/**
 * 报告导出（F4 底层公共能力之一）
 * ------------------------------------------------------------------
 * 输出自包含 HTML（浏览器「打印 → 另存为 PDF」即得 PDF 报告）与 Markdown。
 * 边界：不引入任何外部 CDN/字体，报告可离线打开；所有用户输入均做 HTML 转义。
 */

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------- 周期构成：HTML 报告与 Markdown 共用一份口径文案 ---------- */
const tlRange = (d) => (Array.isArray(d) ? (d[0] === d[1] ? `约 ${d[0]} 天` : `${d[0]}–${d[1]} 天`) : '—');
const TL_PHASE_TEXT = { sequential: '串行 · 占关键路径', parallel: '并行 · 不叠加', prerequisite: '一次性前置 · 长期复用' };
const TL_PHASES = [
  ['sequential', '串行核准 / 查验', '相加'],
  ['parallel', '并行准备工作', '取最长'],
  ['prerequisite', '一次性主体资格前置', '取最长'],
];

export function timelineSummary(tl) {
  if (!tl) return '待主管机关确认';
  if (tl.applicable === false) return tl.text || '不适用（无合法输入路径）';
  const base = tl.critical_path_text || tl.text || '待主管机关确认';
  return tl.landed_ready_text ? `${base}（${tl.landed_ready_text}）` : base;
}

export function timelineBreakdownLines(tl) {
  if (!tl || !tl.segments) return [];
  const out = [];
  for (const [key, label, agg] of TL_PHASES) {
    const s = tl.segments[key];
    if (!s || !(s.items || []).length) continue;
    out.push(`${label}（${agg}）：${s.items.map((i) => `${i.name} ${tlRange(i.days)}`).join('、')} → ${tlRange(s.days)}`);
  }
  const pc = tl.segments.port_clearance;
  if (pc) out.push(`${pc.label}：${tlRange(pc.days)}`);
  const sh = tl.segments.shipping;
  if (sh) out.push(`${sh.label}：不计入（${sh.note}）`);
  return out;
}

export function timelineBreakdownHtml(tl) {
  const lines = timelineBreakdownLines(tl);
  if (!lines.length) return '';
  return `<h3>周期构成（为什么是这一串天数）</h3><ul>${lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul><p class="meta">${esc(tl.note || '')}</p>`;
}

const STYLE = `
:root{--primary:#1e40af;--ink:#1c2b44;--muted:#627086;--border:#e4e9f2;--amber:#d97706;--red:#b42332;--green:#137351}
*{box-sizing:border-box}body{font-family:'Segoe UI','Microsoft YaHei','PingFang SC',sans-serif;color:var(--ink);margin:0;padding:32px;background:#fff;font-size:13px;line-height:1.65}
h1{font-size:21px;margin:0 0 4px}h2{font-size:15px;margin:26px 0 8px;padding-bottom:5px;border-bottom:2px solid var(--primary)}
h3{font-size:13px;margin:16px 0 6px;color:var(--primary)}
.meta{color:var(--muted);font-size:11.5px;margin-bottom:18px}
.verdict{display:inline-block;padding:7px 14px;border-radius:6px;font-weight:700;font-size:14px;color:#fff}
.v-prohibited{background:var(--red)}.v-special_approval{background:var(--amber)}.v-permit_conditional{background:var(--green)}.v-undetermined{background:#64748b}
table{width:100%;border-collapse:collapse;margin:8px 0;font-size:12px}
th,td{border:1px solid var(--border);padding:6px 8px;text-align:left;vertical-align:top}
th{background:#f2f5fb;font-weight:600}.scan-ov{margin-top:6px;padding:7px 9px;border-left:3px solid #c9d4e8;background:#f8fafd;display:grid;gap:3px;font-size:11.5px}.scan-ov em{color:var(--muted);font-style:normal}.scan-ov b{color:var(--ink);font-weight:600}.scan-ov span{color:var(--muted)}.scan-ov-one{margin-top:4px;padding:5px 8px;border-left:3px solid #c9d4e8;background:#f8fafd;color:var(--muted);font-size:11px;line-height:1.6}td.num{text-align:right;font-variant-numeric:tabular-nums}
.badge{display:inline-block;padding:1px 6px;border-radius:9px;font-size:10.5px;background:#fff3e0;color:#a15c07;border:1px solid #ffd9a8}
.badge.ok{background:#e7f6ee;color:var(--green);border-color:#b8e2c9}
ul{margin:6px 0 6px 20px;padding:0}li{margin:3px 0}
.disc{margin-top:26px;padding:12px 14px;border:1.5px solid var(--amber);background:#fff8ec;border-radius:7px;color:#8a4b04;font-size:12px}
.kv{display:grid;grid-template-columns:150px 1fr;gap:4px 10px;font-size:12px}
@media print{body{padding:12mm}.noprint{display:none}}
`;

