/**
 * 知海 TradePilot · 前端（零构建，ESM）
 * ------------------------------------------------------------------
 * 运行模式自适应：
 *   server —— 探测到 /api/health 可用，走服务端（持久化 + LLM 网关 + 运营后台）
 *   local  —— 静态托管或 API 不可用时，浏览器直接 import 同一套 engine/*.mjs 计算
 * 两种模式的结论口径一致，因为调用的是同一份引擎代码，不存在两套算法。
 */

import { createCore } from '../engine/index.mjs';

/* ----------------------------- 存储垫片 ----------------------------- */
const mem = new Map();
export const ls = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return mem.has(k) ? mem.get(k) : d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { mem.set(k, v); } },
  del(k) { try { localStorage.removeItem(k); } catch { mem.delete(k); } },
};
const WS_KEY = 'tp.workspace';
const workspace = ls.get(WS_KEY, null) || 'ws-' + Math.random().toString(36).slice(2, 8);
ls.set(WS_KEY, workspace);

/* ----------------------------- 状态 ----------------------------- */
const state = {
  route: 'workbench',
  mode: 'probing',
  meta: null,
  core: null,
  products: [],
  assessments: [],
  costs: [],
  messages: [],
  results: {},
  busy: false,
};

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nf = (n, d = 2) => (Number.isFinite(Number(n)) ? Number(n).toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: d }) : '—');
const pct = (n) => (Number.isFinite(Number(n)) ? `${n}%` : '—');
const dt = (s) => (s ? String(s).replace('T', ' ').slice(0, 16) : '—');

let toastTimer;
function toast(msg, kind = '') {
  const el = $('#toast');
  el.textContent = msg;
  el.className = `toast show ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = 'toast'; }, 3600);
}

/* ----------------------------- 运行模式与调用分发 ----------------------------- */
async function probe() {
  try {
    const r = await fetch('/api/health', { headers: { 'x-workspace': workspace } });
    if (!r.ok) throw new Error();
    const j = await r.json();
    state.mode = 'server';
    state.meta = j;
    return j;
  } catch {
    state.mode = 'local';
    state.core = createCore({ overrides: ls.get('tp.overrides', {}) });
    state.meta = { ...state.core.meta, repo_mode: 'browser_localStorage', kb: state.core.kb.stats(), note: '本地引擎模式：无服务端持久化，数据存于本浏览器' };
    return state.meta;
  }
}

async function api(path, body, method = 'POST') {
  const r = await fetch(`/api/${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'x-workspace': workspace, 'x-session-id': sessionId() },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error?.message || `接口 ${path} 返回 ${r.status}`);
  return j;
}

/** 统一算子分发：服务端优先，本地降级到同版本引擎 */
async function run(op, payload) {
  if (state.mode === 'server') {
    try { return await api(op, payload); } catch (e) {
      if (state.mode === 'server' && /返回 4\d\d|返回 5\d\d|Failed to fetch/.test(e.message)) { toast(`服务端不可用（${e.message}），本次改用本地引擎`, 'err'); state.mode = 'local'; state.core = state.core || createCore({ overrides: ls.get('tp.overrides', {}) }); }
      else throw e;
    }
  }
  const core = state.core || (state.core = createCore({ overrides: ls.get('tp.overrides', {}) }));
  const p = { ...payload, session_id: sessionId() };
  switch (op) {
    case 'admission': { const r = await core.assess(p); return withLocalRecord('assessments', r); }
    case 'cost': { const r = await core.cost(p); return withLocalRecord('costs', r); }
    case 'compare': return core.compare(p);
    case 'ssg': return core.ssg(p);
    case 'label': return core.label(p);
    case 'monitor': return core.monitor({ ...p, kb: undefined });
    default: throw new Error(`本地模式不支持算子 ${op}`);
  }
}

function withLocalRecord(coll, result) {
  const id = `${coll === 'costs' ? 'CST' : 'ASM'}-${Date.now().toString(36).toUpperCase()}`;
  const rows = ls.get(`tp.${coll}`, []);
  rows.push({ id, created_at: result.generated_at, name: result.product?.name || result.matched_tariff?.name || '—', verdict: result.verdict?.code, risk_level: result.risk?.level, effective_tax_rate_pct: result.totals?.effective_tax_rate_pct, unit_landed_cost: result.totals?.unit_landed_cost, payload: result });
  ls.set(`tp.${coll}`, rows.slice(-80));
  return { ...result, record_id: id };
}

const sessionId = () => ls.get('tp.session_id', null) || (() => { const s = `QW-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`; ls.set('tp.session_id', s); return s; })();

/* ----------------------------- 组件片段 ----------------------------- */
const verifyBadge = (v) => (v === 'verified' ? '<span class="tone t-green">已核验</span>' : v === 'skeleton' ? '<span class="tone t-slate">仅骨架</span>' : '<span class="tone t-amber">待核验</span>');
const toneOf = { green: 't-green', amber: 't-amber', red: 't-red', slate: 't-slate', cyan: 't-cyan', violet: 't-violet' };
const OBL_ZH = { prerequisite: '申报前提', per_batch: '逐批查验', pre_registration: '登录制', special_approval: '事前核准', blocking_check: '清单拦截', ongoing: '持续义务' };

