/**
 * F2-2 SSG 特别防卫措施监控预警
 * ------------------------------------------------------------------
 * 要做什么：读取公开 SSG 累积量快照 → 计算距触发剩余空间 → 做加征成本模拟
 *          → 给出报价风险缓冲建议
 * 输入：HS 编码或品类 + 拟出口数量（+ 可选：自身已申报量、近期速率修正）
 * 输出：累积进度、剩余空间、预计触发时点、触发后成本上涨模拟、缓冲建议、告警等级
 * 边界：
 *   1) 外部数据源存在延迟，输出必须带 snapshot_date，并标注「仅供参考，以海关实际公告为准」；
 *   2) 累积量为全市场共享额度，本系统只能按「线性速率」外推，不宣称预测准确性；
 *   3) 快照缺失时一律返回 unknown，不允许用邻近品类替代。
 */

import { AppError, num, round } from './util.mjs';
import { DISCLAIMER, normalizeHs } from './kb.mjs';

const LEVELS = {
  safe: { code: 'safe', label: '安全', tone: 'green' },
  watch: { code: 'watch', label: '关注', tone: 'cyan' },
  alert: { code: 'alert', label: '告警', tone: 'amber' },
  breach: { code: 'breach', label: '已逾触发点', tone: 'red' },
  unknown: { code: 'unknown', label: '无数据', tone: 'slate' },
};

export function checkSsg(input, kb) {
  const quantity = num(input.quantity ?? 1, '拟出口数量', { min: 1 });
  let snap = null;
  if (input.hs) {
    try { snap = kb.findSsg(input.hs); } catch { snap = null; }
  }
  if (!snap && input.code) snap = (kb.raw.ssgSnapshots || []).find((s) => s.code === String(input.code)) || null;
  if (!snap && input.name) snap = (kb.raw.ssgSnapshots || []).find((s) => s.name === input.name) || null;

  if (!snap) {
    return {
      engine: 'ssg', generated_at: new Date().toISOString(), rule_version: kb.version,
      level: LEVELS.unknown,
      message: '该品类不在当前 SSG 监控清单内，或快照数据缺失。系统不以邻近品类替代推算。',
      monitored: false, disclaimer: DISCLAIMER,
      note: '若该品类实际受 SSG 规范，请由运营在规则后台补录条目后重新评估。',
    };
  }

  const accumulated = num(input.accumulated_override ?? snap.accumulated, '已累积量', { min: 0 });
  const trigger = snap.trigger_volume;
  const rate = num(input.monthly_rate_override ?? snap.monthly_rate, '近期月均速率', { min: 0 });
  const remaining = round(trigger - accumulated, 2);
  const usagePct = round((accumulated / trigger) * 100, 2);
  const afterMine = round(accumulated + quantity, 2);
  const usageAfterPct = round((afterMine / trigger) * 100, 2);
  const wouldTrigger = afterMine > trigger;
  const overflow = wouldTrigger ? round(afterMine - trigger, 2) : 0;

  let level = LEVELS.safe;
  if (usagePct >= 100) level = LEVELS.breach;
  else if (usagePct >= 90) level = LEVELS.alert;
  else if (usagePct >= 70) level = LEVELS.watch;
  if (wouldTrigger && usagePct < 100) level = usageAfterPct >= 100 ? LEVELS.breach : level;

  const monthsToTrigger = rate > 0 ? round(Math.max(0, remaining) / rate, 2) : null;

  /* ---------- 触发后成本模拟（与 F2-1 同口径：按完税价格从价加征） ---------- */
  let simulation = null;
  const cif = input.value != null ? round(num(input.value, '货值', { min: 0 }) + (input.freight || 0) + (input.insurance || 0), 2) : null;
  if (cif) {
    const extraTax = round(cif * (snap.ssg_rate / 100), 2);
    const vatOnExtra = round(extraTax * ((kb.findMarket(input.market || 'TW')?.vat_rate ?? 5) / 100), 2);
    const totalExtra = round(extraTax + vatOnExtra, 2);
    simulation = {
      currency: kb.findMarket(input.market || 'TW')?.currency || 'TWD',
      customs_value: cif,
      ssg_rate_pct: snap.ssg_rate,
      extra_ssg_tax: extraTax,
      extra_business_tax_on_ssg: vatOnExtra,
      total_extra_cost: totalExtra,
      extra_per_unit: round(totalExtra / quantity, 4),
      cost_uplift_pct: round((totalExtra / cif) * 100, 2),
      formula: `完税价格 ${cif} × SSG ${snap.ssg_rate}% = ${extraTax}，另加征部分计入营业税基数 +${vatOnExtra}`,
    };
  }

  const qd = kb.raw.quoteDefaults;
  const bufferPct = level.code === 'breach' || level.code === 'alert' ? qd.ssg_buffer_pct_when_alert : level.code === 'watch' ? qd.ssg_buffer_pct_when_watch : 0;

  return {
    engine: 'ssg',
    generated_at: new Date().toISOString(),
    rule_version: kb.version,
    item: { code: snap.code, name: snap.name, unit: snap.unit, ssg_rate_pct: snap.ssg_rate },
    snapshot: { accumulated, trigger_volume: trigger, monthly_rate: rate, snapshot_date: snap.snapshot_date, sources: kb.resolveSources(snap.source_ids) },
    progress: {
      usage_pct: usagePct,
      remaining_volume: remaining,
      remaining_pct: round(100 - usagePct, 2),
      months_to_trigger_at_current_rate: monthsToTrigger,
      projection_basis: '线性外推，仅用于风险感知，不构成预测',
    },
    your_shipment: { quantity, unit: snap.unit, usage_after_pct: usageAfterPct, would_trigger: wouldTrigger, overflow_volume: overflow },
    level,
    simulation,
    recommendation: {
      buffer_pct: bufferPct,
      actions: buildActions({ level, wouldTrigger, monthsToTrigger, snap, overflow, quantity, trigger }),
    },
    disclaimer: DISCLAIMER,
    data_caveat: `SSG 累积量以主管机关公告为准；本结果基于 ${snap.snapshot_date} 快照，外部数据源存在延迟，仅供参考。`,
  };
}

