/**
 * F2-1 综合税负计算器 + F2-3 多方案成本对比
 * ------------------------------------------------------------------
 * 要做什么：算清「完整落地综合成本」，不止基础关税，含货物税、营业税、
 *          捐费（农产品推广费）、行政规费、口岸物流费，并给出安全报价带。
 * 输入：HS 编码 / 货值 / 数量 / 运费保费 / 报关口岸 / 目标市场 / SSG 情景
 * 输出：分项明细（每项含算式与规则来源）+ 综合税负率 + 单件落地成本 +
 *       建议报价区间 + 未计入项 + 风险缓冲建议
 * 边界：
 *   1) 全部数字由本文件确定性计算，禁止大模型产出或修改任何金额；
 *   2) 课征顺序固定为 关税 → SSG → 货物税 → 捐费 → 营业税（税上税），
 *      顺序本身标注 verify_status，若与当地实际征收顺序不同，须由运营核验后覆写；
 *   3) 与 ChatGPT 原型口径向后兼容：当 use_kb_rates=false 且关闭扩展费项时，
 *      计算结果必须与原型静态快照完全一致（tests 已断言）。
 */

import { AppError, num, round } from './util.mjs';
import { DISCLAIMER, UNVERIFIED_WARNING, normalizeHs } from './kb.mjs';

/** 课征顺序（顺序本身即业务规则，集中声明便于核验与覆写） */
export const LEVY_ORDER = ['customs_duty', 'ssg', 'excise_tax', 'levy_fee', 'business_tax'];

