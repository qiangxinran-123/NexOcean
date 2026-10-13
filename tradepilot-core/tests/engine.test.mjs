/**
 * 核心引擎验证套件（node:test，零依赖）
 * 运行：node --test tests/
 * 覆盖：口径兼容性、判定方向、降级路径、边界拦截、防幻觉闸门
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { createCore } from '../engine/index.mjs';
import { buildNumberWhitelist, auditNumbers } from '../engine/llm-gateway.mjs';
import { buildRiskPlan } from '../engine/plan.mjs';
import { timelineSummary, timelineBreakdownLines, buildJourneyReportHtml } from '../engine/report.mjs';
import { regimes as seedRegimes, regimeTimeModel } from '../engine/kb-seed.mjs';

const core = createCore();

/* ---------------- 1. 与 ChatGPT 原型静态快照口径对齐 ---------------- */
test('成本引擎在手工模式下必须与原型静态快照完全一致', async () => {
  const base = { value: 30000, quantity: 2000, freight: 1800, insurance: 120, dutyRate: 10, vatRate: 5, fee: 600, use_kb_rates: false, include_extended_fees: false, market: 'TW' };

  const off = await core.cost({ ...base, ssgRate: 0, ssg_mode: 'manual' });
  assert.equal(off.totals.customs_value, 31920);
  assert.equal(off.lines.find((l) => l.key === 'customs_duty').amount, 3192);
  assert.equal(off.lines.find((l) => l.key === 'business_tax').amount, 1755.6);
  assert.equal(off.totals.taxes_total, 4947.6);
  assert.equal(off.totals.grand_total, 37467.6);
  assert.equal(off.totals.unit_landed_cost.toFixed(2), '18.73');
  assert.equal(off.totals.effective_tax_rate_pct, 15.5);

  const on = await core.cost({ ...base, ssgRate: 15, ssg_mode: 'manual' });
  assert.equal(on.lines.find((l) => l.key === 'ssg').amount, 4788);
  assert.equal(on.lines.find((l) => l.key === 'business_tax').amount, 1995);
  assert.equal(on.totals.taxes_total, 9975);
  assert.equal(on.totals.grand_total, 42495);
  assert.equal(on.totals.unit_landed_cost.toFixed(2), '21.25');
  assert.equal(on.totals.effective_tax_rate_pct, 31.25);
});

/* ---------------- 2. 课征顺序：营业税基数必须含 SSG 与货物税 ---------------- */
test('知识库模式下货物税/捐费进入营业税基数，顺序可追溯', async () => {
  const r = await core.cost({ hs: '220299', market: 'TW', value: 100000, quantity: 4000, freight: 5000, insurance: 500, volume_liters: 10000, ssg_mode: 'off' });
  assert.equal(r.mode, 'knowledge_base_rates');
  const cif = r.lines.find((l) => l.key === 'customs_value').amount;
  const duty = r.lines.find((l) => l.key === 'customs_duty').amount;
  const excise = r.lines.find((l) => l.key === 'excise_tax').amount;
  const vat = r.lines.find((l) => l.key === 'business_tax').amount;
  assert.equal(excise, 60000, '10000 公升 × 6 元/公升');
  assert.equal(vat, Math.round(((cif + duty + excise) * 0.05) * 100) / 100);
  assert.ok(r.trace.length >= 6);
  assert.deepEqual(r.levy_order, ['customs_duty', 'ssg', 'excise_tax', 'levy_fee', 'business_tax']);
});

test('从量货物税缺少液体总量时必须显式报待补项，不得静默为 0', async () => {
  const r = await core.cost({ hs: '220299', market: 'TW', value: 100000, quantity: 4000, freight: 5000, insurance: 500 });
  const pending = r.pending_items.find((p) => p.field === 'volume_liters');
  assert.ok(pending, '应产生 volume_liters 待补项');
  assert.equal(pending.severity, 'high');
});

/* ---------------- 3. 准入判定方向 ---------------- */
const baseProduct = { name: '低糖燕麦饮', category: '食品饮料', hs: '220299', market: 'TW', origin: '中国大陆', specs: '250mL/常温/植物配方', attributes: ['is_food'] };

test('食品+大陆产地：给出有条件准许并列出逐批查验义务', async () => {
  const r = await core.assess(baseProduct);
  assert.equal(r.verdict.code, 'permit_conditional');
  assert.equal(r.applicant.can_mainland_apply, false);
  assert.equal(r.applicant.requires_local_importer, true);
  assert.ok(r.document_checklist.length >= 6);
  assert.ok(r.regimes.some((x) => x.id === 'RG-FOOD-01'));
  assert.ok(r.evidence.length > 0);
  assert.equal(r.verification.usable_for_quotation, false, '未核验规则不得标记为可用于报价');
  assert.ok(r.disclaimer.length > 10);
});

test('宣称保健功效：自动升级为需要专案核准，并给出两条缓解路径', async () => {
  const r = await core.assess({ ...baseProduct, attributes: ['is_food', 'claims_health_function'] });
  assert.equal(r.verdict.code, 'special_approval');
  assert.ok(r.blockers.some((b) => b.id === 'RG-HEALTH-01'));
  assert.ok(r.mitigation_options.some((m) => m.option.startsWith('A 改写文案')));
  assert.ok(r.mitigation_options.some((m) => m.option.startsWith('B 申请健康食品认证')));
});