function buildActions({ level, wouldTrigger, monthsToTrigger, snap, overflow, quantity, trigger }) {
  const a = [];
  if (level.code === 'breach') {
    a.push('立即停止以当前税率报价，改按「已加征 SSG」情景重新测算（F2-1 ssg_mode=triggered）。');
    a.push(`本批若申报将超出触发点 ${overflow} ${snap.unit}，须评估分批至下一期或改用未受 SSG 规范之替代规格。`);
  }
  if (level.code === 'alert') {
    a.push(`按当前速率约 ${monthsToTrigger ?? '—'} 个月内触发，建议报价预留 ${level.code === 'alert' ? '18%' : '8%'} 缓冲。`);
    a.push('与当地进口商确认是否已有同期他厂报单挤占额度，必要时调整船期错开。');
  }
  if (level.code === 'watch') {
    a.push('纳入订阅监控（F1-2 / 消息中心），每次累积量更新后自动重算剩余空间。');
  }
  if (level.code === 'safe') {
    a.push('额度空间充足，维持常规报价，仍建议保留汇率缓冲。');
  }
  if (wouldTrigger && level.code !== 'breach') {
    a.push(`本批 ${quantity} ${snap.unit} 会使累积量达到触发点的 ${round((quantity / (trigger || 1)) * 100, 2)}%，属临界单批，建议拆单或延后。`);
  }
  return a;
}

/** 供消息中心使用：把 SSG 快照批量转成预警条目 */
export function scanSsgAlerts(kb, { thresholdPct = 90 } = {}) {
  return (kb.raw.ssgSnapshots || [])
    .map((s) => ({ code: s.code, name: s.name, usage_pct: round((s.accumulated / s.trigger_volume) * 100, 2), snapshot_date: s.snapshot_date, unit: s.unit, remaining: round(s.trigger_volume - s.accumulated, 2), monthly_rate: s.monthly_rate }))
    .filter((x) => x.usage_pct >= thresholdPct)
    .sort((x, y) => y.usage_pct - x.usage_pct);
}