export function calculateCost(input, kb, options = {}) {
  const trace = [];
  const marketCode = input.market || 'TW';
  const market = kb.findMarket(marketCode);
  if (!market) throw new AppError('目标市场不在已建库范围内。', 'UNKNOWN_MARKET');
  if (market.coverage === 'skeleton') throw new AppError(`市场「${market.name}」税率库尚未建库，系统不输出推测性成本。`, 'NO_RATE_DATA');

  const useKb = input.use_kb_rates !== false;
  const includeExtended = input.include_extended_fees !== false;

  /* ---------- 输入 ---------- */
  const goodsValue = num(input.value, '货值（离岸/申报货价）', { min: 0.01 });
  const quantity = num(input.quantity, '出口数量', { min: 1, integer: true });
  const freight = num(input.freight ?? 0, '运费', { required: false }) ?? 0;
  const insurance = num(input.insurance ?? 0, '保险费', { required: false }) ?? 0;
  const otherFixedFee = num(input.fee ?? 0, '其他固定费用（报关服务费等）', { required: false }) ?? 0;
  const volumeLiters = num(input.volume_liters ?? 0, '液体总量（公升，从量货物税用）', { required: false }) ?? 0;
  const weightKg = num(input.weight_kg ?? 0, '毛重（公斤）', { required: false }) ?? 0;
  const teu = num(input.teu ?? 0, '柜数（TEU）', { required: false }) ?? 0;

  /* ---------- 税率来源：知识库优先，允许人工覆写 ---------- */
  let dutyRate; let vatRate = market.vat_rate; let ssgRate = 0; let excise = null; let levy = null;
  let rateProvenance = [];
  const item = useKb ? safeFindTariff(kb, input.hs, market.code) : null;

  if (input.hs && !useKb) { /* 手工模式：不查税则，excise/levy 保持为空 */ }
  if (useKb) {
    if (!item) throw new AppError('启用知识库税率时必须提供可匹配的 HS 编码。', 'VALIDATION', { field: 'hs' });
    /* 知识库模式：税率只能来自规则库，或来自显式的 rate_overrides。
       绝不接受表单里残留的 dutyRate/ssgRate 静默覆盖——那会让「税率可追溯」名存实亡。 */
    const ov = input.rate_overrides || {};
    dutyRate = num(ov.duty_rate ?? item.duty_rate, '关税税率', { max: 100 });
    ssgRate = num(ov.ssg_rate ?? (item.ssg ? item.ssg.rate : 0), 'SSG 税率', { max: 100 });
    if (ov.vat_rate != null) vatRate = num(ov.vat_rate, '营业税率', { max: 100 });
    excise = item.excise || null;
    levy = item.levy || null;
    rateProvenance = kb.resolveSources(item.source_ids);
    if (Object.keys(ov).length) rateProvenance = [...rateProvenance, { id: 'OVERRIDE', name: '含人工覆写税率（rate_overrides）', url: '', status: '待核验' }];
  } else {
    dutyRate = num(input.dutyRate, '关税税率', { max: 100 });
    ssgRate = num(input.ssgRate ?? 0, 'SSG 加征税率', { max: 100 });
    if (input.vatRate !== undefined && input.vatRate !== '' && input.vatRate !== null) vatRate = num(input.vatRate, '营业税税率', { max: 100 });
    rateProvenance = [{ id: 'MANUAL', name: '用户手工输入（未经核验）', url: '', status: '待核验' }];
  }

  /* ---------- SSG 情景 ---------- */
  const ssgMode = input.ssg_mode || (useKb ? 'watch' : 'manual');
  let ssgApplied = false;
  if (useKb && ssgRate > 0) {
    if (ssgMode === 'triggered') ssgApplied = true;
    else if (ssgMode === 'manual_rate') { ssgApplied = true; ssgRate = num(input.ssgRate ?? ssgRate, 'SSG 加征税率', { max: 100 }); }
    else ssgApplied = false;
  } else if (!useKb) {
    ssgApplied = ssgRate > 0;
  }

  /* ---------- 计算链 ---------- */
  const lines = [];
  /** add() 返回行项目对象（含 .amount），下游一律以 .amount 取值 */
  const add = (key, label, amount, formula, extra = {}) => {
    const a = round(amount, 2);
    /* currency=null 表示该行金额跟随输入货值币种（比率计算行）；
     * 规费/口岸行显式标市场币种（TWD 计征），跨币种时前端需标注「未换算」。 */
    const line = { key, label, amount: a, formula, currency: null, ...extra };
    lines.push(line);
    trace.push(`${key}=${a}`);
    return line;
  };

  const cif = add('customs_value', '完税价格（CIF 基础）', goodsValue + freight + insurance,
    `货值 ${goodsValue} + 运费 ${freight} + 保险费 ${insurance}`,
    { note: '以申报货价加运费保费构成，实际海关估验可能调整。', rule_ref: 'S01' });

  const duty = add('customs_duty', '进口关税', cif.amount * (dutyRate / 100),
    `完税价格 ${cif.amount} × 关税税率 ${dutyRate}%`,
    { rate: dutyRate, rule_ref: 'S01', verify_status: item?.verify_status || 'needs_verification' });

  const ssg = add('ssg', 'SSG 特别防卫措施加征关税', ssgApplied ? cif.amount * (ssgRate / 100) : 0,
    ssgApplied ? `完税价格 ${cif.amount} × SSG 税率 ${ssgRate}%（情景：${ssgMode}）` : `本编码 SSG 税率 ${ssgRate}%，当前情景未触发，未计入`,
    { rate: ssgApplied ? ssgRate : 0, rule_ref: 'S01', verify_status: 'needs_verification', ssg_mode: ssgMode });

  /* 货物税：从价基数 = 完税价格 + 关税 + SSG；从量 = 数量 × 单位税额 */
  let exciseAmount = 0; let exciseFormula = '本品目不属货物税课征范围';
  if (excise && excise.mode !== 'none' && includeExtended) {
    if (excise.mode === 'specific') {
      const unitTax = excise.amount_per_liter || 0;
      exciseAmount = volumeLiters * unitTax;
      exciseFormula = volumeLiters > 0
        ? `液体总量 ${volumeLiters} 公升 × 单位税额 ${unitTax} 元/公升`
        : `未提供液体总量（公升），从量货物税无法计算，已按 0 计入并标记为待补项`;
    } else {
      exciseAmount = (cif.amount + duty.amount + ssg.amount) * ((excise.rate || 0) / 100);
      exciseFormula = `(完税价格 + 关税 + SSG) × 货物税率 ${excise.rate}%`;
    }
  }
  const exciseLine = add('excise_tax', excise?.name || '货物税', exciseAmount, exciseFormula,
    { rule_ref: 'S07', verify_status: excise?.verify_status || 'needs_verification', needs_input: excise?.mode === 'specific' && volumeLiters === 0 ? 'volume_liters' : null });

  const levyAmount = includeExtended && levy ? cif.amount * ((levy.rate || 0) / 100) : 0;
  const levyLine = add('levy_fee', levy?.name || '捐费（农产品推广费等）', levyAmount,
    levy ? `完税价格 ${cif.amount} × ${levy.rate}%` : '本品目无适用捐费',
    { rule_ref: 'S08', verify_status: 'needs_verification' });

  /* 营业税基数 = 完税价格 + 关税 + SSG + 货物税 + 捐费 */
  const vatBase = cif.amount + duty.amount + ssg.amount + exciseLine.amount + levyLine.amount;
  const vat = add('business_tax', '加值型营业税（进口环节）', vatBase * (vatRate / 100),
    `(完税价格 + 关税 + SSG + 货物税 + 捐费) ${round(vatBase, 2)} × 营业税率 ${vatRate}%`,
    { rate: vatRate, rule_ref: 'S07', verify_status: 'needs_verification' });

  const taxes = round(duty.amount + ssg.amount + exciseLine.amount + levyLine.amount + vat.amount, 2);

  /* ---------- 行政规费与口岸物流 ---------- */
  let adminLines = []; let logisticsLines = [];
  /* 规费与口岸物流目前仅台湾口径建库；其他市场不套用台湾口岸数据，避免张冠李戴 */
  if (includeExtended && market.code === 'TW') {
    const tags = item ? [...kb.tagsFor({ item, attributes: input.attributes || [] })] : [];
    adminLines = (kb.raw.adminFees || [])
      .filter((f) => (f.applies_tags || []).includes('*') || (f.applies_tags || []).some((t) => tags.includes(t)))
      .map((f) => ({ key: f.id, label: f.name, amount: f.amount, currency: market.currency, fx_unconverted: true, formula: `按票计征 ${f.amount} ${market.currency}（未换算，暂按同值计入）`, rule_ref: (f.source_ids || [])[0], verify_status: f.verify_status }));
    const port = kb.findPort(input.port);
    if (port) {
      const handling = port.handling_per_teu ? port.handling_per_teu * Math.max(1, teu || 1) : (port.air_per_100kg || 0) * Math.max(1, Math.ceil((weightKg || 0) / 100));
      logisticsLines = [{ key: 'port_handling', label: `口岸作业与报关杂费（${port.name}）`, amount: round(handling, 2), currency: market.currency, fx_unconverted: true, formula: port.handling_per_teu ? `${port.handling_per_teu} ${market.currency} × ${Math.max(1, teu || 1)} 柜（未换算，暂按同值计入）` : `${port.air_per_100kg} ${market.currency} × ${Math.max(1, Math.ceil((weightKg || 0) / 100))} 个 100kg 计费单位（未换算，暂按同值计入）`, rule_ref: 'S01', verify_status: port.verify_status }];
    }
  }
  const adminTotal = round(adminLines.reduce((a, l) => a + l.amount, 0), 2);
  const logisticsTotal = round(logisticsLines.reduce((a, l) => a + l.amount, 0), 2);
  const otherFixed = round(otherFixedFee, 2);

  const totalLines = [...lines, exciseLine, levyLine].filter((l, i, arr) => arr.findIndex((x) => x.key === l.key) === i);
  const allLines = [
    ...totalLines,
    { key: 'other_fixed', label: '其他固定费用（手工输入）', amount: otherFixed, formula: `用户输入 ${otherFixed}`, rule_ref: 'MANUAL', verify_status: 'needs_verification', currency: market.currency },
    ...adminLines.map((l) => ({ ...l, currency: market.currency })),
    ...logisticsLines.map((l) => ({ ...l, currency: market.currency })),
  ];

  const grandTotal = round(allLines.reduce((a, l) => a + l.amount, 0), 2);
  const effectiveRate = round((taxes / cif.amount) * 100, 2);
  const unitLanded = round(grandTotal / quantity, 4);

  /* ---------- 报价带与风险缓冲 ---------- */
  const qd = kb.raw.quoteDefaults;
  const buffers = [];
  let bufferPct = 0;
  if (ssgRate > 0 && !ssgApplied) {
    const pct = ssgMode === 'alert' ? qd.ssg_buffer_pct_when_alert : qd.ssg_buffer_pct_when_watch;
    bufferPct += pct;
    buffers.push({ name: 'SSG 触发缓冲', pct, why: `本编码受 SSG 监控（加征 ${ssgRate}%），当前情景 ${ssgMode} 未计入加征；建议报价预留 ${pct}% 缓冲。` });
  } else if (ssgRate > 0 && ssgApplied) {
    buffers.push({ name: 'SSG 已计入', pct: 0, why: `本测算已按触发后加征 ${ssgRate}% 计入，缓冲不再重复叠加。` });
  }
  buffers.push({ name: '汇率缓冲', pct: qd.fx_buffer_pct, why: `申报时点汇率至结汇时点波动预留 ${qd.fx_buffer_pct}%。` });
  bufferPct += qd.fx_buffer_pct;
  buffers.push({ name: '合规变动预留', pct: qd.compliance_buffer_pct, why: '改标、改文案、补许可随时可能发生（业务访谈 BI-03），比例待运营按品类历史复核。' });
  bufferPct += qd.compliance_buffer_pct;
  const [gmMin, gmMax] = qd.gross_margin_band;
  const safeQuote = {
    currency: market.currency,
    unit_landed_cost: unitLanded,
    suggested_low: round(unitLanded * (1 + gmMin) * (1 + bufferPct / 100), 2),
    suggested_mid: round(unitLanded * (1 + (gmMin + gmMax) / 2) * (1 + bufferPct / 100), 2),
    suggested_high: round(unitLanded * (1 + gmMax) * (1 + bufferPct / 100), 2),
    gross_margin_band: [gmMin * 100, gmMax * 100],
    buffer_pct: round(bufferPct, 2),
    buffers,
    note: '报价带仅覆盖到岸税负与作业成本，未含通路毛利、进场费与售后成本，实际定价须叠加渠道结构（见 F3-3）。',
  };

  const verifyStatuses = allLines.map((l) => l.verify_status || 'needs_verification');
  const allVerified = verifyStatuses.every((v) => v === 'verified');
  const unverifiedCount = verifyStatuses.filter((v) => v !== 'verified').length;

  return {
    engine: 'cost',
    generated_at: new Date().toISOString(),
    rule_version: kb.version,
    data_as_of: kb.data_as_of,
    session_id: input.session_id || null,
    market: { code: market.code, name: market.name, currency: market.currency },
    mode: useKb ? 'knowledge_base_rates' : 'manual_rates',
    inputs: { hs: input.hs ? normalizeHs(input.hs) : null, goodsValue, quantity, freight, insurance, otherFixedFee, volumeLiters, weightKg, teu, dutyRate, vatRate, ssgRate: ssgApplied ? ssgRate : 0, ssg_mode: ssgMode, port: input.port || null },
    matched_tariff: item ? { code: item.code, name: item.name, duty_rate: item.duty_rate, ssg: item.ssg, excise: item.excise, levy: item.levy } : null,
    levy_order: LEVY_ORDER,
    lines: allLines,
    totals: {
      customs_value: cif.amount,
      taxes_total: taxes,
      admin_fees_total: adminTotal,
      logistics_total: logisticsTotal,
      other_fixed: otherFixed,
      grand_total: grandTotal,
      effective_tax_rate_pct: effectiveRate,
      unit_landed_cost: unitLanded,
    },
    quote: safeQuote,
    pending_items: [
      ...allLines.filter((l) => l.needs_input).map((l) => ({ field: l.needs_input, label: `${l.label} 缺少计算所需输入，当前按 0 计入`, severity: 'high' })),
      ...(!includeExtended ? [{ field: 'extended_fees', label: '已关闭扩展费项，货物税/捐费/规费/口岸费未计入', severity: 'info' }] : []),
      ...(allLines.some((l) => l.fx_unconverted) ? [{ field: 'fx_conversion', label: '口岸规费（查验/报关/检疫/口岸作业）以 TWD 计征，本结果未做汇率换算、按同值计入总额；跨币种报价前必须换算核验', severity: 'medium' }] : []),
    ],
    not_included: kb.raw.notIncluded,
    verification: {
      total_rules: verifyStatuses.length,
      unverified_rules: unverifiedCount,
      verified_ratio: round(((verifyStatuses.length - unverifiedCount) / Math.max(1, verifyStatuses.length)) * 100, 1),
      all_rules_verified: allVerified,
      usable_for_quotation: allVerified,
      warning: allVerified ? null : UNVERIFIED_WARNING,
    },
    sources: [
      ...rateProvenance,
      ...kb.resolveSources([...new Set(allLines.map((l) => l.rule_ref).filter((r) => r && r !== 'MANUAL'))]),
    ],
    disclaimer: DISCLAIMER,
    trace,
  };
}

