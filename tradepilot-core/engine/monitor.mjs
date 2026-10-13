/**
 * F1-2 法规增量监测与变更影响评估
 * ------------------------------------------------------------------
 * 要做什么：接收法规/检疫/标签/税率变更条目 → 匹配用户已录入的产品档案 →
 *          评估业务影响（是否需改标签、补许可、更换口岸）→ 生成站内消息与合规变更报告
 * 输入：changes[]（运营录入或采集源 feed）+ products[]（用户产品档案）
 * 输出：影响清单（按产品分组，含成本 delta 重算）+ 消息条目 + 可导出报告
 * 边界：
 *   1) 只处理公开官方来源，非官方渠道消息不纳入知识库（change.source_kind 必须为 official）；
 *   2) 一期采集层以「运营录入 + 模拟 feed」演示，不宣称已完成自动爬虫；
 *   3) 成本 delta 由税负引擎按变更后税率重算，不由模型估算。
 */

import { round } from './util.mjs';
import { DISCLAIMER } from './kb.mjs';
import { calculateCost } from './tax.mjs';

const KIND_IMPACT = {
  rate: { action: '重算综合税负并复核报价', level: 'high' },
  ssg: { action: '复核 SSG 累积量与触发情景', level: 'high' },
  label: { action: '更新标签与宣传文案，重新送审', level: 'medium' },
  list_add: { action: '暂停以当前假设继续报价，确认是否命中禁止/许可清单', level: 'critical' },
  list_remove: { action: '可重启评估，重跑准入判断', level: 'medium' },
  procedure: { action: '更新书件清单与办理路径，通知当地进口商', level: 'medium' },
  quarantine: { action: '确认产地/寄主限制与检疫文件要求', level: 'high' },
};

export function evaluateChanges({ changes = [], products = [], kb, defaultCostInputs = null }) {
  const official = changes.filter((c) => (c.source_kind || 'official') === 'official');
  const rejected = changes.filter((c) => (c.source_kind || 'official') !== 'official')
    .map((c) => ({ id: c.id, title: c.title, reason: '非官方公开来源，按边界约束不纳入知识库' }));

  const impacts = [];
  for (const change of official) {
    for (const product of products) {
      const match = matchProductToChange({ change, product, kb });
      if (!match.matched) continue;
      const meta = KIND_IMPACT[change.diff_type] || { action: '人工复核影响范围', level: 'medium' };
      const entry = {
        change_id: change.id,
        title: change.title,
        market: change.market || 'TW',
        effective_on: change.effective_on || null,
        diff_type: change.diff_type || 'procedure',
        impact_level: meta.level,
        actions: [meta.action],
        match_reason: match.reason,
        source: { name: change.source_name || '运营录入', url: change.source_url || '', kind: 'official' },
        summary: change.summary || '',
        cost_delta: null,
        requires_reassess: ['rate', 'list_add', 'list_remove', 'ssg'].includes(change.diff_type),
        requires_label_change: change.diff_type === 'label',
        requires_port_change: !!change.port_change,
      };

      if (change.diff_type === 'rate' && defaultCostInputs) {
        try {
          const before = calculateCost({ ...defaultCostInputs, hs: product.hs, market: product.market || 'TW' }, kb);
          const after = calculateCost({ ...defaultCostInputs, hs: product.hs, market: product.market || 'TW', use_kb_rates: false, dutyRate: Number(change.new_value ?? before.inputs.dutyRate) }, kb);
          entry.cost_delta = {
            duty_rate_before: before.inputs.dutyRate,
            duty_rate_after: after.inputs.dutyRate,
            unit_landed_before: before.totals.unit_landed_cost,
            unit_landed_after: after.totals.unit_landed_cost,
            uplift_pct: round(((after.totals.unit_landed_cost - before.totals.unit_landed_cost) / before.totals.unit_landed_cost) * 100, 2),
            note: '按变更后税率重算，其余参数沿用产品档案默认成本假设。',
          };
          entry.actions.push(`单件落地成本预计变动 ${entry.cost_delta.uplift_pct}%，需复核对外报价。`);
        } catch (e) {
          entry.cost_delta = { error: `成本重算未完成：${e.message}` };
        }
      }
      impacts.push(entry);
    }
  }

  const byProduct = new Map();
  for (const i of impacts) {
    const key = i.match_key || i.change_id;
    if (!byProduct.has(i.product_id || key)) byProduct.set(i.product_id || key, []);
    byProduct.get(i.product_id || key).push(i);
  }

  const messages = impacts
    .filter((i) => ['critical', 'high'].includes(i.impact_level))
    .map((i) => ({
      level: i.impact_level,
      title: `法规变更：${i.title}`,
      body: `${i.actions.join('；')}。生效日 ${i.effective_on || '未公布'}。`,
      product_id: i.product_id || null,
      source_url: i.source.url,
      created_at: new Date().toISOString(),
    }));

  return {
    engine: 'regulation_monitor',
    generated_at: new Date().toISOString(),
    rule_version: kb.version,
    scanned_changes: official.length,
    rejected_non_official: rejected,
    impacted_products: [...new Set(impacts.map((i) => i.product_id).filter(Boolean))].length,
    impacts: impacts.sort((a, b) => rank(b.impact_level) - rank(a.impact_level)),
    messages,
    report_sections: buildSections(impacts),
    limitations: [
      '变更条目由运营录入或模拟 feed 提供，一期未接通自动采集。',
      '影响判定基于编码前缀与标签匹配，可能漏判未在编码层面体现的适用范围变化。',
      '成本 delta 仅在提供默认成本假设时计算，且沿用同一批数量与口岸。',
    ],
    disclaimer: DISCLAIMER,
  };
}

