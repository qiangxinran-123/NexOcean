/**
 * F1-1 产品准入判断引擎（Admission Engine）
 * ------------------------------------------------------------------
 * 要做什么：输入产品信息 → 判定目标市场准入类型 → 输出办理路径与材料清单
 * 输入：产品名称 / HS 编码 / 产品参数 / 属性标签 / 原产地 / 目标市场
 * 输出：准入结论 + 申请主体 + 书件清单 + 审核条件 + 预估周期 + 风险提示 + 依据来源
 * 边界：
 *   1) 不替代官方审批结果，只输出参考建议并强制附免责声明；
 *   2) 结论只能由规则库推导，缺关键字段或无匹配规则一律输出「无法判定」，禁止推测；
 *   3) 判定顺序：先查禁止输入清单 → 再查专案核准类制度 → 再查逐批/登录类 → 最后才可能给「准许」；
 *   4) 依据规则若全部未核验，结论自动降级为「参考级」并强制显示警告。
 */

import { AppError, num, rangeText, round, str } from './util.mjs';
import { DISCLAIMER, UNVERIFIED_WARNING, isMainlandOrigin, normalizeHs } from './kb.mjs';

const VERDICT = {
  prohibited: { code: 'prohibited', label: '禁止入境', tone: 'red' },
  special_approval: { code: 'special_approval', label: '需要专案核准', tone: 'amber' },
  permit_conditional: { code: 'permit_conditional', label: '准许入境（有条件）', tone: 'green' },
  undetermined: { code: 'undetermined', label: '无法判定', tone: 'slate' },
};