test('命中禁止输入清单：即使税则条目未补录也必须判为禁止入境（漏判方向校验）', async () => {
  const r = await core.assess({ name: '肉制品', category: '食品', hs: '160100', market: 'TW', origin: '中国大陆', specs: '含猪肉成分', attributes: [] });
  assert.equal(r.verdict.code, 'prohibited');
  assert.equal(r.risk.level, 'critical');
  assert.ok(r.blockers.length >= 1);
});

test('无线射频产品：升级为专案核准（NCC 型式认证）', async () => {
  const r = await core.assess({ name: '家用路由器', category: '电子', hs: '851762', market: 'TW', origin: '中国大陆', specs: 'Wi-Fi 6', attributes: ['has_wireless_rf'] });
  assert.equal(r.verdict.code, 'special_approval');
  assert.ok(r.regimes.some((x) => x.id === 'RG-NCC-01'));
});

test('编码未收录 / 市场未登记：一律无法判定或明确报错，不猜测', async () => {
  const unknownHs = await core.assess({ ...baseProduct, hs: '999999' });
  assert.equal(unknownHs.verdict.code, 'undetermined');
  /* 日本已建库但未收录该编码：同样无法判定，不拿台湾税则跨市场套用 */
  const jpUnknown = await core.assess({ ...baseProduct, market: 'JP', hs: '999999' });
  assert.equal(jpUnknown.verdict.code, 'undetermined');
  await assert.rejects(() => core.assess({ ...baseProduct, market: 'XX' }), /不在已建库市场/);
});

test('成本引擎按市场取税率：欧盟用欧盟税则，未登记市场拒绝输出金额', async () => {
  const eu = await core.cost({ hs: '220299', market: 'EU', value: 1000, quantity: 100, use_kb_rates: true });
  assert.equal(eu.matched_tariff.code, '2202');
  assert.equal(eu.matched_tariff.duty_rate, 9.1, '成本税率必须取本市场税则而非台湾口径');
  assert.ok(!eu.lines.some((l) => l.key === 'port_handling'), '非台湾市场不得套用台湾口岸费用');
  await assert.rejects(() => core.cost({ hs: '220299', market: 'XX', value: 1000, quantity: 1 }), /UNKNOWN_MARKET|不在已建库/);
});

test('知识库模式下编码未收录必须拒绝，而不是退回手工税率', async () => {
  await assert.rejects(() => core.cost({ hs: '999999', market: 'TW', value: 1000, quantity: 1, dutyRate: 10 }), /可匹配的 HS 编码/);
});

test('业务访谈输入被编码进引擎，且带出处与核验状态', async () => {
  const r = await core.assess(baseProduct);
  assert.ok(r.execution_variance.ports.length >= 4, '执行口径差异须列出各口岸查验强度');
  assert.match(r.execution_variance.note, /解读可能不一致/);
  assert.equal(r.execution_variance.verify_status, 'needs_verification');
  const ids = r.business_inputs.map((b) => b.id);
  assert.ok(ids.includes('BI-01') && ids.includes('BI-02'));
  assert.ok(r.business_inputs.every((b) => b.verify_status === 'needs_verification' && String(b.source).includes('访谈')), '访谈来源必须可追溯且不得伪装为已核验');
});

test('专案核准结论必须同时给周期与进度可控性提示', async () => {
  const r = await core.assess({ ...baseProduct, attributes: ['is_food', 'claims_health_function'] });
  assert.ok(r.risk.notes.some((n) => /进度可控性/.test(n)));
});

test('报价带必须含合规变动预留与汇率预留（访谈 BI-03）', async () => {
  const r = await core.cost({ hs: '220210', market: 'TW', value: 100000, quantity: 1000, freight: 0, insurance: 0 });
  const names = r.quote.buffers.map((b) => b.name);
  assert.ok(names.includes('合规变动预留') && names.includes('汇率缓冲'));
  assert.ok(r.quote.buffer_pct >= 5, '汇率 3% 与合规 2% 都必须计入报价带');
});

/* ---------------- 4. SSG ---------------- */
test('SSG 临界品类：给出告警等级、剩余空间与触发后成本模拟', async () => {
  const r = core.ssg({ hs: '690721', quantity: 2000, market: 'TW', value: 100000, freight: 5000, insurance: 500 });
  assert.equal(r.item.name, '磁砖');
  assert.ok(r.progress.usage_pct > 90);
  assert.equal(r.level.code, 'breach', '本批会使累积量超过触发点');
  assert.equal(r.your_shipment.would_trigger, true);
  assert.ok(r.simulation.extra_ssg_tax > 0);
  assert.ok(r.recommendation.buffer_pct >= 18);
  assert.match(r.data_caveat, /以主管机关公告为准|仅供参考/);
});

test('SSG 未监控品类：返回 unknown 而非借用邻近品类推算', async () => {
  const r = core.ssg({ hs: '220210', quantity: 100 });
  assert.equal(r.level.code, 'unknown');
  assert.equal(r.monitored, false);
});

/* ---------------- 5. 标签合规 ---------------- */
test('标签校验：命中医疗效能、零添加、简体字与产地表述', async () => {
  const text = '本饮品经临床验证可治療高血压、降低膽固醇，是全网銷量第一的健康饮品。零添加防腐剂，纯天然无农药残留。产地：中国，适合微商與小紅書同款代購渠道。';
  const r = core.label({ text, market: 'TW', is_food: true, category: '食品饮料' });
  const ids = r.hits.map((h) => h.rule_id);
  assert.ok(ids.includes('LB-01'), '医疗效能');
  assert.ok(ids.includes('LB-05'), '零添加');
  assert.ok(ids.includes('LB-10'), '有机/无农药');
  assert.ok(ids.includes('LB-04'), '绝对化用语');
  assert.ok(ids.includes('LB-06'), '简体字');
  assert.ok(ids.includes('LB-07'), '产地表述');
  assert.ok(ids.includes('LB-08'), '华人圈话术');
  assert.ok(r.summary.level === 'critical' || r.summary.level === 'high');
  assert.equal(r.summary.publishable, '不建议直接刊播');
});