/** F2-3 多方案成本对比：同产品 × 不同数量 × 不同口岸 */
export function compareScenarios(input, kb) {
  const quantities = (input.quantities || [input.quantity]).map((q) => num(q, '数量', { min: 1, integer: true }));
  const ports = (input.ports?.length ? input.ports : (kb.raw.ports || []).map((p) => p.code));
  const item = safeFindTariff(kb, input.hs);
  const monitored = !!(item && item.ssg);
  const ssgModes = input.ssg_modes || (monitored ? ['off', 'triggered'] : ['off']);
  if (!monitored && ssgModes.some((m) => m !== 'off')) {
    throw new AppError(`编码 ${input.hs} 不受 SSG 监控，无需对比触发情景；请改用「off」或选择受 SSG 监控的品类。`, 'VALIDATION', { field: 'ssg_modes' });
  }
  const rows = [];
  for (const q of quantities) {
    for (const p of ports) {
      for (const m of ssgModes) {
        const r = calculateCost({ ...input, quantity: q, port: p, ssg_mode: m }, kb);
        rows.push({
          quantity: q, port: p, port_name: kb.findPort(p)?.name || p, ssg_mode: m,
          grand_total: r.totals.grand_total, unit_landed_cost: r.totals.unit_landed_cost,
          effective_tax_rate_pct: r.totals.effective_tax_rate_pct,
          suggested_mid: r.quote.suggested_mid,
          risk_flags: [
            m === 'triggered' ? 'SSG 已触发情景' : null,
            r.pending_items.length ? `待补项 ${r.pending_items.length}` : null,
            (kb.findPort(p)?.inspection_intensity || '').includes('高') ? '该口岸查验强度高，交期风险' : null,
          ].filter(Boolean),
        });
      }
    }
  }
  const best = rows.slice().sort((a, b) => a.unit_landed_cost - b.unit_landed_cost)[0] || null;
  const worst = rows.slice().sort((a, b) => b.unit_landed_cost - a.unit_landed_cost)[0] || null;
  return {
    engine: 'cost_compare',
    generated_at: new Date().toISOString(),
    rule_version: kb.version,
    rows,
    best, worst,
    spread_pct: best && worst ? round(((worst.unit_landed_cost - best.unit_landed_cost) / best.unit_landed_cost) * 100, 2) : null,
    disclaimer: DISCLAIMER,
    note: '对比仅反映税负与作业成本差异，不含各口岸仓租与内陆配送；口岸查验强度差异会造成交期成本，需另行评估。',
  };
}

function safeFindTariff(kb, hs, market = 'TW') {
  if (!hs) return null;
  try { return kb.findTariff(hs, market); } catch { return null; }
}