function sourcesList(items) {
  if (!items?.length) return '<p class="hint">本条结论未绑定具体来源，视为不可用。</p>';
  return `<div class="chips">${items.map((s) => `<span class="chip src" title="${esc(s.scope || '')}｜状态 ${esc(s.status || '')}">${esc(s.name)}${s.url ? ` ↗` : ''}</span>`).join('')}</div>`;
}
function sourceLink(s) { return s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.name)}</a>` : esc(s.name); }

function loading(text = '计算中') {
  return `<div class="card"><div class="row"><strong>${esc(text)}</strong><span class="mono">规则优先 · AI 仅成文</span></div>
  <div class="skel" style="width:70%"></div><div class="skel" style="width:90%"></div><div class="skel" style="width:55%"></div></div>`;
}

function narrativeCard(n) {
  if (!n?.text) return '';
  const src = n.source === 'llm'
    ? '<span class="tone t-violet">大模型成文</span> 已通过数字白名单审计（输出中的每个数字均来自引擎结果）'
    : '<span class="tone t-slate">规则模板成文</span> ' + esc(n.reason || '未配置模型密钥，按设计走确定性模板');
  return `<div class="card"><h3>执行摘要</h3><p style="white-space:pre-wrap;font-size:15px">${esc(n.text)}</p>
  <p class="hint">${src}</p></div>`;
}

function verificationCard(v) {
  if (!v) return '';
  return `<div class="card"><h3>核验状态</h3>
  <dl class="kv"><dt>引用规则</dt><dd>${v.total_rules ?? v.total ?? '—'} 条，未核验 ${v.unverified_rules ?? '—'} 条（已核验 ${nf(v.verified_ratio, 1)}%）</dd>
  <dt>可用于报价</dt><dd>${v.usable_for_quotation ? '<span class="tone t-green">是</span>' : '<span class="tone t-amber">否，参考级结论</span>'}</dd></dl>
  ${v.warning ? `<div class="alert warn" style="margin-top:10px"><strong>核验警告</strong>${esc(v.warning)}</div>` : ''}</div>`;
}

/* ----------------------------- 视图 ----------------------------- */
const views = {};

views.workbench = () => {
  const ssg = (state.meta?.ssg_items || []).filter((s) => s.usage_pct >= 90).sort((a, b) => b.usage_pct - a.usage_pct);
  const pending = state.products.filter((p) => !p.hs || !p.assessed);
  return `
  <div class="page-head"><div><h1>出海工作台</h1><p>回答三个硬核问题：能不能进？要花多少钱进去？进去好不好卖？当前一期聚焦前两问的准入与成本，营销类功能按 PRD 后置。</p></div>
  <div class="head-actions"><a class="btn" href="#/admission">开始准入评估</a><a class="btn ghost" href="#/cost">成本测算</a></div></div>

  <div class="card"><div class="kpi">
    <div><dt>产品档案</dt><dd>${state.products.length}<small> 个</small></dd></div>
    <div><dt>准入评估</dt><dd>${state.assessments.length}<small> 次</small></dd></div>
    <div><dt>成本测算</dt><dd>${state.costs.length}<small> 次</small></dd></div>
    <div><dt>未读预警</dt><dd>${state.messages.filter((m) => !m.read_at).length}<small> 条</small></dd></div>
    <div><dt>规则库已核验率</dt><dd>${nf(state.meta?.kb?.verified_ratio, 1)}<small>%</small></dd></div>
  </div></div>

  ${ssg.length ? `<div class="alert warn"><strong>SSG 临界提醒</strong>${ssg.map((s) => `${esc(s.name)}（${esc(s.code)}）累积量已达触发点 ${s.usage_pct}%，快照 ${esc(s.snapshot_date)}`).join('；')}。
  <a class="linkish" href="#/ssg">前往复核</a></div>` : ''}

  <div class="split">
    <div>
      <div class="card"><h3>待处理产品</h3>
        ${pending.length ? `<ul class="list tight">${pending.slice(0, 6).map((p) => `<li>${esc(p.name)} <span class="mono">${esc(p.hs || '缺 HS')}</span></li>`).join('')}</ul>` : '<p class="hint">暂无缺 HS 或未评估的档案。</p>'}
        <p class="hint">缺 HS 编码时系统只输出「无法判定」，不会猜测准入结论。</p>
        <a class="btn ghost sm" href="#/products">管理产品档案</a>
      </div>
      <div class="card"><h3>最近记录</h3>
        ${recentRows()}
      </div>
    </div>
    <div>
      <div class="card"><h3>一期能力边界（写死在产品里，不是没做）</h3>
        <ul class="list">
          <li>准入判断与税负测算以规则库推导为准，大模型不参与任何数字与结论判定。</li>
          <li>标签校验一期仅处理文字，不做包装图片 OCR。</li>
          <li>竞品情报与 AI 文案生成属 P1/二期，本版本不开放生成。</li>
          <li>不做建站、投放、电商交易与代办申请——本系统是辅助决策工具，不是报关代理。</li>
        </ul>
      </div>
      <div class="card"><h3>已建库市场</h3>
        <table><thead><tr><th>市场</th><th>覆盖度</th><th>营业税</th><th>说明</th></tr></thead><tbody>
        ${(state.meta?.markets || []).map((m) => `<tr><td>${esc(m.name)}</td><td>${m.coverage === 'deep' ? '<span class="tone t-green">已建库</span>' : '<span class="tone t-slate">骨架</span>'}</td><td class="num">${m.vat_rate}%</td><td class="hint">${esc(m.note || '')}</td></tr>`).join('')}
        </tbody></table>
        <p class="hint">骨架市场一律输出「无法判定」，用于验证系统不会把空知识库当已知。</p>
      </div>
      <div class="card"><h3>官方来源登记（${(state.meta?.sources || []).length} 家）</h3>
        <p class="hint">仅登记公开查询入口。首页链接不等于已完成具体条款核验。</p>
        <div class="chips">${(state.meta?.sources || []).map((s) => `<span class="chip src">${sourceLink(s)} ${verifyBadge(s.status === '已核验' ? 'verified' : 'needs_verification')}</span>`).join('')}</div>
      </div>
    </div>
  </div>`;
};

function recentRows() {
  const rows = [
    ...state.assessments.map((a) => ({ kind: '准入', name: a.name || a.payload?.product?.name, at: a.created_at, tail: verdictLabel(a.verdict || a.payload?.verdict?.code), tone: verdictTone(a.verdict || a.payload?.verdict?.code), id: a.id })),
    ...state.costs.map((c) => ({ kind: '成本', name: c.payload?.matched_tariff?.name || c.name || c.hs, at: c.created_at, tail: `${nf(c.effective_tax_rate_pct ?? c.payload?.totals?.effective_tax_rate_pct)}%`, tone: 't-cyan', id: c.id })),
  ].sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 8);
  if (!rows.length) return '<div class="empty"><strong>还没有评估记录</strong>先在左侧建立产品档案，或直接发起一次准入评估。</div>';
  return `<table><tbody>${rows.map((r) => `<tr><td><span class="chip">${r.kind}</span></td><td>${esc(r.name || '—')}</td><td class="num"><span class="tone ${r.tone}">${esc(r.tail)}</span></td><td class="mono">${dt(r.at)}</td></tr>`).join('')}</tbody></table>`;
}
const verdictLabel = (c) => ({ prohibited: '禁止入境', special_approval: '需专案核准', permit_conditional: '有条件准许', undetermined: '无法判定' }[c] || c || '—');
const verdictTone = (c) => ({ prohibited: 't-red', special_approval: 't-amber', permit_conditional: 't-green', undetermined: 't-slate' }[c] || 't-slate');

/* ---------- 准入评估 ---------- */
views.admission = () => `
  <div class="page-head"><div><h1>产品准入判断（F1-1）</h1><p>输入产品信息，系统按规则库判定目标市场准入类型，输出办理路径、申请主体、书件清单、预估周期与风险。</p></div></div>
  <div class="split">
    <div class="card"><h3>产品信息</h3>
      ${productForm('adm')}
      <button class="btn" id="admGo" type="button">开始判定</button>
      <button class="btn ghost" id="admClear" type="button">清空</button>
      <p class="hint">边界：不替代官方审批结果，仅输出参考建议；缺关键字段时输出「无法判定」而非猜测。</p>
    </div>
    <div id="admOut">${state.results.admission || `<div class="card"><div class="empty"><strong>尚未评估</strong>填写左侧表单发起判定。系统会同时返回依据来源与核验状态。</div></div>`}</div>
  </div>`;

function productForm(prefix) {
  const m = state.meta || {};
  return `
  <div class="field"><label for="${prefix}name">产品名称 *</label><input id="${prefix}name" value="${esc(state.form?.name || '低糖燕麦饮')}" maxlength="120"></div>
  <div class="field"><label for="${prefix}cat">产品类别</label><input id="${prefix}cat" value="${esc(state.form?.category || '食品饮料')}" list="${prefix}cats"><datalist id="${prefix}cats"><option>食品饮料</option><option>化妆品</option><option>电子电器</option><option>纺织服装</option><option>家居建材</option><option>工业零部件</option></datalist></div>
  <div class="field"><label for="${prefix}hs">HS 编码 / 当地分类编码 *</label>
    <input id="${prefix}hs" value="${esc(state.form?.hs || '220299')}" maxlength="20" inputmode="numeric">
    <div class="hint">至少 4 位。已收录 ${m.tariff_items?.length || 0} 条税则前缀；未收录编码不会给出结论。</div>
    <select id="${prefix}hsPick" style="margin-top:5px"><option value="">— 从已收录税则中选择 —</option>
    ${(m.tariff_items || []).map((t) => `<option value="${t.code}">${t.code} ${esc(t.name)}（关税 ${t.duty_rate}%）</option>`).join('')}</select>
  </div>
  <div class="field"><label for="${prefix}market">目标市场 *</label><select id="${prefix}market">
    ${(m.markets || []).map((x) => `<option value="${x.code}"${(state.form?.market || 'TW') === x.code ? ' selected' : ''}>${esc(x.name)}${x.coverage === 'skeleton' ? '（骨架库）' : ''}</option>`).join('')}</select></div>
  <div class="field"><label for="${prefix}origin">原产地 / 来源 *</label><select id="${prefix}origin">
    ${['中国大陆', '中国港澳台（第三地）', '东南亚', '欧盟', '其他'].map((o) => `<option${(state.form?.origin || '中国大陆') === o ? ' selected' : ''}>${o}</option>`).join('')}</select>
    <div class="hint">选择「中国大陆」会额外触发两岸贸易管制检查。</div></div>
  <div class="field"><label for="${prefix}specs">产品简要参数</label><textarea id="${prefix}specs" maxlength="2000" style="min-height:74px">${esc(state.form?.specs || '250mL／常温保存／植物配方／含糖量 4.2g/100mL')}</textarea></div>
  <div class="field"><label>产品属性（影响管制匹配）</label><div class="checks">
    ${(m.attributes || []).map((a) => `<label class="check"><input type="checkbox" value="${a.attribute}" data-attr ${((state.form?.attributes || []).includes(a.attribute)) ? 'checked' : ''}>${esc(a.label)}</label>`).join('')}
  </div></div>`;
}

function readProductForm(p) {
  return {
    name: $(`#${p}name`).value.trim(),
    category: $(`#${p}cat`).value.trim(),
    hs: $(`#${p}hs`).value.trim(),
    market: $(`#${p}market`).value,
    origin: $(`#${p}origin`).value,
    specs: $(`#${p}specs`).value.trim(),
    attributes: [...document.querySelectorAll('[data-attr]:checked')].map((i) => i.value),
  };
}

function admissionResult(r) {
  const v = r.verdict || {};
  return `
  <div class="verdict v-${esc(v.code)}"><h2>${esc(v.label)}</h2><p>${esc(v.reason)}</p>
    <div class="meta">${esc(r.market?.name || '')}｜编码 ${esc(r.classification?.matched_code || '未匹配')}｜规则 ${esc(r.rule_version)}｜${dt(r.generated_at)}${r.record_id ? `｜记录 ${esc(r.record_id)}` : ''}</div></div>

  ${r.missing_fields?.length ? `<div class="alert err"><strong>信息不足，无法判定</strong>需补充：${r.missing_fields.map(esc).join('；')}</div>` : ''}
  ${r.blockers?.length ? `<div class="alert warn"><strong>阻塞项</strong><ul class="list tight">${r.blockers.map((b) => `<li>${esc(b.text)}</li>`).join('')}</ul></div>` : ''}

  <div class="card"><h3>申请主体</h3>
    <dl class="kv"><dt>大陆厂商可自行申请</dt><dd>${r.applicant?.can_mainland_apply ? '<span class="tone t-green">可</span>' : '<span class="tone t-red">否</span>'}</dd>
    <dt>强制需要当地进口方</dt><dd>${r.applicant?.requires_local_importer ? '<span class="tone t-amber">是</span>' : '<span class="tone t-green">否</span>'}</dd>
    <dt>说明</dt><dd>${esc(r.applicant?.summary)}</dd></dl></div>

  ${r.regimes?.length ? `<div class="card"><h3>办理路径（${r.regimes.length} 项制度）</h3><div class="table-wrap"><table>
    <thead><tr><th>制度</th><th>主管机关</th><th>义务性质</th><th class="num">周期</th><th>风险提示</th></tr></thead><tbody>
    ${r.regimes.map((x) => `<tr><td><strong>${esc(x.name)}</strong><br><span class="mono">${esc(x.id)}</span></td><td>${esc(x.agency)}</td><td><span class="tone ${x.obligation === 'special_approval' ? 't-red' : x.obligation === 'per_batch' ? 't-amber' : 't-slate'}">${esc(OBL_ZH[x.obligation] || x.obligation)}</span></td><td class="num">${x.duration_days ? esc(x.duration_days.join('–')) + ' 天' : '—'}</td><td class="hint">${esc(x.risk || '')}</td></tr>`).join('')}
    </tbody></table></div></div>` : ''}

  ${r.conditions?.length ? `<div class="card"><h3>审核条件 / 前置条件</h3><ul class="list">${r.conditions.map((c) => `<li>${esc(c)}</li>`).join('')}</ul></div>` : ''}

  ${r.document_checklist?.length ? `<div class="card"><h3>书件清单（${r.document_checklist.length} 项）</h3>
    <ol class="list tight">${r.document_checklist.map((d) => `<li>${esc(d.item)} <span class="mono">${esc((d.from || []).join(','))}</span></li>`).join('')}</ol>
    <p class="hint">清单由各制度合并去重，实际以主管机关要求为准。</p></div>` : ''}

  <div class="card"><h3>时程与风险</h3>
    <dl class="kv"><dt>关键路径</dt><dd>${esc(r.timeline?.critical_path_text || '—')}<span class="hint"> ${esc(r.timeline?.note || '')}</span></dd>
    <dt>风险等级</dt><dd><span class="tone ${r.risk?.level === 'critical' ? 't-red' : r.risk?.level === 'high' ? 't-amber' : 't-slate'}">${esc(r.risk?.label || '—')}</span> <span class="mono">评分 ${esc(r.risk?.score ?? 0)}</span></dd></dl>
    <ul class="list tight" style="margin-top:8px">${(r.risk?.notes || []).map((n) => `<li>${esc(n)}</li>`).join('')}</ul>
    ${r.ssg?.monitored ? `<div class="alert info" style="margin-top:10px"><strong>SSG 关联</strong>${esc(r.ssg.name)} 加征 ${esc(r.ssg.ssg_rate)}%，快照 ${esc(r.ssg.snapshot_date)}。${esc(r.ssg.hint)} <a class="linkish" href="#/ssg">立即复核</a></div>` : ''}
  </div>

  ${r.execution_variance ? `<div class="card"><h3>执行口径差异</h3><p>${esc(r.execution_variance.note)}</p>
    <p class="hint">${esc(r.execution_variance.action)}</p>
    <div class="chips">${(r.execution_variance.ports || []).map((p) => `<span class="chip">${esc(p.name)}｜查验 ${esc(p.inspection_intensity)}｜${esc((p.clearance_days || []).join('–'))} 天</span>`).join('')}</div></div>` : ''}
  ${r.mitigation_options?.length ? `<div class="card"><h3>缓解路径对照（成本换时程）</h3><table>
    <thead><tr><th>选项</th><th class="num">成本指数</th><th>周期</th><th>说明</th></tr></thead><tbody>
    ${r.mitigation_options.map((m) => `<tr><td>${esc(m.option)}</td><td class="num">${esc(m.cost_index)}</td><td>${esc(m.duration_text)}</td><td class="hint">${esc(m.note)}</td></tr>`).join('')}</tbody></table></div>` : ''}

  ${narrativeCard(r.narrative)}
  ${verificationCard(r.verification)}

  <div class="card"><h3>依据来源与规则绑定</h3>
    ${(r.evidence || []).length ? `<div class="table-wrap"><table><thead><tr><th>规则</th><th>标题</th><th>核验</th><th>来源</th></tr></thead><tbody>
    ${r.evidence.map((e) => `<tr><td class="mono">${esc(e.rule_id)}</td><td>${esc(e.title)}${e.agency ? `<br><span class="mono">${esc(e.agency)}</span>` : ''}</td><td>${verifyBadge(e.verify_status)}</td><td>${(e.sources || []).map(sourceLink).join('、') || '—'}</td></tr>`).join('')}
    </tbody></table></div>` : '<p class="hint">本次结论无规则绑定，视为不可用。</p>'}
    <p class="hint" style="margin-top:8px">检索轨迹（RAG）：${(r.retrieval_trace || []).map((t) => `<span class="chip">${esc(t.title)} ${esc(t.score)}</span>`).join(' ') || '—'}</p>
  </div>

  <div class="card"><h3>导出与交接</h3>
    <div class="row">
      <button class="btn sm" data-report="admission" data-id="${esc(r.record_id || '')}">导出报告（打印为 PDF）</button>
      <button class="btn ghost sm" data-copy="${esc(JSON.stringify({ handoffType: 'TRADEPILOT_CORE_TASK', task: '产品市场准入与法规依据评估', session_id: sessionId(), product: r.product, verdict: r.verdict?.code, rule_version: r.rule_version }, null, 2))}">复制交接 JSON</button>
      <span class="hint">交接 JSON 不含演示结论，只含输入与结论码，便于人工复核。</span>
    </div></div>`;
}