test('回归：简体文案必须命中繁体词库（防漏判方向缺陷）', () => {
  const simplified = '本饮品可治療高血压、降低胆固醇，经临床验证。';
  const r = core.label({ text: simplified, market: 'TW', is_food: true });
  const ids = r.hits.map((h) => h.rule_id);
  assert.ok(ids.includes('LB-01'), '简体「治療高血压」必须经繁简归一后命中医疗效能规则');
  const hit = r.hits.find((h) => h.rule_id === 'LB-01');
  assert.equal(hit.matched, '治療高血压', '回显原文必须是用户输入的原始字形');
  assert.ok(hit.normalized_form, '应标注归一化后的匹配形式');
});

test('标签校验：合规繁体文案不产生高风险命中，且保留「未命中≠合规」声明', async () => {
  const text = '品名：燕麥飲品。內容物：水、燕麥、食鹽。淨重：250毫升。原產地：中國大陸。負責廠商：某某食品有限公司，地址：台北市某某路1號。有效日期：标示於瓶身。營養標示：熱量 45大卡。';
  const r = core.label({ text, market: 'TW', is_food: true });
  assert.equal(r.hits.filter((h) => h.severity === 'high').length, 0);
  assert.ok(r.limitations.some((l) => l.includes('未命中不代表合规')));
});

/* ---------------- 6. 多方案对比 ---------------- */
test('多方案对比：跨口岸跨数量给出最优/最差与价差百分比', async () => {
  const r = core.compare({ hs: '170199', market: 'TW', value: 200000, freight: 12000, insurance: 1200, fee: 3000, quantities: [1000, 5000], ports: ['KEE', 'KHH'], ssg_modes: ['off', 'triggered'], include_extended_fees: false });
  assert.equal(r.rows.length, 8);
  assert.ok(r.best && r.worst);
  assert.ok(r.spread_pct > 0);
  assert.ok(r.rows.some((x) => x.risk_flags.includes('SSG 已触发情景')));
});

test('多方案对比：不受 SSG 监控的品类请求触发情景时报错', () => {
  assert.throws(() => core.compare({ hs: '220210', market: 'TW', value: 1000, quantity: 1, ssg_modes: ['off', 'triggered'] }), /不受 SSG 监控/);
});

/* ---------------- 7. 法规变更监测 ---------------- */
test('变更监测：官方条目命中产品并量化成本变动，非官方条目被拦截', async () => {
  const products = [{ id: 'p1', name: '燕麦饮', hs: '220299', market: 'TW', attributes: ['is_food'] }];
  const r = core.monitor({ changes: core.demoChangeFeed, products, defaultCostInputs: { value: 30000, quantity: 2000, freight: 1800, insurance: 120, fee: 600, include_extended_fees: false } });
  assert.equal(r.rejected_non_official.length, 1, '非官方来源必须被拦截并说明原因');
  assert.ok(r.impacts.some((i) => i.diff_type === 'rate' && i.cost_delta?.uplift_pct > 0));
  assert.ok(r.impacts.some((i) => i.requires_label_change));
  assert.ok(r.messages.length >= 1);
});

/* ---------------- 8. 防幻觉闸门 ---------------- */
test('LLM 数字白名单：模型输出中出现引擎之外的数字即被拒绝', async () => {
  const r = await core.cost({ hs: '170199', market: 'TW', value: 100000, quantity: 1000, freight: 5000, insurance: 500 });
  const whitelist = buildNumberWhitelist(r);
  assert.ok(auditNumbers(`综合税负率 ${r.totals.effective_tax_rate_pct}%，单件成本 ${r.totals.unit_landed_cost}。`, whitelist).passed);
  const bad = auditNumbers('该品类关税为 66.7%，预计 2027 年下调。', whitelist);
  assert.equal(bad.passed, false);
  assert.ok(bad.violations.includes('66.7'));
});

test('未配置模型密钥时降级为规则模板成文，且模板文本保留免责与真实数字', async () => {
  assert.equal(core.meta.llm_mode, 'rule_template');
  const r = await core.cost({ hs: '170199', market: 'TW', value: 100000, quantity: 1000, freight: 5000, insurance: 500 });
  assert.equal(r.narrative.source, 'rule_template');
  assert.ok(r.narrative.text.includes(core.meta.disclaimer.slice(0, 12)));
  assert.ok(r.narrative.text.includes(String(r.totals.effective_tax_rate_pct)));
});

test('网关限流：超过 RPM 后抛出可降级错误', async () => {
  const small = createCore({ gateway: { baseUrl: 'https://example.invalid', apiKey: 'test', rpm: 1 } });
  assert.equal(small.meta.llm_mode, 'live');
  const r = await small.cost({ hs: '170199', market: 'TW', value: 1000, quantity: 1 });
  assert.equal(r.narrative.source, 'rule_template');
  assert.match(r.narrative.reason, /降级|失败/);
});