export function assessAdmission(input, kb) {
  const name = str(input.name, '产品名称', { max: 120 });
  const marketCodeOrName = str(input.market, '目标市场', { required: true, max: 40 });
  const origin = str(input.origin, '原产地/来源', { required: true, max: 40 });
  const category = str(input.category, '产品类别', { max: 60 });
  const specs = str(input.specs, '产品参数', { max: 2000 });
  const attributes = Array.isArray(input.attributes) ? input.attributes.filter((a) => typeof a === 'string') : [];
  const hsRaw = str(input.hs, 'HS 编码', { max: 20 });

  const market = kb.findMarket(marketCodeOrName);
  if (!market) throw new AppError(`目标市场「${marketCodeOrName}」不在已建库市场范围内。`, 'UNKNOWN_MARKET', { supported: kb.raw.markets.map((m) => m.name) });

  /* 骨架市场：不输出任何实质结论 */
  if (market.coverage === 'skeleton') {
    return undetermined({
      market, name, hsRaw, origin, reason: `目标市场「${market.name}」规则库尚未建库（coverage=skeleton），系统不输出推测性准入结论。`,
      missing: ['该市场完整管制制度', '该市场税则条目'], kb,
    });
  }

  let hs = '';
  try { hs = normalizeHs(hsRaw); } catch (e) {
    return undetermined({ market, name, hsRaw, origin, reason: e.message, missing: ['有效 HS 编码'], kb });
  }
  if (!hs) {
    return undetermined({
      market, name, hsRaw, origin,
      reason: '未提供 HS 编码。准入判定以编码为锚，缺失时系统不依据产品名称或类别推测结论。',
      missing: ['有效 HS 编码（至少 4 位）', '产品成分与用途等关键参数'], kb,
    });
  }

  /* 判定顺序：禁止清单优先于税则匹配。
     否则「命中禁止清单但税率条目尚未补录」的商品会被误判为「无法判定」，
     属于最危险的漏判方向（把「不能进」当成「不知道」）。 */
  const prohibited = kb.findProhibited(hs, origin, market.code);

  const item = kb.findTariff(hs, market.code);
  if (!item && !prohibited) {
    return undetermined({
      market, name, hsRaw: hs, origin,
      reason: `已登记税则库中查无编码 ${hs} 的前缀匹配（最细到 6 位）。为避免幻觉，系统不对未登记商品给出准入结论。`,
      missing: ['更完整的当地分类编码（建议 8 位）', '该品目税则与管制条目需由运营补录后重评'], kb,
    });
  }
  const matchedRegimes = kb.matchRegimes({ item, origin, attributes, market: market.code });
  const tags = [...kb.tagsFor({ item, attributes })];
  const precision = kb.matchPrecision(hs, item);
  const evidence = kb.evidenceFor({ item, matchedRegimes, prohibited });
  const unverified = evidence.filter((e) => e.verify_status !== 'verified');
  const confidence = unverified.length === 0 ? 'verified_rules' : (unverified.length === evidence.length ? 'unverified_rules' : 'mixed_rules');

  /* ---------- 判定决策树 ---------- */
  let verdict; let reason; let blockers = []; let conditions = []; let documents = []; let regimesOut = [];
  const ssgItem = kb.findSsg(hs, market.code);

  if (prohibited) {
    verdict = VERDICT.prohibited;
    reason = `原产地为${origin}，编码 ${hs} 命中禁止输入清单条目「${prohibited.name}」，原因：${prohibited.reason}。在完成清单解除或产地/工艺实质变更前，不可按正常贸易路径输入。`;
    blockers = [{ id: prohibited.code_prefix, text: `禁止输入清单命中：${prohibited.name}`, severity: 'blocking' }];
    documents = uniq([].concat(...matchedRegimes.map((r) => r.documents || [])).concat(['禁止输入清单适用性书面确认（主管机关函复）', '产品是否可变更产地/配方的可行性评估']));
    conditions = ['不得以第三地转口规避原产地认定', '如主张实质转型，须先取得产地认定函复'];
  } else {
    const special = matchedRegimes.filter((r) => r.obligation === 'special_approval');
    const preReg = matchedRegimes.filter((r) => r.obligation === 'pre_registration');
    const perBatch = matchedRegimes.filter((r) => r.obligation === 'per_batch');
    regimesOut = matchedRegimes.map((r) => ({
      id: r.id, name: r.name, agency: r.agency, obligation: r.obligation,
      duration_days: r.duration_days, risk: r.risk, legal_basis: r.legal_basis || [],
      lead_phase: r.lead_phase, applies_per: r.applies_per,
      documents: r.documents || [], applicant: r.applicant_rule, sources: kb.resolveSources(r.source_ids),
    }));
    documents = uniq([].concat(...matchedRegimes.map((r) => r.documents || [])));

    if (special.length) {
      verdict = VERDICT.special_approval;
      reason = `编码 ${hs}（${item.name}）需完成 ${special.map((r) => r.name).join('、')}，属事前核准类义务；在取得核准/认证前不得上架销售。`;
      blockers = special.map((r) => ({ id: r.id, text: `${r.name}（${r.agency}）：${r.risk}`, severity: 'approval' }));
      conditions = [
        '核准类义务无法以文件补齐方式跳过，须预留完整审查周期',
        ...special.map((r) => `${r.name} 预估周期 ${rangeText(r.duration_days)}`),
      ];
    } else if (preReg.length || perBatch.length) {
      verdict = VERDICT.permit_conditional;
      const list = [...preReg, ...perBatch];
      reason = `编码 ${hs}（${item.name}）未命中禁止清单，也无事前核准类制度；在满足 ${list.map((r) => r.name).join('、')} 等登录/逐批查验前提后，可按一般路径输入。`;
      conditions = [
        ...list.map((r) => `${r.name}：${(r.applicant_rule?.note || '').slice(0, 60)}`),
        '标示与广告内容须通过标签合规校验（F1-3）后方可刊播',
        ssgItem ? `本编码受 SSG 监控，须确认累积量未触发（F2-2）` : null,
      ].filter(Boolean);
    } else {
      verdict = VERDICT.permit_conditional;
      reason = `编码 ${hs}（${item.name}）在现行规则库中仅适用一般申报与标示义务，未见事前管制；仍须完成进口主体资格与中文标示。`;
      conditions = ['完成进口业者登录与营利事业登记', '繁体中文标示与原产地标示合规'];
    }
  }

  /* ---------- 申请主体 ---------- */
  const applicantRules = matchedRegimes.map((r) => r.applicant_rule).filter(Boolean);
  const applicant = {
    can_mainland_apply: applicantRules.length ? applicantRules.every((a) => a.can_mainland_apply) : false,
    requires_local_importer: applicantRules.length ? applicantRules.some((a) => a.requires_local_importer) : true,
    summary: isMainlandOrigin(origin)
      ? '大陆厂商不具备当地进口申报资格：可由大陆厂商提供技术资料与产品文件，但报验义务人、登录主体与许可证持有人须为当地已登记进口商。'
      : (applicantRules[0]?.note || '须由当地已登记进口商作为报验义务人。'),
    basis: uniq(matchedRegimes.filter((r) => r.applicant_rule).map((r) => r.id)),
  };

  /* ---------- 周期与风险 ---------- */
  const timeline = buildTimeline({ verdict, matchedRegimes, prohibited, kb });
  const risk = buildRisk({ verdict, matchedRegimes, ssgItem, item, origin, confidence, market });

  return {
    engine: 'admission',
    generated_at: new Date().toISOString(),
    rule_version: kb.version,
    data_as_of: kb.data_as_of,
    session_id: input.session_id || null,
    market: { code: market.code, name: market.name, coverage: market.coverage, currency: market.currency },
    product: { name, category, hs, hs_input: hsRaw, origin, specs, attributes, tags },
    classification: item ? {
      matched_code: item.code, matched_name: item.name, precision_digits: precision,
      duty_type: item.duty_type, duty_rate: item.duty_rate, ssg_monitored: !!ssgItem,
    } : { matched_code: null, matched_name: '（税则条目未补录，仅命中管制清单）', precision_digits: 0, duty_type: null, duty_rate: null, ssg_monitored: false },
    verdict: { ...verdict, reason },
    applicant,
    regimes: regimesOut.length ? regimesOut : matchedRegimes.map((r) => ({ id: r.id, name: r.name, agency: r.agency, obligation: r.obligation, documents: r.documents, duration_days: r.duration_days, lead_phase: r.lead_phase, applies_per: r.applies_per, sources: kb.resolveSources(r.source_ids) })),
    document_checklist: documents.map((d) => ({ item: d, status: '待准备', from: regimesForDocument(matchedRegimes, d) })),
    conditions,
    blockers,
    timeline,
    ssg: ssgItem ? { monitored: true, code: ssgItem.code, name: ssgItem.name, ssg_rate: ssgItem.ssg_rate, snapshot_date: ssgItem.snapshot_date, hint: '报价前必须执行 F2-2 SSG 累积量检查。' } : { monitored: false },
    risk,
    execution_variance: buildExecutionVariance(kb),
    business_inputs: (kb.raw.businessInputs || []).filter((b) => String(b.affects).startsWith('admission')),
    mitigation_options: buildMitigation(matchedRegimes, kb),
    evidence,
    confidence,
    verification: {
      total_rules: evidence.length,
      unverified_rules: unverified.length,
      verified_ratio: round((evidence.length - unverified.length) / Math.max(1, evidence.length) * 100, 1),
      usable_for_quotation: confidence === 'verified_rules' && verdict.code !== 'undetermined',
      warning: confidence === 'verified_rules' ? null : UNVERIFIED_WARNING,
    },
    official_lookup_entries: kb.resolveSources(evidence.flatMap((e) => (e.sources || []).map((s) => s.id))),
    missing_fields: [],
    disclaimer: DISCLAIMER,
  };
}