/* ---------- 成本测算 ---------- */
views.cost = () => `
  <div class="page-head"><div><h1>综合税负测算（F2-1）与多方案对比（F2-3）</h1><p>不止基础关税：关税 → SSG → 货物税 → 捐费 → 营业税按固定顺序课征，另计行政规费与口岸作业费，输出分项算式与报价带。</p></div></div>
  <div class="split">
    <div class="card"><h3>测算参数</h3>
      <div class="field"><label for="cMode">税率来源</label><select id="cMode">
        <option value="kb">知识库税率（推荐，可追溯）</option><option value="manual">手工输入税率（与原型口径对齐）</option></select></div>
      <div class="field"><label for="cHs">HS 编码</label><input id="cHs" value="${esc(state.form?.hs || '220299')}" maxlength="20"></div>
      <div class="field"><label for="cMarket">目标市场</label><select id="cMarket">
        ${(state.meta?.markets || []).map((m) => `<option value="${m.code}"${(state.form?.market || 'TW') === m.code ? ' selected' : ''}>${esc(m.name)}${m.coverage === 'skeleton' ? '（骨架库，将拒绝输出金额）' : ''}</option>`).join('')}</select></div>
      <div class="grid g2">
        <div class="field"><label for="cValue">货值 *</label><input id="cValue" type="number" min="0" step="0.01" value="30000"></div>
        <div class="field"><label for="cQty">数量 *</label><input id="cQty" type="number" min="1" step="1" value="2000"></div>
        <div class="field"><label for="cFreight">运费</label><input id="cFreight" type="number" min="0" step="0.01" value="1800"></div>
        <div class="field"><label for="cIns">保险费</label><input id="cIns" type="number" min="0" step="0.01" value="120"></div>
        <div class="field"><label for="cDuty">关税率 %（手工模式）</label><input id="cDuty" type="number" min="0" max="100" step="0.1" value="10"></div>
        <div class="field"><label for="cVat">营业税率 %</label><input id="cVat" type="number" min="0" max="100" step="0.1" value="5"></div>
        <div class="field"><label for="cSsg">SSG 加征 %（手工模式）</label><input id="cSsg" type="number" min="0" max="100" step="0.1" value="0"></div>
        <div class="field"><label for="cFee">其他固定费用</label><input id="cFee" type="number" min="0" step="0.01" value="600"></div>
        <div class="field"><label for="cLiters">液体总量（公升）</label><input id="cLiters" type="number" min="0" step="0.01" value="0"><div class="hint">从量货物税必填，否则列入待补项</div></div>
        <div class="field"><label for="cTeu">柜数 TEU</label><input id="cTeu" type="number" min="0" step="1" value="1"></div>
      </div>
      <div class="field"><label for="cPort">报关口岸</label><select id="cPort">
        <option value="">不计口岸费</option>${(state.meta?.ports || []).map((p) => `<option value="${p.code}">${esc(p.name)}</option>`).join('')}</select></div>
      <div class="field"><label for="cSsgMode">SSG 情景</label><select id="cSsgMode">
        <option value="off">未触发（不加征）</option><option value="watch" selected>关注（未触发，加缓冲）</option><option value="alert">告警（未触发，加高缓冲）</option><option value="triggered">已触发（计入加征）</option></select></div>
      <label class="check" style="margin-bottom:10px"><input type="checkbox" id="cExt" checked>计入扩展费项（货物税／捐费／行政规费／口岸费）</label>
      <button class="btn" id="cGo" type="button">开始测算</button>
      <button class="btn ghost" id="cCompare" type="button">多方案对比</button>
      <p class="hint">口径兼容说明：手工模式关闭扩展费项时，结果与 ChatGPT 原型的两组静态快照完全一致（已写入自动化断言）。</p>
    </div>
    <div id="cOut">${state.results.cost || `<div class="card"><div class="empty"><strong>尚未测算</strong>系统不会在本地用大模型估算税费，所有金额来自规则库推导。</div></div>`}</div>
  </div>`;

function readCostForm() {
  const v = (id) => $(`#${id}`).value.trim();
  const kbMode = $('#cMode').value === 'kb';
  const base = {
    use_kb_rates: kbMode,
    hs: v('cHs'), market: $('#cMarket') ? $('#cMarket').value : (state.form?.market || 'TW'),
    value: Number(v('cValue')), quantity: Number(v('cQty')), freight: Number(v('cFreight')), insurance: Number(v('cIns')),
    fee: Number(v('cFee')), volume_liters: Number(v('cLiters')), teu: Number(v('cTeu')), weight_kg: 0,
    port: v('cPort') || null, ssg_mode: $('#cSsgMode').value, include_extended_fees: $('#cExt').checked,
  };
  /* 知识库模式下不下发手工税率字段，避免表单残值静默覆盖税则库税率 */
  if (!kbMode) Object.assign(base, { dutyRate: Number(v('cDuty')), vatRate: Number(v('cVat')), ssgRate: Number(v('cSsg')) });
  return base;
}

function costResult(r) {
  const t = r.totals || {};
  return `
  <div class="card"><h3>汇总</h3><div class="kpi">
    <div><dt>完税价格</dt><dd>${nf(t.customs_value)}<small> ${esc(r.market?.currency)}</small></dd></div>
    <div><dt>税费合计</dt><dd>${nf(t.taxes_total)}</dd></div>
    <div><dt>综合税负率</dt><dd>${nf(t.effective_tax_rate_pct)}<small>%</small></dd></div>
    <div><dt>到岸总成本</dt><dd>${nf(t.grand_total)}</dd></div>
    <div><dt>单件落地成本</dt><dd>${nf(t.unit_landed_cost, 4)}</dd></div>
  </div>
  <p class="hint">税率来源：${r.mode === 'knowledge_base_rates' ? `知识库（${esc(r.matched_tariff?.code)} ${esc(r.matched_tariff?.name)}）` : '手工输入（未经核验）'}｜课征顺序：${(r.levy_order || []).join(' → ')}｜规则 ${esc(r.rule_version)}</p></div>

  <div class="card"><h3>分项明细（每项含算式）</h3><div class="table-wrap"><table>
    <thead><tr><th>项目</th><th class="num">金额</th><th>计算式</th><th>来源</th><th>核验</th></tr></thead><tbody>
    ${(r.lines || []).map((l) => `<tr><td>${esc(l.label)}</td><td class="num">${nf(l.amount)}</td><td class="mono">${esc(l.formula)}</td><td class="mono">${esc(l.rule_ref || '—')}</td><td>${verifyBadge(l.verify_status)}</td></tr>`).join('')}
    </tbody></table></div>
    ${r.pending_items?.length ? `<div class="alert warn" style="margin-top:10px"><strong>待补事项</strong><ul class="list tight">${r.pending_items.map((p) => `<li>${esc(p.label)}</li>`).join('')}</ul></div>` : ''}
  </div>

  <div class="card"><h3>安全报价参考区间</h3>
    <div class="kpi"><div><dt>低</dt><dd>${nf(r.quote?.suggested_low)}</dd></div><div><dt>中</dt><dd>${nf(r.quote?.suggested_mid)}</dd></div><div><dt>高</dt><dd>${nf(r.quote?.suggested_high)}</dd></div><div><dt>已含缓冲</dt><dd>${nf(r.quote?.buffer_pct)}<small>%</small></dd></div></div>
    <ul class="list tight" style="margin-top:9px">${(r.quote?.buffers || []).map((b) => `<li><strong>${esc(b.name)}</strong> ${esc(b.pct)}%：${esc(b.why)}</li>`).join('')}</ul>
    <p class="hint">${esc(r.quote?.note)}</p></div>

  ${narrativeCard(r.narrative)}
  ${verificationCard(r.verification)}

  <div class="card"><h3>未计入项（必须一并评估，否则报价必然失真）</h3>
    <ul class="list tight">${(r.not_included || []).map((n) => `<li>${esc(n)}</li>`).join('')}</ul></div>

  <div class="card"><h3>依据来源</h3>${sourcesList(r.sources)}
    <div class="row" style="margin-top:10px"><button class="btn sm" data-report="cost" data-id="${esc(r.record_id || '')}">导出报告（打印为 PDF）</button>
    <button class="btn ghost sm" data-copy="${esc(JSON.stringify(r.totals, null, 2))}">复制汇总 JSON</button></div></div>`;
}