/* ---------------- 9. 免责与来源绑定 ---------------- */
test('所有引擎输出必须携带免责声明；结论必须绑定来源', async () => {
  const cases = [await core.assess(baseProduct), await core.cost({ hs: '170199', market: 'TW', value: 1000, quantity: 1 }), core.ssg({ hs: '170199', quantity: 10 }), core.label({ text: '測試品名：飲品。淨重：250毫升。原產地：中國大陸。', market: 'TW', is_food: true })];
  for (const c of cases) {
    assert.ok(c.disclaimer && c.disclaimer.includes('不能替代官方许可'), '免责声明强制');
    assert.ok(c.rule_version && c.generated_at);
  }
  const a = cases[0];
  assert.ok(a.evidence.every((e) => Array.isArray(e.sources)));
  assert.ok(a.official_lookup_entries.length > 0);
});

test('报告导出：HTML 自包含且转义用户输入，Markdown 可复制', async () => {
  const evil = '<script>alert(1)</script>';
  const a = await core.assess({ ...baseProduct, name: evil });
  const html = core.report('admission', a);
  assert.ok(!html.includes('<script>alert'), '必须转义');
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes('打印 / 导出 PDF'));
  const c = await core.cost({ hs: '170199', market: 'TW', value: 1000, quantity: 1 });
  const md = core.report('cost', c, { format: 'markdown' });
  assert.match(md, /综合税负率/);
});

/* ---------------- 10. 知识库可运营性 ---------------- */
test('回归：知识库模式必须忽略表单残留的手工税率，只认规则库或显式覆写', async () => {
  const clean = await core.cost({ hs: '170199', market: 'TW', value: 100000, quantity: 100, freight: 0, insurance: 0 });
  const stale = await core.cost({ hs: '170199', market: 'TW', value: 100000, quantity: 100, freight: 0, insurance: 0, dutyRate: 1, ssgRate: 0, vatRate: 99 });
  assert.equal(clean.inputs.dutyRate, 30, '170199 糖的库内关税率为 30%');
  assert.equal(stale.inputs.dutyRate, 30, '传入 dutyRate=1 不得覆盖知识库税率');
  assert.equal(stale.inputs.vatRate, 5, '传入 vatRate=99 不得覆盖市场营业税率');
  assert.equal(clean.totals.grand_total, stale.totals.grand_total);
  const explicit = await core.cost({ hs: '170199', market: 'TW', value: 100000, quantity: 100, freight: 0, insurance: 0, rate_overrides: { duty_rate: 12 } });
  assert.equal(explicit.inputs.dutyRate, 12, '显式 rate_overrides 才允许改税率');
  assert.ok(explicit.sources.some((s) => s.id === 'OVERRIDE'), '覆写必须在来源中标示出来');
});

test('成本结果必须自带核验计数，供 UI 直接展示', async () => {
  const r = await core.cost({ hs: '170199', market: 'TW', value: 1000, quantity: 1 });
  assert.ok(r.verification.total_rules >= 6);
  assert.equal(typeof r.verification.unverified_rules, 'number');
  assert.equal(typeof r.verification.verified_ratio, 'number');
});

test('运营覆写：改写税率后结论随之变化，且保留覆写痕迹', async () => {
  const before = await core.cost({ hs: '170199', market: 'TW', value: 100000, quantity: 100, freight: 0, insurance: 0 });
  const core2 = createCore({ overrides: { tariffItems: [{ code: '170199', duty_rate: 55, verify_status: 'verified', updated_by: 'ops@demo', updated_at: '2026-10-08T10:00:00Z' }] } });
  const after = await core2.cost({ hs: '170199', market: 'TW', value: 100000, quantity: 100, freight: 0, insurance: 0 });
  assert.ok(after.totals.effective_tax_rate_pct > before.totals.effective_tax_rate_pct);
  const rule = core2.kb.raw.tariffItems.find((t) => t.code === '170199');
  assert.equal(rule.verify_status, 'verified');
  assert.equal(rule._overridden, true);
  assert.equal(rule.updated_by, 'ops@demo');
});

