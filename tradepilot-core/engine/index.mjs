/**
 * 核心能力编排层（Core Orchestrator）
 * ------------------------------------------------------------------
 * 把「检索 → 规则引擎 → LLM 成文 → 报告」串成一条可复用的调用链。
 * 浏览器与服务端共用本文件，保证同一输入得到同一结论。
 */

import { createKnowledgeBase, DISCLAIMER, RULE_VERSION, DATA_AS_OF, UNVERIFIED_WARNING } from './kb.mjs';
import { assessAdmission } from './admission.mjs';
import { calculateCost, compareScenarios } from './tax.mjs';
import { checkSsg, scanSsgAlerts } from './ssg.mjs';
import { scanLabel } from './label.mjs';
import { evaluateChanges, demoChangeFeed } from './monitor.mjs';
import { buildRiskPlan } from './plan.mjs';
import { createLlmGateway, templateBrief } from './llm-gateway.mjs';
import { buildReportHtml, buildReportMarkdown, timelineSummary, timelineBreakdownLines } from './report.mjs';
import { AppError } from './util.mjs';

export function createCore({ overrides = {}, gateway = {}, onLlmCall = null } = {}) {
  const kb = createKnowledgeBase({ overrides });
  const gw = createLlmGateway({ config: gateway, logger: onLlmCall, kb });

  async function assess(input) {
    const result = assessAdmission(input, kb);
    const retrieval = result.verdict.code === 'undetermined'
      ? kb.search(`${input.name || ''} ${input.hs || ''} 准入 管制 标示`, { limit: 5 })
      : kb.search(`${result.classification?.matched_name || ''} ${(result.regimes || []).map((r) => r.name).join(' ')} 申请主体 书件`, { limit: 6 });
    const brief = await gw.narrate({
      promptName: 'admission_brief',
      payload: result,
      retrieval,
      fallbackText: templateBrief(result),
    });
    return { ...result, narrative: brief, retrieval_trace: retrieval };
  }

  async function cost(input) {
    const result = calculateCost(input, kb);
    const retrieval = kb.search(`${result.matched_tariff?.name || ''} 关税 货物税 营业税 捐费 完税价格`, { limit: 5 });
    const brief = await gw.narrate({
      promptName: 'cost_brief',
      payload: result,
      retrieval,
      fallbackText: templateBrief(result),
    });
    return { ...result, narrative: brief, retrieval_trace: retrieval };
  }

  /**
   * 出海方案报告（调研 → 评估 → 成本 → 风控 → 方案）：
   * 一次输入产品档案与成本参数，串联全部引擎能力并返回结构化数据 + Markdown。
   * 服务端编排（本函数），不在前端拼装——保证报告与页面同源同口径。
   */
  async function journeyReport({ product, costInputs = {}, useKbRates = true }) {
    let assessment = null;
    try {
      assessment = assessAdmission({ ...product, market: product?.market || 'TW' }, kb);
    } catch (e) {
      /* 必填字段缺失（如原产地）时降级：报告仍生成，评估段标注缺口而非整体失败 */
      assessment = { verdict: { code: 'undetermined', label: '无法判定', reason: `评估未完成：${e.message}` }, applicant: { requires_local_importer: true }, evidence: [], document_checklist: [], missing_fields: [e.message], timeline: null, verification: { unverified_rules: 0 } };
    }
    let cost = null; let costError = null;
    try {
      cost = calculateCost({
        hs: product?.hs || null, market: product?.market || 'TW',
        value: costInputs.value, quantity: costInputs.quantity,
        freight: costInputs.freight ?? 0, insurance: costInputs.insurance ?? 0,
        fee: costInputs.fee ?? 0, dutyRate: costInputs.dutyRate, vatRate: costInputs.vatRate,
        use_kb_rates: useKbRates, ssg_mode: 'off', include_extended_fees: true,
      }, kb);
    } catch (e) { costError = e.message; /* 成本缺参数时降级：报告仍生成，成本段标注缺口 */ }
    const scan = scanMarkets(product || {});
    const competitors = kb.findCompetitors({ hs: product?.hs, category: product?.category, tags: ['food'], name: product?.name, specs: product?.specs, market: product?.market || 'TW' });
    const plan = buildRiskPlan({ product, assessment, cost }, kb);
    const data = { assessment, cost, costError, scan, competitors, plan };
    return { data, markdown: buildJourneyMarkdown({ product, assessment, cost, costError, scan, competitors, plan }) };
  }

  function buildJourneyMarkdown({ product, assessment, cost, costError, scan, competitors, plan }) {
    const L = [];
    L.push(`# 出海方案报告 · ${product?.name || '未命名产品'}`, '');
    L.push(`> 规则版本 ${kb.version} · 生成时间 ${new Date().toLocaleString('zh-CN')} · 全部结论待人工核验，不构成报价/报关/签约依据`, '');
    L.push('## 一、市场调研', '');
    L.push(`- 全球市场扫描：${scan.built} 个已建库市场、${scan.skeleton} 个骨架市场（未建库一律「无法判定」）`);
    const built = scan.rows.filter((r) => r.coverage !== 'skeleton');
    for (const r of built) L.push(`  - ${r.market_name}：${r.status_label}（依据 ${r.evidence_count} 条规则）`);
    /* 骨架市场：结论仍是无法判定，但给出背景概览（监管机关/门槛/标签，待核验）供调研 */
    const skRows = scan.rows.filter((r) => r.coverage === 'skeleton' && r.overview);
    if (skRows.length) {
      L.push('  骨架市场（未建库，一律「无法判定」；以下为背景概览，全部待核验，不构成准入结论）：');
      for (const r of skRows) L.push(`  - ${r.market_name}：监管 ${r.overview.regulator}｜标签 ${r.overview.label}｜门槛 ${r.overview.gates[0]}${r.overview.gates.length > 1 ? ` 等 ${r.overview.gates.length} 项` : ''}`);
    }
    if (competitors.count) {
      const snap = [...new Set(competitors.items.map((c) => c.retrieved_at))].join('/');
      const line = (c) => `  - ${c.brand} ${c.name}｜${c.platform}｜NT$${c.price_twd[0]}–${c.price_twd[1]}（${c.spec}${c.volume_liters ? `，约 NT$${Math.round(c.price_twd[1] / c.volume_liters)}/升` : ''}）`;
      if (competitors.match_level === 'subcategory' || competitors.match_level === 'text') {
        L.push(`- 竞品参考（${competitors.match_level === 'subcategory' ? `细分品类：${competitors.subcategory_label || competitors.subcategory}` : '品名相似度匹配'} · 快照 ${snap} · 待核验）：`);
        L.push(`  直接竞品（${competitors.direct.length} 条${competitors.match_level === 'text' ? '，按品名相似度' : ''}）：`);
        for (const c of competitors.direct) L.push(line(c) + (c.match_reason ? `（${c.match_reason}）` : ''));
        if (competitors.substitutes.length) {
          L.push(`  替代品 / 相邻品类（${competitors.substitutes.length} 条）：`);
          for (const c of competitors.substitutes) L.push(line(c));
        }
        if (competitors.band_direct) L.push(`  - 价格带（直接竞品）：NT$${competitors.band_direct.min}–${competitors.band_direct.max}/升${competitors.band_all ? `；（含替代品）NT$${competitors.band_all.min}–${competitors.band_all.max}/升` : ''}`);
      } else {
        L.push(`- 竞品参考（未识别细分品类，按 HS 品类粗匹配 · 快照 ${snap} · 待核验）：`);
        for (const c of competitors.items) L.push(line(c));
        L.push(`  - 价格带（品类口径）：NT$${competitors.band.min}–${competitors.band.max}/升`);
        L.push('  - 提示：产品资料中写明品类关键词（如燕麦、气泡、豆浆）可匹配到直接竞品');
      }
    } else L.push('- 竞品参考：该品类竞品库尚未录入');
    L.push('', '## 二、准入评估', '');
    L.push(`- 结论：**${assessment.verdict.label}**（${assessment.verdict.code}）`);
    if (assessment.verdict.code === 'undetermined') L.push(`- 无法判定原因：${assessment.verdict.reason}`);
    L.push(`- 申请主体：${assessment.applicant?.requires_local_importer ? '须当地进口商申报' : '可自行申报'}`);
    L.push(`- 关键路径周期：${timelineSummary(assessment.timeline)}`);
    for (const line of timelineBreakdownLines(assessment.timeline)) L.push(`  - ${line}`);
    L.push(`- 命中条例：${assessment.evidence?.length || 0} 条（见评估页，均可追溯规则 ID）`);
    L.push(`- 办理书件：${assessment.document_checklist?.length || 0} 项`);
    L.push('', '## 三、成本与收益', '');
    if (cost) {
      L.push(`- 综合落地成本：${cost.totals.grand_total}（币种同输入货值）`);
      L.push(`- 单位落地成本：${cost.totals.unit_landed_cost} / 件｜综合税负率 ${cost.totals.effective_tax_rate_pct}%（CIF 口径）`);
      if (cost.quote) L.push(`- 建议报价带：${cost.quote.suggested_low} – ${cost.quote.suggested_high}（含缓冲 ${cost.quote.buffer_pct}%）`);
      if (cost.pending_items?.length) { L.push('- ⚠ 待补/口径警示：'); for (const p of cost.pending_items) L.push(`  - ${p.label}`); }
    } else {
      L.push(`- 成本测算未完成：${costError || '缺少必要参数'}。补齐货值/数量后重新生成本报告。`);
    }
    L.push('', '## 四、风控预案', '');
    L.push('| # | 类别 | 风险 | 触发条件 | 预案动作 | 责任角色 | 监控指标 |', '|---|---|---|---|---|---|---|');
    for (const r of plan.risks) L.push(`| ${r.id} | ${r.category} | ${r.risk} | ${r.trigger} | ${r.action} | ${r.owner} | ${r.monitor} |`);
    L.push('', '## 五、下一步方案', '');
    L.push('1. 补齐/核验书件清单（见评估页），专案类由当地进口方牵头递交；');
    L.push('2. 按报价带与竞品价格带确定上市定价，预留 SSG 与汇率缓冲；');
    L.push('3. 首票小批量试单，通关后复盘动销与复购数据再决定放量；');
    L.push('4. 订阅法规变更预警，规则变化后重新生成本报告。', '');
    L.push('---', '', plan.disclaimer);
    return L.join('\n');
  }

  function ssg(input) { return checkSsg(input, kb); }
  function label(input) { return scanLabel(input, kb); }
  function compare(input) { return compareScenarios(input, kb); }
  function monitor(input) { return evaluateChanges({ ...input, kb }); }

  /**
   * 市场准入扫描：一个产品 × 规则库登记的全部市场（反向查询）。
   * 与单市场 assess 同一套判定逻辑：已建库市场输出真实结论，
   * 骨架市场一律 undetermined（无法判定）并说明原因，绝不推测。
   * 不走 LLM 成文（逐行 reason 已足够），保证扫描又快又确定。
   */
  function scanMarkets(input) {
    const rows = kb.raw.markets.map((m) => {
      const base = { market_code: m.code, market_name: m.name, coverage: m.coverage, currency: m.currency };
      /* 骨架市场的背景概览：主管机关/法定门槛/标签要求等稳定事实（待核验）。
         它不改变「无法判定」结论——概览是给调研用的路标，不是准入判定。 */
      if (m.coverage === 'skeleton') {
        return {
          ...base,
          status: 'undetermined', status_label: '无法判定',
          reason: `目标市场「${m.name}」规则库尚未建库（coverage=skeleton），系统不输出推测性准入结论。`,
          missing_fields: ['该市场完整管制制度', '该市场税则条目'],
          evidence_count: 0, verify_status: 'skeleton', usable_for_quotation: false,
          overview: m.overview || null,
        };
      }
      try {
        const r = assessAdmission({ ...input, market: m.code }, kb);
        return {
          ...base,
          status: r.verdict.code,
          status_label: r.verdict.code === 'undetermined' ? '无法判定' : r.verdict.label,
          reason: r.verdict.reason,
          missing_fields: r.missing_fields || [],
          evidence_count: (r.evidence || []).length,
          verify_status: r.verification?.usable_for_quotation ? 'verified' : (m.coverage === 'skeleton' ? 'skeleton' : 'needs_verification'),
          usable_for_quotation: r.verification?.usable_for_quotation || false,
        };
      } catch (e) {
        return {
          ...base,
          status: 'undetermined',
          status_label: '无法判定',
          reason: `该市场评估未完成：${e.message}`,
          missing_fields: [],
          evidence_count: 0,
          verify_status: 'skeleton',
          usable_for_quotation: false,
        };
      }
    });
    return {
      engine: 'market_scan',
      generated_at: new Date().toISOString(),
      rule_version: kb.version,
      rows,
      built: rows.filter((r) => r.coverage !== 'skeleton').length,
      skeleton: rows.filter((r) => r.coverage === 'skeleton').length,
      disclaimer: DISCLAIMER,
      note: '扫描只覆盖已登记市场，且每个市场按自己的规则库出结论；未登记品目一律「无法判定」，不做跨市场推测。扩展市场按「税则 + 制度 + 来源」三件套补录即可自动进入扫描与评估。',
    };
  }

  function report(kind, payload, { format = 'html' } = {}) {
    return format === 'markdown' ? buildReportMarkdown(kind, payload) : buildReportHtml(kind, payload);
  }

  return {
    meta: { rule_version: RULE_VERSION, data_as_of: DATA_AS_OF, llm_mode: gw.mode, disclaimer: DISCLAIMER, unverified_warning: UNVERIFIED_WARNING },
    kb,
    assess, cost, ssg, label, compare, monitor, report, scanMarkets, journeyReport,
    ssgAlerts: (opts) => scanSsgAlerts(kb, opts),
    demoChangeFeed,
    health: () => ({ ok: true, llm_mode: gw.mode, rule_version: RULE_VERSION, kb_stats: kb.stats(), gateway: gw.stats() }),
  };
}

export { AppError, DISCLAIMER, RULE_VERSION, DATA_AS_OF };
export { normalizeHs } from './kb.mjs';
