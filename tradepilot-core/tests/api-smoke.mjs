/**
 * 服务端 API 冒烟测试（自带起停，不依赖外部工具）
 * 运行：node tests/api-smoke.mjs
 * 覆盖：健康检查、四大引擎接口、档案 CRUD、消息中心、看板、运营覆写、报告导出、错误与边界路径
 */
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.SMOKE_PORT || 8137);
const BASE = `http://127.0.0.1:${PORT}`;
const WS = 'smoke-workspace';

const RUN_ID = `${Date.now().toString(36)}`;
const child = spawn(process.execPath, ['server.js'], {
  cwd: ROOT,
  env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', DATA_DIR: path.join(ROOT, '..', 'tmp', 'smoke-data', RUN_ID) },
  stdio: ['ignore', 'pipe', 'pipe'],
});
child.stdout.on('data', (d) => process.stdout.write(`[server] ${d}`));
child.stderr.on('data', (d) => process.stderr.write(`[server:err] ${d}`));

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function up() {
  for (let i = 0; i < 60; i += 1) {
    try { const r = await fetch(`${BASE}/api/health`); if (r.ok) return; } catch { /* retry */ }
    await wait(250);
  }
  throw new Error('服务未能启动');
}

async function call(path, body, method = 'POST') {
  const r = await fetch(`${BASE}/api/${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'x-workspace': WS, 'x-session-id': 'SMOKE-1' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let json; try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 200) }; }
  return { status: r.status, body: json, text };
}

const results = [];
const check = (name, fn) => { try { fn(); results.push(['PASS', name]); } catch (e) { results.push(['FAIL', `${name} → ${e.message}`]); } };

try {
  await up();

  const health = await call('health', null, 'GET');
  check('健康检查可用且不含 /healthz 冲突', () => {
    assert.equal(health.status, 200);
    assert.equal(health.body.ok, true);
    assert.equal(health.body.repo_mode, 'jsonfile');
    assert.ok(health.body.rule_version);
  });

  const meta = await call('meta', null, 'GET');
  check('meta 提供市场/口岸/税则/SSG/来源/变更 feed', () => {
    assert.ok(meta.body.markets.length >= 4);
    assert.ok(meta.body.ports.length >= 4);
    assert.ok(meta.body.tariff_items.length >= 20);
    assert.ok(meta.body.demo_changes.length >= 4);
    assert.ok(meta.body.kb.verified_ratio !== undefined);
  });

  const adm = await call('admission', { name: '低糖燕麦饮', category: '食品饮料', hs: '220299', market: 'TW', origin: '中国大陆', specs: '250mL', attributes: ['is_food'] });
  check('准入接口返回结论+来源+免责+记录 ID', () => {
    assert.equal(adm.status, 200);
    assert.ok(['permit_conditional', 'special_approval'].includes(adm.body.verdict.code));
    assert.ok(adm.body.evidence.length > 0);
    assert.ok(adm.body.disclaimer.includes('不能替代官方许可'));
    assert.ok(adm.body.record_id.startsWith('ASM-'));
    assert.equal(adm.body.narrative.source, 'rule_template');
    assert.ok(adm.body.retrieval_trace.length > 0);
  });

  const admBad = await call('admission', { name: '未知物', hs: '999999', market: 'TW', origin: '中国大陆' });
  check('未收录编码返回无法判定而非猜测', () => {
    assert.equal(admBad.status, 200);
    assert.equal(admBad.body.verdict.code, 'undetermined');
    assert.equal(admBad.body.verification.usable_for_quotation, false);
  });

  const admUnregistered = await call('admission', { name: '测试', hs: '220299', market: 'GB', origin: '中国大陆' });
  check('未登记市场被明确拒绝，不输出推测结论', () => {
    assert.equal(admUnregistered.status, 422);
    assert.equal(admUnregistered.body.error.code, 'UNKNOWN_MARKET');
  });
  const admJp = await call('admission', { name: '低糖燕麦饮', category: '食品饮料', hs: '220299', market: 'JP', origin: '中国大陆', attributes: ['is_food'] });
  check('日本市场按本市场规则库出真实结论（市场分流生效）', () => {
    assert.equal(admJp.status, 200);
    assert.equal(admJp.body.verdict.code, 'permit_conditional');
    assert.ok(admJp.body.verdict.reason.includes('食品卫生法'));
  });

  const cost = await call('cost', { hs: '170199', market: 'TW', value: 100000, quantity: 1000, freight: 5000, insurance: 500, port: 'KHH' });
  check('成本接口返回分项/税负率/报价带', () => {
    assert.equal(cost.status, 200);
    assert.ok(cost.body.lines.length >= 7);
    assert.ok(cost.body.totals.effective_tax_rate_pct > 0);
    assert.ok(cost.body.quote.suggested_high > cost.body.quote.suggested_low);
    assert.ok(cost.body.not_included.length > 3);
  });

  const costErr = await call('cost', { hs: '220299', market: 'GB', value: 1000, quantity: 1 });
  check('未登记市场成本请求返回 422 而非 0 金额', () => {
    assert.equal(costErr.status, 422);
    assert.ok(costErr.body.error.code);
  });

  const valErr = await call('cost', { hs: '170199', market: 'TW', value: -5, quantity: 10 });
  check('非法输入被校验拦截', () => assert.equal(valErr.status, 422));

  const cmp = await call('compare', { hs: '170199', market: 'TW', value: 100000, quantity: 1000, quantities: [1000, 5000], ports: ['KEE', 'KHH'], ssg_modes: ['off', 'triggered'] });
  check('多方案对比返回矩阵', () => {
    assert.equal(cmp.status, 200);
    assert.equal(cmp.body.rows.length, 8);
    assert.ok(cmp.body.best.unit_landed_cost <= cmp.body.worst.unit_landed_cost);
  });

  const ssg = await call('ssg', { hs: '690721', quantity: 2000, value: 100000, freight: 5000, insurance: 500 });
  check('SSG 接口返回等级与成本模拟', () => {
    assert.ok(['alert', 'breach'].includes(ssg.body.level.code));
    assert.ok(ssg.body.simulation.total_extra_cost > 0);
    assert.ok(ssg.body.data_caveat.includes('仅供参考'));
  });

  const lbl = await call('label', { text: '本饮品可治療高血压、降低胆固醇，零添加防腐剂，全网销量第一。', market: 'TW', tags: ['food'] });
  check('标签接口命中简体医疗宣称与绝对化用语', () => {
    const ids = lbl.body.hits.map((h) => h.rule_id);
    assert.ok(ids.includes('LB-01') && ids.includes('LB-04') && ids.includes('LB-05'));
  });

  const lblXss = await call('label', { text: '<img src=x onerror=alert(1)> 品名：測試', market: 'TW', tags: ['food'] });
  check('标签接口以 JSON 返回原文（不服务端渲染，前端渲染时统一转义）', () => {
    assert.ok(String(lblXss.body.input?.preview || '').includes('品名'));
  });

  const xssAdm = await call('admission', { name: '<script>alert(1)</script>', hs: '170199', market: 'TW', origin: '中国大陆', specs: 'x' });
  const xssRep = await fetch(`${BASE}/api/report/admission/${xssAdm.body.record_id}`, { headers: { 'x-workspace': WS } });
  const xssHtml = await xssRep.text();
  check('HTML 报告必须转义用户输入的产品名', () => {
    assert.ok(!/<script>alert\(1\)<\/script>/.test(xssHtml), '报告中不得出现可执行脚本');
    assert.ok(xssHtml.includes('&lt;script&gt;alert'));
  });

  const prod = await call('products', { name: '磁砖 600×600', category: '家居建材', hs: '690721', market: 'TW', origin: '中国大陆', specs: '每柜 720 片' });
  check('产品档案创建', () => { assert.equal(prod.status, 201); assert.ok(prod.body.id.startsWith('PRD-')); });
  const prodId = prod.body.id;
  const prodUp = await call(`products/${prodId}`, { specs: '每柜 640 片' }, 'PUT');
  check('产品档案更新', () => { assert.equal(prodUp.status, 200); assert.equal(prodUp.body.specs, '每柜 640 片'); });
  const prodList = await call('products', null, 'GET');
  check('产品档案列表含工作区隔离', () => assert.ok(prodList.body.items.some((p) => p.id === prodId)));

  const mon = await call('monitor', { products: [{ id: prodId, name: '磁砖', hs: '690721', market: 'TW', attributes: [] }], defaultCostInputs: { value: 30000, quantity: 2000, freight: 1800, insurance: 120, fee: 600, include_extended_fees: false } });
  check('变更监测生成消息并拦截非官方', () => {
    assert.equal(mon.body.rejected_non_official.length, 1);
    assert.ok(mon.body.impacts.length >= 1);
    assert.ok(mon.body.messages.length >= 1);
  });

  const msg = await call('messages', null, 'GET');
  check('消息中心可读且含未读计数', () => {
    assert.ok(msg.body.items.length >= 1);
    assert.ok(msg.body.unread >= 1);
  });
  const readOne = await call('messages/read', { id: msg.body.items[0].id });
  check('消息标已读', () => assert.equal(readOne.body.updated, 1));

  const scan = await call('ssg/scan', {}, 'POST');
  check('SSG 扫描写入告警', () => assert.ok(scan.body.alerts.length >= 1));

  const dash = await call('dashboard', null, 'GET');
  check('看板聚合含结论分布与风险项', () => {
    assert.ok(dash.body.products >= 1);
    assert.ok(dash.body.assessments >= 1);
    assert.ok(Object.keys(dash.body.verdict_distribution).length >= 1);
    assert.ok(dash.body.disclaimer);
  });

  const kb = await call('kb/rules?kind=tariffItems', null, 'GET');
  check('规则后台可列表与检索', () => {
    assert.ok(kb.body.rows.length >= 20);
    assert.equal(kb.body.key_field, 'code');
  });

  const ov = await call('kb/rules/tariffItems/170199', { record: { duty_rate: 51, verify_status: 'verified' }, updated_by: 'smoke-ops' }, 'PUT');
  check('规则覆写生效并记录审计人', () => {
    assert.equal(ov.status, 200);
    assert.equal(ov.body.record.verify_status, 'verified');
    assert.equal(ov.body.record.updated_by, 'smoke-ops');
  });
  const costAfter = await call('cost', { hs: '170199', market: 'TW', value: 100000, quantity: 1000, freight: 0, insurance: 0 });
  check('覆写后税负结论随之变化', () => assert.ok(costAfter.body.totals.effective_tax_rate_pct > cost.body.totals.effective_tax_rate_pct));
  const reset = await call('kb/reset', {}, 'POST');
  check('一键重置回到种子库', () => assert.ok(reset.body.removed >= 1));

  const rep = await fetch(`${BASE}/api/report/admission/${adm.body.record_id}`, { headers: { 'x-workspace': WS } });
  const repHtml = await rep.text();
  check('HTML 报告自包含且含免责与打印提示', () => {
    assert.equal(rep.status, 200);
    assert.ok(repHtml.includes('免责声明'));
    assert.ok(repHtml.includes('打印 / 导出 PDF'));
    assert.ok(repHtml.includes('产品市场准入评估报告'));
  });
  const repMd = await fetch(`${BASE}/api/report/admission/${adm.body.record_id}?format=markdown`, { headers: { 'x-workspace': WS } });
  const repMdText = await repMd.text();
  check('Markdown 报告可导出', () => assert.ok(repMdText.includes('结论')));

  const notFound = await call('report/admission/NOPE-1', null, 'GET');
  check('不存在记录返回 404', () => assert.equal(notFound.status, 404));

  const route404 = await call('nope/nope', {}, 'POST');
  check('未知接口返回 404 JSON', () => { assert.equal(route404.status, 404); assert.equal(route404.body.error.code, 'NOT_FOUND'); });

  const badJson = await fetch(`${BASE}/api/label`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-workspace': WS }, body: '{oops' });
  check('非法 JSON 返回 400', () => assert.equal(badJson.status, 400));

  const html = await fetch(`${BASE}/`);
  const htmlText = await html.text();
  check('根路径提供既有 React 前端', () => {
    assert.ok(htmlText.includes('知海 TradePilot'));
    assert.ok(htmlText.includes('assets/app.js'));
  });
  const consoleHtml = await fetch(`${BASE}/console/`);
  const consoleText = await consoleHtml.text();
  check('控制台位于 /console/ 且引用共享引擎模块', () => {
    assert.ok(consoleText.includes('./app.js'));
  });
  const consoleJs = await (await fetch(`${BASE}/console/app.js`)).text();
  check('控制台以相对路径 import 共享引擎（同口径保证）', () => assert.ok(consoleJs.includes("../engine/index.mjs")));
  const engineFile = await fetch(`${BASE}/engine/index.mjs`);
  check('引擎模块以 ESM MIME 提供（浏览器可直接 import）', () => {
    assert.ok(String(engineFile.headers.get('content-type')).includes('javascript'));
  });
  const blocked = await fetch(`${BASE}/data/products.json`);
  check('数据目录不对外暴露', () => assert.equal(blocked.status, 404));
  const trav = await fetch(`${BASE}/%2e%2e%2f%2e%2e%2f%2e%2e%2fWindows%2fwin.ini`);
  const travText = await trav.text();
  check('编码路径穿越不得泄露根目录外文件（未知路径回落首页）', () => {
    assert.ok(!/\[fonts\]|\[extensions\]/.test(travText), '不得返回 win.ini 内容');
    assert.ok(travText.includes('知海 TradePilot'));
  });
  const trav2 = await fetch(`${BASE}/engine/%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd`);
  const trav2Text = await trav2.text();
  check('引擎目录穿越同样被拦截', () => assert.ok(!/root:x:0:0/.test(trav2Text)));

  const del = await call(`products/${prodId}`, null, 'DELETE');
  check('产品档案删除', () => assert.equal(del.body.ok, true));

  /* ---------- v1 契约接口（字段名对齐前端 API-CONTRACT.md） ---------- */
  const v1h = await call('v1/health', null, 'GET');
  check('v1 健康检查带契约版本与免责声明', () => {
    assert.equal(v1h.body.contract, 'v1');
    assert.ok(v1h.body.disclaimer.includes('不能替代官方许可'));
  });

  const v1a = await call('v1/admission', { product: { name: '低糖燕麦饮', category: '食品饮料', hs: '220299', market: '中国台湾地区', origin: '中国大陆', specs: '250mL' } }, 'POST');
  check('v1 准入返回契约字段且来源绑定规则', () => {
    assert.ok(['permit_conditional', 'special_approval'].includes(v1a.body.status));
    assert.ok(v1a.body.conclusion.length > 10);
    assert.equal(v1a.body.applicant.requires_local_importer, true);
    assert.ok(Array.isArray(v1a.body.documents) && v1a.body.documents.length >= 6);
    assert.ok(v1a.body.timeline?.text);
    assert.ok(v1a.body.sources.length >= 3);
    assert.ok(v1a.body.sources.every((s) => s.rule_id && s.url !== undefined));
    assert.ok(v1a.body.rule_version && v1a.body.generated_at && v1a.body.session_id !== undefined);
    assert.ok(v1a.body.execution_variance?.ports?.length >= 4, '契约须披露口岸执行口径差异');
    assert.ok(v1a.body.business_inputs?.length >= 2, '契约须携带业务访谈出处');
    assert.equal(v1a.body.provenance, 'RULE_ENGINE');
    assert.equal(v1a.body.simulated, false);
  });

  const v1u = await call('v1/admission', { product: { name: '未知物', hs: '999999', market: '中国台湾地区', origin: '中国大陆' } }, 'POST');
  check('v1 规则缺失返回无法判定而非猜测', () => {
    assert.equal(v1u.body.status, 'undetermined');
    assert.equal(v1u.body.status_label, '无法判定');
    assert.ok(v1u.body.missing_fields.length >= 1);
    assert.equal(v1u.body.verification.usable_for_quotation, false);
  });

  const v1u2 = await call('v1/admission', { product: { name: '无编码产品', market: '中国台湾地区', origin: '中国大陆' } }, 'POST');
  check('v1 缺 HS 编码同样返回无法判定并列出待补字段', () => {
    assert.equal(v1u2.body.status, 'undetermined');
    assert.ok(v1u2.body.missing_fields.some((f) => String(f).includes('HS')));
  });

  const v1c = await call('v1/cost', { product: { hs: '170199', market: 'TW' }, costInputs: { value: 100000, quantity: 1000, freight: 5000, insurance: 500, dutyRate: 10, vatRate: 5, fee: 600, ssgRate: 0 }, ssg_mode: 'off' }, 'POST');
  check('v1 成本返回分项/总额/单价/报价带/未计入项', () => {
    assert.ok(v1c.body.items.length >= 6);
    assert.ok(v1c.body.items.every((i) => i.name && typeof i.amount === 'number' && i.formula));
    assert.ok(v1c.body.total > 0 && v1c.body.unit_cost > 0);
    assert.ok(v1c.body.quote.high > v1c.body.quote.low);
    assert.ok(v1c.body.not_included.length >= 5);
    assert.equal(v1c.body.currency, 'CNY');
    assert.equal(v1c.body.provenance, 'RULE_ENGINE');
  });

  const v1m = await call('v1/cost', { costInputs: { value: 30000, quantity: 2000, freight: 1800, insurance: 120, dutyRate: 10, vatRate: 5, fee: 600, ssgRate: 0 }, use_kb_rates: false, ssg_mode: 'manual' }, 'POST');
  check('v1 手工模式与原型静态快照口径一致（契约兼容）', () => {
    assert.equal(v1m.body.customs_value, 31920);
    assert.equal(v1m.body.total, 37467.6);
    assert.equal(v1m.body.effective_tax_rate_pct, 15.5);
    assert.equal(v1m.body.provenance, 'RULE_ENGINE_MANUAL_RATES');
  });

  const v1e = await call('v1/regulation-events', { products: [{ id: 'p1', name: '磁砖', hs: '690721', market: 'TW' }] }, 'POST');
  check('v1 法规事件返回影响/来源/生效日并拦截非官方', () => {
    assert.ok(v1e.body.events.length >= 1);
    const e0 = v1e.body.events[0];
    assert.ok(e0.title && e0.impact && e0.source_name);
    assert.ok(e0.effective_on !== undefined);
    assert.equal(v1e.body.rejected_non_official, 1);
  });

  const v1s = await call('v1/sources', null, 'GET');
  check('v1 来源登记接口可用', () => assert.ok(v1s.body.sources.length >= 8));

  /* ---------- V4：税率口径披露 / 工作区隔离 / v1 产品档案 ---------- */
  const ci = (over = {}) => ({ value: 10000, quantity: 100, freight: 1200, insurance: 80, dutyRate: 5, vatRate: 5, fee: 300, ssgRate: 0, ...over });
  const kb5 = await call('v1/cost', { product: { hs: '220299', market: '中国台湾地区' }, costInputs: ci({ dutyRate: 5 }), use_kb_rates: true, ssg_mode: 'off' }, 'POST');
  const kb50 = await call('v1/cost', { product: { hs: '220299', market: '中国台湾地区' }, costInputs: ci({ dutyRate: 50 }), use_kb_rates: true, ssg_mode: 'off' }, 'POST');
  check('v1 成本披露税率口径：规则库模式下用户税率被忽略且结果不变', () => {
    assert.equal(kb5.body.rate_basis.mode, 'knowledge_base_rates');
    assert.equal(kb5.body.rate_basis.duty_rate_pct, 12);
    assert.equal(kb5.body.rate_basis.vat_rate_pct, 5);
    assert.deepEqual(kb5.body.rate_basis.ignored_inputs, ['dutyRate', 'vatRate']);
    assert.equal(kb5.body.rate_basis.matched_tariff.code, '220299');
    assert.equal(kb5.body.rate_basis.matched_tariff.verify_status, 'needs_verification');
    assert.ok(kb5.body.rate_basis.note.includes('未被采用'));
    assert.equal(kb5.body.total, kb50.body.total, '用户改税率不应改变规则库口径结果');
  });

  const manual = await call('v1/cost', { product: { hs: '220299', market: '中国台湾地区' }, costInputs: ci({ dutyRate: 50 }), use_kb_rates: false, ssg_mode: 'off' }, 'POST');
  check('v1 手工模式采用用户税率并明确标注口径', () => {
    assert.equal(manual.body.rate_basis.mode, 'manual_rates');
    assert.equal(manual.body.rate_basis.duty_rate_pct, 50);
    assert.deepEqual(manual.body.rate_basis.ignored_inputs, []);
    assert.equal(manual.body.provenance, 'RULE_ENGINE_MANUAL_RATES');
    assert.ok(manual.body.total > kb5.body.total, '手工 50% 关税应高于规则库 12%');
  });

  const ssgOff = await call('v1/cost', { product: { hs: '071331', market: '中国台湾地区' }, costInputs: ci(), ssg_mode: 'off' }, 'POST');
  const ssgOn = await call('v1/cost', { product: { hs: '071331', market: '中国台湾地区' }, costInputs: ci(), ssg_mode: 'triggered' }, 'POST');
  check('列入 SSG 清单的品目：触发情景改变总额，未列入的品目不改变', () => {
    assert.equal(ssgOff.body.rate_basis.ssg_listed, true);
    assert.equal(ssgOff.body.rate_basis.matched_tariff.ssg_rate, 35);
    assert.ok(ssgOn.body.total > ssgOff.body.total, 'SSG 触发后总额应上升');
    assert.equal(kb5.body.rate_basis.ssg_listed, false, '220299 未列入 SSG，切换开关不应改变结果');
    assert.equal(kb5.body.ssg_applied_rate, 0);
  });

  const callOwner = async (p, body, method = 'POST', ws = WS) => {
    const r = await fetch(`${BASE}/api/${p}`, {
      method,
      headers: { 'content-type': 'application/json', 'x-workspace': ws, 'x-session-id': 'SMOKE-1' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await r.text();
    let json; try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 200) }; }
    return { status: r.status, body: json };
  };

  const seedA = { id: 'p-smoke-a', name: '工作区A产品', category: '食品饮料', hs: '220299', market: '中国台湾地区', origin: '中国大陆', specs: '250mL', scenario: 'conditional', color: 'blue', cost_value: 30000, cost_quantity: 2000 };
  const pA = await callOwner('v1/products', seedA, 'POST', 'ws-alpha');
  check('v1 产品档案创建并回显默认货值 / 数量', () => {
    assert.equal(pA.status, 201);
    assert.equal(pA.body.product.id, 'p-smoke-a');
    assert.equal(pA.body.product.cost_value, 30000);
    assert.equal(pA.body.product.cost_quantity, 2000);
    assert.equal(pA.body.product.scenario, 'conditional');
    assert.equal(pA.body.owner, 'ws-alpha');
    assert.equal(pA.body.repo_mode, 'jsonfile');
  });

  const pA2 = await callOwner('v1/products', { ...seedA, cost_value: 42000 }, 'POST', 'ws-alpha');
  check('同 ID 重复提交为 upsert，不产生副本', () => {
    assert.equal(pA2.status, 200);
    assert.equal(pA2.body.upserted, true);
    assert.equal(pA2.body.product.cost_value, 42000);
  });

  const listA = await callOwner('v1/products', null, 'GET', 'ws-alpha');
  const listB = await callOwner('v1/products', null, 'GET', 'ws-beta');
  check('工作区之间产品档案互相隔离', () => {
    assert.equal(listA.body.count, 1);
    assert.ok(listA.body.items.some((p) => p.id === 'p-smoke-a'));
    assert.equal(listB.body.count, 0);
    assert.equal(listB.body.items.some((p) => p.id === 'p-smoke-a'), false);
    assert.ok(listB.body.persistence_note.includes('演示'), '必须说明持久化边界');
  });

  const crossPut = await callOwner('v1/products/p-smoke-a', { specs: '越权修改' }, 'PUT', 'ws-beta');
  check('跨工作区改写他人档案返回 404', () => assert.equal(crossPut.status, 404));
  const crossDel = await callOwner('v1/products/p-smoke-a', null, 'DELETE', 'ws-beta');
  check('跨工作区删除他人档案返回 404', () => assert.equal(crossDel.status, 404));

  const putA = await callOwner('v1/products/p-smoke-a', { specs: '每箱 24 瓶', cost_quantity: 3000 }, 'PUT', 'ws-alpha');
  check('本工作区可更新档案', () => {
    assert.equal(putA.status, 200);
    assert.equal(putA.body.product.specs, '每箱 24 瓶');
    assert.equal(putA.body.product.cost_quantity, 3000);
  });

  const shortHs = await callOwner('v1/products', { name: '短码产品', hs: '12' }, 'POST', 'ws-alpha');
  check('HS 少于 4 位被拒绝而非静默入库', () => assert.equal(shortHs.status, 422));
  const noName = await callOwner('v1/products', { hs: '220299' }, 'POST', 'ws-alpha');
  check('缺产品名被校验拦截', () => assert.equal(noName.status, 422));

  const ownerAlias = await fetch(`${BASE}/api/v1/products`, { headers: { 'x-owner': 'ws-alpha' } });
  const aliasBody = await ownerAlias.json();
  check('x-owner 作为 x-workspace 别名同样生效', () => {
    assert.equal(aliasBody.owner, 'ws-alpha');
    assert.equal(aliasBody.count, 1);
  });

  const dirtyOwner = await fetch(`${BASE}/api/v1/products`, { headers: { 'x-workspace': '  <script>x</script>  ' } });
  const dirtyBody = await dirtyOwner.json();
  check('工作区名称被清洗（去标签与首尾空白）', () => {
    assert.ok(!/[<>]/.test(dirtyBody.owner), dirtyBody.owner);
    assert.equal(dirtyBody.owner, 'scriptx/script');
  });

  /* 中文企业名：HTTP 头不允许非 ASCII，客户端必须 encodeURIComponent，服务端必须还原 */
  const cnOwner = encodeURIComponent('评测企业A');
  const cnList0 = await (await fetch(`${BASE}/api/v1/products`, { headers: { 'x-workspace': cnOwner } })).json();
  check('中文工作区名经 URL 编码后正确还原', () => {
    assert.equal(cnList0.owner, '评测企业A');
    assert.equal(cnList0.count, 0);
  });
  const cnPost = await callOwner('v1/products', { id: 'p-cn-1', name: '中文工作区产品', hs: '220299', market: '中国台湾地区' }, 'POST', cnOwner);
  const cnList = await (await fetch(`${BASE}/api/v1/products`, { headers: { 'x-workspace': cnOwner } })).json();
  check('中文工作区可写入并与 ASCII 工作区互相隔离', () => {
    assert.equal(cnPost.status, 201);
    assert.equal(cnList.count, 1);
    assert.equal(cnList.items[0].id, 'p-cn-1');
    assert.equal(listA.body.count, 1, 'ASCII 工作区档案数不受影响');
  });

  const delA = await callOwner('v1/products/p-smoke-a', null, 'DELETE', 'ws-alpha');
  check('v1 产品档案删除', () => assert.equal(delA.body.ok, true));
  const delAgain = await callOwner('v1/products/p-smoke-a', null, 'DELETE', 'ws-alpha');
  check('重复删除返回 404', () => assert.equal(delAgain.status, 404));

  /* ---------- V7：全球市场准入扫描（一个产品 × 全部登记市场） ---------- */
  const mscan = await call('v1/market-scan', { product: { name: '低糖燕麦饮', category: '食品饮料', hs: '220299', origin: '中国大陆', specs: '250mL' } }, 'POST');
  check('市场扫描覆盖全部登记市场：四个建库市场各自按本市场规则出结论', () => {
    assert.equal(mscan.status, 200);
    assert.equal(mscan.body.markets.length, 4);
    assert.equal(mscan.body.built, 4);
    assert.equal(mscan.body.skeleton, 0);
    const twRow = mscan.body.markets.find((m) => m.market_code === 'TW');
    assert.ok(twRow.reason.includes('可按一般路径输入'), '已建库市场说明必须完整（扫描行不截断）');
    assert.equal(twRow.status, 'permit_conditional');
    assert.ok(twRow.evidence_count >= 3);
    assert.equal(twRow.verify_status, 'needs_verification');
    /* 日 / 美 / 欧：结论引用各自法规，且台湾的大陆禁止清单不跨市场套用 */
    const jpRow = mscan.body.markets.find((m) => m.market_code === 'JP');
    const usRow = mscan.body.markets.find((m) => m.market_code === 'US');
    const euRow = mscan.body.markets.find((m) => m.market_code === 'EU');
    for (const [row, law] of [[jpRow, '食品卫生法'], [usRow, 'FSVP'], [euRow, '一般食品法']]) {
      assert.equal(row.status, 'permit_conditional', `${row.market_name} 须出真实结论`);
      assert.ok(row.reason.includes(law), `${row.market_name} 结论须引用本市场法规`);
    }
    assert.ok(mscan.body.note.includes('跨市场推测'), '扫描说明须声明不做跨市场推测');
    assert.equal(mscan.body.provenance, 'RULE_ENGINE');
    assert.ok(mscan.body.disclaimer.includes('不能替代官方许可'));
  });
  check('市场分流：大陆禁止清单只作用台湾，日本同码产品不被误禁', async () => {
    const chest = await call('v1/market-scan', { product: { name: '糖渍栗子', category: '食品饮料', hs: '2008119200', origin: '中国大陆', specs: '500g' } }, 'POST');
    assert.equal(chest.body.markets.find((m) => m.market_code === 'TW').status, 'prohibited');
    assert.notEqual(chest.body.markets.find((m) => m.market_code === 'JP').status, 'prohibited');
  });

  const mscanNoHs = await call('v1/market-scan', { product: { name: '无编码产品', origin: '中国大陆' } }, 'POST');
  check('无 HS 产品扫描：建库市场也返回无法判定而非猜测', () => {
    assert.equal(mscanNoHs.status, 200);
    const tw = mscanNoHs.body.markets.find((m) => m.market_code === 'TW');
    assert.equal(tw.status, 'undetermined');
    assert.ok((tw.missing_fields || []).some((f) => String(f).includes('HS')));
  });

  const mscanNoName = await call('v1/market-scan', { product: { hs: '220299' } }, 'POST');
  check('缺产品名的扫描请求被校验拦截', () => assert.equal(mscanNoName.status, 422));

  /* ---------- V19：规则核验工作台 ---------- */
  const vq = await call('v1/kb/verify-queue', null, 'GET');
  check('核验队列返回全部类别规则与统计', () => {
    assert.equal(vq.status, 200);
    assert.ok(vq.body.items.length >= 55);
    assert.ok(vq.body.items.every((i) => i.kind && i.code && i.verify_status !== undefined));
    for (const k of ['tariffItems', 'regimes', 'labelRules', 'ssgSnapshots', 'adminFees', 'ports']) assert.ok(vq.body.items.some((i) => i.kind === k), k);
    assert.equal(vq.body.total, vq.body.items.length);
    assert.ok(vq.body.items.some((i) => (i.sources || []).length > 0 && i.sources[0].url));
    assert.ok(vq.body.note.includes('核验'));
  });
  check('核验队列给出定位三要素与按来源分组（不必开官网手搜）', () => {
    assert.ok(vq.body.items.every((i) => i.locator && Array.isArray(i.check_links)), '每条规则都要有 locator 与检索入口');
    const vTariff = vq.body.items.find((i) => i.kind === 'tariffItems' && i.code === '220299');
    assert.ok(vTariff.locator.fields_to_check.some((f) => f.includes('关税税率')), '税则条目须列出该比对的参数');
    const vRegime = vq.body.items.find((i) => i.kind === 'regimes' && i.code === 'RG-FOOD-01');
    assert.ok(vRegime.locator.legal_titles.length > 0, '管制制度须给出法规名定位');
    assert.ok(vRegime.params.includes('串行'), '周期角色须进关键参数摘要');
    const vLink = (vRegime.check_links || [])[0];
    assert.ok(vLink.search_url.includes('site%3A'), '站内检索式必须限定到该主管机关域名');
    const vQ = decodeURIComponent(vLink.search_url);
    assert.ok(vQ.includes('输入食品查验登记'), '检索式须用规则自身业务名');
    assert.ok(!vQ.includes('RG-FOOD'), '内部制度 ID 不得进官方检索式（搜了也搜不到）');
    assert.ok(vQ.includes('aaph') || vQ.includes('fda') || vQ.includes('trade') || vQ.includes('customs'), '检索域名为该规则绑定的主管机关');
    const vTariffQ = decodeURIComponent((vTariff.check_links[0] || {}).search_url || '');
    assert.ok(vTariffQ.includes('220299'), '官方税则编码须进检索式');
    assert.ok(!JSON.stringify(vq.body.items.map((i) => i.locator)).includes('待核验'), '定位文案不得把「（待核验）」当检索词');
    assert.ok(vq.body.groups.length >= 5, '按来源聚类须成组');
    assert.ok(vq.body.groups.every((g) => g.total > 0 && g.kinds_text && g.site));
    assert.equal(new Set(vq.body.groups.map((g) => g.site)).size, vq.body.groups.length, '分组必须各自命名（一条规则挂多机关时不得沿用其首个来源名）');
    assert.ok(vq.body.groups.some((g) => g.site.includes('食品药物管理署')), 'FDA 来源分组须以 FDA 之名显示');
    const s01g = vq.body.groups.find((g) => g.source_id === 'S01');
    assert.equal(s01g.total, vq.body.items.filter((i) => (i.sources || []).some((s) => s.id === 'S01')).length, '分组计数 = 挂该来源的条目数');
    assert.ok(vTariff.locator.locate_hint.includes('170') || vTariff.locator.locate_hint.includes('税号'), '每条给出「到哪个表/页找」的指引');
    assert.ok(vq.body.groups.some((g) => g.pending > 1), '存在一次进站可核多条的来源分组');
    const gSum = vq.body.groups.reduce((s, g) => s + g.total, 0);
    assert.ok(gSum >= vq.body.items.length, '多来源条目会进多个分组，合计不得少于条目数');
    assert.ok(vq.body.items.every((i) => (i.sources || []).length === 0
      ? vq.body.groups.some((g) => !g.source_id)
      : vq.body.groups.some((g) => (i.sources || []).some((s) => s.id === g.source_id))), '每条规则都能在其来源分组中找到');
  });
  const vrf1 = await call('v1/kb/verify', { kind: 'tariffItems', code: '220299', verify_status: 'verified', note: 'smoke：对照关务署税则核验' }, 'POST');
  check('核验单条规则成功并回写核验人', () => {
    assert.equal(vrf1.status, 200);
    assert.equal(vrf1.body.rule.verify_status, 'verified');
    assert.ok(vrf1.body.rule.updated_by);
  });
  const vq2 = await call('v1/kb/verify-queue', null, 'GET');
  check('核验后队列统计即时更新', () => {
    assert.equal(vq2.body.verified, vq.body.verified + 1);
    assert.ok(vq2.body.items.find((i) => i.kind === 'tariffItems' && i.code === '220299')?.verify_status === 'verified');
  });
  /* AI 预检：参数抽取比对 */
  const va1 = await call('v1/kb/verify-assist', { kind: 'tariffItems', code: '220299', official_text: '税则号别 220299 其他非酒精饮料：关税税率 12%。货物税：含糖饮料每升 6 元。' }, 'POST');
  check('AI 预检抽取税率/从量税并与规则比对一致（含文本证据）', () => {
    assert.equal(va1.status, 200);
    assert.equal(va1.body.verdict, 'consistent');
    const duty = va1.body.checks.find((c) => c.field === '关税税率');
    assert.equal(duty.match, true);
    assert.ok(duty.evidence && duty.evidence.includes('12'));
    const excise = va1.body.checks.find((c) => c.field.includes('货物税'));
    assert.equal(excise.match, true);
    assert.ok(va1.body.note.includes('人工'));
  });
  const va2 = await call('v1/kb/verify-assist', { kind: 'tariffItems', code: '220299', official_text: '关税税率 15%。' }, 'POST');
  check('AI 预检检出参数不一致（文本 15% vs 规则 12%）', () => {
    assert.equal(va2.body.verdict, 'mismatch');
    assert.equal(va2.body.checks.find((c) => c.field === '关税税率').match, false);
  });
  const va3 = await call('v1/kb/verify-assist', { kind: 'adminFees', code: 'FEE-FOOD-INSPECT', official_text: '输入食品查验费：每批收新台币 1,200 元。' }, 'POST');
  check('AI 预检核对规费金额并给出证据', () => {
    assert.equal(va3.body.verdict, 'consistent');
    const amt = va3.body.checks.find((c) => c.field === '规费金额');
    assert.equal(amt.match, true);
    assert.ok(amt.evidence);
  });
  const va4 = await call('v1/kb/verify-assist', { kind: 'regimes', code: 'RG-FOOD-01', official_text: '依食品安全卫生管理法办理输入食品查验，作业期间约 14 至 45 天。' }, 'POST');
  check('AI 预检核对制度周期与法规名称', () => {
    assert.equal(va4.body.verdict, 'consistent');
    assert.equal(va4.body.checks.find((c) => c.field === '办理周期').match, true);
    assert.equal(va4.body.checks.find((c) => c.field === '法规名称').match, true);
  });
  const va5 = await call('v1/kb/verify-assist', { kind: 'tariffItems', code: '220299', official_text: '   ' }, 'POST');
  check('空文本预检被校验拦截', () => assert.equal(va5.status, 422));

  /* 核验 220299 全部依据规则（税则 + 全部制度）后，评估结论应升级为可报价 */
  for (const it of vq.body.items.filter((i) => i.kind === 'regimes')) {
    await call('v1/kb/verify', { kind: 'regimes', code: it.code, verify_status: 'verified' }, 'POST');
  }
  const admV = await call('v1/admission', { product: { name: '低糖燕麦饮', category: '食品饮料', hs: '220299', market: '中国台湾地区', origin: '中国大陆', specs: '250mL' }, attributes: ['is_food'] }, 'POST');
  check('依据规则全部核验后，结论升级为「依据已核验」可报价', () => {
    assert.equal(admV.body.status, 'permit_conditional');
    assert.equal(admV.body.verification.usable_for_quotation, true);
    assert.equal(admV.body.verification.warning, null);
    assert.equal(admV.body.verification.unverified_rules, 0);
  });
  const resetV = await call('kb/reset', {}, 'POST');
  check('核验覆写可一键重置回种子库', () => assert.ok(resetV.body.removed >= 14));

  /* ---------- V19：法规变更登记 ---------- */
  const chgBad = await call('v1/regulation-changes', { change: { title: '小道消息测试', source_name: '某公众号', source_kind: 'unofficial' } }, 'POST');
  check('非官方来源登记被拦截（422）且不入库', () => {
    assert.equal(chgBad.status, 422);
    assert.ok(chgBad.body.error.message.includes('非官方'));
  });
  const chgNoUrl = await call('v1/regulation-changes', { change: { title: '缺 URL 测试', source_name: '财政部关务署' } }, 'POST');
  check('官方来源缺 URL 被校验拦截', () => assert.equal(chgNoUrl.status, 422));
  /* 登记评估按当前工作区（WS）产品执行：先放一个 220299 产品进去 */
  await call('v1/products', { id: 'p-chg-test', name: '变更登记测试产品', hs: '220299', market: '中国台湾地区' }, 'POST');
  const chg = await call('v1/regulation-changes', { change: { title: '含糖饮料关税税率调整（登记测试）', source_name: '财政部关务署', source_url: 'https://web.customs.gov.tw/', source_kind: 'official', diff_type: 'rate', affected_codes: ['220299'], effective_on: '2026-12-01', summary: '登记测试：非酒精饮料关税调整。' } }, 'POST');
  check('法规变更登记成功并即时评估影响', () => {
    assert.equal(chg.status, 200);
    assert.ok(chg.body.change.id.startsWith('CHG-'));
    assert.ok(chg.body.events.length >= 1, '工作区产品（220299）应命中');
    assert.ok(chg.body.events.every((e) => e.source_name && e.impact));
  });
  const pullAfter = await call('v1/regulation-events', { products: [{ id: 'px1', name: '低糖燕麦饮', hs: '220299', market: 'TW' }] }, 'POST');
  check('登记的变更在后续拉取中自动包含', () => {
    assert.ok(pullAfter.body.events.some((e) => e.title.includes('登记测试')));
  });

  /* ---------- V18：标签自查（F1-3） ---------- */
  const lblScan = await call('v1/label-scan', { text: '本產品可治療高血壓，零添加防腐劑，全網銷量第一。產地：中國。', market: 'TW', tags: ['food'] }, 'POST');
  check('标签扫描返回命中条款/整改建议/依据', () => {
    assert.equal(lblScan.status, 200);
    assert.equal(lblScan.body.passed, false);
    assert.ok(lblScan.body.hits.length >= 3);
    assert.ok(lblScan.body.hits.every((h) => h.rule_id && h.rule_name && h.severity && h.matched && h.why));
    assert.ok(lblScan.body.hits.some((h) => h.suggestion), '命中须带整改建议');
    assert.ok(lblScan.body.hits.some((h) => h.legal_basis.length > 0), '命中须绑定依据');
    assert.ok(lblScan.body.summary.publishable);
    assert.ok(lblScan.body.disclaimer.includes('不能替代'));
  });
  const lblClean = await call('v1/label-scan', { text: '品名：燕麥飲。成分：燕麥、水。淨重：250毫升。原產地：中國大陸。製造商：廈門某某食品有限公司。地址：廈門市某區某路88號。有效日期：2027年1月31日。營養標示：每份熱量120大卡。開封後請冷藏。', market: 'TW', tags: ['food'] }, 'POST');
  check('合规繁体文本扫描通过（passed=true 且零命中）', () => {
    assert.equal(lblClean.body.passed, true);
    assert.equal(lblClean.body.hits.length, 0);
  });
  const lblEmpty = await call('v1/label-scan', { text: '   ' }, 'POST');
  check('空文本扫描被校验拦截', () => assert.equal(lblEmpty.status, 422));

  /* ---------- V15：竞品参考 / 出海方案报告 ---------- */
  const comp = await call('v1/competitors', { product: { name: '低糖燕麦饮', hs: '220299', category: '食品饮料' } }, 'POST');
  check('竞品接口返回检索快照与每升归一价格带', () => {
    assert.equal(comp.status, 200);
    assert.ok(comp.body.count >= 8);
    assert.ok(comp.body.items.every((c) => c.brand && c.platform && c.price_twd[0] <= c.price_twd[1]));
    assert.ok(comp.body.items.some((c) => c.twd_per_liter > 0));
    assert.equal(comp.body.band.unit, 'TWD/升');
    assert.ok(comp.body.band.min > 0 && comp.body.band.max >= comp.body.band.min);
    assert.ok(comp.body.note.includes('非实时'));
    assert.ok(comp.body.items.every((c) => c.verify_status === 'needs_verification'));
    assert.ok(Array.isArray(comp.body.known_category_words) && comp.body.known_category_words.includes('果汁'), '词库须随数据透出');
  });
  const compJuice = await call('v1/competitors', { product: { name: '芒果果汁', hs: '2009', category: '食品饮料', specs: '芒果原汁 330ml' } }, 'POST');
  check('果汁类竞品按细分品类匹配到直接竞品', () => {
    assert.equal(compJuice.status, 200);
    assert.equal(compJuice.body.match_level, 'subcategory');
    assert.equal(compJuice.body.subcategory, 'juice');
    assert.ok(compJuice.body.direct.length >= 3);
    assert.ok(compJuice.body.direct.every((c) => c.match_reason));
  });
  const compJp = await call('v1/competitors', { product: { name: '燕麦奶饮', hs: '220299', category: '食品饮料', specs: '1L', market: 'JP' } }, 'POST');
  check('竞品按市场分流：日本产品只命中日本渠道快照并披露折算口径', () => {
    assert.equal(compJp.status, 200);
    assert.equal(compJp.body.market, 'JP');
    assert.ok(compJp.body.items.length >= 2);
    assert.ok(compJp.body.items.every((c) => c.market === 'JP' && c.price_local && c.currency === 'JPY'));
    assert.ok(compJp.body.note.includes('参考折算'), '非台湾市场须披露本地币种与折算口径');
  });

  const rpt = await call('v1/report', { product: { name: '低糖燕麦饮', category: '食品饮料', hs: '220299', market: '中国台湾地区', origin: '中国大陆', specs: '250mL' }, costInputs: { value: 30000, quantity: 2000, freight: 1800, insurance: 120, fee: 600 } }, 'POST');
  check('方案报告串联调研/评估/成本/风控/方案五段', () => {
    assert.equal(rpt.status, 200);
    const R = rpt.body.report;
    assert.equal(R.admission.verdict.code, 'permit_conditional');
    assert.ok(R.cost.totals.grand_total > 0);
    assert.equal(R.research.scan.built, 4);
    assert.ok(R.research.competitors.count >= 8);
    assert.ok(R.plan.risks.length >= 4);
    assert.ok(R.plan.risks.every((x) => x.provenance));
    for (const s of ['一、市场调研', '二、准入评估', '三、成本与收益', '四、风控预案', '五、下一步方案']) assert.ok(rpt.body.markdown.includes(s), s);
    assert.ok(rpt.body.html.startsWith('<!DOCTYPE'));
    /* V23/V27：报告说明列完整不截断 + 四个建库市场全部入表 */
    assert.ok(rpt.body.html.includes('可按一般路径输入'), '已建库市场说明不得被 80 字腰斩');
    assert.ok(rpt.body.html.includes('日本') && rpt.body.html.includes('欧盟'), '报告扫描表须列出新建库市场');
    assert.ok(!rpt.body.html.includes('骨架'), '报告不应再出现骨架市场行');
    assert.ok(rpt.body.html.includes('打印 / 导出 PDF'));
    assert.ok(rpt.body.html.includes('四、风控预案'));
    assert.ok(rpt.body.record_id.startsWith('RPT-'));
    assert.equal(rpt.body.provenance, 'RULE_ENGINE');
  });

  const rptBad = await call('v1/report', { product: { name: '无编码产品', market: '中国台湾地区' }, costInputs: {} }, 'POST');
  check('缺参报告降级生成并明示缺口', () => {
    assert.equal(rptBad.status, 200);
    assert.equal(rptBad.body.report.admission.verdict.code, 'undetermined');
    assert.equal(rptBad.body.report.cost, null);
    assert.ok(rptBad.body.markdown.includes('成本测算未完成'));
  });

  const rptNoName = await call('v1/report', { product: { hs: '220299' } }, 'POST');
  check('缺产品名的报告请求被校验拦截', () => assert.equal(rptNoName.status, 422));

  /* ---------- V9：税则库 / 法规库只读接口 ---------- */
  const tw = await call('v1/kb/tariff-items', null, 'GET');
  check('税则库接口返回全部税则条目与税率口径', () => {
    assert.equal(tw.status, 200);
    assert.ok(tw.body.items.length >= 20);
    assert.equal(tw.body.count, tw.body.items.length);
    const item = tw.body.items.find((x) => x.code === '220299');
    assert.equal(item.duty_rate, 12);
    assert.equal(item.ssg_rate, null);
    assert.ok(item.source_ids.length >= 1);
    assert.equal(item.verify_status, 'needs_verification');
    const ssgItem = tw.body.items.find((x) => x.code === '170199');
    assert.equal(ssgItem.ssg_rate, 30);
    assert.ok(tw.body.disclaimer.includes('不能替代官方许可'));
  });

  const rg = await call('v1/kb/regulations', null, 'GET');
  check('法规库接口返回管制制度与法规依据', () => {
    assert.equal(rg.status, 200);
    assert.ok(rg.body.items.length >= 10);
    const imp = rg.body.items.find((x) => x.id === 'RG-IMP-01');
    assert.equal(imp.requires_local_importer, true);
    assert.ok(imp.documents.length >= 3);
    assert.ok(imp.legal_basis[0].title);
    assert.ok(imp.legal_basis[0].article);
    assert.equal(imp.verify_status, 'needs_verification');
    assert.ok(rg.body.items.every((x) => x.agency && x.name));
  });
} catch (e) {
  results.push(['FAIL', `冒烟流程异常：${e.message}`]);
} finally {
  child.kill('SIGTERM');
}

const fails = results.filter(([s]) => s === 'FAIL');
for (const [s, n] of results) console.log(`${s === 'PASS' ? '✓' : '✗'} ${n}`);
console.log(`\n共 ${results.length} 项，通过 ${results.length - fails.length}，失败 ${fails.length}`);
process.exit(fails.length ? 1 : 0);