function compareResult(r) {
  return `<div class="card"><h3>多方案成本对比（F2-3）</h3>
    <p class="hint">最优：${esc(r.best?.port_name)} × ${esc(r.best?.quantity)} 件 × SSG ${esc(r.best?.ssg_mode)}，单件 ${nf(r.best?.unit_landed_cost, 4)}；最差单件 ${nf(r.worst?.unit_landed_cost, 4)}；价差 ${nf(r.spread_pct)}%。</p>
    <div class="table-wrap"><table><thead><tr><th class="num">数量</th><th>口岸</th><th>SSG 情景</th><th class="num">到岸总成本</th><th class="num">单件落地</th><th class="num">税负率</th><th class="num">建议报价中值</th><th>风险标记</th></tr></thead><tbody>
    ${(r.rows || []).map((x) => `<tr${x === r.best ? ' style="background:#e7f6ee"' : ''}><td class="num">${esc(x.quantity)}</td><td>${esc(x.port_name)}</td><td>${esc(x.ssg_mode)}</td><td class="num">${nf(x.grand_total)}</td><td class="num">${nf(x.unit_landed_cost, 4)}</td><td class="num">${nf(x.effective_tax_rate_pct)}%</td><td class="num">${nf(x.suggested_mid)}</td><td>${(x.risk_flags || []).map((f) => `<span class="tone t-amber">${esc(f)}</span>`).join(' ') || '—'}</td></tr>`).join('')}
    </tbody></table></div>
    <p class="hint">${esc(r.note)}</p></div>`;
}

/* ---------- SSG ---------- */
views.ssg = () => `
  <div class="page-head"><div><h1>SSG 特别防卫措施监控（F2-2）</h1><p>读取公开累积量快照，计算距触发剩余空间，做加征成本模拟并给出报价缓冲建议。</p></div>
  <div class="head-actions"><button class="btn ghost" id="sgScan" type="button">扫描全部品类并入消息中心</button></div></div>
  ${ssgOverview()}
  <div class="split">
    <div class="card"><h3>单品复核</h3>
      <div class="field"><label for="sCode">品类（受监控）</label><select id="sCode">
        ${(state.meta?.ssg_items || []).map((s) => `<option value="${s.code}">${esc(s.name)}（${s.code}）· 已用 ${s.usage_pct}%</option>`).join('')}</select></div>
      <div class="field"><label for="sQty">拟出口数量 *</label><input id="sQty" type="number" min="1" value="2000"></div>
      <div class="grid g2">
        <div class="field"><label for="sValue">货值</label><input id="sValue" type="number" min="0" value="100000"></div>
        <div class="field"><label for="sFreight">运费+保费</label><input id="sFreight" type="number" min="0" value="5500"></div>
      </div>
      <button class="btn" id="sGo" type="button">计算触发风险</button>
      <p class="hint">外部数据源存在延迟，结果标注快照日期并以海关实际公告为准。</p>
    </div>
    <div id="sOut">${state.results.ssg || ''}</div>
  </div>`;

function ssgOverview() {
  const items = (state.meta?.ssg_items || []).slice().sort((a, b) => b.usage_pct - a.usage_pct);
  if (!items.length) return '';
  return `<div class="card"><h3>监控总览（${items.length} 个品类）</h3><div class="table-wrap"><table>
    <thead><tr><th>品类</th><th>编码</th><th style="width:200px">累积进度</th><th class="num">使用率</th><th>快照日</th></tr></thead><tbody>
    ${items.map((s) => { const lvl = s.usage_pct >= 100 ? 'breach' : s.usage_pct >= 90 ? 'alert' : s.usage_pct >= 70 ? 'watch' : 'safe'; return `<tr><td>${esc(s.name)}</td><td class="mono">${esc(s.code)}</td><td><div class="bar ${lvl}"><i style="width:${Math.min(100, s.usage_pct)}%"></i></div></td><td class="num">${s.usage_pct}%</td><td class="mono">${esc(s.snapshot_date)}</td></tr>`; }).join('')}
    </tbody></table></div></div>`;
}

function ssgResult(r) {
  if (!r.monitored && r.level?.code === 'unknown') return `<div class="card"><div class="alert info"><strong>无 SSG 数据</strong>${esc(r.message)}</div><p class="hint">${esc(r.note)}</p></div>`;
  const p = r.progress || {};
  return `
  <div class="card"><h3>${esc(r.item?.name)}（${esc(r.item?.code)}）</h3>
    <div class="row" style="margin-bottom:10px"><span class="tone ${toneOf[r.level.tone]}">${esc(r.level.label)}</span>
      <span class="mono">加征税率 ${esc(r.item?.ssg_rate_pct)}%｜快照 ${esc(r.snapshot?.snapshot_date)}</span></div>
    <div class="bar ${esc(r.level.code)}"><i style="width:${Math.min(100, p.usage_pct)}%"></i></div>
    <dl class="kv" style="margin-top:10px">
      <dt>累积 / 触发点</dt><dd>${nf(p.accumulated ?? r.snapshot?.accumulated)} / ${nf(r.snapshot?.trigger_volume)} ${esc(r.item?.unit)}</dd>
      <dt>剩余空间</dt><dd>${nf(p.remaining_volume)} ${esc(r.item?.unit)}（${nf(p.remaining_pct)}%）</dd>
      <dt>按现速距触发</dt><dd>${p.months_to_trigger_at_current_rate ?? '—'} 个月 <span class="hint">${esc(p.projection_basis)}</span></dd>
      <dt>本批影响</dt><dd>${nf(r.your_shipment?.quantity)} ${esc(r.item?.unit)} → 使用率 ${nf(r.your_shipment?.usage_after_pct)}%${r.your_shipment?.would_trigger ? ' <span class="tone t-red">将触发</span>' : ''}</dd>
    </dl></div>
  ${r.simulation ? `<div class="card"><h3>触发后成本模拟</h3><div class="kpi">
    <div><dt>加征税额</dt><dd>${nf(r.simulation.extra_ssg_tax)}</dd></div>
    <div><dt>连带营业税</dt><dd>${nf(r.simulation.extra_business_tax_on_ssg)}</dd></div>
    <div><dt>合计增加</dt><dd>${nf(r.simulation.total_extra_cost)}</dd></div>
    <div><dt>单件上涨</dt><dd>${nf(r.simulation.extra_per_unit, 4)}</dd></div>
    <div><dt>涨幅</dt><dd>${nf(r.simulation.cost_uplift_pct)}<small>%</small></dd></div></div>
    <p class="hint">${esc(r.simulation.formula)}</p></div>` : ''}
  <div class="card"><h3>建议动作（报价缓冲 ${esc(r.recommendation?.buffer_pct)}%）</h3>
    <ul class="list">${(r.recommendation?.actions || []).map((a) => `<li>${esc(a)}</li>`).join('')}</ul>
    <p class="hint">${esc(r.data_caveat)}</p>${sourcesList(r.snapshot?.sources)}</div>`;
}

/* ---------- 标签合规 ---------- */
views.label = () => `
  <div class="page-head"><div><h1>标签与宣传文案合规校验（F1-3）</h1><p>按目标市场规则扫描文字风险，输出违规原句、对应条款、风险等级与改写方向。一期不做包装图片 OCR。</p></div></div>
  <div class="split">
    <div class="card"><h3>待校验文本</h3>
      <div class="field"><label for="lText">标签文本 / 广告文案</label><textarea id="lText" maxlength="20000" placeholder="粘贴繁体或简体中文文案">${esc(state.form?.labelText || '本饮品经临床验证可治療高血压、降低胆固醇，是全网销量第一的健康饮品。零添加防腐剂，纯天然无农药残留。产地：中国，适合微商與小紅書同款代購渠道。')}</textarea>
      <div class="hint">系统会做繁简归一后再匹配词库，避免简体文案漏检。</div></div>
      <div class="field"><label for="lCat">品类</label><select id="lCat"><option value="food">食品／饮料</option><option value="cosmetic">化妆品</option><option value="">其他（仅通用规则）</option></select></div>
      <button class="btn" id="lGo" type="button">扫描风险</button>
      <button class="btn ghost" id="lSample" type="button">填入合规示例</button>
    </div>
    <div id="lOut">${state.results.label || ''}</div>
  </div>`;

function labelResult(r) {
  const s = r.summary || {};
  const lvlTone = { critical: 't-red', high: 't-red', medium: 't-amber', low: 't-slate', pass: 't-green' }[s.level] || 't-slate';
  return `
  <div class="card"><h3>校验结论</h3>
    <div class="row"><span class="tone ${lvlTone}">风险 ${esc(s.level)}</span><span class="mono">评分 ${esc(s.risk_score)}</span>
    <span class="tone ${s.publishable.startsWith('不建议') ? 't-red' : 't-green'}">${esc(s.publishable)}</span></div>
    <p class="hint">命中 ${esc(s.hits)} 项：高 ${esc(s.high)}／中 ${esc(s.medium)}／低 ${esc(s.low)}｜适用规则 ${(r.hits.length + r.skipped_rules.length)} 条中已排除 ${esc(r.skipped_rules.length)} 条品类不适用</p></div>
  ${(r.hits || []).length ? `<div class="card"><h3>命中条目</h3>${r.hits.map((h, i) => `
    <div class="hit ${esc(h.severity)}"><p><strong>${i + 1}. ${esc(h.rule_name)}</strong>
      <span class="tone ${h.severity === 'high' ? 't-red' : h.severity === 'medium' ? 't-amber' : 't-slate'}">${esc(h.severity)}</span>
      <span class="mono">${esc(h.rule_id)}｜位置 ${esc(h.position)}｜置信 ${esc(h.confidence)}</span></p>
      <p>原文：<q>${esc(h.matched)}</q>${h.normalized_form ? ` <span class="hint">（按繁体「${esc(h.normalized_form)}」匹配）</span>` : ''}</p>
      <p class="hint">${esc(h.context)}</p>
      <p style="margin-top:5px"><strong>违反依据：</strong>${(h.legal_basis || []).map((b) => `${esc(b.title)} ${esc(b.article)} ${verifyBadge(b.verify_status)}`).join('；')}</p>
      <p><strong>风险原因：</strong>${esc(h.why)}</p>
      <p><strong>修改建议：</strong>${esc(h.suggestion)}</p>
      <p><strong>改写候选：</strong>${(h.rewrite_candidates || []).map((c) => `<span class="chip">${esc(c)}</span>`).join(' ')}</p>
      ${h.caveat ? `<p class="hint">判定说明：${esc(h.caveat)}</p>` : ''}</div>`).join('')}</div>`
    : '<div class="card"><div class="alert ok"><strong>未命中风险条目</strong>未命中不代表合规，仍需人工终审。</div></div>'}
  <div class="card"><h3>能力边界</h3><ul class="list tight">${(r.limitations || []).map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
  ${(r.skipped_rules || []).length ? `<p class="hint">未适用规则：${r.skipped_rules.map((x) => `${esc(x.name)}（${esc(x.reason)}）`).join('；')}</p>` : ''}</div>`;
}