function undetermined({ market, name, hsRaw, origin, reason, missing, kb }) {
  return {
    engine: 'admission',
    generated_at: new Date().toISOString(),
    rule_version: kb.version,
    data_as_of: kb.data_as_of,
    market: market ? { code: market.code, name: market.name, coverage: market.coverage, currency: market.currency } : null,
    product: { name, hs_input: hsRaw, origin },
    verdict: { ...VERDICT.undetermined, reason },
    applicant: { can_mainland_apply: false, requires_local_importer: true, summary: '信息不足，无法判定申请主体要求。', basis: [] },
    regimes: [], document_checklist: [], conditions: [], blockers: [],
    timeline: null, ssg: { monitored: false },
    risk: { level: 'unknown', label: '未知', notes: ['不得以「无法判定」作为「可以进入」的依据继续报价或签约。'] },
    mitigation_options: [],
    evidence: [],
    confidence: 'insufficient_input',
    verification: { total_rules: 0, unverified_rules: 0, verified_ratio: 0, usable_for_quotation: false, warning: UNVERIFIED_WARNING },
    official_lookup_entries: kb.resolveSources(kb.raw.sources.map((s) => s.id)),
    missing_fields: uniq(missing),
    disclaimer: DISCLAIMER,
  };
}

/**
 * 执行口径差异披露（源自业务访谈 BI-02）：
 * 同一产品在不同口岸、不同报关行的执行解读可能不一致，准入结论必须声明这一点，
 * 否则用户会把「规则库结论」误当成「某口岸的实际执行口径」。
 */