export function buildReportHtml(kind, payload) {
  const title = kind === 'cost' ? '综合税负与报价测算报告' : kind === 'label' ? '标签与宣传文案合规校验报告' : kind === 'ssg' ? 'SSG 特别防卫措施监控报告' : '产品市场准入评估报告';
  const body = kind === 'cost' ? costBody(payload) : kind === 'label' ? labelBody(payload) : kind === 'ssg' ? ssgBody(payload) : admissionBody(payload);
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><title>${esc(title)}｜${esc(payload.product?.name || payload.item?.name || '测算记录')}</title>
<style>${STYLE}</style></head><body>
<div class="noprint" style="margin-bottom:14px;padding:9px 12px;background:#eef3ff;border-radius:6px;font-size:12px">
  提示：使用浏览器「打印」功能并选择「另存为 PDF」即可导出本报告。<button onclick="window.print()" style="padding:4px 12px;border:0;border-radius:5px;background:var(--primary);color:#fff;cursor:pointer">打印 / 导出 PDF</button>
</div>
<h1>${esc(title)}</h1>
<div class="meta">规则版本 ${esc(payload.rule_version || '—')} ｜ 数据时点 ${esc(payload.data_as_of || '—')} ｜ 生成时间 ${esc(payload.generated_at || '')} ｜ Session ID ${esc(payload.session_id || '未记录')}</div>
${body}
<div class="disc"><strong>免责声明：</strong>${esc(payload.disclaimer || '')}${payload.verification?.warning ? `<br><strong>核验警告：</strong>${esc(payload.verification.warning)}` : ''}${payload.data_caveat ? `<br>${esc(payload.data_caveat)}` : ''}</div>
<p class="meta" style="margin-top:14px">本报告由「知海 TradePilot 出海准入与成本引擎」生成，所有结论由规则知识库推导，大模型仅参与文字组织，不参与任何数字与结论判定。</p>
</body></html>`;
}

function admissionBody(p) {
  const v = p.verdict || {};
  return `
<p><span class="verdict v-${esc(v.code)}">${esc(v.label || '无法判定')}</span></p>
<p>${esc(v.reason || '')}</p>
<h2>一、产品与分类</h2>
<div class="kv">
  <div>产品名称</div><div>${esc(p.product?.name)}</div>
  <div>HS 编码</div><div>${esc(p.product?.hs || p.product?.hs_input || '未提供')}</div>
  <div>原产地</div><div>${esc(p.product?.origin)}</div>
  <div>目标市场</div><div>${esc(p.market?.name)}（建库覆盖度 ${esc(p.market?.coverage)}）</div>
  <div>匹配税则</div><div>${esc(p.classification?.matched_code || '—')} ${esc(p.classification?.matched_name || '—')}（匹配精度 ${esc(p.classification?.precision_digits || 0)} 位）</div>
  <div>产品参数</div><div>${esc(p.product?.specs || '未提供')}</div>
</div>
<h2>二、申请主体</h2>
<p>${esc(p.applicant?.summary || '')}</p>
<p>大陆厂商可否自行申请：<strong>${p.applicant?.can_mainland_apply ? '可' : '否'}</strong>；是否强制需要当地进口方：<strong>${p.applicant?.requires_local_importer ? '是' : '否'}</strong></p>
<h2>三、办理路径与审核条件</h2>
${(p.regimes || []).length ? `<table><tr><th>制度</th><th>主管机关</th><th>义务性质</th><th>预估周期</th><th>风险提示</th></tr>
${(p.regimes || []).map((r) => `<tr><td>${esc(r.name)}<br><span class="meta">${esc(r.id)}</span></td><td>${esc(r.agency)}</td><td>${esc(OBL(r.obligation))}</td><td>${esc(r.duration_days ? r.duration_days.join('–') + ' 天' : '—')}${r.lead_phase ? `<br><span class="meta">${esc(TL_PHASE_TEXT[r.lead_phase] || '')}</span>` : ''}</td><td>${esc(r.risk || '')}</td></tr>`).join('')}</table>` : '<p>无匹配制度。</p>'}
${(p.conditions || []).length ? `<h3>前置条件</h3><ul>${p.conditions.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>` : ''}
${(p.blockers || []).length ? `<h3>阻塞项</h3><ul>${p.blockers.map((b) => `<li><span class="badge">${esc(b.severity)}</span> ${esc(b.text)}</li>`).join('')}</ul>` : ''}
<h2>四、书件清单（${(p.document_checklist || []).length} 项）</h2>
<table><tr><th>#</th><th>文件</th><th>状态</th><th>来源制度</th></tr>
${(p.document_checklist || []).map((d, i) => `<tr><td class="num">${i + 1}</td><td>${esc(d.item)}</td><td>${esc(d.status)}</td><td>${esc((d.from || []).join(', '))}</td></tr>`).join('')}</table>
<h2>五、时程与风险</h2>
<p>关键路径：${esc(timelineSummary(p.timeline))}。${esc(p.timeline?.note || '')}</p>
${timelineBreakdownHtml(p.timeline)}
<p>风险等级：<strong>${esc(p.risk?.label || '—')}</strong>（评分 ${esc(p.risk?.score ?? 0)}）</p>
<ul>${(p.risk?.notes || []).map((n) => `<li>${esc(n)}</li>`).join('')}</ul>
${(p.mitigation_options || []).length ? `<h3>缓解路径对照</h3><table><tr><th>选项</th><th>成本指数</th><th>周期</th><th>说明</th></tr>${p.mitigation_options.map((m) => `<tr><td>${esc(m.option)}</td><td class="num">${esc(m.cost_index)}</td><td>${esc(m.duration_text)}</td><td>${esc(m.note)}</td></tr>`).join('')}</table>` : ''}
${p.ssg?.monitored ? `<h3>SSG 关联</h3><p>本编码受 SSG 监控（加征 ${esc(p.ssg.ssg_rate)}%，快照 ${esc(p.ssg.snapshot_date)}）。${esc(p.ssg.hint)}</p>` : ''}
<h2>六、依据来源与核验状态</h2>
<p>引用规则 ${esc(p.evidence?.length || 0)} 条，其中未核验 ${esc(p.verification?.unverified_rules || 0)} 条（已核验比例 ${esc(p.verification?.verified_ratio || 0)}%）。${p.verification?.usable_for_quotation ? '' : '<span class="badge">参考级结论</span>'}</p>
<table><tr><th>规则</th><th>标题</th><th>核验状态</th><th>来源</th></tr>
${(p.evidence || []).map((e) => `<tr><td>${esc(e.rule_id)}</td><td>${esc(e.title)}</td><td>${badge(e.verify_status)}</td><td>${(e.sources || []).map((s) => `${esc(s.name)}<br><span class="meta">${esc(s.url)}</span>`).join('<br>') || '—'}</td></tr>`).join('')}</table>
${(p.narrative?.text) ? `<h2>七、执行摘要</h2><p>${esc(p.narrative.text).replace(/\n/g, '<br>')}</p><p class="meta">成文方式：${esc(p.narrative.source === 'llm' ? '大模型（已通过数字白名单审计）' : '规则模板（未配置模型密钥或已降级）')}</p>` : ''}
${(p.retrieval_trace || []).length ? `<h3>检索轨迹（RAG）</h3><ul>${p.retrieval_trace.map((r) => `<li>${esc(r.title)} <span class="meta">score ${esc(r.score)}</span></li>`).join('')}</ul>` : ''}
${p.missing_fields?.length ? `<h3>待补充字段</h3><ul>${p.missing_fields.map((m) => `<li>${esc(m)}</li>`).join('')}</ul>` : ''}
<p class="meta">注：官方查询入口仅为检索起点，未表示已完成具体条款核验。</p>`;
}

function costBody(p) {
  const t = p.totals || {};
  return `
<h2>一、测算输入</h2>
<div class="kv">
  <div>HS 编码</div><div>${esc(p.inputs?.hs || '手工税率模式')}</div>
  <div>匹配税则</div><div>${esc(p.matched_tariff?.code || '—')} ${esc(p.matched_tariff?.name || '（手工输入税率）')}</div>
  <div>货值 / 数量</div><div>${esc(p.inputs?.goodsValue)} / ${esc(p.inputs?.quantity)}</div>
  <div>运费 / 保费</div><div>${esc(p.inputs?.freight)} / ${esc(p.inputs?.insurance)}</div>
  <div>口岸</div><div>${esc(p.inputs?.port || '未指定')}</div>
  <div>税率模式</div><div>${esc(p.mode === 'knowledge_base_rates' ? '知识库税率' : '手工输入税率（未经核验）')}</div>
  <div>SSG 情景</div><div>${esc(p.inputs?.ssg_mode)}</div>
</div>
<h2>二、分项成本明细</h2>
<p>课征顺序：${(p.levy_order || []).join(' → ')}</p>
<table><tr><th>项目</th><th>金额（${esc(p.market?.currency)}）</th><th>计算式</th><th>来源</th><th>核验</th></tr>
${(p.lines || []).map((l) => `<tr><td>${esc(l.label)}</td><td class="num">${esc(l.amount)}</td><td>${esc(l.formula)}</td><td>${esc(l.rule_ref || '—')}</td><td>${badge(l.verify_status)}</td></tr>`).join('')}</table>
<h2>三、汇总</h2>
<table><tr><th>指标</th><th>数值</th></tr>
<tr><td>完税价格</td><td class="num">${esc(t.customs_value)}</td></tr>
<tr><td>税费合计（关税+SSG+货物税+捐费+营业税）</td><td class="num">${esc(t.taxes_total)}</td></tr>
<tr><td><strong>综合税负率</strong></td><td class="num"><strong>${esc(t.effective_tax_rate_pct)}%</strong></td></tr>
<tr><td>行政规费小计</td><td class="num">${esc(t.admin_fees_total)}</td></tr>
<tr><td>口岸物流小计</td><td class="num">${esc(t.logistics_total)}</td></tr>
<tr><td>到岸总成本</td><td class="num">${esc(t.grand_total)}</td></tr>
<tr><td>单件落地成本</td><td class="num">${esc(t.unit_landed_cost)}</td></tr></table>
<h2>四、安全报价参考区间</h2>
<table><tr><th>低</th><th>中</th><th>高</th><th>已含缓冲</th></tr>
<tr><td class="num">${esc(p.quote?.suggested_low)}</td><td class="num">${esc(p.quote?.suggested_mid)}</td><td class="num">${esc(p.quote?.suggested_high)}</td><td class="num">${esc(p.quote?.buffer_pct)}%</td></tr></table>
<ul>${(p.quote?.buffers || []).map((b) => `<li><strong>${esc(b.name)}</strong> ${esc(b.pct)}%：${esc(b.why)}</li>`).join('')}</ul>
<p class="meta">${esc(p.quote?.note)}</p>
${(p.pending_items || []).length ? `<h2>五、待补事项</h2><ul>${p.pending_items.map((x) => `<li><span class="badge">${esc(x.severity)}</span> ${esc(x.label)}</li>`).join('')}</ul>` : ''}
<h2>${(p.pending_items || []).length ? '六' : '五'}、未计入项（必须一并评估）</h2>
<ul>${(p.not_included || []).map((n) => `<li>${esc(n)}</li>`).join('')}</ul>
${p.narrative?.text ? `<h2>执行摘要</h2><p>${esc(p.narrative.text).replace(/\n/g, '<br>')}</p><p class="meta">成文方式：${esc(p.narrative.source === 'llm' ? '大模型（已通过数字白名单审计）' : '规则模板（未配置模型密钥或已降级）')}</p>` : ''}
<h2>依据来源</h2>
<table><tr><th>来源</th><th>范围</th><th>链接</th><th>状态</th></tr>
${(p.sources || []).map((s) => `<tr><td>${esc(s.name)}</td><td>${esc(s.scope || '')}</td><td>${esc(s.url || '—')}</td><td>${badge(s.status || 'needs_verification')}</td></tr>`).join('')}</table>`;
}

function labelBody(p) {
  return `
<h2>一、总体结论</h2>
<p>风险评分 ${esc(p.summary?.risk_score)}（${esc(p.summary?.level)}），命中 ${esc(p.summary?.hits)} 项：高 ${esc(p.summary?.high)} / 中 ${esc(p.summary?.medium)} / 低 ${esc(p.summary?.low)}。
建议：<strong>${esc(p.summary?.publishable)}</strong></p>
<p class="meta">文本预览：${esc(p.input?.preview)}…（共 ${esc(p.input?.length)} 字）</p>
<h2>二、命中条目</h2>
${(p.hits || []).length ? (p.hits || []).map((h, i) => `
<h3>${i + 1}. ${esc(h.rule_name)} <span class="badge">${esc(h.severity)}</span></h3>
<div class="kv">
  <div>命中原文</div><div>「${esc(h.matched)}」（位置 ${esc(h.position)}）</div>
  <div>上下文</div><div>${esc(h.context)}</div>
  <div>违反依据</div><div>${(h.legal_basis || []).map((b) => `${esc(b.title)} ${esc(b.article)} ${badge(b.verify_status)}`).join('<br>')}</div>
  <div>为什么有风险</div><div>${esc(h.why)}</div>
  <div>修改建议</div><div>${esc(h.suggestion)}</div>
  <div>改写候选</div><div><ul>${(h.rewrite_candidates || []).map((c) => `<li>${esc(c)}</li>`).join('')}</ul></div>
  ${h.caveat ? `<div>判定说明</div><div>${esc(h.caveat)}</div>` : ''}
</div>`).join('') : '<p>未命中当前规则库中的风险条目。注意：未命中不代表合规。</p>'}
<h2>三、未适用规则</h2>
<ul>${(p.skipped_rules || []).map((s) => `<li>${esc(s.name)}：${esc(s.reason)}</li>`).join('') || '<li>无</li>'}</ul>
<h2>四、能力边界</h2>
<ul>${(p.limitations || []).map((l) => `<li>${esc(l)}</li>`).join('')}</ul>`;
}

function ssgBody(p) {
  return `
<h2>一、当前状态</h2>
<p>品类：${esc(p.item?.code)} ${esc(p.item?.name)}；告警等级：<strong>${esc(p.level?.label)}</strong></p>
<table><tr><th>指标</th><th>数值</th></tr>
<tr><td>已累积量 / 触发点</td><td class="num">${esc(p.snapshot?.accumulated)} / ${esc(p.snapshot?.trigger_volume)} ${esc(p.item?.unit)}</td></tr>
<tr><td>使用率</td><td class="num">${esc(p.progress?.usage_pct)}%</td></tr>
<tr><td>剩余空间</td><td class="num">${esc(p.progress?.remaining_volume)}（${esc(p.progress?.remaining_pct)}%）</td></tr>
<tr><td>近期月均速率</td><td class="num">${esc(p.snapshot?.monthly_rate)} ${esc(p.item?.unit)}/月</td></tr>
<tr><td>按现速推算距触发</td><td class="num">${esc(p.progress?.months_to_trigger_at_current_rate ?? '—')} 个月</td></tr>
<tr><td>本批数量 / 触发后使用率</td><td class="num">${esc(p.your_shipment?.quantity)} → ${esc(p.your_shipment?.usage_after_pct)}%${p.your_shipment?.would_trigger ? '（将触发）' : ''}</td></tr>
<tr><td>数据快照日</td><td class="num">${esc(p.snapshot?.snapshot_date)}</td></tr></table>
${p.simulation ? `<h2>二、触发后成本模拟</h2>
<table><tr><th>项目</th><th>数值</th></tr>
<tr><td>SSG 加征税率</td><td class="num">${esc(p.simulation.ssg_rate_pct)}%</td></tr>
<tr><td>加征税额</td><td class="num">${esc(p.simulation.extra_ssg_tax)}</td></tr>
<tr><td>因加征而增加的营业税</td><td class="num">${esc(p.simulation.extra_business_tax_on_ssg)}</td></tr>
<tr><td>合计增加成本</td><td class="num">${esc(p.simulation.total_extra_cost)}</td></tr>
<tr><td>单件成本上涨</td><td class="num">${esc(p.simulation.extra_per_unit)}</td></tr>
<tr><td>成本上涨幅度</td><td class="num">${esc(p.simulation.cost_uplift_pct)}%</td></tr></table>
<p class="meta">${esc(p.simulation.formula)}</p>` : ''}
<h2>三、建议动作</h2>
<p>报价建议预留缓冲：<strong>${esc(p.recommendation?.buffer_pct)}%</strong></p>
<ul>${(p.recommendation?.actions || []).map((a) => `<li>${esc(a)}</li>`).join('')}</ul>
<h2>四、数据来源</h2>
<table><tr><th>机构</th><th>范围</th><th>链接</th><th>状态</th></tr>
${(p.snapshot?.sources || []).map((s) => `<tr><td>${esc(s.name)}</td><td>${esc(s.scope)}</td><td>${esc(s.url)}</td><td>${badge(s.status)}</td></tr>`).join('')}</table>`;
}

function badge(v) {
  if (!v) return '<span class="badge">未知</span>';
  if (v === 'verified') return '<span class="badge ok">已核验</span>';
  if (v === 'skeleton') return '<span class="badge">仅骨架</span>';
  return '<span class="badge">待核验</span>';
}

const OBL = (o) => ({ prerequisite: '申报前提', per_batch: '逐批查验', pre_registration: '登录制', special_approval: '事前核准', blocking_check: '清单拦截检查', ongoing: '持续义务' }[o] || o || '—');

export function buildReportMarkdown(kind, p) {
  const head = `# ${kind === 'cost' ? '综合税负测算报告' : '产品准入评估报告'}\n\n- 规则版本：${p.rule_version}\n- 数据时点：${p.data_as_of}\n- 生成时间：${p.generated_at}\n- Session ID：${p.session_id || '未记录'}\n`;
  if (kind === 'cost') {
    return `${head}\n## 分项明细\n\n${(p.lines || []).map((l) => `- ${l.label}：${l.amount} ${p.market?.currency}（${l.formula}）`).join('\n')}\n\n## 汇总\n\n- 综合税负率：${p.totals?.effective_tax_rate_pct}%\n- 到岸总成本：${p.totals?.grand_total}\n- 单件落地成本：${p.totals?.unit_landed_cost}\n- 建议报价带：${p.quote?.suggested_low}–${p.quote?.suggested_high}\n\n> ${p.disclaimer}\n`;
  }
  return `${head}\n## 结论：${p.verdict?.label}\n\n${p.verdict?.reason || ''}\n\n## 申请主体\n\n${p.applicant?.summary || ''}\n\n## 书件清单\n\n${(p.document_checklist || []).map((d, i) => `${i + 1}. ${d.item}（${d.status}）`).join('\n')}\n\n## 依据来源\n\n${(p.evidence || []).map((e) => `- ${e.rule_id} ${e.title}［${e.verify_status}］`).join('\n')}\n\n> ${p.disclaimer}\n`;
}