/* ---------- 法规变更监测 ---------- */
views.monitor = () => `
  <div class="page-head"><div><h1>法规增量监测与变更预警（F1-2）</h1><p>接收法规/检疫/标签/税率变更条目，匹配你已录入的产品，评估是否需要改标签、补许可、更换口岸，并量化成本变动。</p></div>
  <div class="head-actions"><button class="btn" id="moGo" type="button">用我的产品跑一次影响评估</button></div></div>
  <div class="alert info"><strong>数据来源边界</strong>只处理公开官方来源。下方 feed 含一条刻意混入的非官方消息，用于演示系统拦截而非静默采信。一期采集层以运营录入 + 模拟 feed 演示，不宣称已完成自动爬虫。</div>
  <div class="card"><h3>变更 feed（${(state.meta?.demo_changes || []).length} 条）</h3>
    <div class="table-wrap"><table><thead><tr><th>标题</th><th>类型</th><th>生效</th><th>来源</th><th>性质</th></tr></thead><tbody id="moFeed"></tbody></table></div></div>
  <div id="moOut">${state.results.monitor || '<div class="card"><div class="empty"><strong>尚未评估</strong>需先在产品档案中录入至少一个产品。</div></div>'}</div>`;

function monitorResult(r) {
  return `
  <div class="card"><h3>影响评估结果</h3><div class="kpi">
    <div><dt>扫描变更</dt><dd>${esc(r.scanned_changes)}</dd></div>
    <div><dt>受影响产品</dt><dd>${esc(r.impacted_products)}</dd></div>
    <div><dt>拦截非官方</dt><dd>${esc(r.rejected_non_official.length)}</dd></div>
    <div><dt>生成消息</dt><dd>${esc(r.messages.length)}</dd></div></div>
    ${r.rejected_non_official.length ? `<div class="alert warn" style="margin-top:10px"><strong>已拦截</strong>${r.rejected_non_official.map((x) => `${esc(x.title)}：${esc(x.reason)}`).join('；')}</div>` : ''}</div>
  ${(r.impacts || []).length ? `<div class="card"><h3>影响清单</h3><div class="table-wrap"><table>
    <thead><tr><th>变更</th><th>等级</th><th>命中原因</th><th>需要做什么</th><th class="num">成本变动</th></tr></thead><tbody>
    ${r.impacts.map((i) => `<tr><td><strong>${esc(i.title)}</strong><br><span class="mono">${esc(i.diff_type)}｜生效 ${esc(i.effective_on || '未公布')}</span></td>
      <td><span class="tone ${i.impact_level === 'critical' ? 't-red' : i.impact_level === 'high' ? 't-amber' : 't-slate'}">${esc(i.impact_level)}</span></td>
      <td class="hint">${esc(i.match_reason)}</td>
      <td><ul class="list tight" style="margin:0">${i.actions.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>
        ${i.requires_label_change ? '<span class="tone t-amber">需改标签</span>' : ''}${i.requires_port_change ? '<span class="tone t-amber">需换口岸</span>' : ''}${i.requires_reassess ? '<span class="tone t-cyan">需重跑评估</span>' : ''}</td>
      <td class="num">${i.cost_delta?.uplift_pct != null ? `${i.cost_delta.uplift_pct > 0 ? '+' : ''}${esc(i.cost_delta.uplift_pct)}%` : i.cost_delta?.error ? '<span class="hint">未计算</span>' : '—'}</td></tr>`).join('')}
    </tbody></table></div></div>` : '<div class="card"><p class="hint">没有产品命中本次变更范围。</p></div>'}
  <div class="card"><h3>报告分段</h3>${(r.report_sections || []).map((s) => `<details${s.level === 'critical' ? ' open' : ''}><summary>${esc(s.level)}（${esc(s.count)} 项）</summary>
    <ul class="list tight">${s.items.map((i) => `<li>${esc(i.title)} → ${esc(i.actions.join('；'))}</li>`).join('')}</ul></details>`).join('')}
    <p class="hint">限制：${(r.limitations || []).join(' ')}</p></div>`;
}

/* ---------- 记录 ---------- */
views.records = () => `
  <div class="page-head"><div><h1>评估记录</h1><p>历次准入评估与成本测算结果，可导出报告发给海外合作方，减少信息不对称。</p></div>
  <div class="head-actions"><button class="btn ghost sm" id="recExport" type="button">导出全部 JSON</button></div></div>
  <div class="card"><h3>准入评估（${state.assessments.length}）</h3>
    ${state.assessments.length ? `<div class="table-wrap"><table><thead><tr><th>产品</th><th>结论</th><th>风险</th><th>规则版本</th><th>时间</th><th></th></tr></thead><tbody>
    ${state.assessments.map((a) => `<tr><td>${esc(a.name || a.payload?.product?.name)}</td><td><span class="tone ${verdictTone(a.verdict)}">${esc(verdictLabel(a.verdict))}</span></td><td>${esc(a.risk_level || '—')}</td><td class="mono">${esc(a.rule_version)}</td><td class="mono">${dt(a.created_at)}</td><td><button class="btn ghost sm" data-report="admission" data-id="${esc(a.id)}">报告</button></td></tr>`).join('')}
    </tbody></table></div>` : '<div class="empty">暂无记录</div>'}</div>
  <div class="card"><h3>成本测算（${state.costs.length}）</h3>
    ${state.costs.length ? `<div class="table-wrap"><table><thead><tr><th>标的</th><th class="num">税负率</th><th class="num">单件落地</th><th>币别</th><th>时间</th><th></th></tr></thead><tbody>
    ${state.costs.map((c) => `<tr><td>${esc(c.payload?.matched_tariff?.name || c.hs || '—')}</td><td class="num">${nf(c.effective_tax_rate_pct)}%</td><td class="num">${nf(c.unit_landed_cost, 4)}</td><td>${esc(c.currency)}</td><td class="mono">${dt(c.created_at)}</td><td><button class="btn ghost sm" data-report="cost" data-id="${esc(c.id)}">报告</button></td></tr>`).join('')}
    </tbody></table></div>` : '<div class="empty">暂无记录</div>'}</div>
  <div class="card"><h3>消息中心（未读 ${state.messages.filter((m) => !m.read_at).length}）</h3>
    ${state.messages.length ? `<ul class="list">${state.messages.slice(0, 20).map((m) => `<li><span class="tone ${m.level === 'critical' ? 't-red' : m.level === 'high' ? 't-amber' : 't-slate'}">${esc(m.level || 'info')}</span>
      <span>${esc(m.title)}<br><span class="hint">${esc(m.body || '')}${m.source_url ? ` <a class="linkish" href="${esc(m.source_url)}" target="_blank" rel="noopener noreferrer">来源</a>` : ''}</span></span>
      ${!m.read_at ? `<button class="linkbtn" data-read="${esc(m.id)}">标为已读</button>` : '<span class="mono">已读</span>'}</li>`).join('')}</ul>` : '<div class="empty">暂无预警消息。可在 SSG 页或法规监测页手动触发扫描。</div>'}</div>`;

/* ---------- 产品档案 ---------- */
views.products = () => `
  <div class="page-head"><div><h1>产品档案</h1><p>保存多个产品，重复用于准入、成本、SSG 与法规影响评估，避免每次重填。</p></div></div>
  <div class="split">
    <div class="card"><h3>新增 / 更新档案</h3>${productForm('pf')}
      <button class="btn" id="pfSave" type="button">保存档案</button>
      <button class="btn ghost" id="pfClear" type="button">新建</button>
      <p class="hint">数据保存位置取决于运行模式：服务端模式存 ${esc(state.mode === 'server' ? '服务端（' + esc(state.meta?.repo_mode || '') + '）' : '本浏览器 localStorage')}。</p></div>
    <div><div class="card"><h3>已保存（${state.products.length}）</h3>
      ${state.products.length ? `<div class="table-wrap"><table><thead><tr><th>名称</th><th>编码</th><th>市场</th><th>属性</th><th></th></tr></thead><tbody>
      ${state.products.map((p) => `<tr><td>${esc(p.name)}<br><span class="mono">${esc(p.category || '')}</span></td><td class="mono">${esc(p.hs || '—')}</td><td>${esc(p.market)}</td><td class="hint">${esc((p.attributes || []).join(','))}</td>
        <td class="row" style="gap:5px"><button class="btn ghost sm" data-eval="${esc(p.id)}">评估</button><button class="btn ghost sm" data-edit="${esc(p.id)}">编辑</button><button class="btn danger sm" data-del="${esc(p.id)}">删除</button></td></tr>`).join('')}
      </tbody></table></div>` : '<div class="empty"><strong>还没有产品档案</strong>左侧录入，或用示例数据快速体验。</div>'}
      <button class="btn ghost sm" id="pfSeed" type="button" style="margin-top:8px">载入 3 个示例产品</button></div>
    </div>
  </div>`;

/* ---------- 规则后台 ---------- */
views.kb = () => `
  <div class="page-head"><div><h1>规则知识库运营后台（模块 5）</h1><p>人工维护与校验是必需环节，不可省略：AI 解析出的规则必须经运营核对来源与数值后才能标记为已核验。</p></div></div>
  <div class="alert warn"><strong>当前库状态</strong>已核验率 ${nf(state.meta?.kb?.verified_ratio, 1)}%。未核验规则参与计算时，结论会自动降级为「参考级」并在页面显示警告。</div>
  <div class="card"><div class="row" style="margin-bottom:10px">
    ${['tariffItems', 'regimes', 'labelRules', 'ssgSnapshots', 'mainlandProhibited', 'ports', 'adminFees', 'sources'].map((k) => `<button class="btn ghost sm" data-kind="${k}">${esc(({ tariffItems: '税则条目', regimes: '管制制度', labelRules: '标签规则', ssgSnapshots: 'SSG 快照', mainlandProhibited: '禁止清单', ports: '口岸', adminFees: '行政规费', sources: '来源登记' })[k])}</button>`).join('')}
    <input id="kbQ" placeholder="搜索规则…" style="max-width:200px">
    <button class="btn danger sm" id="kbReset" type="button">重置全部覆写</button></div>
    <div id="kbTable">${loading('载入规则')}</div></div>`;