test('浏览器安全约束：engine/ 下不得直接引用 Node 全局（前端要能 import 同一套引擎）', async () => {
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const engDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'engine');
  const files = await fs.readdir(engDir);
  assert.ok(files.length >= 10, '应扫描到全部引擎模块');
  const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  for (const f of files.filter((x) => x.endsWith('.mjs'))) {
    const src = stripComments(await fs.readFile(path.join(engDir, f), 'utf8'));
    const lines = src.split('\n');
    const bad = lines.map((l, i) => (/\bprocess\s*[.?]/.test(l) && !/typeof process/.test(l) ? `${f}:${i + 1}: ${l.trim()}` : null)).filter(Boolean);
    assert.equal(bad.length, 0, `${f} 直接引用了 Node 的 process，浏览器端会抛 ReferenceError\n${bad.join('\n')}`);
    assert.ok(!/\brequire\(/.test(src), `${f} 使用了 CommonJS require`);
    assert.ok(!/\bfrom ['"]node:/.test(src), `${f} 引入了 node: 内置模块`);
  }
});

test('知识库统计与检索轨迹可用于审计', () => {
  const s = core.kb.stats();
  assert.ok(s.tariff_items >= 20 && s.regimes >= 10 && s.label_rules >= 10);
  const hits = core.kb.search('SSG 磁砖 触发量', { limit: 3 });
  assert.ok(hits.length >= 1);
  assert.ok(hits[0].title.includes('磁砖'));
});

test('市场扫描：一个产品 × 全部登记市场，四个建库市场各自按本市场规则出结论', () => {
  const scan = core.scanMarkets({ name: '低糖燕麦饮', category: '食品饮料', hs: '220299', origin: '中国大陆', specs: '250mL' });
  assert.equal(scan.engine, 'market_scan');
  assert.equal(scan.rows.length, 4);
  assert.equal(scan.built, 4);
  assert.equal(scan.skeleton, 0);
  const tw = scan.rows.find((r) => r.market_code === 'TW');
  assert.equal(tw.status, 'permit_conditional');
  assert.ok(tw.evidence_count >= 3);
  assert.equal(tw.verify_status, 'needs_verification');
  /* 日 / 美 / 欧：各自命中本市场制度，不再是清一色无法判定 */
  const jp = scan.rows.find((r) => r.market_code === 'JP');
  const us = scan.rows.find((r) => r.market_code === 'US');
  const eu = scan.rows.find((r) => r.market_code === 'EU');
  for (const [row, law] of [[jp, '食品卫生法'], [us, 'FSVP'], [eu, '一般食品法']]) {
    assert.equal(row.status, 'permit_conditional', `${row.market_name} 应出真实结论`);
    assert.ok(row.reason.includes(law), `${row.market_name} 结论须引用本市场法规（${law}）`);
  }
  /* 市场分流：台湾的大陆禁止清单不得套到日本头上 */
  const jpChestnut = core.scanMarkets({ name: '糖渍栗子', category: '食品饮料', hs: '2008119200', origin: '中国大陆', specs: '500g' });
  assert.equal(jpChestnut.rows.find((r) => r.market_code === 'TW').status, 'prohibited');
  assert.notEqual(jpChestnut.rows.find((r) => r.market_code === 'JP').status, 'prohibited', '台湾禁止清单不得跨市场套用');
  assert.ok(scan.note.includes('不做跨市场推测'));
  /* 无 HS 产品：连建库市场也必须无法判定，不得按名称猜测 */
  const noHs = core.scanMarkets({ name: '无编码产品', origin: '中国大陆' });
  const twNoHs = noHs.rows.find((r) => r.market_code === 'TW');
  assert.equal(twNoHs.status, 'undetermined');
  assert.ok((twNoHs.missing_fields || []).some((f) => String(f).includes('HS')));
});

test('风控预案与出海方案报告：确定性生成、风险绑定出处、缺参降级不失败', async () => {
  const product = { name: '低糖燕麦饮', category: '食品饮料', hs: '220299', market: '中国台湾地区', origin: '中国大陆', specs: '250mL' };
  const r = await core.journeyReport({ product, costInputs: { value: 30000, quantity: 2000, freight: 1800, insurance: 120, fee: 600 } });
  assert.equal(r.data.assessment.verdict.code, 'permit_conditional');
  assert.ok(r.data.cost.totals.grand_total > 0);
  assert.equal(r.data.scan.built, 4);
  assert.ok(r.data.competitors.count >= 8);
  assert.ok(r.data.competitors.band.unit === 'TWD/升');
  assert.ok(r.data.competitors.band.min > 0 && r.data.competitors.band.max > r.data.competitors.band.min);
  const plan = r.data.plan;
  assert.ok(plan.risks.length >= 4);
  for (const x of plan.risks) assert.ok(x.id && x.category && x.risk && x.trigger && x.action && x.owner && x.monitor && x.provenance, '风险条目须字段齐备且绑定出处');
  assert.ok(plan.principles.length >= 3);
  assert.ok(['## 一、市场调研','## 二、准入评估','## 三、成本与收益','## 四、风控预案','## 五、下一步方案'].every(s => r.markdown.includes(s)));
  /* SSG 品目的风险预案必须出现加征预警 */
  const rSsg = await core.journeyReport({ product: { ...product, hs: '071331' }, costInputs: { value: 10000, quantity: 100 } });
  assert.ok(rSsg.data.plan.risks.some(x => x.id === 'R2' && x.risk.includes('SSG')), 'SSG 品目须生成加征风险预案');
  /* 缺参降级：报告仍生成并明示缺口 */
  const rBad = await core.journeyReport({ product: { name: '无编码产品', market: '中国台湾地区' }, costInputs: {} });
  assert.equal(rBad.data.assessment.verdict.code, 'undetermined');
  assert.equal(rBad.data.cost, null);
  assert.ok(rBad.markdown.includes('成本测算未完成') && rBad.markdown.includes('无法判定原因'));
});

test('竞品三层匹配：关键词加速 + 品名相似度泛化 + 未知品类如实降级', () => {
  const t = (name, specs, hs) => core.kb.findCompetitors({ hs, tags: ['food'], name, specs });
  /* 0) 品类词数据化：果汁类（后期补录）与既有品类同等待遇 */
  const juice = t('芒果果汁', '芒果原汁 330ml', '2009');
  assert.equal(juice.match_level, 'subcategory');
  assert.equal(juice.subcategory, 'juice');
  assert.ok(juice.direct.length >= 3, '果汁竞品须全部进入直接竞品');
  assert.ok(juice.direct.every((c) => c.match_reason));
  assert.ok(juice.known_category_words.includes('果汁'), '词库须包含「果汁」供前端动态提示');
  /* 1) 已登记细分品类：关键词命中，直接/替代分档且披露理由 */
  const oat = t('低糖燕麦饮', '250mL 植物配方', '220299');
  assert.equal(oat.match_level, 'subcategory');
  assert.equal(oat.subcategory, 'oat');
  assert.equal(oat.direct.length, 2);
  assert.equal(oat.substitutes.length, 7);
  assert.ok(oat.direct.every((c) => c.match_reason));
  assert.ok(oat.band_direct.min > 0 && oat.band_direct.max >= oat.band_direct.min);
  /* 2) 泛化性：库内没有的品类（椰子水）不得误判为任何竞品的直接竞品 */
  const coco = t('椰子水', '椰子水饮料 330ml', '220299');
  assert.equal(coco.match_level, 'category');
  assert.equal(coco.direct.length, 0, '未知品类不得凭单字碰撞误判直接竞品');
  /* 3) 无文本：同样降级品类口径 */
  const bare = t('测试产品', '', '220299');
  assert.equal(bare.match_level, 'category');
  /* 4) 文本相似度档：非关键词但品名高度重合时应进 direct（如自定义品名与库内品名几乎一致） */
  const dup = t('無糖豆漿', '冷藏 1L', '220299');
  assert.ok(dup.direct.length >= 3, '与库内品名高度重合的名称应匹配直接竞品');
});

test('标签扫描：两岸同形字不得误报为简体，真简体与违规宣称仍须命中', () => {
  const identity = core.label({ text: '品名：燕麥飲。淨重：250毫升。品質：優。概不退換。船運配送。完善售後。', market: 'TW', tags: ['food'] });
  assert.ok(!identity.hits.some((h) => h.rule_id === 'LB-06'), `同形字被误报为简体：${identity.hits.map((h) => h.rule_id).join(',')}`);
  const simplified = core.label({ text: '本产品可治疗高血压，软件服务器专业团队。', market: 'TW', tags: ['food'] });
  assert.ok(simplified.hits.some((h) => h.rule_id === 'LB-06'), '简体字必须命中 LB-06');
  assert.ok(simplified.hits.some((h) => h.rule_id === 'LB-01'), '简体医疗宣称必须命中（繁简归一不漏检）');
  /* 完整繁体合规文本应零命中 */
  const clean = core.label({ text: '品名：燕麥飲。成分：燕麥、水。淨重：250毫升。原產地：中國大陸。製造商：廈門某某食品有限公司。地址：廈門市某區某路88號。有效日期：2027年1月31日。營養標示：每份熱量120大卡。開封後請冷藏。', market: 'TW', tags: ['food'] });
  assert.equal(clean.hits.length, 0, `合规文本不得命中：${clean.hits.map((h) => h.rule_id).join(',')}`);
});

test('禁输清单补充：大陆产管制品禁止入境，非大陆产同码可通行（产地分流）', async () => {
  const cn = await core.assess({ name: '糖渍栗子', hs: '2008119200', market: '中国台湾地区', origin: '中国大陆', specs: '' });
  assert.equal(cn.verdict.code, 'prohibited', '大陆产栗子制品必须判禁止');
  assert.ok((cn.evidence || []).some((e) => e.kind === 'prohibition' && e.title.includes('栗子')));
  const cnTea = await core.assess({ name: '茶叶', hs: '090290', market: '中国台湾地区', origin: '中国大陆', specs: '' });
  assert.equal(cnTea.verdict.code, 'prohibited', '大陆产茶叶（0902 前缀）必须判禁止');
  const nonCn = await core.assess({ name: '糖渍栗子', hs: '2008119200', market: '中国台湾地区', origin: '越南', specs: '' });
  assert.equal(nonCn.verdict.code, 'permit_conditional', '非大陆产同码不得被禁止清单误伤');
  const cnJuice = await core.assess({ name: '果汁', hs: '2009', market: '中国台湾地区', origin: '中国大陆', specs: '' });
  assert.equal(cnJuice.verdict.code, 'prohibited');
  const milk = await core.assess({ name: '奶粉', hs: '040221', market: '中国台湾地区', origin: '中国大陆', specs: '' });
  assert.equal(milk.verdict.code, 'special_approval', '新补税则（040221）应给出需检疫核准结论');
});

test('竞品第二层（bigram + 规格清洗）：未录入变体可召回，无关品类不误判', () => {
  const t = (name, specs, hs) => core.kb.findCompetitors({ hs, tags: ['food'], name, specs });
  /* 变体召回：词库未覆盖的写法，经清洗+相似度进直接竞品（或经品类词繁体变体命中） */
  const oatTw = t('燕麥風味乳', '1L', '2202');
  assert.equal(oatTw.match_level, 'subcategory');
  assert.ok(oatTw.direct.length >= 2, '繁体变体须召回燕麦竞品');
  const soda = t('蘇打氣泡飲', '500ml', '2202');
  assert.equal(soda.match_level, 'subcategory');
  assert.ok(soda.direct.length >= 4, '「蘇打氣泡飲」变体须召回气泡竞品');
  const smoothie = t('芒果冰沙', '芒果冰沙 330ml 冰鎮', '2009');
  assert.equal(smoothie.match_level, 'subcategory');
  assert.ok(smoothie.direct.length >= 3, '规格噪声（330ml/冰鎮）不得稀释匹配');
  /* 误判防线：椰子水（库内无同类）不得被气泡/豆浆误吸 */
  const coco = t('椰子水', '椰子水饮料 330ml', '2202');
  assert.equal(coco.match_level, 'category');
  assert.equal(coco.direct.length, 0, '无关品类不得经相似度误判');
  /* 语义变体理由须披露百分比与清洗口径 */
  const viaSim = t('综合蔬果汁', '冷藏 300ml', '2009');
  assert.ok(viaSim.direct.every((c) => c.match_reason));
});

/* ---------------- 8. 办理周期模型（串行相加 / 并行取最长 / 前置单列） ---------------- */
const pJuice = { name: '柳橙汁', category: '食品饮料', hs: '2009', market: 'TW', origin: '美国', attributes: ['is_food'] };
const pChestnut = { name: '糖渍栗子', category: '食品饮料', hs: '2008119200', market: 'TW', origin: '越南', attributes: ['is_food'] };

test('每项管制制度都必须显式声明周期角色（新增制度不得漏声明）', () => {
  const missing = seedRegimes.filter((r) => !regimeTimeModel[r.id]).map((r) => r.id);
  assert.deepEqual(missing, [], '新增制度须同时声明 lead_phase / applies_per');
  const orphan = Object.keys(regimeTimeModel).filter((id) => !seedRegimes.some((r) => r.id === id));
  assert.deepEqual(orphan, [], '周期模型不得残留已删除制度的声明');
});

test('周期口径：串行义务相加，并行准备取最长不叠加，一次性前置单列', async () => {
  const juice = await core.assess(pJuice);
  const chestnut = await core.assess(pChestnut);
  assert.equal(chestnut.verdict.code, 'permit_conditional');
  /* 旧实现取逐位 max：只要食品逐批查验在命中集合里，所有食品都被压成同一个 14–45 */
  assert.deepEqual(juice.timeline.days, [14, 45], '仅串行走逐批查验 → 14–45');
  assert.ok(chestnut.timeline.days[0] > juice.timeline.days[0], '叠加植物检疫许可后关键路径必须变长');
  assert.notDeepEqual(chestnut.timeline.days, juice.timeline.days, '不同义务集合不得算出同一个周期（防 max 吞并回归）');
  /* 串行段 = 各制度相加 */
  const seq = chestnut.timeline.segments.sequential;
  assert.deepEqual(seq.days, seq.items.reduce(([a, b], i) => [a + i.days[0], b + i.days[1]], [0, 0]));
  /* 并行段不得进关键路径 */
  const par = chestnut.timeline.segments.parallel;
  assert.ok(par.items.length >= 1, '标示/广告等并行准备项应有归类');
  assert.ok(par.days[1] < chestnut.timeline.days[1], '并行准备不得被加进关键路径');
  /* 一次性主体资格前置 */
  assert.ok(chestnut.timeline.segments.prerequisite.items.some((i) => i.id === 'RG-IMP-01'), '进口主体登录归一次性前置');
  /* 到港可上架 = 关键路径 + 口岸放行 */
  const pc = chestnut.timeline.segments.port_clearance;
  assert.ok(pc.days, '口岸放行区间取自已建库口岸数据');
  assert.deepEqual(chestnut.timeline.landed_ready_days, [chestnut.timeline.days[0] + pc.days[0], chestnut.timeline.days[1] + pc.days[1]]);
  /* 船期不在此口径，必须显式说明而非静默丢失 */
  assert.match(chestnut.timeline.segments.shipping.note, /不在本引擎口径/);
});

test('命中禁止输入清单：不报办理天数，改给不适用与替代路径，预案同步为准入阻断', async () => {
  const r = await core.assess({ ...pChestnut, origin: '中国大陆' });
  assert.equal(r.verdict.code, 'prohibited');
  assert.equal(r.timeline.applicable, false);
  assert.equal(r.timeline.days, null);
  assert.equal(r.timeline.segments, null, '不适用时不得还摆出一套周期拆解');
  assert.match(r.timeline.text, /不适用/);
  assert.match(r.timeline.note, /产地|编码/, '不适用必须交代怎么解除');
  const plan = buildRiskPlan({ product: { ...pChestnut, origin: '中国大陆' }, assessment: r, cost: null }, core.kb);
  const r1 = plan.risks.find((x) => x.id === 'R1');
  assert.ok(r1 && r1.category === '准入阻断', '禁止清单须进预案，且不再谈周期');
  assert.doesNotMatch(JSON.stringify(r1), /核准周期约/);
});

test('周期口径文案：报告与 Markdown 共用同一份拆解，缺数据时不编天数', () => {
  const fake = {
    applicable: true, text: '21–75 天', critical_path_text: '21–75 天',
    landed_ready_text: '22–82 天（含口岸查验放行）',
    segments: {
      sequential: { days: [21, 75], label: '串行核准/查验（占关键路径）', items: [{ id: 'X', name: '植物检疫', days: [7, 30], applies_per: 'shipment' }] },
      parallel: null, prerequisite: null,
      port_clearance: { days: [1, 7], label: '口岸查验放行（另计）', note: 'n' },
      shipping: { days: null, label: '船期', note: '不在本引擎口径内' },
    },
    note: '口径说明',
  };
  assert.equal(timelineSummary(fake), '21–75 天（22–82 天（含口岸查验放行））');
  const lines = timelineBreakdownLines(fake);
  assert.ok(lines.some((l) => l.includes('植物检疫 7–30 天') && l.includes('→ 21–75 天')));
  assert.ok(lines.some((l) => l.includes('口岸查验放行')));
  assert.equal(timelineSummary(null), '待主管机关确认');
  assert.equal(timelineSummary({ applicable: false, text: '不适用（无合法输入路径）' }), '不适用（无合法输入路径）');
  assert.deepEqual(timelineBreakdownLines({ applicable: false, text: '不适用' }), []);
});

/* ---------------- 11. 竞品快照按市场分流 ---------------- */
test('竞品快照按市场分流：日本产品命中日本渠道，台湾快照不跨市场混入', () => {
  const jp = core.kb.findCompetitors({ hs: '220299', tags: ['food'], name: '燕麦奶饮', specs: '1L', market: 'JP' });
  assert.ok(jp.items.length >= 2 && jp.items.every((c) => c.market === 'JP'), '日本市场只应命中日本渠道快照');
  assert.equal(jp.match_level, 'subcategory');
  const tw = core.kb.findCompetitors({ hs: '220299', tags: ['food'], name: '燕麦奶饮', specs: '1L', market: 'TW' });
  assert.ok(tw.items.every((c) => (c.market || 'TW') === 'TW'), '台湾竞品不得混入日/美/欧快照');
  const us = core.kb.findCompetitors({ hs: '2009', tags: ['food'], name: '橙果汁', specs: '1.75L', market: 'US' });
  assert.ok(us.direct.length >= 1 && us.direct.every((c) => c.market === 'US'), '美国果汁应命中美国渠道直接竞品');
  assert.ok(us.direct.every((c) => c.price_local && c.currency), '非台湾快照须带本地币种价格');
});

test('标签规则按市场分流：美/日宣称规则只在本市场命中，不污染台湾扫描', () => {
  const claim = '本产品可预防心血管疾病并治疗失眠';
  const us = core.label({ text: claim, market: 'US', is_food: true });
  assert.ok(us.hits.some((h) => h.rule_id === 'LB-US-01'), '美国市场须命中疾病宣称规则');
  const tw = core.label({ text: claim, market: 'TW', is_food: true });
  assert.ok(!tw.hits.some((h) => h.rule_id === 'LB-US-01'), '美国规则不得漏进台湾扫描');
  const jp = core.label({ text: '增强免疫力，改善肠道环境', market: 'JP', is_food: true });
  assert.ok(jp.hits.some((h) => h.rule_id === 'LB-JP-01'), '日本市场须命中机能性宣称规则');
  const eu = core.label({ text: '增强免疫力，抗氧化抗衰老', market: 'EU', is_food: true });
  assert.ok(eu.hits.some((h) => h.rule_id === 'LB-EU-01'), '欧盟市场须命中授权清单外健康宣称规则');
  /* 三个新市场的规则条目合计不超过 20 条（登记上限约定） */
  const marketRules = core.kb.raw.regimes.filter((r) => r.market && r.market !== 'TW').length
    + core.kb.raw.tariffItems.filter((t) => t.market && t.market !== 'TW').length
    + core.kb.raw.labelRules.filter((l) => l.market && l.market !== 'TW').length;
  assert.ok(marketRules <= 20, `多市场规则条目合计 ${marketRules} 条，不得超过 20 条约定`);
});

test('方案报告：已建库市场理由完整渲染（不再 80 字腰斩），骨架市场附背景概览', async () => {
  const jr = await core.journeyReport({ product: { name: '低糖燕麦饮', category: '食品饮料', hs: '220299', origin: '中国大陆', specs: '250mL' }, costInputs: {}, useKbRates: true });
  /* 与 server.js /api/v1/report 相同的扁平口径 */
  const a = jr.data.assessment;
  const flat = {
    product: { name: '低糖燕麦饮', hs: '220299', market: '中国台湾地区', origin: '中国大陆' },
    research: { scan: jr.data.scan, competitors: jr.data.competitors },
    admission: { verdict: a.verdict, applicant: a.applicant, timeline: a.timeline, evidence_count: (a.evidence || []).length, documents: a.document_checklist || [], risks: a.risk || null },
    cost: jr.data.cost ? { totals: jr.data.cost.totals, quote: jr.data.cost.quote, lines: jr.data.cost.lines } : null,
    cost_error: jr.data.costError,
    plan: jr.data.plan,
  };
  const html = buildJourneyReportHtml({ ...flat, rule_version: 'T', data_as_of: 'D', generated_at: new Date().toISOString() });
  /* 截断回归：台湾行理由必须带完整结尾「可按一般路径输入」 */
  assert.ok(html.includes('可按一般路径输入'), '已建库市场说明不得被 80 字硬截断');
  assert.ok(/依据 \d+ 条规则/.test(html), '已建库行附依据条数');
  /* 多市场建库：报告扫描表列四个建库市场结论，不再有一排骨架空市场 */
  assert.ok(html.includes('日本') && html.includes('美国') && html.includes('欧盟'), '报告须列出三个新建库市场');
  assert.ok(!html.includes('骨架'), '报告不应再出现骨架市场行');
  const jpRow = await core.assess({ name: '低糖燕麦饮', category: '食品饮料', hs: '220299', market: 'JP', origin: '中国大陆', attributes: ['is_food'] });
  assert.equal(jpRow.verdict.code, 'permit_conditional');
  assert.ok(jpRow.regimes.some((r) => r.id === 'JP-FOOD-01'), '日本准入须命中食品卫生法届出查验制度');
  assert.ok(jpRow.timeline.days, '日本关键路径须可计算');
  const usRow = await core.assess({ name: '低糖燕麦饮', category: '食品饮料', hs: '220299', market: 'US', origin: '中国大陆', attributes: ['is_food'] });
  assert.ok(usRow.regimes.some((r) => r.id === 'US-FSVP-01'), '美国准入须命中 FSVP');
  const euRow = await core.assess({ name: '低糖燕麦饮', category: '食品饮料', hs: '220299', market: 'EU', origin: '中国大陆', attributes: ['is_food'] });
  assert.ok(euRow.regimes.some((r) => r.id === 'EU-LBL-01'), '欧盟准入须命中 1169/2011 标示');
  assert.ok(!html.includes('undefined'), '渲染不得出现 undefined');
});