function buildExecutionVariance(kb) {
  return {
    note: '同一产品在不同口岸、不同报关行的执行解读可能不一致（业务访谈反馈）。本结论基于规则库推导，不代表任何特定口岸或报关行的执行口径。',
    ports: (kb.raw.ports || []).map((p) => ({ code: p.code, name: p.name, inspection_intensity: p.inspection_intensity, clearance_days: p.clearance_days })),
    action: '报价与订舱前，与当地进口商及报关行复核本批货物的执行口径与查验预期。',
    provenance: 'BI-02',
    verify_status: 'needs_verification',
  };
}

/**
 * 办理周期：把「每项义务多少天」折算成「关键路径要等多久」
 * ------------------------------------------------------------------
 * 旧实现是对所有命中制度的 duration_days 逐位取 max，只要食品逐批查验（14–45 天）
 * 在集合里，其他义务就全被它吞掉——不同产品算出同一个数，既不符合实务也像是硬编码。
 * 现按真实办理结构分三段（角色声明集中在 kb-seed.regimeTimeModel）：
 *   串行 sequential     必须排队的前置核准/查验，周期相加。这是保守口径：
 *                       实务上部分环节可提前备件而重叠，真实交期可能短于此。
 *   并行 parallel       标示、广告文案等准备工作，能在串行等待期内做完，取最长不叠加。
 *   一次性 prerequisite 输入业者登录等主体资格，办好长期复用，不占每批交期。
 * 另附口岸查验放行区间（取自已建库口岸数据）与「关键路径+放行」合计；船期与通路进场不在此口径。
 * 命中禁止输入清单时不存在「办理周期」这件事，直接给不适用，不编天数。
 */
function buildTimeline({ verdict, matchedRegimes, prohibited, kb }) {
  if (verdict.code === 'prohibited') {
    const text = '不适用（无合法输入路径）';
    return {
      applicable: false, days: null, critical_path_days: null,
      text, critical_path_text: text,
      note: `命中禁止输入清单${prohibited ? `「${prohibited.name}」` : ''}，此时谈办理周期没有意义：须先完成产地/编码/工艺变更，或待清单解除后重新评估。`,
      segments: null,
    };
  }
  const withDays = matchedRegimes.filter((r) => Array.isArray(r.duration_days) && r.duration_days.length === 2);
  const pick = (phase) => withDays.filter((r) => (r.lead_phase || 'sequential') === phase);
  const brief = (r) => ({ id: r.id, name: r.name, agency: r.agency, days: r.duration_days, applies_per: r.applies_per || 'shipment' });
  const sumRange = (rs) => rs.reduce(([a, b], r) => [a + r.duration_days[0], b + r.duration_days[1]], [0, 0]);
  const maxRange = (rs) => rs.length ? [Math.max(...rs.map((r) => r.duration_days[0])), Math.max(...rs.map((r) => r.duration_days[1]))] : null;

  const serial = pick('sequential'); const parallel = pick('parallel'); const prereq = pick('prerequisite');
  const serialDays = serial.length ? sumRange(serial) : null;
  const parallelDays = maxRange(parallel);
  const prereqDays = maxRange(prereq);
  const portRanges = (kb.raw.ports || []).map((p) => p.clearance_days).filter((d) => Array.isArray(d) && d.length === 2);
  const portDays = portRanges.length ? [Math.min(...portRanges.map((d) => d[0])), Math.max(...portRanges.map((d) => d[1]))] : null;
  const landedDays = serialDays && portDays ? [serialDays[0] + portDays[0], serialDays[1] + portDays[1]] : serialDays;

  const text = serialDays ? rangeText(serialDays)
    : (parallelDays ? `${rangeText(parallelDays)}（无串行核准项，仅并行准备）` : '待主管机关确认');
  return {
    applicable: Boolean(serialDays || parallelDays),
    days: serialDays, critical_path_days: serialDays,
    text, critical_path_text: text,
    landed_ready_days: landedDays,
    landed_ready_text: landedDays ? `${rangeText(landedDays)}（含口岸查验放行）` : null,
    segments: {
      sequential: { days: serialDays, label: '串行核准/查验（占关键路径）', items: serial.map(brief) },
      parallel: { days: parallelDays, label: '并行准备工作（可在等待期完成，不叠加）', items: parallel.map(brief) },
      prerequisite: { days: prereqDays, label: '一次性主体资格前置（办好长期复用）', items: prereq.map(brief) },
      port_clearance: { days: portDays, label: '口岸查验放行（另计，视口岸与查验率）', note: '取已建库各口岸 clearance 区间的下界/上界，执行口径因口岸与报关行而异（BI-02）。' },
      shipping: { days: null, label: '船期 / 空运时效 / 通路进场', note: '不在本引擎口径内，须另行向货代与通路确认。' },
    },
    note: '关键路径 = 串行核准/查验制度周期相加（保守上界，实务可因提前备件而重叠缩短）；并行准备项与一次性登录不计入；不含船期与通路进场时程。',
  };
}