function kbTable(kind, rows, keyField, overridden, q) {
  const cols = {
    tariffItems: [['code', '编码'], ['name', '名称'], ['duty_rate', '关税率'], ['ssg', 'SSG'], ['excise', '货物税'], ['levy', '捐费'], ['tags', '标签'], ['verify_status', '核验']],
    regimes: [['id', 'ID'], ['name', '制度'], ['agency', '机关'], ['duration_days', '周期'], ['risk', '风险']],
    labelRules: [['id', 'ID'], ['name', '规则'], ['severity', '等级'], ['pattern', '模式'], ['why', '原因']],
    ssgSnapshots: [['code', '编码'], ['name', '品名'], ['trigger_volume', '触发量'], ['accumulated', '已累积'], ['monthly_rate', '月速率'], ['ssg_rate', '加征%'], ['snapshot_date', '快照日']],
    mainlandProhibited: [['code_prefix', '前缀'], ['name', '名称'], ['reason', '原因'], ['verify_status', '核验']],
    ports: [['code', '代码'], ['name', '口岸'], ['handling_per_teu', '作业费'], ['clearance_days', '通关天数'], ['inspection_intensity', '查验强度']],
    adminFees: [['id', 'ID'], ['name', '费用'], ['amount', '金额'], ['applies_tags', '适用标签']],
    sources: [['id', 'ID'], ['name', '机构'], ['scope', '范围'], ['url', '网址'], ['status', '状态']],
  }[kind] || [];
  const filtered = rows.filter((r) => !q || JSON.stringify(r).toLowerCase().includes(q));
  return `<div class="table-wrap" style="max-height:520px"><table><thead><tr>${cols.map(([k, t]) => `<th>${esc(t)}</th>`).join('')}<th>操作</th></tr></thead><tbody>
    ${filtered.map((r) => `<tr>${cols.map(([k]) => `<td>${k === 'verify_status' ? verifyBadge(r[k]) : k === 'tags' || k === 'applies_tags' ? `<span class="hint">${(r[k] || []).join(',')}</span>` : k === 'ssg' || k === 'excise' || k === 'levy' ? `<span class="hint">${esc(typeof r[k] === 'object' && r[k] ? (r[k].name || JSON.stringify(r[k])) : (r[k] ? '是' : '否'))}</span>` : esc(Array.isArray(r[k]) ? r[k].join('~') : (typeof r[k] === 'object' && r[k] ? JSON.stringify(r[k]) : r[k] ?? '')).slice(0, 120)}</td>`).join('')}
      <td class="row" style="gap:4px">${overridden.includes(String(r[keyField])) ? '<span class="tone t-cyan">已覆写</span>' : ''}
        ${kind === 'tariffItems' || kind === 'ssgSnapshots' || kind === 'adminFees' ? `<button class="btn ghost sm" data-rule="${kind}|${esc(r[keyField])}" data-verify="verified">标已核验</button>` : ''}
        <button class="btn ghost sm" data-rule="${kind}|${esc(r[keyField])}">编辑</button></td></tr>`).join('')}
    </tbody></table></div><p class="hint">共 ${filtered.length} 条。编辑会写入覆写层并即时重建引擎，原始种子不被修改，可一键重置。</p>`;
}

/* ---------- 架构与边界 ---------- */
views.about = () => `
  <div class="page-head"><div><h1>架构、边界与风险</h1><p>本页面是给研发与评审看的：说清楚哪一层做了什么、没做什么、以及为什么会出错。</p></div></div>
  <div class="card"><h3>系统分层（实现状态如实标注）</h3>
    <div class="flow"><span>接入层 Web</span><i>→</i><span>业务逻辑层 四引擎</span><i>→</i><span>AI 能力层 RAG+网关</span><i>→</i><span>存储层</span></div>
    <table style="margin-top:12px"><thead><tr><th>层</th><th>本版本实现</th><th>未实现 / 后置</th></tr></thead><tbody>
      <tr><td>接入层</td><td>零构建前端、产品档案、任务交接 JSON</td><td>登录鉴权、企业多租户隔离（当前用 workspace 标识做演示隔离）</td></tr>
      <tr><td>业务逻辑层</td><td>准入引擎、税负引擎、SSG 监控、标签合规、变更影响评估、多方案对比</td><td>批量产品导入（迭代3）、完整决策看板（迭代3）</td></tr>
      <tr><td>AI 能力层</td><td>BM25 检索、LLM 网关（prompt 版本、限流、日志、费用、数字白名单审计）</td><td>向量库（Chroma/Milvus）、AI 文案生成（迭代2/3）</td></tr>
      <tr><td>数据采集层</td><td>运营后台人工维护 + 模拟变更 feed</td><td>真实爬虫与调度（限流/反爬规避未实现，不宣称已完成）</td></tr>
      <tr><td>存储层</td><td>双模仓储：Supabase 驱动已实现（待套餐开通）／JSON 文件／内存</td><td>Redis 缓存与定时任务</td></tr>
    </tbody></table></div>

  <div class="card"><h3>为什么「规则优先、AI 为辅」不是口号</h3>
    <ul class="list">
      <li>准入结论由决策树产生：禁止清单 → 事前核准 → 逐批/登录 → 有条件准许，每一步都引用规则 ID。</li>
      <li>所有金额由 <code class="inline">tax.mjs</code> 按固定课征顺序计算，输出附带计算式，可逐行复算。</li>
      <li>大模型输出前执行数字白名单审计：文本中每个数字必须能在引擎结果中找到，否则整段作废并降级为模板成文。</li>
      <li>未配置模型密钥时 <code class="inline">llm_mode=rule_template</code>，系统按设计降级，不冒充 AI 生成。</li>
      <li>缺规则、缺字段、骨架市场一律输出「无法判定」，宁可无用不可幻觉。</li>
    </ul></div>

  <div class="card"><h3>关键风险与处置（PRD 第五节落地情况）</h3>
    <table><thead><tr><th>风险</th><th>处置</th><th>残留</th></tr></thead><tbody>
      <tr><td>幻觉导致重大决策损失</td><td>数字白名单 + 强制来源绑定 + 免责强制层 + 参考级降级</td><td>规则本身若录错，系统无法自纠，依赖运营核验</td></tr>
      <tr><td>数据源延迟</td><td>所有 SSG/税率结果标注 snapshot_date 与「以海关公告为准」</td><td>无自动采集，延迟窗口不可控</td></tr>
      <tr><td>知识库维护成本高</td><td>运营后台覆写层 + 审计记录 + 一键重置 + 已核验率指标</td><td>仍需人工比对原文，无法自动化</td></tr>
      <tr><td>定位越界（代办/报关行）</td><td>页面与报告强制免责，输出不含代办入口</td><td>用户仍可能误用，需在培训中强调</td></tr>
      <tr><td>两岸表述与政策敏感</td><td>市场名统一「中国台湾地区」，产地标示按当地规定输出「中国大陆」</td><td>政策变动频繁，须持续监测</td></tr>
    </tbody></table></div>

  <div class="card"><h3>验证与质量</h3>
    <p class="hint">自动化断言：node --test tests/engine.test.mjs（覆盖口径对齐、判定方向、降级路径、边界拦截、防幻觉闸门、XSS 转义、运营覆写）。</p>
    <dl class="kv"><dt>运行模式</dt><dd>${esc(state.mode === 'server' ? '服务端引擎 + 持久化' : '浏览器本地引擎 + localStorage')}</dd>
      <dt>规则版本</dt><dd class="mono">${esc(state.meta?.rule_version || '—')}</dd>
      <dt>数据时点</dt><dd class="mono">${esc(state.meta?.data_as_of || '—')}</dd>
      <dt>LLM 模式</dt><dd class="mono">${esc(state.meta?.llm_mode || '—')}</dd>
      <dt>Session ID</dt><dd class="mono">${esc(sessionId())} <button class="linkbtn" data-copy="${esc(sessionId())}">复制</button></dd>
      <dt>Workspace</dt><dd class="mono">${esc(workspace)}</dd></dl></div>

  <div class="card"><h3>第三方工具与责任划分（如实说明）</h3>
    <p>前端毛坯房（页面结构、视觉规范、交互骨架）由 ChatGPT 生成；准入判断、税负测算、SSG 监控、标签合规、变更影响、检索与网关、持久化等核心业务逻辑，全部在千问办公中生成与验证。本页面保留该说明，不做模糊化处理。</p></div>`;

/* ----------------------------- 渲染与事件 ----------------------------- */
const VIEWS = views;