/* ---------------- 出海方案报告（调研→评估→成本→风控→方案） ---------------- */
export function buildJourneyReportHtml(r) {
  const { product, research, admission, cost, cost_error: costError, plan } = r;
  const scan = research.scan;
  const built = scan.rows.filter((x) => x.coverage !== 'skeleton');
  const L = [];
  L.push(`<h1>出海方案报告 · ${esc(product.name)}</h1>`);
  L.push(`<div class="meta">规则版本 ${esc(r.rule_version)} ｜ 数据时点 ${esc(r.data_as_of)} ｜ 生成时间 ${esc(r.generated_at)} ｜ HS ${esc(product.hs || '待补充')} ｜ 目标市场 ${esc(product.market || '')}</div>`);
  /* 一、市场调研 */
  L.push('<h2>一、市场调研</h2>');
  L.push(`<h3>全球市场扫描（已建库 ${scan.built} 个${scan.skeleton ? ` · 骨架 ${scan.skeleton} 个` : ''}）</h3>`);
  L.push('<table><tr><th>市场</th><th>规则库</th><th>结论</th><th>说明</th></tr>');
  for (const m of [...built, ...scan.rows.filter((x) => x.coverage === 'skeleton')].slice(0, 15)) {
    /* 已建库：说明 = 完整判定理由（曾被 80 字硬截断，长理由会腰斩，不再截断） */
    if (m.coverage !== 'skeleton') {
      L.push(`<tr><td>${esc(m.market_name)}</td><td>已建库</td><td>${esc(m.status_label)}</td><td>${esc(m.reason)}${m.evidence_count ? `（依据 ${m.evidence_count} 条规则）` : ''}</td></tr>`);
      continue;
    }
    /* 骨架：结论仍为无法判定；14 个市场若每个都铺整段原因+概览会把报告撑爆，
       压成一行「监管｜标签｜门槛数」，完整概览在市场扫描页交互查看。 */
    const ov = m.overview;
    const ovLine = ov ? `<div class="scan-ov-one">背景概览（待核验 · 仅供调研）：监管 ${esc(ov.regulator)}｜标签 ${esc(ov.label)}｜门槛 ${(ov.gates || []).length} 项｜${esc(ov.note || '')}</div>` : '';
    L.push(`<tr><td>${esc(m.market_name)}</td><td>骨架</td><td>${esc(m.status_label)}</td><td>未建库，不输出准入结论。${ovLine}</td></tr>`);
  }
  L.push('</table>');
  const c = research.competitors;
  L.push(`<h3>竞品参考（${c.count} 条 · 检索快照 · 待核验）</h3>`);
  if (c.count) {
    const row = (x, rel) => `<tr><td>${esc(x.brand)}</td><td>${esc(x.name)}</td><td>${rel}</td><td>${esc(x.platform)}</td><td class="num">${x.price_twd[0]}–${x.price_twd[1]}</td><td>${esc(x.spec)}</td><td class="num">${x.volume_liters ? 'NT$' + Math.round(x.price_twd[1] / x.volume_liters) : '—'}</td></tr>`;
    L.push('<table><tr><th>品牌</th><th>品名</th><th>关系</th><th>渠道</th><th>价格（TWD）</th><th>规格</th><th>约每升</th></tr>');
    if (c.direct?.length) {
      for (const x of (c.direct || [])) L.push(row(x, '直接竞品'));
      for (const x of (c.substitutes || [])) L.push(row(x, '替代品'));
    } else {
      for (const x of (c.items || [])) L.push(row(x, '品类匹配'));
    }
    L.push('</table>');
    if (c.direct?.length && c.band_direct) L.push(`<p class="meta">价格带（直接竞品，按每升归一）：NT$${c.band_direct.min}–${c.band_direct.max}/升${c.band_all ? `；含替代品 NT$${c.band_all.min}–${c.band_all.max}/升` : ''}；快照 ${esc((c.items[0] || {}).retrieved_at || '')}，非实时。</p>`);
    else if (c.band) L.push(`<p class="meta">未识别细分品类，按 HS 品类粗匹配；价格带 NT$${c.band.min}–${c.band.max}/升；产品资料写明品类关键词（燕麦/气泡/豆浆）可匹配直接竞品。快照 ${esc((c.items[0] || {}).retrieved_at || '')}，非实时。</p>`);
  } else L.push('<p class="meta">该品类竞品库尚未录入。</p>');
  /* 二、准入评估 */
  L.push('<h2>二、准入评估</h2>');
  L.push(`<p><span class="verdict v-${esc(admission.verdict.code)}">${esc(admission.verdict.label)}</span></p>`);
  L.push(`<p>${esc(admission.verdict.reason || '')}</p>`);
  L.push(`<div class="kv"><span>申请主体</span><span>${admission.applicant?.requires_local_importer ? '须当地进口商申报' : '可自行申报'}</span>`);
  L.push(`<span>关键路径周期</span><span>${esc(timelineSummary(admission.timeline))}</span>`);
  L.push(`<span>命中条例</span><span>${admission.evidence_count} 条（均可追溯规则 ID）</span>`);
  L.push(`<span>办理书件</span><span>${(admission.documents || []).length} 项</span></div>`);
  if ((admission.documents || []).length) {
    L.push('<h3>书件清单</h3><ul>');
    for (const d of admission.documents.slice(0, 10)) L.push(`<li>${esc(typeof d === 'string' ? d : d.item)}</li>`);
    L.push('</ul>');
  }
  const tlTable = timelineBreakdownHtml(admission.timeline);
  if (tlTable) L.push(tlTable);
  /* 三、成本 */
  L.push('<h2>三、成本与收益</h2>');
  if (cost) {
    L.push(`<div class="kv"><span>综合落地成本</span><span><strong>${cost.totals.grand_total}</strong>（币种同输入货值）</span>`);
    L.push(`<span>单位落地成本</span><span>${cost.totals.unit_landed_cost} / 件</span>`);
    L.push(`<span>综合税负率（CIF）</span><span>${cost.totals.effective_tax_rate_pct}%</span>`);
    if (cost.quote) L.push(`<span>建议报价带</span><span>${cost.quote.suggested_low} – ${cost.quote.suggested_high}（含缓冲 ${cost.quote.buffer_pct}%）</span>`);
    L.push('</div>');
    if ((cost.pending_items || []).length) {
      L.push('<h3>待补与口径警示</h3><ul>');
      for (const p of cost.pending_items) L.push(`<li>${esc(p.label)}</li>`);
      L.push('</ul>');
    }
    L.push('<h3>成本分项</h3><table><tr><th>项目</th><th>金额</th><th>算式</th></tr>');
    for (const it of (cost.lines || [])) L.push(`<tr><td>${esc(it.label)}${it.fx_unconverted ? ' <span class="badge">TWD 未换算</span>' : ''}</td><td class="num">${it.amount}</td><td>${esc(it.formula)}</td></tr>`);
    L.push('</table>');
  } else L.push(`<p>成本测算未完成：${esc(costError || '缺少必要参数')}。补齐货值/数量后重新生成。</p>`);
  /* 四、风控预案 */
  L.push('<h2>四、风控预案</h2>');
  L.push('<table><tr><th>#</th><th>类别</th><th>风险</th><th>预案动作</th><th>责任角色</th><th>监控指标</th></tr>');
  for (const x of plan.risks) L.push(`<tr><td>${esc(x.id)}</td><td>${esc(x.category)}</td><td>${esc(x.risk)}<br><span style="color:var(--muted);font-size:11px">触发：${esc(x.trigger)}</span></td><td>${esc(x.action)}</td><td>${esc(x.owner)}</td><td>${esc(x.monitor)}</td></tr>`);
  L.push('</table>');
  L.push('<h3>预案原则</h3><ul>');
  for (const p of plan.principles) L.push(`<li>${esc(p)}</li>`);
  L.push('</ul>');
  /* 五、下一步 */
  L.push('<h2>五、下一步方案</h2><ol>');
  L.push('<li>补齐/核验书件清单（见上），专案类由当地进口方牵头递交；</li>');
  L.push('<li>按报价带与竞品价格带确定上市定价，预留 SSG 与汇率缓冲；</li>');
  L.push('<li>首票小批量试单，通关后复盘动销与复购数据再决定放量；</li>');
  L.push('<li>订阅法规变更预警，规则变化后重新生成本报告。</li></ol>');
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><title>出海方案报告｜${esc(product.name)}</title><style>${STYLE}</style></head><body>
<div class="noprint" style="margin-bottom:14px;padding:9px 12px;background:#eef3ff;border-radius:6px;font-size:12px">提示：使用浏览器「打印」并选择「另存为 PDF」即可导出本报告。<button onclick="window.print()" style="padding:4px 12px;border:0;border-radius:5px;background:var(--primary);color:#fff;cursor:pointer">打印 / 导出 PDF</button></div>
${L.join('\n')}
<div class="disc"><strong>免责声明：</strong>${esc(plan.disclaimer)}<br><strong>数据边界：</strong>竞品价格为检索快照（非实时）；规则参数尚未完成人工核验，本报告不构成报价、报关或签约依据。</div>
<p class="meta" style="margin-top:14px">本报告由「知海 TradePilot 出海准入与成本引擎」生成：调研/评估/成本/风控均由规则知识库确定性推导，大模型不参与任何数字与结论判定。</p>
</body></html>`;
}