function matchProductToChange({ change, product, kb }) {
  const codes = (change.affected_codes || []).filter(Boolean);
  const tags = change.affected_tags || [];
  const markets = change.market ? [change.market] : [];
  if (markets.length && product.market && !markets.some((m) => (kb.findMarket(m)?.name || m) === (kb.findMarket(product.market)?.name || product.market))) {
    return { matched: false };
  }
  const hs = String(product.hs || '').replace(/[^0-9]/g, '');
  if (codes.length) {
    const hit = codes.find((c) => hs && hs.startsWith(String(c)));
    if (hit) return { matched: true, reason: `编码前缀匹配：${product.hs} ↔ ${hit}`, key: `code:${hit}` };
    return { matched: false };
  }
  if (tags.length) {
    const item = hs ? safeTariff(kb, hs) : null;
    const productTags = new Set([...(item?.tags || []), ...(product.attributes || [])]);
    const hit = tags.find((t) => productTags.has(t));
    if (hit) return { matched: true, reason: `管制标签匹配：${hit}`, key: `tag:${hit}` };
  }
  return { matched: false };
}

const safeTariff = (kb, hs) => { try { return kb.findTariff(hs); } catch { return null; } };

function buildSections(impacts) {
  const groups = { critical: [], high: [], medium: [], low: [] };
  for (const i of impacts) (groups[i.impact_level] || groups.medium).push(i);
  return Object.entries(groups).filter(([, v]) => v.length).map(([level, items]) => ({
    level, count: items.length, items: items.map((i) => ({ title: i.title, product_id: i.product_id, actions: i.actions, effective_on: i.effective_on })),
  }));
}

const rank = (l) => ({ critical: 4, high: 3, medium: 2, low: 1 }[l] || 0);

/** 演示用变更 feed（模拟采集源产出，来源均为公开官方机构） */
export const demoChangeFeed = [
  { id: 'CHG-2026-1001', title: '含糖饮料货物税单位税额调整（示例）', market: 'TW', diff_type: 'rate', affected_codes: ['220299'], new_value: 15, old_value: 12, summary: '示例条目：非酒精饮料关税税率由 12% 调整为 15%。', source_name: '财政部关务署', source_url: 'https://www.customs.gov.tw/', source_kind: 'official', effective_on: '2026-12-01', published_on: '2026-10-02' },
  { id: 'CHG-2026-1002', title: '包装食品添加物标示用语加严（示例）', market: 'TW', diff_type: 'label', affected_tags: ['food'], summary: '示例条目：禁止以「零添加/无防腐剂」作为诉求，需改版标签与文案。', source_name: '卫生福利部食品药物管理署', source_url: 'https://www.fda.gov.tw/', source_kind: 'official', effective_on: '2027-01-01', published_on: '2026-09-26' },
  { id: 'CHG-2026-1003', title: '部分植物产品检疫要求更新（示例）', market: 'TW', diff_type: 'quarantine', affected_tags: ['plant_product'], summary: '示例条目：新增寄主与产地组合限制，须确认检疫文件。', source_name: '农业部动植物防疫检疫署', source_url: 'https://www.aaph.gov.tw/', source_kind: 'official', effective_on: '2026-11-15', published_on: '2026-10-01' },
  { id: 'CHG-2026-1004', title: 'SSG 累积量周更新（示例）', market: 'TW', diff_type: 'ssg', affected_codes: ['690721'], summary: '示例条目：磁砖 SSG 累积量逼近触发点，须复核报价缓冲。', source_name: '财政部关务署', source_url: 'https://web.customs.gov.tw/', source_kind: 'official', effective_on: '2026-10-05', published_on: '2026-10-05' },
  { id: 'CHG-2026-9999', title: '某自媒体称将开放新类目（非官方）', market: 'TW', diff_type: 'procedure', affected_tags: ['food'], summary: '非官方小道消息，用于演示边界拦截。', source_name: '某公众号转载', source_url: '', source_kind: 'unofficial', effective_on: null, published_on: '2026-10-06' },
];