async function render() {
  const el = $('#view');
  const v = VIEWS[state.route] || VIEWS.workbench;
  document.querySelectorAll('[data-nav]').forEach((a) => {
    if (a.dataset.nav === state.route) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  el.innerHTML = v();
  bind();
  if (state.route === 'monitor') loadFeed();
  if (state.route === 'kb') loadKb();
  window.scrollTo(0, 0);
}

function bind() {
  const on = (sel, ev, fn) => document.querySelectorAll(sel).forEach((n) => n.addEventListener(ev, fn));

  /* 编码下拉联动到输入框 */
  on('#admhsPick', 'change', (e) => { if (e.target.value) $('#admhs').value = e.target.value; });
  on('#pfhsPick', 'change', (e) => { if (e.target.value) $('#pfhs').value = e.target.value; });

  on('#admGo', 'click', async () => {
    const payload = readProductForm('adm');
    state.form = { ...state.form, ...payload };
    $('#admOut').innerHTML = loading('准入判定中');
    try { const r = await run('admission', payload); state.lastPayload = { ...state.lastPayload, admission: r }; state.results.admission = admissionResult(r); $('#admOut').innerHTML = state.results.admission; await reloadRecords(); toast(`判定完成：${r.verdict.label}`); } catch (e) { $('#admOut').innerHTML = errorCard(e); }
    bind();
  });
  on('#admClear', 'click', () => { state.results.admission = null; render(); });

  on('#cGo', 'click', async () => {
    const payload = readCostForm();
    $('#cOut').innerHTML = loading('税负测算中');
    try { const r = await run('cost', payload); state.lastPayload = { ...state.lastPayload, cost: r }; state.results.cost = costResult(r); $('#cOut').innerHTML = state.results.cost; await reloadRecords(); toast('测算完成'); } catch (e) { $('#cOut').innerHTML = errorCard(e); }
    bind();
  });
  on('#cCompare', 'click', async () => {
    const base = readCostForm();
    $('#cOut').innerHTML = loading('多方案对比中');
    try {
      const r = await run('compare', { ...base, quantities: [Number(base.quantity), Math.max(1, Math.round(Number(base.quantity) * 2.5))], ports: (state.meta?.ports || []).map((p) => p.code), ssg_modes: ['off', 'triggered'] });
      state.results.cost = compareResult(r) + (state.results.cost || '');
      $('#cOut').innerHTML = state.results.cost; toast('对比完成');
    } catch (e) { $('#cOut').innerHTML = errorCard(e); }
    bind();
  });

  on('#sGo', 'click', async () => {
    const payload = { code: $('#sCode').value, quantity: Number($('#sQty').value), market: 'TW', value: Number($('#sValue').value), freight: Number($('#sFreight').value), insurance: 0 };
    try { const r = await run('ssg', payload); state.results.ssg = ssgResult(r); $('#sOut').innerHTML = state.results.ssg; toast(`SSG 等级：${r.level.label}`); } catch (e) { $('#sOut').innerHTML = errorCard(e); }
    bind();
  });
  on('#sgScan', 'click', async () => {
    try {
      if (state.mode === 'server') { const r = await api('ssg/scan', {}); toast(`已生成 ${r.alerts.length} 条告警`); await reloadRecords(); }
      else { const alerts = state.core.ssgAlerts({ thresholdPct: 90 }); const msgs = ls.get('tp.messages', []); alerts.forEach((a) => msgs.push({ id: 'MSG-' + Math.random().toString(36).slice(2, 8), level: a.usage_pct >= 100 ? 'critical' : 'high', title: `SSG 告警：${a.name}`, body: `使用率 ${a.usage_pct}%，剩余 ${a.remaining} ${a.unit}`, read_at: null, created_at: new Date().toISOString() })); ls.set('tp.messages', msgs); state.messages = msgs.slice().reverse(); toast(`已生成 ${alerts.length} 条告警（本地）`); }
      render();
    } catch (e) { toast(e.message, 'err'); }
  });

  on('#lGo', 'click', async () => {
    const payload = { text: $('#lText').value, market: 'TW', tags: $('#lCat').value ? [$('#lCat').value] : [] };
    state.form = { ...state.form, labelText: payload.text };
    $('#lOut').innerHTML = loading('合规扫描中');
    try { const r = await run('label', payload); state.results.label = labelResult(r); $('#lOut').innerHTML = state.results.label; toast(`命中 ${r.summary.hits} 项`); } catch (e) { $('#lOut').innerHTML = errorCard(e); }
    bind();
  });
  on('#lSample', 'click', () => { $('#lText').value = '品名：燕麥飲品。內容物：水、燕麥、食鹽。淨重：250毫升。原產地：中國大陸。負責廠商：某某食品有限公司，地址：台北市中正區某某路1號。有效日期：標示於瓶身。營養標示：熱量 45 大卡。'; });

  on('#moGo', 'click', async () => {
    if (!state.products.length) { toast('请先录入产品档案', 'err'); return; }
    $('#moOut').innerHTML = loading('影响评估中');
    try {
      const payload = { changes: state.meta?.demo_changes || undefined, products: state.products, defaultCostInputs: { value: 30000, quantity: 2000, freight: 1800, insurance: 120, fee: 600, include_extended_fees: false } };
      const r = state.mode === 'server' ? await api('monitor', payload) : state.core.monitor({ changes: payload.changes || [], products: payload.products, defaultCostInputs: payload.defaultCostInputs, kb: state.core.kb });
      state.results.monitor = monitorResult(r); $('#moOut').innerHTML = state.results.monitor; await reloadRecords(); toast(`影响 ${r.impacts.length} 项`);
    } catch (e) { $('#moOut').innerHTML = errorCard(e); }
    bind();
  });

  on('#pfSave', 'click', async () => {
    const payload = readProductForm('pf');
    if (!payload.name) { toast('产品名称不能为空', 'err'); return; }
    try {
      if (state.mode === 'server') {
        const r = state.editing
          ? await fetch(`/api/products/${state.editing}`, { method: 'PUT', headers: { 'content-type': 'application/json', 'x-workspace': workspace }, body: JSON.stringify(payload) })
          : await fetch('/api/products', { method: 'POST', headers: { 'content-type': 'application/json', 'x-workspace': workspace }, body: JSON.stringify(payload) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j?.error?.message || `保存失败（${r.status}）`);
      } else {
        const rows = ls.get('tp.products', []);
        if (state.editing) { const i = rows.findIndex((r) => r.id === state.editing); if (i >= 0) rows[i] = { ...rows[i], ...payload, updated_at: new Date().toISOString() }; }
        else rows.push({ id: 'PRD-' + Date.now().toString(36).toUpperCase(), ...payload, created_at: new Date().toISOString() });
        ls.set('tp.products', rows);
      }
      state.editing = null; await reloadRecords(); render(); toast(state.editing ? '档案已更新' : '档案已保存');
    } catch (e) { toast(e.message, 'err'); }
  });
  on('#pfClear', 'click', () => { state.editing = null; render(); });
  on('#pfSeed', 'click', async () => {
    const seeds = [
      { name: '低糖燕麦饮', category: '食品饮料', hs: '220299', market: 'TW', origin: '中国大陆', specs: '250mL／含糖 4.2g/100mL', attributes: ['is_food'] },
      { name: '无糖气泡水', category: '食品饮料', hs: '220210', market: 'TW', origin: '中国大陆', specs: '330mL／无糖／含气', attributes: ['is_food'] },
      { name: '植物蛋白饮（宣称功效）', category: '食品饮料', hs: '220299', market: 'TW', origin: '中国大陆', specs: '配方待补充', attributes: ['is_food', 'claims_health_function'] },
      { name: '家用路由器', category: '电子电器', hs: '851762', market: 'TW', origin: '中国大陆', specs: 'Wi-Fi 6', attributes: ['has_wireless_rf'] },
      { name: '磁砖 600×600', category: '家居建材', hs: '690721', market: 'TW', origin: '中国大陆', specs: '每柜 720 片', attributes: [] },
    ];
    for (const s of seeds) {
      try { if (state.mode === 'server') await api('products', s, 'POST'); } catch { /* 重复忽略 */ }
    }
    if (state.mode !== 'server') { const rows = ls.get('tp.products', []); seeds.forEach((s) => rows.push({ id: 'PRD-' + Math.random().toString(36).slice(2, 8), ...s, created_at: new Date().toISOString() })); ls.set('tp.products', rows); }
    await reloadRecords(); render(); toast('示例产品已载入');
  });

  on('#recExport', 'click', async () => {
    const bundle = {
      exported_at: new Date().toISOString(), workspace, session_id: sessionId(),
      rule_version: state.meta?.rule_version, data_as_of: state.meta?.data_as_of, mode: state.mode,
      disclaimer: state.meta?.disclaimer,
      products: state.products.map(({ payload, ...r }) => r),
      assessments: state.assessments.map((a) => ({ id: a.id, name: a.name || a.payload?.product?.name, verdict: a.verdict || a.payload?.verdict?.code, risk: a.risk_level || a.payload?.risk?.level, rule_version: a.rule_version, created_at: a.created_at })),
      costs: state.costs.map((c) => ({ id: c.id, hs: c.hs || c.payload?.inputs?.hs, effective_tax_rate_pct: c.effective_tax_rate_pct ?? c.payload?.totals?.effective_tax_rate_pct, unit_landed_cost: c.unit_landed_cost ?? c.payload?.totals?.unit_landed_cost, created_at: c.created_at })),
      messages: state.messages.map(({ payload, ...r }) => r),
    };
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `tradepilot-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click(); URL.revokeObjectURL(a.href);
    toast('已导出 JSON，可直接发给海外合作方');
  });

  document.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => {
    const p = state.products.find((x) => x.id === b.dataset.edit); if (!p) return;
    state.editing = p.id; state.form = { name: p.name, category: p.category, hs: p.hs, market: p.market, origin: p.origin, specs: p.specs, attributes: p.attributes || [] };
    render(); setTimeout(() => { Object.entries({ pfname: p.name, pfcat: p.category, pfhs: p.hs, pfspecs: p.specs }).forEach(([k, v]) => { if ($(`#${k}`)) $(`#${k}`).value = v; }); if ($(`#pfmarket`)) $(`#pfmarket`).value = p.market; if ($(`#pforigin`)) $(`#pforigin`).value = p.origin; document.querySelectorAll('[data-attr]').forEach((i) => { i.checked = (p.attributes || []).includes(i.value); }); }, 30);
    toast('已载入档案，修改后点保存');
  }));
  document.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm('确认删除该产品档案？关联历史记录不会被删除。')) return;
    try { if (state.mode === 'server') { const r = await fetch(`/api/products/${b.dataset.del}`, { method: 'DELETE', headers: { 'x-workspace': workspace } }); if (!r.ok) throw new Error('删除失败'); } else { ls.set('tp.products', ls.get('tp.products', []).filter((x) => x.id !== b.dataset.del)); } await reloadRecords(); render(); toast('已删除'); } catch (e) { toast(e.message, 'err'); }
  }));
  document.querySelectorAll('[data-eval]').forEach((b) => b.addEventListener('click', async () => {
    const p = state.products.find((x) => x.id === b.dataset.eval); if (!p) return;
    state.form = { name: p.name, category: p.category, hs: p.hs, market: p.market, origin: p.origin, specs: p.specs, attributes: p.attributes || [] };
    state.route = 'admission'; await render();
    $('#admGo')?.click();
  }));

  document.querySelectorAll('[data-report]').forEach((b) => b.addEventListener('click', () => openReport(b.dataset.report, b.dataset.id)));
  document.querySelectorAll('[data-copy]').forEach((b) => b.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(b.dataset.copy); toast('已复制到剪贴板'); } catch { toast('浏览器拒绝剪贴板，请手动选择', 'err'); }
  }));
  document.querySelectorAll('[data-read]').forEach((b) => b.addEventListener('click', async () => {
    if (state.mode === 'server') { await api('messages/read', { id: b.dataset.read }); await reloadRecords(); }
    else { const msgs = ls.get('tp.messages', []).map((m) => (m.id === b.dataset.read ? { ...m, read_at: new Date().toISOString() } : m)); ls.set('tp.messages', msgs); state.messages = msgs.slice().reverse(); }
    render();
  }));

  document.querySelectorAll('[data-kind]').forEach((b) => b.addEventListener('click', () => loadKb(b.dataset.kind)));
  on('#kbQ', 'input', (e) => loadKb(state.kbKind || 'tariffItems', e.target.value));
  on('#kbReset', 'click', async () => {
    if (!confirm('重置全部规则覆写，回到种子库？')) return;
    if (state.mode === 'server') { await api('kb/reset', {}); toast('已重置'); await bootMeta(); }
    else { ls.set('tp.overrides', {}); state.core = createCore({ overrides: {} }); toast('已重置（本地）'); }
    await reloadRecords(); loadKb(state.kbKind || 'tariffItems');
  });
  document.querySelectorAll('[data-rule]').forEach((b) => b.addEventListener('click', async () => {
    const [kind, code] = b.dataset.rule.split('|');
    const data = await fetchKbRule(kind, code);
    if (!data) return;
    if (b.dataset.verify === 'verified') {
      const ok = confirm(`将 ${kind}/${code} 标记为「已核验」？\n\n前提：你已比对官方原文条款。系统会记录操作者与时间，供审计追溯。`);
      if (ok) await saveRule(kind, code, { verify_status: 'verified' }, '标记已核验');
      return;
    }
    openRuleEditor(kind, code, data);
  }));
}