function buildRisk({ verdict, matchedRegimes, ssgItem, item, origin, confidence, market }) {

  const notes = [];
  let score = 0;
  if (verdict.code === 'prohibited') { score += 100; notes.push('命中禁止输入清单，本批次不具备输入条件。'); }
  if (verdict.code === 'special_approval') {
    score += 55;
    const longest = matchedRegimes.filter((r) => r.obligation === 'special_approval').map((r) => r.duration_days?.[1] || 0).sort((a, b) => b - a)[0];
    notes.push(`专案核准通过率风险：核准类制度最长周期 ${longest} 天，且审查结果不受申报文件齐备度保证。`);
    notes.push('进度可控性低：业务访谈反馈专案核准通过率低、周期长，厂家难以干预审查进度，须预留排期与替代路径（见缓解路径对照）。');
  }
  if (ssgItem) { score += 20; notes.push(`本编码受 SSG 监控（加征 ${ssgItem.ssg_rate}%），累积量触发会使单批成本骤增。`); }
  if (item?.excise && (item.excise.amount_per_liter || 0) > 0) { score += 12; notes.push(`含从量货物税（${item.excise.name}），低单价大批量时税负占比会被放大。`); }
  if (isMainlandOrigin(origin)) { score += 15; notes.push('大陆产地另受清单增删与政策变动影响，须开启法规变更监测（F1-2）。'); }
  if (confidence !== 'verified_rules') { score += 10; notes.push('规则参数未完成人工核验，本结论为参考级。'); }
  const level = score >= 90 ? 'critical' : score >= 55 ? 'high' : score >= 30 ? 'medium' : score > 0 ? 'low' : 'minimal';
  const label = { critical: '极高', high: '高', medium: '中', low: '低', minimal: '低/常规' }[level];
  if (!notes.length) notes.push('未见显著附加风险，仍须完成一般申报与标示义务。');
  return { level, label, score, notes, market_coverage: market.coverage };
}

function buildMitigation(matchedRegimes, kb) {
  const ids = new Set(matchedRegimes.map((r) => r.id));
  return (kb.raw.mitigationPaths || []).filter((m) => ids.has(m.when_regime)).map((m) => ({
    id: m.id, regime_id: m.when_regime, option: m.option, cost_index: m.cost_index,
    duration_text: rangeText(m.duration_days), note: m.note,
  }));
}

function regimesForDocument(regimes, doc) {
  return regimes.filter((r) => (r.documents || []).includes(doc)).map((r) => r.id);
}

const uniq = (arr) => [...new Set(arr.filter(Boolean))];