function errorCard(e) {
  return `<div class="card"><div class="alert err"><strong>未能完成计算</strong>${esc(e.message)}
    <p class="hint" style="margin-top:6px">系统不会用估算值填补失败结果。请检查输入，或该品类规则是否尚未建库。</p></div></div>`;
}

/* ---------- 规则后台数据 ---------- */
async function fetchKbRule(kind, code) {
  const keyField = keyOf(kind);
  let rows = [];
  if (state.mode === 'server') {
    const r = await fetch(`/api/kb/rules?kind=${kind}`, { headers: { 'x-workspace': workspace } });
    rows = (await r.json()).rows || [];
  } else {
    rows = (state.core || createCore({ overrides: ls.get('tp.overrides', {}) })).kb.raw[kind] || [];
  }
  return rows.find((x) => String(x[keyField]) === code) || null;
}
const keyOf = (kind) => ({ tariffItems: 'code', regimes: 'id', labelRules: 'id', ssgSnapshots: 'code', ports: 'code', adminFees: 'id', mainlandProhibited: 'code_prefix', sources: 'id' }[kind] || 'id');

async function loadKb(kind = 'tariffItems', q = '') {
  state.kbKind = kind;
  const host = $('#kbTable'); if (!host) return;
  host.innerHTML = loading('载入规则');
  try {
    let rows = []; let overridden = [];
    if (state.mode === 'server') {
      const r = await fetch(`/api/kb/rules?kind=${kind}`, { headers: { 'x-workspace': workspace } });
      const j = await r.json();
      rows = j.rows || []; overridden = (j.overridden_ids || []).map(String);
    } else {
      const core = state.core || createCore({ overrides: ls.get('tp.overrides', {}) });
      rows = core.kb.raw[kind] || [];
      const ov = ls.get('tp.overrides', {})[kind] || [];
      overridden = ov.map((x) => String(x[keyOf(kind)]));
    }
    host.innerHTML = kbTable(kind, rows, keyOf(kind), overridden, q);
    bind();
  } catch (e) { host.innerHTML = errorCard(e); }
}

async function saveRule(kind, code, patch, note) {
  const keyField = keyOf(kind);
  if (state.mode === 'server') {
    try { await fetch(`/api/kb/rules/${kind}/${encodeURIComponent(code)}`, { method: 'PUT', headers: { 'content-type': 'application/json', 'x-workspace': workspace, 'x-actor': 'ops-console' }, body: JSON.stringify({ record: patch, updated_by: 'ops-console' }) }); } catch (e) { toast(e.message, 'err'); return; }
    await bootMeta();
  } else {
    const ov = ls.get('tp.overrides', {});
    ov[kind] = ov[kind] || [];
    const base = (state.core.kb.raw[kind] || []).find((r) => String(r[keyField]) === code) || {};
    const idx = ov[kind].findIndex((r) => String(r[keyField]) === code);
    const rec = { ...base, ...patch, [keyField]: code, updated_at: new Date().toISOString(), updated_by: 'local-ops' };
    if (idx >= 0) ov[kind][idx] = rec; else ov[kind].push(rec);
    ls.set('tp.overrides', ov);
    state.core = createCore({ overrides: ov });
  }
  toast(`${note || '规则已更新'}（${kind}/${code}）`);
  await loadKb(kind, $('#kbQ')?.value || '');
}

function openRuleEditor(kind, code, data) {
  const fields = kind === 'tariffItems'
    ? [['duty_rate', '关税税率 %', 'number'], ['verify_status', '核验状态', 'select:needs_verification,verified,skeleton']]
    : kind === 'ssgSnapshots'
      ? [['accumulated', '已累积量', 'number'], ['trigger_volume', '触发量', 'number'], ['monthly_rate', '月均速率', 'number'], ['snapshot_date', '快照日期', 'text'], ['verify_status', '核验状态', 'select:needs_verification,verified,skeleton']]
      : kind === 'adminFees'
        ? [['amount', '金额', 'number'], ['verify_status', '核验状态', 'select:needs_verification,verified,skeleton']]
        : [['verify_status', '核验状态', 'select:needs_verification,verified,skeleton'], ['note', '备注', 'text']];
  const html = `<div class="card"><h3>编辑规则 ${esc(kind)} / ${esc(code)}</h3>
    ${fields.map(([k, label, type]) => `<div class="field"><label>${esc(label)}</label>
      ${type === 'select' ? `<select data-f="${k}">${type.split(':')[1].split(',').map((o) => `<option${String(data[k] ?? '') === o ? ' selected' : ''}>${o}</option>`).join('')}</select>`
        : `<input data-f="${k}" type="${type}" value="${esc(data[k] ?? '')}">`}</div>`).join('')}
    <div class="row"><button class="btn" id="kbSave" type="button">保存覆写</button><button class="btn ghost" id="kbCancel" type="button">取消</button></div>
    <p class="hint">覆写不修改种子库，写入覆写层并记录审计；重置后回到种子。</p></div>`;
  $('#kbTable').insertAdjacentHTML('beforebegin', `<div id="kbEditor">${html}</div>`);
  $('#kbSave').addEventListener('click', async () => {
    const patch = {};
    document.querySelectorAll('#kbEditor [data-f]').forEach((i) => { patch[i.dataset.f] = i.type === 'number' ? Number(i.value) : i.value; });
    await saveRule(kind, code, patch, '已覆写');
    $('#kbEditor')?.remove();
  });
  $('#kbCancel').addEventListener('click', () => $('#kbEditor')?.remove());
}

/* ---------- 报告 ---------- */
async function openReport(kind, id) {
  if (state.mode === 'server' && id) { window.open(`/api/report/${kind}/${id}`, '_blank', 'noopener'); return; }
  const payload = (state.lastPayload || {})[kind === 'cost' ? 'cost' : 'admission'];
  if (!payload) { toast('本地模式仅能导出本次会话最近一次结果，请先完成一次测算', 'err'); return; }
  const html = state.core.report(kind, { ...payload, session_id: payload.session_id || sessionId() });
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener');
  toast('报告已在新窗口打开，用浏览器打印即可导出 PDF');
}

/* ---------- 数据加载 ---------- */
async function bootMeta() {
  if (state.mode === 'server') {
    const m = await (await fetch('/api/meta', { headers: { 'x-workspace': workspace } })).json();
    state.meta = { ...state.meta, ...m };
  } else {
    const core = state.core;
    state.meta = { ...core.meta, markets: core.kb.raw.markets, ports: core.kb.raw.ports, attributes: core.kb.raw.attributeTagMap, tariff_items: core.kb.raw.tariffItems, ssg_items: core.kb.raw.ssgSnapshots.map((s) => ({ code: s.code, name: s.name, unit: s.unit, usage_pct: Math.round((s.accumulated / s.trigger_volume) * 1000) / 10, snapshot_date: s.snapshot_date })), sources: core.kb.raw.sources, kb: core.kb.stats(), demo_changes: core.demoChangeFeed };
  }
  $('#ruleVersion').textContent = `规则版本 ${state.meta.rule_version || '—'}`;
  $('#dataAsOf').textContent = `数据时点 ${state.meta.data_as_of || '—'}`;
  $('#globalDisclaimer').textContent = state.meta.disclaimer || '本系统仅为信息参考，不能替代官方许可与报关行专业意见。';
  const badge = $('#modeBadge');
  badge.textContent = state.mode === 'server' ? `服务端引擎 · ${state.meta.llm_mode === 'live' ? 'LLM 已接入' : 'LLM 模板降级'} · ${state.meta.repo_mode || ''}` : '本地引擎模式（浏览器内计算）';
  badge.className = `pill ${state.mode === 'server' ? 'live' : 'local'}`;
}

async function reloadRecords() {
  if (state.mode === 'server') {
    const h = { 'x-workspace': workspace };
    const [p, a, c, msg] = await Promise.all([
      fetch('/api/products', { headers: h }).then((r) => r.json()).catch(() => ({ items: [] })),
      fetch('/api/records?type=assessments', { headers: h }).then((r) => r.json()).catch(() => ({ items: [] })),
      fetch('/api/records?type=costs', { headers: h }).then((r) => r.json()).catch(() => ({ items: [] })),
      fetch('/api/messages', { headers: h }).then((r) => r.json()).catch(() => ({ items: [] })),
    ]);
    state.products = p.items || []; state.assessments = a.items || []; state.costs = c.items || []; state.messages = msg.items || [];
  } else {
    state.products = ls.get('tp.products', []);
    state.assessments = ls.get('tp.assessments', []).slice().reverse();
    state.costs = ls.get('tp.costs', []).slice().reverse();
    state.messages = ls.get('tp.messages', []).slice().reverse();
  }
}

async function loadFeed() {
  const rows = state.meta?.demo_changes || [];
  const tb = $('#moFeed'); if (!tb) return;
  tb.innerHTML = rows.map((c) => `<tr><td>${esc(c.title)}<br><span class="hint">${esc(c.summary)}</span></td><td><span class="chip">${esc(c.diff_type)}</span></td><td class="mono">${esc(c.effective_on || '未公布')}</td><td>${c.source_url ? `<a class="linkish" href="${esc(c.source_url)}" target="_blank" rel="noopener noreferrer">${esc(c.source_name)}</a>` : esc(c.source_name)}</td><td>${c.source_kind === 'official' ? '<span class="tone t-green">公开官方</span>' : '<span class="tone t-red">非官方·将拦截</span>'}</td></tr>`).join('');
}

/* ----------------------------- 启动 ----------------------------- */
$('#toggleDisclaimer').addEventListener('click', (e) => {
  const bar = document.querySelector('.disclaimer-bar');
  bar.classList.toggle('collapsed');
  e.target.textContent = bar.classList.contains('collapsed') ? '展开' : '收起';
  e.target.setAttribute('aria-expanded', String(!bar.classList.contains('collapsed')));
});

window.addEventListener('hashchange', () => {
  state.route = (location.hash.replace('#/', '') || 'workbench').split('?')[0];
  if (!VIEWS[state.route]) state.route = 'workbench';
  render();
});

(async function boot() {
  await probe();
  await bootMeta();
  await reloadRecords();
  state.route = (location.hash.replace('#/', '') || 'workbench').split('?')[0];
  if (!VIEWS[state.route]) state.route = 'workbench';
  await render();
  console.info(`[TradePilot] mode=${state.mode} rules=${state.meta.rule_version} llm=${state.meta.llm_mode}`);
})();
