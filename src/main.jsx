import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowRight, ArrowUpRight, Bell, BookmarkCheck, Calculator, Check, CheckCheck, ChevronDown, ChevronRight, CircleHelp, ClipboardList, Copy, Download, FileCheck2, FileText, Globe2, LayoutDashboard, Menu, Navigation, Package, Plus, Search, Settings2, ShieldCheck, SlidersHorizontal, Sparkles, TriangleAlert, X, ExternalLink, CircleCheck, Clock3, Link2, RotateCcw, Inbox, Printer, Layers3, Lock, Building2, BarChart3, ClipboardCheck, BadgeCheck } from 'lucide-react';
import { DISCLAIMER, initialProducts, sources, scenarios, getDemoAssessment as demoAssessment, defaultCost, getDemoCostPreview as previewCost, readStore, writeStore, today, readOwner, writeOwner, scopedKey, DEFAULT_OWNER } from './demo-data.mjs';
import './styles.css';
import { WorkflowHero, CapabilityShowcase } from './workflow-showcase.jsx';
import { probeQw, assessViaQw, costViaQw, eventsViaQw, productsViaQw, saveProductViaQw, scanMarketsViaQw, sourcesViaQw, tariffViaQw, regulationsViaQw, competitorsViaQw, reportViaQw, labelScanViaQw, verifyQueueViaQw, verifyRuleViaQw, verifyAssistViaQw, registerChangeViaQw } from './qw-client.mjs';

const routes = [
  { id: 'overview', name: '出海工作台', icon: LayoutDashboard },
  { id: 'assessment', name: '准入评估', icon: ShieldCheck },
  { id: 'cost', name: '成本测算', icon: Calculator },
  { id: 'alerts', name: '法规与预警', icon: Bell },
  { id: 'products', name: '产品档案', icon: Package },
  { id: 'tariff', name: '税则库', icon: FileText },
  { id: 'regulations', name: '法规库', icon: FileCheck2 },
  { id: 'verify', name: '规则核验', icon: BadgeCheck },
  { id: 'competition', name: '竞品分析', icon: BarChart3 },
  { id: 'report', name: '方案报告', icon: ClipboardCheck },
];
const number = n => Number(n).toLocaleString('zh-CN', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
const currency = n => `¥${number(n)}`;
const count = n => String(n).padStart(2, '0');
/* 支持 #route/子段（如 #products/attention、#assessment/scan）：路由取前缀，子段由目标页解析 */
const hashRoute = () => location.hash.slice(1).split('/')[0];
const validRoute = () => routes.some(r => r.id === hashRoute()) ? hashRoute() : 'overview';

function Button({ children, className = '', variant = 'secondary', icon: Icon, ...props }) {
  return <button className={`btn btn-${variant} ${className}`} {...props}>{Icon && <Icon size={17} aria-hidden="true" />}{children}</button>;
}
function Badge({ children, tone = 'slate' }) { return <span className={`badge badge-${tone}`}><span className="badge-dot" />{children}</span>; }
function ProductIcon({ product, size = '' }) { return <span className={`product-icon ${product.color || 'blue'} ${size}`}><Package size={size === 'large' ? 26 : 20} aria-hidden="true" /></span>; }
function SectionTitle({ title, description, action, icon: Icon }) { return <div className="section-heading"><div>{Icon && <Icon size={18} aria-hidden="true" />}<h2>{title}</h2>{description && <span className="section-description">{description}</span>}</div>{action}</div>; }
function Empty({ title, text, action }) { return <div className="empty"><Inbox size={36} aria-hidden="true" /><h3>{title}</h3><p>{text}</p>{action}</div>; }
function Modal({ title, children, onClose, wide = false }) {
  const ref = useRef(null);
  useEffect(() => { const d = ref.current; d.showModal(); return () => { if (d.open) d.close(); }; }, []);
  return <dialog ref={ref} className={`modal ${wide ? 'modal-wide' : ''}`} aria-labelledby="modal-title" onCancel={onClose} onClick={e => { if (e.target === ref.current) onClose(); }}><div className="modal-head"><h2 id="modal-title">{title}</h2><button className="icon-button" onClick={onClose} aria-label="关闭对话框"><X size={20} /></button></div>{children}</dialog>;
}
function RouteMap() {
  return <div className="route-map" aria-label="从中国大陆到中国台湾地区的市场评估示意图"><div className="map-caption"><span className="pulse-dot" />一期市场覆盖</div><svg viewBox="0 0 500 240" aria-hidden="true">
    <defs><pattern id="dots" width="12" height="12" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.1" fill="#b4c8e8" /></pattern><linearGradient id="routeGradient"><stop stopColor="#1e40af" /><stop offset="1" stopColor="#d97706" /></linearGradient></defs>
    <path fill="url(#dots)" d="M48 48 125 25 188 37 235 19 295 37 330 76 373 69 427 102 417 130 353 130 327 160 280 151 262 190 234 194 216 158 173 140 145 113 112 109 72 87Z" />
    <path fill="url(#dots)" d="M323 174 343 181 337 211 325 219 318 202Z M368 156 378 158 382 185 366 191Z M394 67 399 90 387 99 379 95Z M242 211 286 212 304 229 271 237Z" />
    <path d="M198 94 Q290 42 342 151" fill="none" stroke="url(#routeGradient)" strokeWidth="2" strokeDasharray="5 5" />
    <circle cx="198" cy="94" r="20" fill="#1e40af" opacity=".08" /><circle cx="198" cy="94" r="7" fill="#1e40af" stroke="white" strokeWidth="3" />
    <circle cx="342" cy="151" r="20" fill="#d97706" opacity=".12" /><circle cx="342" cy="151" r="7" fill="#d97706" stroke="white" strokeWidth="3" />
    <g transform="translate(125 118)"><rect width="129" height="35" rx="7" fill="white" stroke="#d7e2f2" /><text x="13" y="23" fill="#1e3a8a" fontSize="12">起点 · 中国大陆</text></g>
    <g transform="translate(274 181)"><rect width="153" height="35" rx="7" fill="white" stroke="#d7e2f2" /><text x="13" y="23" fill="#1e3a8a" fontSize="12">目标 · 中国台湾地区</text></g>
    <g transform="translate(269 75) rotate(27)"><circle r="17" fill="white" stroke="#d7e2f2" /><path d="m-6 4 12-10-4 13-3-5Z" fill="#1e40af" /></g>
  </svg><div className="map-footer"><ShieldCheck size={14} />准入、税负与规则依据，一站式梳理<span>示意图</span></div></div>;
}

function App() {
  const [owner, setOwnerName] = useState(readOwner);
  const [page, setPage] = useState(validRoute);
  const [products, setProducts] = useState(() => readStore(scopedKey('tradepilot.products.v1', readOwner()), initialProducts));
  const [selectedId, setSelectedId] = useState(() => {
    const list = readStore(scopedKey('tradepilot.products.v1', readOwner()), initialProducts);
    try { const id = localStorage.getItem(scopedKey('tradepilot.selected.v1', readOwner())); return list.some(p => p.id === id) ? id : list[0]?.id; } catch { return list[0]?.id; }
  });
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState('');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [qw, setQw] = useState(null);
  const [qwState, setQwState] = useState('probing');
  const [syncNote, setSyncNote] = useState('');
  const [sourceCount, setSourceCount] = useState(null);
  const [search, setSearch] = useState('');
  const [costInputs, setCostInputs] = useState({ ...defaultCost });
  const [events, setEvents] = useState(() => readStore(scopedKey('tradepilot.events.v1', readOwner()), []));
  const [readIds, setReadIds] = useState(() => readStore(scopedKey('tradepilot.read.v1', readOwner()), []));
  const pageRef = useRef(null);
  const probeSeq = useRef(0);
  const costProductRef = useRef(null);
  const product = products.find(p => p.id === selectedId) || products[0];
  const unread = events.filter(e => !readIds.includes(e.id)).length;
  useEffect(() => { const handle = () => { setPage(validRoute()); setMobileOpen(false); }; window.addEventListener('hashchange', handle); return () => window.removeEventListener('hashchange', handle); }, []);
  /* 引擎探测：首次失败立即降级为演示模式（不阻塞界面），随后按 2s / 5s 自动重试；
     任一次成功即升级为「核心引擎已接入」，无需刷新页面。冷启动不再把整场演示锁死在静态样例。 */
  const runProbe = (force = false) => {
    const seq = ++probeSeq.current;
    setQwState('probing');
    return probeQw({ force, onUpdate: (st, health) => { if (seq !== probeSeq.current) return; setQwState(st); if (health) setQw(health); } });
  };
  useEffect(() => { runProbe(true); return () => { probeSeq.current += 1; }; }, []);
  async function reconnect() {
    setToast('正在重新连接核心引擎…');
    const r = await runProbe(true);
    setToast(r ? `核心引擎已连接（规则 ${r.rule_version}）。` : '仍然连不上核心引擎，已保持演示模式；可稍后再点一次。');
  }
  useEffect(() => { document.title = `${routes.find(r => r.id === page)?.name} · 知海 TradePilot`; pageRef.current?.focus({ preventScroll: true }); }, [page]);
  useEffect(() => { try { localStorage.setItem(scopedKey('tradepilot.selected.v1', owner), selectedId || ''); } catch {} }, [selectedId, owner]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 4500); return () => clearTimeout(timer); }, [toast]);
  /* 工作区档案同步：引擎在线时以服务端为准；服务端为空则把本地/种子档案 upsert 上去。
     失败一律静默回落本地存储，不影响页面可用性。 */
  useEffect(() => {
    if (qwState !== 'online') return;
    let alive = true;
    (async () => {
      const r = await productsViaQw({ owner });
      if (!alive) return;
      if (r?.items?.length) {
        const next = r.items;
        setProducts(next); persist(scopedKey('tradepilot.products.v1', owner), next);
        setSelectedId(id => (next.some(p => p.id === id) ? id : next[0]?.id));
        setSyncNote(`服务端 ${next.length} 条档案已载入`);
        return;
      }
      const local = readStore(scopedKey('tradepilot.products.v1', owner), initialProducts);
      const pushed = [];
      for (const p of local) {
        const s = await saveProductViaQw(p, { owner });
        if (!alive) return;
        if (s?.product) pushed.push(s.product);
      }
      if (pushed.length) {
        setProducts(pushed); persist(scopedKey('tradepilot.products.v1', owner), pushed);
        setSelectedId(id => (pushed.some(p => p.id === id) ? id : pushed[0]?.id));
        setSyncNote(`${pushed.length} 条档案已同步到服务端`);
      }
    })();
    return () => { alive = false; };
  }, [qwState, owner]);
  /* 切换产品时把档案里的默认货值 / 数量带进成本页，消除「换了产品参数却没变」的错觉 */
  useEffect(() => {
    const id = product?.id;
    if (!id || costProductRef.current === id) return;
    costProductRef.current = id;
    const v = Number(product?.cost_value);
    const q = Number(product?.cost_quantity);
    const patch = {};
    if (Number.isFinite(v) && v > 0) patch.value = v;
    if (Number.isFinite(q) && q > 0) patch.quantity = Math.round(q);
    if (Object.keys(patch).length) setCostInputs(prev => ({ ...prev, ...patch }));
  }, [product?.id]);
  /* 引擎真实准入结论：在线时对每个产品档案执行一次规则评估并缓存（键含 HS/品类/成分，
     改档案自动重估），列表、概览、筛选全部以引擎结论为准；离线回落演示规则。 */
  const [verdicts, setVerdicts] = useState({});
  const verdictCache = useRef({});
  useEffect(() => {
    if (qwState !== 'online') return;
    let on = true;
    const t = setTimeout(() => {
      (async () => {
        const next = {};
        for (const p of products) {
          if (!p?.id || !p?.name) continue;
          const key = `${p.id}|${p.hs || ''}|${p.category || ''}|${p.specs || ''}`;
          if (verdictCache.current[key]) { next[p.id] = verdictCache.current[key]; continue; }
          /* 资料已变但尚未重估完成：先标记「评估中」，防止旧结论冒充新结果 */
          setVerdicts(prev => (prev[p.id]?.status === 'assessing' ? prev : { ...prev, [p.id]: { status: 'assessing', label: '评估中', short: '评估中…', reason: '资料已更新，规则引擎正在重新评估' } }));
          const r = await assessViaQw(p, [], { owner });
          if (!on) return;
          if (r?.status) { const v = { status: r.status, label: r.status_label, reason: r.conclusion, risk: r.risks?.label || '未知', missing: r.missing_fields || [], docs: r.documents?.length || 0 }; verdictCache.current[key] = v; next[p.id] = v; setVerdicts(prev => ({ ...prev, [p.id]: v })); }
        }
      })();
    }, 600);
    return () => { on = false; clearTimeout(t); };
  }, [qwState, owner, products]);
  /* 引擎在线时取一次来源登记数，供首页「待核验来源」卡片显示真实数量 */
  useEffect(() => {
    if (qwState !== 'online') return;
    let on = true;
    sourcesViaQw({ owner }).then(r => { if (on && r?.sources?.length) setSourceCount(r.sources.length); });
    return () => { on = false; };
  }, [qwState, owner]);
  /* 统一状态取值：优先引擎结论，回落演示规则 */
  const statusOf = (p) => {
    const v = p?.id && verdicts[p.id];
    if (v?.status === 'assessing') return { scenario: 'assessing', label: '评估中', short: '评估中…', tone: 'blue', reason: v.reason, risk: '评估中', missing: [], engine: true };
    return v
      ? { scenario: v.status, label: v.label, short: v.label, tone: QW_TONE[v.status] || 'slate', reason: v.reason, risk: v.risk || '未知', missing: v.missing || [], engine: true }
      : { ...demoAssessment(p), risk: '未知', missing: [], engine: false };
  };
  function navigate(route) { if (location.hash === `#${route}`) setPage(validRoute()); else location.hash = route; setMobileOpen(false); }
  function persist(key, value) { if (!writeStore(key, value)) setToast('浏览器未允许本地保存，本次数据仅在当前页面保留。'); }
  function select(p, route = 'assessment') { setSelectedId(p.id); navigate(route); }
  async function saveProduct(p) {
    const next = products.some(x => x.id === p.id) ? products.map(x => x.id === p.id ? p : x) : [...products, p];
    setProducts(next); persist(scopedKey('tradepilot.products.v1', owner), next); setSelectedId(p.id); setModal(null); navigate('assessment');
    if (qwState !== 'online') { setToast(`产品档案已保存在浏览器（工作区「${owner}」）。核心引擎未连接，未同步到服务端。`); return; }
    const r = await saveProductViaQw(p, { owner });
    setSyncNote(r?.product ? '已同步到服务端' : '服务端写入失败，仅本地保存');
    setToast(r?.product ? `产品档案已保存到工作区「${owner}」。` : '服务端写入失败，档案已保存在当前浏览器，可稍后重试。');
  }
  function changeOwner(name) {
    const next = String(name).trim().replace(/\s+/g, ' ').slice(0, 32) || DEFAULT_OWNER;
    writeOwner(next); setOwnerName(next);
    const cached = readStore(scopedKey('tradepilot.products.v1', next), null);
    const list = cached?.length ? cached : initialProducts;
    setProducts(list); persist(scopedKey('tradepilot.products.v1', next), list); setSelectedId(list[0]?.id || null);
    setEvents(readStore(scopedKey('tradepilot.events.v1', next), []));
    setReadIds(readStore(scopedKey('tradepilot.read.v1', next), []));
    setSyncNote(''); setModal(null); costProductRef.current = null;
    setToast(qwState === 'online' ? `已切换到工作区「${next}」，正在同步该工作区的产品档案…` : `已切换到工作区「${next}」。引擎未连接，当前仅在本地隔离。`);
  }
  function simulateChange() {
    const event = { id: crypto.randomUUID(), title: '标签规则变更 · 演示事件', created: new Date().toISOString(), productIds: products.filter(p => p.market === '中国台湾地区').map(p => p.id), text: '模拟新增标签审核项，关联订阅产品，提示重新核验标签与产品资料。此事件不是实际法规公告。' };
    const next = [event, ...events]; setEvents(next); persist(scopedKey('tradepilot.events.v1', owner), next); setToast('已生成模拟变更通知，未接入实时法规监测。');
  }
  function appendEvents(mapped) {
    const next = [...mapped, ...events];
    setEvents(next); persist(scopedKey('tradepilot.events.v1', owner), next);
  }
  function markRead(ids) { const next = [...new Set([...readIds, ...ids])]; setReadIds(next); persist(scopedKey('tradepilot.read.v1', owner), next); }
  async function loadRealEvents() {
    const r = await eventsViaQw(products, { owner });
    if (!r || !r.events?.length) { simulateChange(); setToast('核心服务不可用或无命中产品，已生成模拟事件。'); return; }
    const mapped = r.events.map(e => ({ id: e.id, title: e.title, created: e.created_at || new Date().toISOString(), productIds: e.affected_product_ids || [], real: true, text: `${e.impact || ''}${e.cost_delta_pct != null ? ` 单件落地成本预计变动 ${e.cost_delta_pct}%。` : ''} 来源：${e.source_name || '运营录入'}${e.source_url ? `（${e.source_url}）` : ''}；生效 ${e.effective_on || '未公布'}。` }));
    const next = [...mapped, ...events];
    setEvents(next); persist(scopedKey('tradepilot.events.v1', owner), next);
    setToast(`已接入 ${mapped.length} 条基于规则的影响评估；另有 ${r.rejected_non_official || 0} 条非官方消息被拦截。`);
  }
  const props = { product, products, navigate, select, setModal, costInputs, setCostInputs, events, readIds, markRead, simulateChange, search, setSearch, setToast, qw, qwState, reconnect, loadRealEvents, owner, syncNote, statusOf, engineOnline: qwState === 'online', sourceCount, appendEvents };
  return <>
    <a className="skip-link" href="#main-content" onClick={e => { e.preventDefault(); pageRef.current?.focus(); }}>跳到主要内容</a>
    {mobileOpen && <button className="nav-scrim" aria-label="关闭导航菜单" onClick={() => setMobileOpen(false)} />}
    <aside className={`sidebar ${mobileOpen ? 'sidebar-open' : ''}`} aria-label="主要导航">
      <a className="brand" href="#overview" onClick={() => navigate('overview')}><span className="brand-mark"><Navigation size={25} strokeWidth={1.7} /></span><span><strong>知海<span className="brand-en">TradePilot</span></strong><small>企业出海决策助手</small></span></a>
      <button className="workspace workspace-button" onClick={() => setModal({ type: 'workspace' })} title="切换工作区：不同企业的产品档案互相隔离"><span className="workspace-avatar">{(owner || DEFAULT_OWNER).slice(0, 1)}</span><div><strong>{owner}</strong><small>{qwState === 'online' ? `服务端隔离 · ${syncNote || '已连接'}` : '本地演示工作区'}</small></div><Building2 size={16} aria-hidden="true" /></button>
      <nav aria-label="出海工具">{[
        { label: '工作空间', ids: ['overview', 'products'] },
        { label: '准入与成本', ids: ['assessment', 'cost', 'alerts'] },
        { label: '市场与增长', ids: ['competition', 'report'] },
        { label: '规则与依据', ids: ['tariff', 'regulations', 'verify'] },
      ].map(group => <React.Fragment key={group.label}><div className="tp-nav-group-label">{group.label}</div>{group.ids.map(id => {
        const { name, icon: Icon } = routes.find(route => route.id === id);
        return <a key={id} href={`#${id}`} onClick={() => navigate(id)} className={`nav-item ${page === id ? 'active' : ''}`} aria-current={page === id ? 'page' : undefined}><Icon size={19} strokeWidth={1.7} /><span>{name}</span>{id === 'alerts' && unread > 0 && <span className="nav-count">{unread}</span>}{page === id && !(id === 'alerts' && unread > 0) && <span className="active-indicator" />}</a>;
      })}</React.Fragment>)}</nav>
      <div className="sidebar-bottom"><div className="side-note"><span className="side-note-icon"><ShieldCheck size={20} /></span><strong>有依据，才有底气</strong><p>规则先行，AI 辅助。<br />让每一次决策都能追溯。</p><button onClick={() => setModal({ type: 'sources' })}>查看数据来源<ArrowUpRight size={15} /></button></div><button className="help-button" onClick={() => setModal({ type: 'guide' })}><CircleHelp size={18} />演示使用指南<ArrowUpRight size={15} /></button><div className="profile"><span className="profile-avatar">演</span><div><strong>开发者工作区</strong><small>比赛 Demo · 本地保存</small></div><span className="profile-dot" /></div></div>
    </aside>
    <div className="app-shell">
      <header className="topbar"><div className="breadcrumb"><button className="icon-button mobile-menu" onClick={() => setMobileOpen(!mobileOpen)} aria-label="打开导航菜单" aria-expanded={mobileOpen}><Menu size={21} /></button><span>工作空间</span><ChevronRight size={13} /><strong>{routes.find(r => r.id === page)?.name}</strong></div><div className="topbar-actions"><form className="global-search" onSubmit={e => { e.preventDefault(); navigate('products'); }}><Search size={16} aria-hidden="true" /><input aria-label="搜索产品档案" value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索产品档案…" /><kbd>↵</kbd></form><span className={`demo-badge engine-${qwState}`}><span />{qwState === 'online' ? '核心引擎已接入' : qwState === 'probing' ? '正在连接核心引擎…' : '演示模式 · 引擎未连接'}</span>{qwState !== 'online' && <button className="reconnect-button" onClick={reconnect}><RotateCcw size={14} />重新连接引擎</button>}<button className="icon-button notification-button" onClick={() => navigate('alerts')} aria-label={`法规预警，${unread} 条未读`}><Bell size={19} />{unread > 0 && <i />}</button></div></header>
      <main id="main-content" ref={pageRef} tabIndex={-1} className="main-content">
        {page === 'overview' && <Overview {...props} unread={unread} />}
        {page === 'assessment' && <Assessment {...props} />}
        {page === 'cost' && <Cost {...props} />}
        {page === 'alerts' && <Alerts {...props} />}
        {page === 'products' && <Products {...props} />}
        {page === 'tariff' && <KbTariff {...props} />}
        {page === 'regulations' && <KbRegulations {...props} />}
        {page === 'verify' && <Verify {...props} />}
        {page === 'competition' && <Compete {...props} />}
        {page === 'report' && <ReportPage {...props} />}
      </main>
      <footer className="app-footer"><ShieldCheck size={14} aria-hidden="true" /><span>{DISCLAIMER}</span><span className="footer-mode">{qw ? `工作区 ${owner} · 规则 ${qw.rule_version} · 数据时点 ${qw.data_as_of} · 未核验规则自动降级为参考级` : `工作区 ${owner} · 模拟规则与税率 · 非实时官方数据`}</span></footer>
    </div>
    {toast && <div className="toast" role="status"><CircleCheck size={19} />{toast}<button onClick={() => setToast('')} aria-label="关闭提示"><X size={16} /></button></div>}
    {modal?.type === 'product' && <ProductForm product={modal.product} onClose={() => setModal(null)} onSave={saveProduct} />}
    {modal?.type === 'workspace' && <WorkspaceModal owner={owner} onClose={() => setModal(null)} onSave={changeOwner} />}
    {modal?.type === 'sources' && <SourcesModal onClose={() => setModal(null)} qw={qw} owner={owner} />}
    {modal?.type === 'guide' && <GuideModal onClose={() => setModal(null)} qw={qw} />}
    {modal?.type === 'handoff' && <HandoffModal product={product} kind={modal.kind} inputs={modal.inputs} onClose={() => setModal(null)} setToast={setToast} />}
  </>;
}
function PageHeading({ eyebrow, title, description, children }) { return <div className="page-heading"><div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h1>{title}</h1><p>{description}</p></div><div className="page-heading-actions">{children}</div></div>; }
function ProductSelect({ product, products, select }) {
  const selRef = useRef(null);
  /* 原生 <select> 只有自身区域可点；箭头/图标在 select 外，点击它们时用 showPicker() 主动弹出选项列表 */
  const openPicker = (e) => {
    if (e.target === selRef.current) return; /* 点在 select 上：走原生行为 */
    e.preventDefault();
    try { selRef.current?.showPicker?.(); } catch { /* 老浏览器无 showPicker：聚焦后仍可键盘/点击选择 */ }
    selRef.current?.focus();
  };
  return <label className="product-select" onClick={openPicker} title="点击切换产品"><Package size={16} /><span className="sr-only">当前产品</span><select ref={selRef} value={product?.id || ''} onChange={e => select(products.find(p => p.id === e.target.value), validRoute())}>{products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select><ChevronDown size={15} /></label>;
}

/* 出海流程九阶段（业务链）：与待办、人工记录复选共同构成进度面板 */
const JOURNEY_STAGES = ['企业与产品准备', '市场调研', '双向准入评估', '成本与收益评估', '合规与本地化', '合作方确认', '小批量试单', '通关与上市', '持续监测'];

function JourneyPanel({ product, products, select, statusOf, engineOnline, setModal, navigate, qw, owner }) {
  /* 人工记录（调研 / 合作方确认 / 试单）按产品存本地复选，阶段 6-8 以此承接 */
  const jkey = product ? `tradepilot.journey.v1::${product.id}` : '';
  const [manual, setManual] = useState(() => readStore(jkey, []));
  const [flash, setFlash] = useState({ row: '', stage: -1 }); /* 点亮动画：行高亮 + 对应阶段灯脉冲 */
  const flashTimer = useRef(null);
  const [labelOpen, setLabelOpen] = useState(false); /* 标签自查弹窗（F1-3：粘贴文案→引擎扫描→标记完成） */
  useEffect(() => { setManual(readStore(jkey, [])); }, [jkey]);
  useEffect(() => () => clearTimeout(flashTimer.current), []);
  const MANUAL_STAGE = { research: 1, coop: 5, trial: 6 };
  const toggleManual = (id) => {
    const next = manual.includes(id) ? manual.filter(x => x !== id) : [...manual, id];
    setManual(next);
    try { localStorage.setItem(jkey, JSON.stringify(next)); } catch {}
    /* 触发一次点亮动画（行背景泛绿 + 阶段灯脉冲），约 1 秒后自然消退 */
    setFlash({ row: id, stage: MANUAL_STAGE[id] ?? -1 });
    clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash({ row: '', stage: -1 }), 1000);
  };
  const done = (id) => manual.includes(id);

  const st = statusOf(product);
  const assessing = st.scenario === 'assessing';
  const hasHs = !!product?.hs, hasSpecs = !!(product?.specs && product.specs.trim()), hasCost = product?.cost_value != null && product?.cost_value !== '' && Number(product.cost_value) > 0;
  const admitted = ['permit_conditional', 'special_approval'].includes(st.scenario); /* 禁止/无法判定 = 未过准入 */
  const ready = hasHs && hasSpecs && hasCost;

  /* 每阶段的系统判定（1/3/4/5）+ 人工复选（2/6/7）+ 推导（8/9） */
  const stageDone = [
    hasHs && hasSpecs,            // 1 资料准备（成本默认值不阻塞，进待办）
    done('research'),             // 2 市场调研（人工确认）
    admitted,                     // 3 准入评估（引擎结论）
    hasCost,                      // 4 成本评估（可测算）
    done('label'),                // 5 合规本地化（标签自查完成才点亮；此前误绑准入结论，已修正）
    done('coop'),                 // 6 合作方确认（人工）
    done('trial'),                // 7 试单（人工）
    done('coop') && done('trial'),// 8 通关上市（依赖 6+7）
    engineOnline,                 // 9 持续监测（引擎预警在线即启用）
  ];
  const current = stageDone.findIndex(d => !d);
  const stageLabel = current < 0 ? '流程已完成' : `当前阶段 ${current + 1} / 9 · ${JOURNEY_STAGES[current]}`;

  /* 待办清单：事项 / 状态 / 待补资料 / 处理角色 / 下一步 */
  const todos = [];
  if (product && !hasHs) todos.push({ title: '补充 HS 编码', status: '阻塞', missing: '有效 HS 编码（6–11 位）', role: '企业 · 产品负责人', next: '编辑产品资料', act: () => setModal({ type: 'product', product }) });
  if (product && !hasSpecs) todos.push({ title: '补充成分与规格', status: '待补', missing: '规格 / 成分 / 关键参数', role: '企业 · 产品负责人', next: '编辑产品资料', act: () => setModal({ type: 'product', product }) });
  if (product && assessing) todos.push({ title: '准入重估中', status: '进行中', missing: '—', role: '核心引擎', next: '资料已更新，结论稍候自动刷新', act: () => navigate('assessment') });
  else if (product && !admitted) todos.push({ title: '完成准入评估', status: '阻塞', missing: st.missing?.slice(0, 2).join('、') || '准入所需信息', role: '企业 + 核心引擎', next: '补齐资料后自动重估', act: () => navigate('assessment') });
  if (product && admitted && st.scenario === 'special_approval') todos.push({ title: '准备专案核准材料', status: '进行中', missing: `书件清单（${st.docs} 项，见评估页）`, role: '当地进口方牵头 · 企业配合', next: '按清单准备并递交', act: () => navigate('assessment') });
  if (product && !hasCost) todos.push({ title: '设定默认货值与数量', status: '待补', missing: '默认货值（¥）/ 出口数量', role: '企业 · 业务负责人', next: '编辑产品资料，成本页自动带入', act: () => setModal({ type: 'product', product }) });
  /* 人工复核项：勾选后保留在清单中并标记「已记录」，不直接消失；可随时取消 */
  todos.push({ title: '市场调研确认', status: done('research') ? '已记录' : '待办', missing: done('research') ? '已记录，可随时取消勾选' : '—', role: '企业 · 市场负责人', next: done('research') ? '已记录 · 可取消' : '跑一次全球市场扫描后勾选确认', act: () => navigate('assessment/scan'), manual: 'research' });
  todos.push({ title: '标签与本地化自查', status: done('label') ? '已记录' : (admitted ? '进行中' : '待办'), missing: done('label') ? '已记录，可随时取消勾选' : '中文标示 / 原产地标示核对（用标签自查扫描）', role: '企业 · 品牌负责人', next: done('label') ? '已记录 · 可取消' : '打开标签自查', manual: 'label', showAct: true, act: () => setLabelOpen(true) });
  todos.push({ title: '合作方确认', status: done('coop') ? '已记录' : '待办', missing: done('coop') ? '已记录，可随时取消勾选' : '当地进口方书面确认（报价 / 书件 / 时效）', role: '企业 + 当地进口方', next: done('coop') ? '已记录 · 可取消' : '线下确认后勾选记录', manual: 'coop' });
  todos.push({ title: '小批量试单', status: done('trial') ? '已记录' : '待办', missing: done('trial') ? '已记录，可随时取消勾选' : '首票试单的物流 / 通关 / 动销记录', role: '企业 + 报关行 + 当地进口方', next: done('trial') ? '已记录 · 可取消' : '试单完成后勾选记录', manual: 'trial' });
  const blockers = todos.filter(t => t.status === '阻塞').length;

  return <section className="panel journey-panel">
    <SectionTitle title="出海进度与待办" description={product ? '按九阶段业务链自动推进' : '尚未选择产品'} icon={Navigation} action={<div className="journey-actions"><ProductSelect {...{ product, products, select: (p) => select(p, 'overview') }} /><span className="date-label">{stageLabel}{blockers > 0 && ` · ${blockers} 项阻塞`}</span></div>} />
    {product ? <>
      <div className="journey-snapshot">
        <div><small>准入状态</small><strong className={`snap-${st.tone}`}>{st.short}</strong></div>
        <div><small>成本完整度</small><strong>{hasCost ? (hasHs ? '可测算 · 含报价带' : '可测算 · 缺 HS') : '待补货值'}</strong></div>
        <div><small>主要风险</small><strong>{st.risk || '未知'}</strong></div>
        <div><small>待补资料</small><strong>{st.missing?.length ? `${st.missing.length} 项` : '—'}</strong></div>
        <div><small>下一步</small><strong className="snap-next">{(todos.find(t => t.status !== '已记录') || {}).next || '流程已完成'}</strong></div>
      </div>
      <div className="journey-steps" role="list" aria-label="出海九阶段">{JOURNEY_STAGES.map((name, i) => (
        <div key={name} role="listitem" className={`jstep ${stageDone[i] ? 'done' : ''} ${i === current ? 'current' : ''} ${flash.stage === i ? 'pulse' : ''}`} title={`${i + 1}. ${name}${stageDone[i] ? '（已完成）' : ''}`}><span>{i + 1}</span><small>{name}</small></div>
      ))}</div>
      <div className="journey-todos">
        {todos.map((t, i) => <div className={`jtodo ${t.manual ? 'jtodo-manual' : ''} ${t.manual && done(t.manual) ? 'jtodo-done' : ''} ${t.manual && flash.row === t.manual ? 'flash' : ''}`} key={`${t.title}-${i}`}>
          {t.manual ? <label className="jcheck"><input type="checkbox" checked={done(t.manual)} onChange={() => toggleManual(t.manual)} aria-label={t.title} /><span /></label> : <span className={`jdot jdot-${t.status}`}>{t.status === '阻塞' ? <TriangleAlert size={13} /> : <Clock3 size={13} />}</span>}
          <div className="jtodo-main"><strong>{t.title}</strong><small>{t.missing && t.missing !== '—' && `${t.status === '已记录' ? '' : '待补：'}${t.missing} · `}角色：{t.role}</small></div>
          <Badge tone={t.status === '阻塞' ? 'red' : t.status === '进行中' ? 'amber' : t.status === '已记录' ? 'green' : 'slate'}>{t.status}</Badge>
          {t.act && (!t.manual || t.showAct) && t.status !== '已记录' ? <button className="text-button" onClick={t.act}>{t.next}<ArrowUpRight size={13} /></button> : <span className="jtodo-next">{t.next}</span>}
        </div>)}
      </div>
      <details className="journey-note"><summary>这面板怎么算出来的？</summary><p>阶段 1 / 3 / 4 由系统按产品资料与核心引擎结论自动判定；阶段 2 / 5 / 6 / 7 为人工记录复选（按产品保存在本地浏览器；阶段 5 在「标签与本地化自查」完成后点亮）；阶段 8 由合作方与试单推导，阶段 9 在核心引擎在线时即视为启用。清单只覆盖出海流程主线，通关执行等环节仍以线下记录为准。</p></details>
    </> : <Empty title="先添加一个产品" text="录入产品后，这里会显示九阶段进度与逐项待办。" action={<Button onClick={() => setModal({ type: 'product' })}>新建产品</Button>} />}
    {labelOpen && <LabelCheckModal product={product} qw={qw} onClose={() => setLabelOpen(false)} onComplete={() => { if (!done('label')) toggleManual('label'); setLabelOpen(false); }} />}
  </section>;
}

/* 标签与本地化自查（F1-3）：粘贴标签/文案 → 引擎按规则库扫描 → 干净后标记完成。
 * 与其余人工项一致按产品存本地勾选；命中条目不阻塞「人工判断为准」，但默认给出整改建议。 */
function LabelCheckModal({ product, qw, onClose, onComplete }) {
  const [text, setText] = useState('');
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState(null);
  const [err, setErr] = useState('');
  const SAMPLE = '本產品可治療高血壓，零添加防腐劑，全網銷量第一。產地：中國。';
  async function scan() {
    if (!text.trim()) return;
    setScanning(true); setErr(''); setResult(null);
    const r = await labelScanViaQw({ text, market: 'TW', tags: ['food'] });
    setScanning(false);
    if (!r) { setErr('扫描失败：核心引擎未连接或请求超时，请稍后重试。'); return; }
    setResult(r);
  }
  return <Modal title={`标签与本地化自查${product ? ` · ${product.name}` : ''}`} onClose={onClose} wide>
    <p className="modal-intro">粘贴包装标签或广告文案，核心引擎按标签规则库扫描（繁简归一，不会漏检简体违规词）。命中 0 条即可标记自查完成；有命中时按整改建议修改后重新扫描。当前范围：食品/一般商品标示缺项、繁体字要求、医疗与绝对化用语、大陆产地表述。</p>
    <label className="field"><span>待检查文本</span><textarea name="labelText" rows={5} maxLength={2000} value={text} onChange={e => setText(e.target.value)} placeholder="粘贴标签全文或广告文案：品名、成分、净重、原产地、厂商信息、宣传语…" /><small>建议粘贴繁体中文定稿文本；简体文案会被检出并提示转繁体（这是实际稽查要求）。<button type="button" className="text-button" onClick={() => setText(SAMPLE)}>填入示例文本（含违规）</button></small></label>
    <div className="lbl-actions"><Button variant="primary" icon={Search} onClick={scan} disabled={scanning || !qw || !text.trim()}>{scanning ? '扫描中…' : '开始扫描'}</Button>{!qw && <span className="lbl-offline">核心引擎未连接，无法扫描</span>}</div>
    {err && <div className="form-error" role="alert">{err}</div>}
    {result && <>
      <div className={`lbl-verdict ${result.passed ? 'pass' : 'fail'}`}>
        {result.passed
          ? <><CircleCheck size={18} aria-hidden="true" /><div><strong>未命中标签规则（已扫描 {result.summary?.total_rules_applied} 条）</strong><p>可标记自查完成；正式上架前仍建议人工复核一次。</p></div></>
          : <><TriangleAlert size={18} aria-hidden="true" /><div><strong>命中 {result.hits.length} 条 · 结论：{result.summary?.publishable || '需整改'}</strong><p>按下方建议修改文案后重新扫描，全部整改完再标记完成。</p></div></>}
      </div>
      {result.hits.length > 0 && <div className="lbl-hits">{result.hits.map((h, i) => <div key={`${h.rule_id}-${i}`} className="lbl-hit">
        <Badge tone={h.severity === 'high' ? 'red' : h.severity === 'medium' ? 'amber' : 'slate'}>{h.severity === 'high' ? '高' : h.severity === 'medium' ? '中' : '低'} · {h.rule_id}</Badge>
        <div><strong>{h.rule_name}</strong><small>命中：「{h.matched}」</small><p>{h.why}</p>{h.suggestion && <p className="lbl-fix">整改建议：{h.suggestion}</p>}{h.legal_basis?.length > 0 && <small className="lbl-basis">依据：{h.legal_basis.map(b => `${b.title} · ${b.article}`).join('；')}（待核验）</small>}</div>
      </div>)}</div>}
      <p className="poster-note">{result.disclaimer}</p>
    </>}
    <div className="modal-actions"><Button type="button" onClick={onClose}>关闭</Button><Button variant="primary" icon={Check} onClick={onComplete}>标记自查完成</Button></div>
  </Modal>;
}

function Overview({ product, products, navigate, select, setModal, unread, statusOf, engineOnline, sourceCount, qw, owner }) {
  const [activeStage, setActiveStage] = useState('access');
  const needsAttention = products.filter(p => !['allowed', 'permit_conditional', 'assessing'].includes(statusOf(p).scenario)).length;
  return <>
    <PageHeading title="出海工作台" description="准入、成本与增长，在同一条决策路径上。"><span className="date-label">2026 年 10 月 · 演示工作区</span><Button variant="accent" icon={Plus} onClick={() => setModal({ type: 'product' })}>新建产品评估</Button></PageHeading>
    <WorkflowHero {...{ product, navigate, setModal, engineOnline, activeStage, setActiveStage }} />
    <div className="metric-grid">{[
      { title: '产品档案', value: products.length, note: '已录入的出海产品', icon: Package, color: 'blue', to: 'products' },
      { title: '需处理产品', value: needsAttention, note: '点击查看引擎判定需处理的产品', icon: ClipboardList, color: 'orange', to: 'products/attention' },
      { title: '一期目标市场', value: 4, note: '台湾 / 日本 / 美国 / 欧盟已建库 · 点击看全球市场扫描', icon: Globe2, color: 'cyan', to: 'assessment/scan' },
      { title: '待核验来源', value: sourceCount ?? sources.length, note: `${sourceCount ?? sources.length} 个官方登记入口 · 点击查看`, icon: Link2, color: 'violet', modal: 'sources' },
    ].map(m => m.modal
      ? <button type="button" className="metric-card metric-link" key={m.title} onClick={() => setModal({ type: m.modal })} aria-label={`查看${m.title}`}><div><span className="metric-label">{m.title}</span><strong>{count(m.value)}</strong><span className="metric-note">{m.note}</span></div><span className={`metric-icon ${m.color}`}><m.icon size={21} strokeWidth={1.7} /></span></button>
      : <a className="metric-card metric-link" key={m.title} href={`#${m.to}`} onClick={() => navigate(m.to)} aria-label={`查看${m.title}`}><div><span className="metric-label">{m.title}</span><strong>{count(m.value)}</strong><span className="metric-note">{m.note}</span></div><span className={`metric-icon ${m.color}`}><m.icon size={21} strokeWidth={1.7} /></span></a>)}</div>
    <CapabilityShowcase {...{ activeStage, setActiveStage, navigate, product }} />
    <JourneyPanel product={product} products={products} select={select} statusOf={statusOf} engineOnline={engineOnline} setModal={setModal} navigate={navigate} qw={qw} owner={owner} />
    <div className="overview-grid"><section className="panel product-panel"><SectionTitle title="我的出海产品" description={`${products.length} 个产品`} action={<button className="text-button" onClick={() => navigate('products')}>全部档案<ArrowRight size={14} /></button>} /><ProductTable products={products.slice(0, 4)} select={select} statusOf={statusOf} engineOnline={engineOnline} /><div className="panel-foot"><span><span className="tiny-dot" />{engineOnline ? '准入状态为核心引擎实时结论，未核验规则自动降级为参考级' : '全部状态为演示结果，尚未核验官方规则'}</span><button onClick={() => setModal({ type: 'product' })}><Plus size={14} />添加产品</button></div></section><section className="panel next-steps"><SectionTitle title="接下来做什么" icon={Navigation} /><div className="step-list"><button onClick={() => navigate('assessment')}><span className="step-num active">01</span><div><strong>先确认产品准入条件</strong><p>查看申请路径与待核验材料</p></div><ChevronRight size={16} /></button><button onClick={() => navigate('cost')}><span className="step-num">02</span><div><strong>再算清实际落地成本</strong><p>拆解税费，对比加征情景</p></div><ChevronRight size={16} /></button><button onClick={() => navigate('alerts')}><span className="step-num">03</span><div><strong>持续留意规则变化</strong><p>{unread > 0 ? `${unread} 条模拟变更待查看` : '模拟变更，验证预警流程'}</p></div><ChevronRight size={16} /></button></div><div className="step-hint"><Sparkles size={16} /><span>先用一个市场，把完整流程跑通。</span></div></section></div>
    <section className="source-strip"><div className="source-strip-icon"><Link2 size={22} /></div><div><h3>好的决策，从可靠的依据开始</h3><p>官方查询入口已整理。具体法规条款与实时数据，等待接入与人工核验。</p></div><div className="source-institutions"><span>贸易署</span><span>关务署</span><span>食药署</span></div><Button onClick={() => setModal({ type: 'sources' })}>查看来源<ArrowUpRight size={15} /></Button></section>
  </>;
}
function ProductTable({ products, select, onEdit, statusOf, engineOnline }) {
  return <div className="table-scroll"><table className="product-table"><thead><tr><th>产品名称 / 编码</th><th>目标市场</th><th>准入状态<span className="table-demo">{engineOnline ? '引擎' : '示例'}</span></th><th>操作</th></tr></thead><tbody>{products.map(p => { const status = statusOf ? statusOf(p) : demoAssessment(p); return <tr key={p.id}><td><div className="table-product"><ProductIcon product={p} /><div><strong>{p.name}</strong><small>HS {p.hs || '待补充'}<span> · {p.category}</span></small></div></div></td><td><span className="market-cell"><Globe2 size={14} />{p.market}</span></td><td title={status.reason || ''}><Badge tone={status.tone}>{status.short}</Badge></td><td><button className="table-action" onClick={() => select(p)}>查看评估<ArrowUpRight size={14} /></button>{onEdit && <button className="table-action edit-action" onClick={() => onEdit(p)}>编辑</button>}</td></tr>; })}</tbody></table></div>;
}

function Assessment({ product, products, select, navigate, setModal, qw, owner }) {
  const [tab, setTab] = useState('result');
  const [qwResult, setQwResult] = useState(null);
  /* 模式：single = 选定市场逐一评估（正向）；scan = 一个产品扫全部登记市场（反向）。
     从首页「一期目标市场」卡片进来时（#assessment/scan）直接进入扫描模式 */
  const [mode, setMode] = useState(() => location.hash.includes('/scan') ? 'scan' : 'single');
  const switchMode = (m) => { setMode(m); history.replaceState(null, '', m === 'scan' ? '#assessment/scan' : '#assessment'); };
  const selectHere = (p, r) => select(p, mode === 'scan' ? 'assessment/scan' : r);
  const [scan, setScan] = useState(null);
  const [scanning, setScanning] = useState(false);
  useEffect(() => {
    let on = true;
    if (!qw || !product) { setQwResult(null); return; }
    setQwResult(undefined);
    assessViaQw(product, [], { owner }).then(r => { if (on) setQwResult(r || null); });
    return () => { on = false; };
    /* 编辑资料保存后 id 不变但 HS/品类/规格会变：这些字段必须进依赖，
       否则改完 HS 结论不重取，得手动刷新——这正是要修的 bug。 */
  }, [product?.id, product?.hs, product?.category, product?.specs, qw, owner]);
  useEffect(() => {
    if (mode !== 'scan' || !qw || !product) { setScan(null); setScanning(false); return; }
    let on = true;
    setScanning(true); setScan(null);
    const t = setTimeout(() => {
      scanMarketsViaQw(product, { owner }).then(r => { if (!on) return; setScan(r || null); setScanning(false); });
    }, 300);
    return () => { on = false; clearTimeout(t); };
  }, [mode, product?.id, product?.hs, product?.specs, qw, owner]);
  if (!product) return <Empty title="先添加一个产品" text="录入产品信息后开始评估。" action={<Button onClick={() => setModal({ type: 'product' })}>新建产品</Button>} />;
  if (mode === 'scan') return <>
    <PageHeading eyebrow="MARKET SCAN" title="全球市场扫描" description="选定一个产品，逐一检验全球主要市场的准入可能。"><div className="mode-switch" role="tablist" aria-label="评估模式"><button role="tab" aria-selected={mode === 'single'} onClick={() => switchMode('single')}>单市场评估</button><button role="tab" aria-selected className="active">全球市场扫描</button></div><ProductSelect {...{ product, products, select: selectHere }} /><Button icon={Plus} onClick={() => setModal({ type: 'product' })}>新增产品</Button></PageHeading>
    <ScanPanel product={product} scan={scan} scanning={scanning} qw={qw} />
  </>;
  const result = demoAssessment(product);
  return <><PageHeading eyebrow="MARKET ACCESS" title="准入评估" description="先确认进入市场的条件，再决定下一步。"><div className="mode-switch" role="tablist" aria-label="评估模式"><button role="tab" aria-selected className="active">单市场评估</button><button role="tab" aria-selected={false} onClick={() => switchMode('scan')}>全球市场扫描</button></div><ProductSelect {...{ product, products, select: selectHere }} /><Button icon={Plus} onClick={() => setModal({ type: 'product' })}>新增产品</Button></PageHeading>
    <div className="assessment-grid"><div>{qwResult === undefined ? <section className="panel result-panel"><div className="scan-loading"><RotateCcw size={16} aria-hidden="true" />资料已更新，规则引擎正在按新 HS / 品类 / 成分重新评估…</div></section> : qwResult ? <QwResultPanel r={qwResult} product={product} setModal={setModal} /> : <section className={`panel result-panel result-${result.tone}`}><div className="result-top"><div className="result-product"><ProductIcon product={product} size="large" /><div><h2>{product.name}</h2><p>HS {product.hs || '待补充'}<span> / </span>{product.market}</p></div></div><button className="text-button" onClick={() => setModal({ type: 'product', product })}>编辑资料<Settings2 size={15} /></button></div><div className="result-status"><span className={`status-symbol ${result.tone}`}>{result.scenario === 'allowed' ? <ShieldCheck size={29} /> : <TriangleAlert size={29} />}</span><div><span className="result-eyebrow">准入结论 · 演示规则</span><h3>{result.label}</h3><p>{result.subtitle}</p></div><Badge tone={result.tone}>模拟评估</Badge></div><div className="result-facts"><div><small>申请主体</small><strong>待官方规则核验</strong></div><div><small>预计办理周期</small><strong>待主管机关确认</strong></div><div><small>规则版本</small><strong>{result.version}</strong></div></div></section>}
      {!qwResult && (<section className="panel detail-panel"><div className="tabs" role="tablist" aria-label="准入评估详情">{[['result', '评估结论'], ['path', '办理路径'], ['evidence', '依据与边界']].map(([id, label]) => <button key={id} role="tab" aria-selected={tab === id} id={`tab-${id}`} aria-controls="assessment-panel" tabIndex={tab === id ? 0 : -1} onClick={() => setTab(id)} onKeyDown={e => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) { e.preventDefault(); const ids = ['result', 'path', 'evidence']; let i = ids.indexOf(tab); i = e.key === 'Home' ? 0 : e.key === 'End' ? 2 : (i + (e.key === 'ArrowRight' ? 1 : 2)) % 3; setTab(ids[i]); document.getElementById(`tab-${ids[i]}`)?.focus(); } }}>{label}</button>)}</div><div className="detail-body" role="tabpanel" id="assessment-panel" aria-labelledby={`tab-${tab}`}>
        {tab === 'result' && <><h3>这对你的产品意味着什么？</h3><p className="body-copy">{result.explanation}</p><div className="inset-note"><ShieldCheck size={19} /><div><strong>先补齐依据，再确认结论</strong><p>准入不只取决于 HS 编码，还涉及原产地、成分、用途和申报时点。当前示例编码也未完成当地细分归类。</p></div></div><h3 className="subheading">需要核验的关键事项</h3><div className="check-list">{result.checklist.map((item, i) => <div key={item}><span>{count(i + 1)}</span><p>{item}</p><Badge>待核验</Badge></div>)}</div></>}
        {tab === 'path' && <><h3>办理路径 · 待官方确认</h3><p className="body-copy">下列步骤是信息收集流程，不代表官方许可办理程序。</p><div className="path-list">{['确定商品分类与适用规则', '确认申请主体与进口合作方', '核验书件清单、标签和检验要求', '向主管机关确认办理方式与周期'].map((s, i) => <div key={s}><span className="step-num">{i + 1}</span><div><strong>{s}</strong><p>{i === 0 ? '核对当地完整编码、原产地与产品成分。' : '以具体官方条款为准，当前暂无核验结论。'}</p></div></div>)}</div></>}
        {tab === 'evidence' && <><h3>依据状态</h3><p className="body-copy">当前只有官方查询入口，没有已绑定的具体法规条款。本页的模拟结论不能被视为有官方依据的准入结果。</p>{sources.map(s => <SourceRow key={s.id} source={s} />)}<div className="inset-note"><CircleHelp size={19} /><div><strong>正式版本的输出边界</strong><p>规则缺失、过期或冲突时返回“无法判定”；不推测专案核准通过率，不代办申请。</p></div></div></>}
      </div></section>)}<div className="assessment-bottom">{qw ? <><p><Sparkles size={16} />结论已由核心引擎生成 · 下一步算清落地成本</p><Button variant="primary" icon={ArrowRight} onClick={() => navigate('cost')}>去算落地成本</Button></> : <><p><Sparkles size={16} />网页准备输入，千问办公完成核心任务</p><Button variant="primary" icon={Sparkles} onClick={() => setModal({ type: 'handoff', kind: 'assessment' })}>交给千问办公评估</Button></>}</div>
    </div><aside className="assessment-side"><section className="panel"><SectionTitle title="产品资料" icon={Package} /><dl className="product-facts"><div><dt>产品类别</dt><dd>{product.category}</dd></div><div><dt>原产地</dt><dd>{product.origin}</dd></div><div><dt>规格 / 参数</dt><dd>{product.specs || '待补充'}</dd></div><div><dt>档案更新</dt><dd>{product.updated}</dd></div></dl></section><section className="panel evidence-card"><SectionTitle title="官方查询入口" icon={Link2} />{sources.map(s => <a className="compact-source" key={s.id} href={s.url} target="_blank" rel="noreferrer"><span className="source-id">{s.id}</span><div><strong>{s.name}</strong><small>{s.category} · 待核验</small></div><ExternalLink size={14} /></a>)}<button className="text-button" onClick={() => setModal({ type: 'sources' })}>查看数据边界<ArrowRight size={14} /></button></section><div className="next-card"><Calculator size={25} /><h3>能进入，还要算得清</h3><p>看看关税、运保费与清关费对单位成本的影响。</p><Button onClick={() => navigate('cost')}>去测算落地成本<ArrowRight size={16} /></Button></div></aside></div>
  </>;
}

function Cost({ product, products, select, costInputs, setCostInputs, setModal, qw, qwState, reconnect, owner }) {
  const [ssg, setSsg] = useState(false);
  const [useAssumed, setUseAssumed] = useState(false);
  const [qwCost, setQwCost] = useState(null);
  const [costStale, setCostStale] = useState(false);
  const input = { ...costInputs, ssgRate: ssg ? 15 : 0 };
  /* 规则库口径：HS ≥ 4 位且未切到手工模式时，税率以规则库为准，表单里的假设税率不参与计算。
     被覆盖的输入框直接置为只读并显示实际采用值，避免「改了没反应」的沉默失败。 */
  const hs = String(product?.hs || '').replace(/\D/g, '');
  const kbEligible = hs.length >= 4;
  const kbLocked = kbEligible && !useAssumed;
  const basis = qwCost?.base?.rate_basis || null;
  useEffect(() => {
    if (!qw) { setQwCost(null); setCostStale(false); return; }
    let on = true;
    setCostStale(true);
    const t = setTimeout(() => {
      Promise.all([
        costViaQw({ ...input, ssgRate: 0 }, product, { ssgMode: 'off', useKbRates: kbLocked, owner }),
        costViaQw({ ...input, ssgRate: 15 }, product, { ssgMode: 'triggered', useKbRates: kbLocked, owner }),
      ]).then(([base, stressed]) => { if (!on) return; setQwCost(base && stressed ? { base, stressed } : null); setCostStale(false); })
        .catch(() => { if (on) setCostStale(false); });
    }, 350);
    return () => { on = false; clearTimeout(t); };
  }, [qw, product?.id, product?.hs, kbLocked, owner, costInputs.value, costInputs.quantity, costInputs.freight, costInputs.insurance, costInputs.dutyRate, costInputs.vatRate, costInputs.fee, ssg]);
  let result, error;
  try { result = previewCost(input); } catch (e) { error = e.message; }
  let baseline, stressed;
  try { baseline = previewCost({ ...costInputs, ssgRate: 0 }); stressed = previewCost({ ...costInputs, ssgRate: 15 }); } catch {}
  const fields = [['value', '货物价值', '人民币 ¥', .01], ['quantity', '出口数量', '件', 1], ['freight', '国际运输费用', '人民币 ¥', .01], ['insurance', '保险费用', '人民币 ¥', .01], ['dutyRate', '假设基础关税率', '%', .01], ['vatRate', '假设增值税率', '%', .01], ['fee', '其他清关费用', '人民币 ¥', .01]];
  return <><PageHeading eyebrow="LANDED COST" title="成本测算" description="看清每一项成本，为报价留出合理空间。"><ProductSelect {...{ product, products, select }} /></PageHeading><div className="cost-grid"><section className="panel cost-inputs"><SectionTitle title="测算参数" icon={SlidersHorizontal} action={<button className="text-button" onClick={() => { setCostInputs({ ...defaultCost }); setSsg(false); }}><RotateCcw size={14} />重置</button>} /><div className="cost-fields">{fields.map(([key, label, unit, step]) => { const locked = kbLocked && (key === 'dutyRate' || key === 'vatRate'); const kbValue = locked ? (key === 'dutyRate' ? basis?.duty_rate_pct : basis?.vat_rate_pct) : null; return <label className={`field ${locked ? 'field-locked' : ''}`} key={key}><span>{label}{locked && <Lock size={12} aria-hidden="true" />}</span><div className="input-unit"><input type="number" name={key} min={key === 'value' ? '.01' : key === 'quantity' ? '1' : '0'} max={key.endsWith('Rate') ? '100' : undefined} step={step} required value={locked && kbValue != null ? kbValue : costInputs[key]} readOnly={locked} onChange={locked ? undefined : e => setCostInputs({ ...costInputs, [key]: e.target.value })} /><span>{unit}</span></div>{locked && <small className="field-lock-note">规则库采用 {kbValue != null ? `${kbValue}%` : '读取中…'} · 待核验，你的输入未参与计算</small>}</label>; })}<div className="formula-note"><CircleHelp size={15} /><p>{kbLocked ? `货值 + 运费 + 保险费 = CIF。税率由规则库提供（税则 ${basis?.matched_tariff?.code || hs}），未完成人工核验前只作参考级。` : '货值 + 运费 + 保险费 = CIF。当前为手工税率口径，结论会标记为手工输入。'}</p></div><div className="rate-mode-row"><div><strong>税率口径</strong><p>{kbEligible ? (kbLocked ? `规则库模式：以 HS ${hs} 命中的税则为准${basis?.matched_tariff?.name ? `（${basis.matched_tariff.name}）` : ''}，上方两个假设税率不参与计算。` : '手工模式：完全采用你填写的假设税率，引擎不查规则库。') : '当前产品未填写 4 位以上 HS 编码。引擎不猜测税率，只能采用你填写的假设税率。'}</p></div><label className="switch-row"><span>改用我的假设税率</span><span className="switch"><input type="checkbox" checked={useAssumed} disabled={!kbEligible} onChange={e => setUseAssumed(e.target.checked)} aria-label="改用我的假设税率而非规则库税率" /><span /></span></label></div>{product?.cost_value != null && <div className="product-default-note"><Package size={14} />货值与数量已从产品档案「{product.name}」带入，可直接修改。</div>}</div></section><div>{qwCost && <QwCostPanel r={ssg ? qwCost.stressed : qwCost.base} pair={qwCost} stale={costStale} setModal={setModal} product={product} />}{!qwCost && <section className="panel cost-result"><div className="cost-result-header"><div><span className="eyebrow">ESTIMATED LANDED COST</span><h2>综合落地成本</h2></div><Badge tone="blue">固定示例</Badge></div>{error ? <div className="form-error" role="alert">{error}</div> : <><div className="total-cost"><span>¥</span>{number(result.total)}<small>人民币 CNY</small></div><div className="cost-summary"><div><small>单位落地成本</small><strong>{currency(result.unit)}<span> / 件</span></strong></div><div><small>综合税负率 / CIF</small><strong>{result.rate.toFixed(2)}<span>%</span></strong></div></div><div className="cost-bar" aria-hidden="true"><span className="bar-goods" style={{ width: `${result.cif / result.total * 100}%` }} /><span className="bar-tax" style={{ width: `${result.tax / result.total * 100}%` }} /><span className="bar-fee" style={{ width: `${result.inputs.fee / result.total * 100}%` }} /></div><div className="bar-legend"><span><i className="goods" />货值与运保费</span><span><i className="tax" />税费</span><span><i className="fee" />其他费用</span></div><div className="cost-lines">{[['CIF 计税参考基础', result.cif, '货值 + 运输 + 保险'], ['基础关税', result.duty, `CIF × ${result.inputs.dutyRate}%`], ['SSG 附加关税', result.ssg, `CIF × ${result.inputs.ssgRate}% · 假设情景`], ['增值税', result.vat, `(CIF + 关税 + SSG) × ${result.inputs.vatRate}%`], ['其他清关费用', result.inputs.fee, '手动输入费用']].map(([label, value, formula]) => <div key={label}><div><strong>{label}</strong><small>{formula}</small></div><span>{currency(value)}</span></div>)}</div><div className="preview-boundary"><Sparkles size={14} />固定样例仅供界面展示，正式测算由千问办公完成</div></>}</section>}<section className="ssg-card"><div><span className="ssg-icon"><TriangleAlert size={21} /></span><div><h3>如果触发特别防卫措施？</h3><p>模拟额外加征 15% 关税，观察成本变化。</p></div><label className="switch"><input type="checkbox" checked={ssg} onChange={e => setSsg(e.target.checked)} aria-label="模拟 SSG 额外加征百分之十五" /><span /></label></div><p className="ssg-boundary">{qw ? (basis && kbLocked && basis.ssg_listed === false ? `本品目（${basis.matched_tariff?.code || hs}）未列入规则库 SSG 清单，切换开关不会改变结果。` : `按规则库 SSG 税率做情景对比${basis?.ssg_rate_pct ? `（当前采用 ${basis.ssg_rate_pct}%）` : ''}；未接入实时累计量与触发阈值，实际加征时点仍需人工核验。`) : '未接入累计量、触发阈值和实际加征规则。此处仅切换两组固定展示数据。'}</p></section></div></div>
    {qwCost ? <QwComparePanel base={qwCost.base} stressed={qwCost.stressed} /> : <section className="panel compare-panel"><SectionTitle title="报价前，比较两个情景" description="两组固定示例 · 非本地计算" icon={Layers3} />{baseline && stressed ? <div className="table-scroll"><table className="comparison-table"><thead><tr><th>测算情景</th><th>综合成本</th><th>单位成本</th><th>较基础情景增加</th><th>备注</th></tr></thead><tbody><tr><td>基础税率情景</td><td>{currency(baseline.total)}</td><td>{currency(baseline.unit)}</td><td>—</td><td><Badge tone="blue">固定示例</Badge></td></tr><tr><td>额外加征 15% 情景</td><td>{currency(stressed.total)}</td><td>{currency(stressed.unit)}</td><td className="amount-warning">+¥5,027.40</td><td><Badge tone="amber">固定示例</Badge></td></tr></tbody></table></div> : <div className="cost-handoff-note"><Sparkles size={18} /><p>参数已更新。完整计算与情景比较由千问办公完成，网页等待展示返回结果。</p></div>}</section>}<div className="assessment-bottom">{qw
      ? <><p><Sparkles size={16} />成本已由核心引擎实时测算 · 一键汇总为出海方案报告</p><Button variant="primary" icon={ArrowRight} onClick={() => { location.hash = 'report'; }}>去生成方案报告</Button></>
      : <><p><Sparkles size={16} />网页准备输入，千问办公完成核心任务</p><Button variant="primary" icon={ArrowUpRight} onClick={() => setModal({ type: 'handoff', kind: 'cost', inputs: input })}>交给千问办公测算</Button></>}</div>
  </>;
}

function Alerts({ events, readIds, markRead, simulateChange, products, select, setModal, qw, loadRealEvents, owner, appendEvents, setToast }) {
  const [filter, setFilter] = useState('all');
  const [changeOpen, setChangeOpen] = useState(false);
  const visible = events.filter(e => filter !== 'unread' || !readIds.includes(e.id));
  return <><PageHeading eyebrow="REGULATORY WATCH" title="法规与预警" description="规则变化发生后，找到需要重新检查的产品。">{qw && <Button icon={Plus} onClick={() => setChangeOpen(true)}>登记法规变更</Button>}<Button variant="primary" icon={Plus} onClick={qw ? loadRealEvents : simulateChange}>{qw ? '拉取变更影响评估' : '模拟一条法规变更'}</Button></PageHeading><div className="alerts-grid"><section className="panel"><div className="section-heading"><div><h2>变更通知</h2><div className="filter-pills"><button aria-pressed={filter === 'all'} className={filter === 'all' ? 'selected' : ''} onClick={() => setFilter('all')}>全部 {events.length}</button><button aria-pressed={filter === 'unread'} className={filter === 'unread' ? 'selected' : ''} onClick={() => setFilter('unread')}>未读 {events.filter(e => !readIds.includes(e.id)).length}</button></div></div><button className="text-button" onClick={() => markRead(events.map(e => e.id))} disabled={!events.length}><CheckCheck size={15} />全部已读</button></div>{visible.length ? <div className="event-list">{visible.map(e => <article key={e.id} className={`event ${readIds.includes(e.id) ? 'event-read' : ''}`}><div className="event-title"><span className="event-icon"><Bell size={19} /></span><div><h3>{e.title}</h3><small>{new Date(e.created).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })} · 模拟事件</small></div>{!readIds.includes(e.id) && <Badge tone="blue">未读</Badge>}</div><p>{e.text}</p><div className="affected-products"><small>关联产品</small>{products.filter(p => e.productIds.includes(p.id)).map(p => <button key={p.id} onClick={() => select(p)}><Package size={13} />{p.name}<ArrowUpRight size={13} /></button>)}</div>{!readIds.includes(e.id) && <button className="text-button" onClick={() => markRead([e.id])}><Check size={14} />标为已读</button>}</article>)}</div> : <Empty title={filter === 'unread' ? '未读通知已处理' : '还没有变更通知'} text={qw ? '点击「拉取真实变更影响评估」，由规则引擎评估法规变更对订阅产品的影响；非官方消息会被拦截。' : '引擎未连接时只能生成模拟事件；连接后可拉取基于规则库的真实影响评估。'} />}</section><aside><section className="panel subscription-card"><SectionTitle title="一期关注范围" icon={Globe2} /><Badge tone="blue">中国台湾地区</Badge><div className="watch-items"><span><Check size={15} />产品输入规定</span><span><Check size={15} />食品与标签要求</span><span><Check size={15} />关税与 SSG 措施</span></div><p>正式上线前需配置官方来源、采集任务和人工审核发布流程。</p><Button onClick={() => setModal({ type: 'sources' })}>查看官方查询入口<ExternalLink size={14} /></Button></section><div className="next-card"><Clock3 size={24} /><h3>数据时间，也是一种依据</h3><p>正式数据须记录发布、生效、抓取与人工审核时间。过期数据不继续输出确定结论。</p></div></aside></div>
    {changeOpen && <ChangeFormModal owner={owner} onClose={() => setChangeOpen(false)} onRegistered={(mapped) => { appendEvents(mapped); setChangeOpen(false); setToast(`已登记并完成影响评估：命中 ${mapped.length} 个产品；后续拉取会持续包含该变更。`); }} />}
  </>;
}
function Products({ products, select, setModal, search, setSearch, owner, qwState, syncNote, statusOf, engineOnline }) {
  /* 从首页「需处理产品」卡片进来时（#products/attention）自动套上筛选 */
  const [filter, setFilter] = useState(() => location.hash.includes('/attention') ? 'attention' : 'all');
  const statusOptions = engineOnline
    ? [['attention', '需处理（非准许入境）'], ['permit_conditional', '准许入境（有条件）'], ['special_approval', '需专案核准'], ['prohibited', '禁止入境'], ['undetermined', '无法判定']]
    : [['attention', '需处理（演示口径）'], ...Object.entries(scenarios).map(([id, s]) => [id, s.label])];
  const isAttention = p => !['allowed', 'permit_conditional', 'assessing'].includes(statusOf(p).scenario);
  const filtered = products.filter(p => (!search || `${p.name} ${p.hs} ${p.market}`.toLowerCase().includes(search.toLowerCase())) && (filter === 'all' || (filter === 'attention' ? isAttention(p) : statusOf(p).scenario === filter)));
  return <><PageHeading eyebrow="PRODUCT LIBRARY" title="产品档案" description="保存产品信息，让每次评估都有一致的起点。"><Button variant="accent" icon={Plus} onClick={() => setModal({ type: 'product' })}>添加产品</Button></PageHeading><section className="panel"><div className="product-toolbar"><label className="search-field"><Search size={17} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索名称、HS 编码或市场" aria-label="筛选产品档案" />{search && <button aria-label="清空搜索" onClick={() => setSearch('')}><X size={15} /></button>}</label><label className="status-filter"><span className="sr-only">按准入状态筛选</span><SlidersHorizontal size={16} /><select value={filter} onChange={e => setFilter(e.target.value)}><option value="all">全部准入状态</option>{statusOptions.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label><span className="record-count">{filtered.length} 个产品</span></div>{filtered.length ? <ProductTable products={filtered} select={select} onEdit={p => setModal({ type: 'product', product: p })} statusOf={statusOf} engineOnline={engineOnline} /> : <Empty title="没有匹配的产品" text="尝试修改关键词或切换状态筛选。" />}</section><div className="storage-note"><BookmarkCheck size={17} /><div><strong>档案按工作区隔离保存</strong><p>当前工作区：{owner}。{qwState === 'online' ? `${syncNote ? `${syncNote}；` : ''}服务端按工作区隔离，换个工作区就看不到这些档案。` : '引擎未连接，仅保存在当前浏览器（同样按工作区分桶）。'}这是数据隔离演示，不是账号鉴权——公开地址上知道名称即可访问，请勿录入真实企业敏感数据。</p></div><button className="text-button" onClick={() => setModal({ type: 'workspace' })}>切换工作区<ArrowUpRight size={14} /></button></div></>;
}
function ProductForm({ product, onClose, onSave }) {
  const [values, setValues] = useState(product || { name: '', category: '食品饮料', hs: '', market: '中国台湾地区', origin: '中国大陆', specs: '', scenario: 'unknown', cost_value: '', cost_quantity: '' });
  const [error, setError] = useState('');
  const set = (key, value) => setValues({ ...values, [key]: value });
  function submit(e) {
    e.preventDefault();
    if (!values.name.trim()) { setError('请填写产品名称。'); return; }
    if (values.hs && !/^\d{6,11}$/.test(values.hs)) { setError('HS 编码请填写 6–11 位数字；当地完整归类仍需核验。'); return; }
    /* 默认货值 / 数量：选填。填了就在切到该产品时自动带入成本页，避免「换产品参数不变」 */
    const cv = values.cost_value === '' || values.cost_value == null ? null : Number(values.cost_value);
    const cq = values.cost_quantity === '' || values.cost_quantity == null ? null : Number(values.cost_quantity);
    if (cv != null && (!Number.isFinite(cv) || cv <= 0)) { setError('默认货值需为大于 0 的数字，或留空。'); return; }
    if (cq != null && (!Number.isSafeInteger(cq) || cq <= 0)) { setError('默认出口数量需为正整数，或留空。'); return; }
    onSave({ ...values, name: values.name.trim(), specs: values.specs.trim(), cost_value: cv, cost_quantity: cq, id: product?.id || crypto.randomUUID(), updated: today(), color: product?.color || 'blue' });
  }
  return <Modal title={product ? '编辑产品档案' : '新建产品评估'} onClose={onClose} wide><form onSubmit={submit}><p className="modal-intro">先录入基础资料。未知信息可以留空，系统会提示待补充。</p><div className="form-grid"><label className="field span-two"><span>产品名称 <em>*</em></span><input name="productName" required autoFocus maxLength={60} value={values.name} onChange={e => set('name', e.target.value)} placeholder="例如：低糖燕麦饮" /></label><label className="field"><span>产品类别</span><select value={values.category} onChange={e => set('category', e.target.value)}><option>食品饮料</option><option>日用消费品</option><option>电子产品</option><option>其他</option></select></label><label className="field"><span>HS 编码</span><input name="hs" inputMode="numeric" maxLength={11} value={values.hs} onChange={e => set('hs', e.target.value)} placeholder="6–11 位数字，可暂留空" /></label><label className="field"><span>目标市场</span><select value={values.market} onChange={e => set('market', e.target.value)}><option>中国台湾地区</option><option>新加坡</option><option>马来西亚</option></select><small>一期仅展示中国台湾地区；其他市场返回无法判定。</small></label><label className="field"><span>原产地</span><select value={values.origin} onChange={e => set('origin', e.target.value)}><option>中国大陆</option><option>其他 / 待核验</option></select></label><label className="field"><span>默认货值（人民币 ¥）</span><input name="cost_value" type="number" min="0.01" step="0.01" value={values.cost_value ?? ''} onChange={e => set('cost_value', e.target.value)} placeholder="选填，用于成本测算" /><small>填了就在切换到该产品时自动带入成本页。</small></label><label className="field"><span>默认出口数量（件）</span><input name="cost_quantity" type="number" min="1" step="1" value={values.cost_quantity ?? ''} onChange={e => set('cost_quantity', e.target.value)} placeholder="选填，正整数" /><small>用于计算单位落地成本。</small></label><label className="field span-two"><span>规格 / 成分 / 关键参数</span><textarea name="specs" maxLength={1200} rows={3} value={values.specs} onChange={e => set('specs', e.target.value)} placeholder="例如：250mL，常温保存，植物配方；填写关键成分和用途。" /></label><div className="field span-two scenario-note"><span><Sparkles size={15} />准入结论如何产生</span><p>结论由核心规则引擎依据 HS 编码、品类与规格成分实时判定，本表单不提供人工指定结论的开关。填得越全，结论越具体；信息不足时引擎如实返回「无法判定」，绝不猜测。</p></div></div>{error && <div className="form-error" role="alert">{error}</div>}<div className="modal-actions"><Button type="button" onClick={onClose}>取消</Button><Button type="submit" variant="primary" icon={ArrowRight}>保存并查看评估</Button></div></form></Modal>;
}
function WorkspaceModal({ owner, onClose, onSave }) {
  const [name, setName] = useState(owner);
  const [error, setError] = useState('');
  function submit(e) {
    e.preventDefault();
    const v = name.trim().replace(/\s+/g, ' ');
    if (!v) { setError('请填写企业 / 工作区名称。'); return; }
    if (v.length > 32) { setError('名称请控制在 32 个字以内。'); return; }
    onSave(v);
  }
  return <Modal title="切换工作区" onClose={onClose}><form onSubmit={submit}>
    <p className="modal-intro">一个工作区对应一家企业。产品档案、预警记录与测算历史按工作区隔离：引擎在线时由服务端按 <code>x-workspace</code> 隔离，离线时在浏览器本地分桶。演示多企业场景，可以开两个窗口填不同名称。</p>
    <label className="field span-two"><span>企业 / 工作区名称 <em>*</em></span><input name="ownerName" required autoFocus maxLength={32} value={name} onChange={e => setName(e.target.value)} placeholder="例如：厦门某某食品" /><small>切换后会载入该工作区的档案；若服务端为空，会把当前种子档案同步过去。</small></label>
    <div className="inset-note"><TriangleAlert size={19} /><div><strong>这是数据隔离，不是账号鉴权</strong><p>当前版本没有注册登录与密码校验，公开地址上任何知道工作区名称的人都能读写其中的档案，因此不要录入真实企业的敏感数据。正式多用户版本需要接入账号体系、权限校验与数据库持久化。</p></div></div>
    {error && <div className="form-error" role="alert">{error}</div>}
    <div className="modal-actions"><Button type="button" onClick={onClose}>取消</Button><Button type="submit" variant="primary" icon={ArrowRight}>切换并同步档案</Button></div>
  </form></Modal>;
}
function SourceRow({ source }) { return <a className="source-row" href={source.url} target="_blank" rel="noreferrer"><span className="source-ord" aria-hidden="true">{source.ord}</span><div><strong>{source.name}</strong><small>{source.note}</small></div><Badge tone={source.verified ? 'green' : 'slate'}>{source.verified ? '已核验' : '待核验'}</Badge><ExternalLink size={16} /></a>; }
function SourcesModal({ onClose, qw, owner }) {
  /* 在线时显示引擎规则库登记的真实来源（S01–S08，与准入结论绑定同源）；离线回落演示入口 */
  const [engineSources, setEngineSources] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let on = true;
    if (!qw) { setLoading(false); return; }
    sourcesViaQw({ owner }).then(r => { if (on) { setEngineSources(r?.sources || []); setLoading(false); } });
    return () => { on = false; };
  }, [qw, owner]);
  const rows = engineSources?.length
    ? engineSources.map(s => ({ id: s.id, name: s.name, note: `${s.id} · ${s.category || '官方查询入口'} · ${s.note || '尚未绑定具体条款'}`, url: s.url, verified: s.status === 'verified' }))
    : sources;
  return <Modal title="数据来源与可信边界" onClose={onClose} wide><p className="modal-intro">{engineSources?.length ? `核心引擎规则库登记的 ${rows.length} 个官方机构查询入口。准入与成本结论引用的规则都指向这里的来源；但尚未接入法规文档原文，因此所有规则仍标记待核验，不构成实际报价或报关依据。` : '以下是官方机构查询入口，尚未接入具体法规文档。它们不构成本 Demo 模拟结论的条款依据。'}</p>{loading ? <div className="scan-loading source-loading"><RotateCcw size={15} aria-hidden="true" />正在载入引擎来源登记…</div> : rows.map((s, i) => <SourceRow key={s.id} source={{ ...s, ord: i + 1 }} />)}<div className="inset-note"><TriangleAlert size={20} /><div><strong>当前数据状态：{engineSources?.length ? '规则库登记 · 待人工核验' : '演示'}</strong><p>没有实时抓取、没有已审核规则、没有实际税率或 SSG 累计量。正式上线需绑定原文、条款、生效日期与审核记录；核验通过后规则自动从「待核验」升级为「已核验」。</p></div></div><div className="modal-actions"><Button variant="primary" onClick={onClose}>我知道了</Button></div></Modal>;
}
function HandoffModal({ product, kind, inputs, onClose, setToast }) {
  const task = { handoffType: 'QWEN_WORK_CORE_TASK', task: kind === 'cost' ? '产品落地成本测算' : '产品市场准入与法规依据评估', createdAt: new Date().toISOString(), product: { name: product?.name, category: product?.category, hs: product?.hs, market: product?.market, origin: product?.origin, specs: product?.specs }, ...(inputs ? { costInputs: inputs, currency: 'CNY', taxRatesAreUnverifiedUserAssumptions: true } : {}), officialLookupEntries: sources.map(s => ({ name: s.name, url: s.url })), note: '请在千问办公完成核心任务并保留 Session ID。本文只包含用户输入与查询入口，不包含已经核验的业务结论。' };
  const text = JSON.stringify(task, null, 2);
  async function copy() { try { await navigator.clipboard.writeText(text); setToast('任务输入已复制，请粘贴到千问办公完成核心任务。'); } catch { setToast('浏览器未允许复制，请选中文本复制，或下载输入 JSON。'); } }
  function download() { const url = URL.createObjectURL(new Blob([text], { type: 'application/json;charset=utf-8' })); const a = document.createElement('a'); a.href = url; a.download = `tradepilot-${kind}-input.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 2000); }
  return <Modal title="把核心任务交给千问办公" onClose={onClose} wide><p className="modal-intro">网页只负责准备输入与展示结果。请将下方输入交给千问办公，结合已核验的官方资料完成{kind === 'cost' ? '成本测算' : '准入评估'}。</p><div className="handoff-content"><div className="inset-note"><Sparkles size={20} /><div><strong>当前为手动交接，未直接调用千问办公</strong><p>保留千问办公的任务对话、核心产物和 Session ID。网页演示数据不能代替千问办公的真实结果。</p></div></div><label className="field"><span>任务输入（不含演示结论）</span><textarea rows={12} readOnly value={text} onFocus={e => e.target.select()} /></label><p className="handoff-boundary">实际评估结论、法规解析与税费测算由千问办公完成；网页不提供本地核心引擎。</p></div><div className="modal-actions"><Button icon={Download} onClick={download}>下载输入 JSON</Button><Button variant="primary" icon={ClipboardList} onClick={copy}>复制给千问办公</Button></div></Modal>;
}
function GuideModal({ onClose, qw }) {
  const online = !!qw;
  const steps = online ? [
    ['录入一个产品', '填写名称、HS 编码与规格；未填编码时引擎如实返回「无法判定」，绝不猜测。'],
    ['单市场评估 / 全球扫描', '评估页可切换两种模式：单市场看结论、书件与命中条例；全球扫描一次对比全部已建库市场（当前 4 个：台湾 / 日本 / 美国 / 欧盟）。命中条例可跳转法规库查原文。'],
    ['算清落地成本', '规则库税率自动锁定并标注口径；口岸规费按 TWD 计征会显式标注「未换算」。缺输入时结果标记不完整并给出补充入口。'],
    ['税则库 / 法规库', '税则与法规可全文搜索，规则来源与核验状态逐条可查，可直接跳转核验工作台。'],
    ['法规预警与登记', '预警页可拉取规则变更影响评估，也可登记官方来源的新变更：登记后即时评估并持续包含；非官方转载会被拦截。'],
    ['规则核验', '核验工作台对照官方来源逐条核验规则，核验后评估与成本结论自动升级为「依据已核验」。工作区按企业隔离档案（演示级隔离，非账号鉴权）。'],
  ] : [
    ['录入一个产品', '填写产品参数与目标市场；当前引擎未连接，页面展示演示规则。'],
    ['点击「重新连接引擎」', '顶栏按钮可立即重试；连接后所有结论切换为规则引擎实时计算。'],
    ['离线也能浏览', '税则库 / 法规库由服务端提供，需引擎在线；产品档案保存在本地浏览器。'],
  ];
  return <Modal title="3 分钟，跑通出海决策流程" onClose={onClose} wide><p className="modal-intro">{online ? `核心引擎已接入（规则 ${qw.rule_version}），以下流程均为实时计算。` : '当前处于演示模式，连接核心引擎后自动切换为实时计算。'}</p><div className="guide-steps">{steps.map(([title, text], i) => <div key={title}><span className="step-num">{i + 1}</span><div><h3>{title}</h3><p>{text}</p></div></div>)}</div><div className="inset-note"><Sparkles size={20} /><div><strong>边界须知</strong><p>规则库条目均为「待核验」状态：结论可用于流程演示与方向判断，不得作为实际报价、报关或签约依据；正式上线需绑定法规原文并完成人工核验。</p></div></div><div className="modal-actions"><Button variant="primary" onClick={onClose}>开始体验<ArrowRight size={16} /></Button></div></Modal>;
}
/* ---------------- 核心引擎结果面板（千问办公返回数据的展示层，只读） ---------------- */
const QW_TONE = { prohibited: 'red', special_approval: 'amber', permit_conditional: 'green', undetermined: 'slate' };

function ScanPanel({ product, scan, scanning, qw }) {
  return <section className="panel scan-panel">
    <SectionTitle title={`${product.name} · 市场准入扫描`} description={scan ? `已建库 ${scan.built} 个${scan.skeleton ? ` · 骨架 ${scan.skeleton} 个` : ''}` : scanning ? '规则引擎逐市场执行中…' : '—'} icon={Globe2} />
    {scanning && <div className="scan-loading"><RotateCcw size={16} aria-hidden="true" />规则引擎逐市场执行中，每个市场独立判定…</div>}
    {scan?.markets?.length ? <>
      <div className="table-scroll"><table className="product-table scan-table"><thead><tr><th>市场</th><th>规则库</th><th>准入结论</th><th>说明</th></tr></thead>
        <tbody>{scan.markets.map(m => <tr key={m.market_code}>
          <td><span className="market-cell"><Globe2 size={14} />{m.market_name}</span></td>
          <td>{m.coverage === 'deep' ? <Badge tone="green">已建库</Badge> : <Badge>骨架 · 未建库</Badge>}</td>
          <td><Badge tone={QW_TONE[m.status] || 'slate'}>{m.status_label}</Badge></td>
          <td className="scan-reason">{m.reason}{m.missing_fields?.length ? `（待补：${m.missing_fields.slice(0, 2).join('、')}）` : ''}{m.evidence_count ? ` · 依据 ${m.evidence_count} 条规则` : ''}
            {m.overview && <div className="scan-ov">
              <em>背景概览（待核验 · 仅供调研，不构成准入结论）</em>
              <div><b>监管</b>{m.overview.regulator}</div>
              <div><b>门槛</b>{(m.overview.gates || []).join('；')}</div>
              <div><b>标签</b>{m.overview.label}<span className="scan-ov-gap">｜</span><b>关税</b>{m.overview.tariff || '待核验'}</div>
              {m.overview.note && <span>{m.overview.note}</span>}
            </div>}
          </td>
        </tr>)}</tbody></table></div>
      <div className="inset-note"><ShieldCheck size={19} /><div><strong>这张表怎么读</strong><p>{scan.note}</p></div></div>
    </> : (!scanning && <Empty title={qw ? '尚无扫描结果' : '引擎未连接'} text={qw ? '切换产品或稍候重试。' : '市场扫描由服务端规则引擎执行，连接后自动开始；点右上角「重新连接引擎」可立即重试。'} />)}
  </section>;
}

/* 税则库：与规则引擎同源的税率条目浏览（只读） */
/* 库内搜索：从 hash 子段初始化（#tariff/q/关键词），hash 变化时同步 */
function useKbSearch(routeId) {
  const read = () => { const seg = location.hash.split('/q/')[1]; return location.hash.startsWith(`#${routeId}`) && seg ? decodeURIComponent(seg) : ''; };
  const [q, setQ] = useState(read);
  useEffect(() => { const h = () => setQ(read()); window.addEventListener('hashchange', h); return () => window.removeEventListener('hashchange', h); }, []);
  return [q, setQ];
}
const norm = (s) => String(s ?? '').toLowerCase();

function KbTariff({ qw, qwState, reconnect }) {
  const [items, setItems] = useState(null);
  const [q, setQ] = useKbSearch('tariff');
  useEffect(() => {
    let on = true;
    if (!qw) { setItems(null); return; }
    tariffViaQw().then(r => { if (on) setItems(r?.items || []); });
    return () => { on = false; };
  }, [qw]);
  /* 全字段过滤：编码 / 品名 / 标签；排序：待核验优先（这是要干的活），已核验按核验时间往后沉 */
  const kw = q.trim().toLowerCase();
  const filtered = !items || !kw ? items : items.filter(t => norm(t.code).includes(kw) || norm(t.name).includes(kw) || (t.tags || []).some(tag => norm(tag).includes(kw)));
  const vr = (t) => t.verify_status === 'verified' ? (t.updated_at ? 1 : 2) : 0;
  const shown = filtered ? [...filtered].sort((a, b) => vr(a) - vr(b) || (vr(a) === 1 ? String(a.updated_at).localeCompare(String(b.updated_at)) : 0)) : filtered;
  return <>
    <PageHeading eyebrow="TARIFF LIBRARY" title="税则库" description="已登记品目的税率、SSG 与货物税口径，与成本测算同源。"><span className="date-label">{items ? `${items.length} 条税则` : '—'}</span></PageHeading>
    
    {items ? <section className="panel"><div className="kb-toolbar"><label className="search-field kb-search"><Search size={17} aria-hidden="true" /><input value={q} onChange={e => setQ(e.target.value)} placeholder="搜编码 / 品名 / 标签，如 220299、饮料、ssg" aria-label="搜索税则库" />{q && <button aria-label="清空搜索" onClick={() => setQ('')}><X size={15} /></button>}</label><span className="record-count">{kw ? `${shown.length} / ${items.length} 条匹配「${q.trim()}」` : `${items.length} 条税则`}</span></div><div className="table-scroll"><table className="product-table kb-table"><thead><tr><th>HS 编码</th><th>品名</th><th>关税</th><th>SSG</th><th>货物税 / 捐费</th><th>核验</th></tr></thead><tbody key={`t-${kw}`}>{shown.length ? shown.map(t => <tr key={t.verify_key || t.code}><td><span className="hs-chip">{t.code}</span>{t.market && t.market !== 'TW' && <small className="kb-tags">市场 {t.market}</small>}</td><td><strong className="kb-name">{t.name}</strong><small className="kb-tags">{(t.tags || []).join(' · ')}</small></td><td>{t.duty_rate}%</td><td>{t.ssg_rate != null ? `${t.ssg_rate}%` : '—'}</td><td className="kb-fee">{t.excise ? t.excise.name : ''}{t.levy ? `${t.excise ? ' + ' : ''}${t.levy.name}` : ''}{!t.excise && !t.levy ? '—' : ''}</td><td><Badge tone={t.verify_status === 'verified' ? 'green' : 'slate'}>{t.verify_status === 'verified' ? '已核验' : '待核验'}</Badge><a className="text-button" href={`#verify/q/${t.verify_key || t.code}`}>去核验<ArrowUpRight size={12} /></a></td></tr>) : <tr><td colSpan="6" className="kb-empty">没有匹配「{q.trim()}」的税则条目。试试编码前 4 位、品名关键词或标签（food / ssg / agri_controlled）。</td></tr>}</tbody></table></div><div className="panel-foot"><span><span className="tiny-dot" />来源标记：{[...new Set(items.flatMap(t => t.source_ids))].join('、')} · 关税 → SSG → 货物税 → 捐费 → 营业税为固定课征顺序</span></div></section> : qwState === 'online' ? <section className="panel"><div className="scan-loading"><RotateCcw size={16} aria-hidden="true" />正在载入税则条目…</div></section> : <Empty title="引擎未连接" text="税则库由服务端规则库提供，连接后即可浏览全部税率条目。" action={<Button onClick={reconnect}><RotateCcw size={15} />重新连接引擎</Button>} />}
  </>;
}

/* 法规库：准入义务 / 申请主体 / 书件 / 法规依据（只读） */
function KbRegulations({ qw, qwState, reconnect }) {
  const [items, setItems] = useState(null);
  const [q, setQ] = useKbSearch('regulations');
  useEffect(() => {
    let on = true;
    if (!qw) { setItems(null); return; }
    regulationsViaQw().then(r => { if (on) setItems(r?.items || []); });
    return () => { on = false; };
  }, [qw]);
  /* 全字段过滤：规则 ID / 制度名 / 主管机关 / 书件 / 法规条文 */
  const kw = q.trim().toLowerCase();
  const shown = !items || !kw ? items : items.filter(r => norm(r.id).includes(kw) || norm(r.name).includes(kw) || norm(r.agency).includes(kw) || (r.documents || []).some(d => norm(d).includes(kw)) || (r.legal_basis || []).some(b => norm(b.title).includes(kw) || norm(b.article).includes(kw)) || norm(r.applicant_note).includes(kw));
  return <>
    <PageHeading eyebrow="REGULATION LIBRARY" title="法规库" description="准入评估引用的每一条管制制度、书件清单与法规依据。"><span className="date-label">{items ? `${items.length} 条制度` : '—'}</span></PageHeading>
    
    {items ? <div className="kb-toolbar kb-toolbar-wide"><label className="search-field kb-search"><Search size={17} aria-hidden="true" /><input value={q} onChange={e => setQ(e.target.value)} placeholder="搜制度名 / 机关 / 规则 ID / 书件 / 法规条文，如 标示、检疫、RG-IMP" aria-label="搜索法规库" />{q && <button aria-label="清空搜索" onClick={() => setQ('')}><X size={15} /></button>}</label><span className="record-count">{kw ? `${shown.length} / ${items.length} 条匹配「${q.trim()}」` : `${items.length} 条制度`}</span></div> : null}
    {items ? (shown.length ? <div className="reg-grid">{shown.map((r, i) => <section className="panel reg-card" key={r.id}>
      <div className="reg-head"><span className="source-ord" aria-hidden="true">{i + 1}</span><div><h3>{r.name}</h3><small>{r.agency} · 规则 {r.id} · 来源 {r.source_ids.join('、')}</small></div><Badge tone={r.verify_status === 'verified' ? 'green' : 'slate'}>{r.verify_status === 'verified' ? '已核验' : '待核验'}</Badge><a className="text-button" href={`#verify/q/${r.id}`}>去核验<ArrowUpRight size={12} /></a></div>
      <p className="reg-note">{r.applicant_note}</p>
      <div className="reg-meta"><div><small>适用对象</small><strong>{(r.applies_to || ['*']).includes('*') ? '全部品类' : r.applies_to.join('、')}</strong></div><div><small>办理周期</small><strong>{r.duration_days ? `${r.duration_days[0]}–${r.duration_days[1]} 天` : '—'}</strong></div><div><small>申请主体</small><strong>{r.requires_local_importer ? '须当地进口商' : '可自行申报'}</strong></div></div>
      {r.documents?.length > 0 && <div className="reg-docs"><small>书件清单</small>{r.documents.map((d, j) => <span key={j}>{d}</span>)}</div>}
      {r.legal_basis?.map((b, j) => <div className="reg-law" key={j}><FileText size={13} aria-hidden="true" /><span>{b.title} · {b.article}（{b.verify_status === 'verified' ? '已核验' : '待核验'}）</span></div>)}
    </section>)}</div> : <section className="panel"><div className="kb-empty kb-empty-wide">没有匹配「{q.trim()}」的管制制度。试试制度关键词（标示、检疫、查验）、主管机关名或规则 ID（RG- 开头）。</div></section>) : qwState === 'online' ? <section className="panel"><div className="scan-loading"><RotateCcw size={16} aria-hidden="true" />正在载入法规制度…</div></section> : <Empty title="引擎未连接" text="法规库由服务端规则库提供，连接后即可浏览全部管制制度。" action={<Button onClick={reconnect}><RotateCcw size={15} />重新连接引擎</Button>} />}
  </>;
}

/* 竞品分析：与产品 HS 前缀匹配的公开渠道检索快照（非实时），价格带按每升归一 */
function Compete({ product, products, select, qw, qwState, reconnect }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    let on = true;
    if (!qw || !product?.name) { setData(null); return; }
    setLoading(true);
    const t = setTimeout(() => {
      competitorsViaQw(product).then(r => { if (!on) return; setData(r); setLoading(false); });
    }, 250);
    return () => { on = false; clearTimeout(t); };
  }, [qw, product?.id, product?.hs, product?.name]);
  const CUR_SYM = { TWD: 'NT$', JPY: '¥', USD: '$', EUR: '€' };
  const symOf = (c) => CUR_SYM[c.currency] || c.currency || 'NT$';
  const priceOf = (c) => (c.price_local ? `${symOf(c)} ${c.price_local[0]}–${c.price_local[1]}` : `NT$ ${c.price_twd[0]}–${c.price_twd[1]}`);
  const perlOf = (c) => (c.local_per_liter != null ? `${symOf(c)} ${c.local_per_liter}` : (c.twd_per_liter ? `NT$ ${c.twd_per_liter}` : '—'));
  const perlNum = (c) => c.local_per_liter ?? c.twd_per_liter ?? 0;
  const maxPerL = data ? Math.max(1, ...data.items.map(perlNum)) : 1;
  return <>
    <PageHeading eyebrow="COMPETITIVE LANDSCAPE" title="竞品分析" description="目标市场同类产品的渠道、价格带与定位参考。"><ProductSelect {...{ product, products, select }} /></PageHeading>
    
    {loading && <section className="panel"><div className="scan-loading"><RotateCcw size={16} aria-hidden="true" />正在匹配「{product?.name}」同 HS 前缀的竞品…</div></section>}
    {data?.count ? <section className="panel">
      {data.match_level === 'subcategory' || data.match_level === 'text'
        ? <div className="comp-band"><BarChart3 size={18} aria-hidden="true" /><div><strong>竞品价格带（{data.match_level === 'subcategory' ? `细分匹配：${data.subcategory_label || data.subcategory}` : '品名相似度匹配'}）</strong><p>直接竞品 {data.direct.length} 条：NT$ {data.band_direct.min} – {data.band_direct.max} / 升{data.substitutes.length ? ` · 替代品 ${data.substitutes.length} 条（含替代品 NT$ ${data.band_all.min} – ${data.band_all.max} / 升）` : ''} · 快照 {data.retrieved_dates?.join('、')} · 定价先看直接竞品带，替代品带作上下限参考。</p></div><span className="band-num">NT$ {data.band_direct.min}–{data.band_direct.max}<small>直接竞品 · 每升</small></span></div>
        : data.band && <div className="comp-band comp-band-coarse"><TriangleAlert size={18} aria-hidden="true" /><div><strong>竞品价格带（品类粗匹配）</strong><p>未从「{product?.name}」识别出细分品类或相似竞品，当前按 HS {(product?.hs || '').slice(0, 4) || '品类'} 整类匹配 {data.count} 条：NT$ {data.band.min} – {data.band.max} / 升 · 当前词库支持的品类：{(data.known_category_words || []).filter(w => /^[一-龥]{2,6}$/.test(w)).slice(0, 8).join('、') || '待扩充'}（库内未覆盖的品类如实按品类粗匹配展示）。</p></div><span className="band-num">NT$ {data.band.min}–{data.band.max}<small>品类口径 · 每升</small></span></div>}
      <div className="table-scroll"><table className="product-table comp-table"><thead><tr><th>品牌 / 品名</th><th>关系</th><th>渠道</th><th>价格（{data?.market && data.market !== 'TW' ? `${data.market_name || data.market} 本地币种` : 'TWD'}）</th><th>每升单价</th><th>价格带位置</th><th>核验</th></tr></thead><tbody>
        {(data.direct?.length ? [...data.direct.map(c => [c, 'direct']), ...data.substitutes.map(c => [c, 'sub'])] : data.items.map(c => [c, 'cat'])).map(([c, rel]) => <tr key={c.id} className={rel === 'sub' ? 'comp-sub-row' : ''} title={c.match_reason || ''}>
          <td><strong className="kb-name">{c.brand}</strong><small className="kb-tags">{c.name} · {c.spec}</small></td>
          <td>{rel === 'direct' ? <Badge tone="green">直接竞品</Badge> : rel === 'sub' ? <Badge>替代品</Badge> : <Badge tone="blue">品类匹配</Badge>}</td>
          <td><span className="market-cell"><Globe2 size={13} />{c.platform}</span></td>
          <td title={c.price_local ? `参考折算 NT$ ${c.price_twd[0]}–${c.price_twd[1]}（汇率未核验）` : undefined}>{priceOf(c)}</td>
          <td className="comp-perl">{perlOf(c)}</td>
          <td><div className="comp-bar-track"><div className="comp-bar" style={{ width: `${Math.max(6, Math.round(perlNum(c) / maxPerL * 100))}%` }} /></div></td>
          <td><Badge>{c.verify_status === 'verified' ? '已核验' : '待核验'}</Badge></td>
        </tr>)}
      </tbody></table></div>
      <div className="panel-foot"><span><span className="tiny-dot" />数据来源：公开电商检索快照（momo / 全聯等入口），正式版接入实时数据源后自动更新；来源入口见各条目</span><a className="text-button" href="https://www.momoshop.com.tw/search/燕麥奶" target="_blank" rel="noreferrer">查看来源入口<ExternalLink size={13} /></a></div>
    </section> : (data && data.count === 0) ? <Empty title="该品类竞品库尚未录入" text={`「${product?.name}」的 HS 前缀（${(product?.hs || '').slice(0, 4) || '待补充'}）暂无竞品快照。运营录入后此处自动展示；也可先用 220299（饮料类）体验。`} /> : (!loading && qw && <Empty title="尚无竞品数据" text="连接引擎后自动匹配。" />)}
    {!qw && <Empty title="引擎未连接" text="竞品库由服务端规则库提供，连接后即可浏览。" action={<Button onClick={reconnect}><RotateCcw size={15} />重新连接引擎</Button>} />}
  </>;
}

/* 方案报告：调研 → 评估 → 成本 → 风控 → 方案，一键生成与下载 */
function ReportPage({ product, products, select, qw, qwState, reconnect, costInputs, owner }) {
  const [rep, setRep] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => { setRep(null); setErr(''); }, [product?.id]);
  async function generate() {
    if (!product?.name) return;
    setLoading(true); setErr('');
    const hs = String(product?.hs || '').replace(/\D/g, '');
    const r = await reportViaQw({ product, costInputs, useKbRates: hs.length >= 4 }, { owner });
    setLoading(false);
    if (!r?.report) { setErr('生成失败：引擎未连接或参数缺失，请检查后重试。'); return; }
    setRep(r);
  }
  function download(kind) {
    const fname = `tradepilot-出海方案报告-${(product?.name || '').slice(0, 10)}`;
    if (kind === 'md') {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([rep.markdown], { type: 'text/markdown;charset=utf-8' }));
      a.download = `${fname}.md`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    } else if (kind === 'html') {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([rep.html], { type: 'text/html;charset=utf-8' }));
      a.download = `${fname}.html`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    } else {
      const w = window.open('', '_blank');
      if (w) { w.document.write(rep.html); w.document.close(); }
    }
  }
  const R = rep?.report;
  return <>
    <PageHeading eyebrow="GO-TO-MARKET PLAN" title="方案报告" description="调研 → 评估 → 成本 → 风控 → 方案，一键生成出海决策报告。"><ProductSelect {...{ product, products, select }} /><Button variant="primary" icon={ClipboardCheck} onClick={generate} disabled={!product?.name || loading || !qw}>{loading ? '生成中…' : rep ? '重新生成' : '生成报告'}</Button></PageHeading>
    
    {err && <section className="panel"><div className="form-error" role="alert">{err}</div></section>}
    {!qw && <Empty title="引擎未连接" text="报告由服务端引擎生成，连接后即可使用。" action={<Button onClick={reconnect}><RotateCcw size={15} />重新连接引擎</Button>} />}
    {loading && <section className="panel"><div className="scan-loading"><RotateCcw size={16} aria-hidden="true" />引擎正在串联调研 / 评估 / 成本 / 风控四条链路…</div></section>}
    {R && <section className="panel report-panel">
      <div className="report-head"><div><span className="eyebrow">GO-TO-MARKET REPORT</span><h2>{R.product.name} · 出海方案</h2><small>规则 {rep.rule_version} · {new Date(rep.generated_at).toLocaleString('zh-CN')} · HS {R.product.hs || '待补充'} · {R.product.market}</small></div>
        <span className="poster-actions"><Button onClick={() => download('html')} icon={Download}>下载 HTML</Button><Button onClick={() => download('md')} icon={Download}>Markdown</Button><Button variant="primary" onClick={() => download('print')} icon={Printer}>打印 / PDF</Button></span></div>
      <div className="report-sections">
        <div className="rsec"><h3><span>1</span>市场调研</h3><p>全球扫描 {R.research.scan.built} 建库 / {R.research.scan.skeleton} 骨架；{R.research.competitors.count ? `竞品 ${R.research.competitors.count} 条，价格带 NT$${R.research.competitors.band?.min}–${R.research.competitors.band?.max}/升（快照待核验）` : '竞品库未录入'}。</p><div className="rsec-links"><button className="text-button" onClick={() => location.hash = 'assessment/scan'}>看全球市场扫描<ArrowUpRight size={13} /></button><button className="text-button" onClick={() => location.hash = 'competition'}>看竞品分析<ArrowUpRight size={13} /></button></div></div>
        <div className="rsec"><h3><span>2</span>准入评估</h3><p><Badge tone={QW_TONE[R.admission.verdict.code] || 'slate'}>{R.admission.verdict.label}</Badge> {R.admission.applicant?.requires_local_importer ? '· 须当地进口商申报' : '· 可自行申报'} · 关键路径 {R.admission.timeline?.critical_path_text || '待确认'} · 命中条例 {R.admission.evidence_count} 条 · 书件 {(R.admission.documents || []).length} 项。</p><div className="rsec-links"><button className="text-button" onClick={() => location.hash = 'assessment'}>看评估详情<ArrowUpRight size={13} /></button></div></div>
        <div className="rsec"><h3><span>3</span>成本与收益</h3>{R.cost ? <p>综合落地成本 <strong>{R.cost.totals.grand_total}</strong>（同输入币种）· 单件 {R.cost.totals.unit_landed_cost} · 税负率 {R.cost.totals.effective_tax_rate_pct}%{R.cost.quote ? ` · 建议报价带 ${R.cost.quote.suggested_low}–${R.cost.quote.suggested_high}（含缓冲 ${R.cost.quote.buffer_pct}%）` : ''}{R.cost.pending_items?.length ? ` · 待补 ${R.cost.pending_items.length} 项` : ''}</p> : <p className="form-error">{R.cost_error || '成本测算未完成，补齐货值/数量后重新生成。'}</p>}<div className="rsec-links"><button className="text-button" onClick={() => location.hash = 'cost'}>看成本明细<ArrowUpRight size={13} /></button></div></div>
        <div className="rsec"><h3><span>4</span>风控预案</h3><p>{R.plan.risks.length} 条风险预案（{[...new Set(R.plan.risks.map(x => x.category))].join(' / ')}），每条含触发条件、预案动作、责任角色与监控指标。</p><div className="rplan-list">{R.plan.risks.map(x => <div key={x.id} className="rplan-row"><Badge tone={x.category === '准入信息' ? 'red' : 'amber'}>{x.id}</Badge><div><strong>{x.risk}</strong><small>{x.action} · 责任：{x.owner}</small></div></div>)}</div></div>
        <div className="rsec rsec-last"><h3><span>5</span>下一步方案</h3><ol className="rnext"><li>补齐/核验书件清单，专案类由当地进口方牵头递交</li><li>按报价带与竞品价格带确定上市定价，预留 SSG 与汇率缓冲</li><li>首票小批量试单，通关后复盘动销与复购再放量</li><li>订阅法规变更预警，规则变化后重新生成本报告</li></ol></div>
      </div>
      <div className="inset-note"><TriangleAlert size={19} /><div><strong>边界须知</strong><p>{R.plan.note}</p></div></div>
    </section>}
  </>;
}

/* 规则核验工作台（真功能）：对照官方来源逐条核验 → 引擎实时重建 → 结论自动升级「依据已核验」 */
/* 检索式/条文定位一键复制：减少「回到官网搜索框手打一串关键词」的摩擦 */
async function copyText(text, tag) {
  try {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return tag; }
  } catch (e) { /* 非安全上下文或用户拒绝授权时回落 */ }
  const ta = document.createElement('textarea');
  ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.left = '-9999px';
  document.body.appendChild(ta); ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
  document.body.removeChild(ta);
  return ok ? tag : '';
}

function Verify({ qw, qwState, reconnect, owner }) {
  const [data, setData] = useState(null);
  const [kindF, setKindF] = useState('all');
  const [statusF, setStatusF] = useState('all');
  /* 支持从税则库/法规库跳入并定位：#verify/q/<编码或规则ID> */
  const [q, setQ] = useKbSearch('verify');
  const [busy, setBusy] = useState('');
  const [assistRow, setAssistRow] = useState(null); /* AI 预检弹窗（引擎比对参数，人工最终确认） */
  const [view, setView] = useState('flat'); /* flat 逐条 / source 按来源聚类（一次进站可核完多条） */
  const [copied, setCopied] = useState('');
  useEffect(() => {
    let on = true;
    if (!qw) { setData(null); return; }
    verifyQueueViaQw({ owner }).then(r => { if (on) setData(r); });
    return () => { on = false; };
  }, [qw, owner]);
  const recalc = (items) => {
    const verified = items.filter((i) => i.verify_status === 'verified').length;
    return { items, total: items.length, verified, pending: items.length - verified, verified_ratio: Math.round(verified / Math.max(1, items.length) * 1000) / 10 };
  };
  async function setStatus(kind, code, status) {
    setBusy(code);
    const r = await verifyRuleViaQw({ kind, code, verify_status: status }, { owner });
    setBusy('');
    if (!r?.rule) return;
    setData(prev => prev ? { ...prev, ...recalc(prev.items.map(it => (it.kind === kind && it.code === code ? { ...it, verify_status: status, updated_by: r.rule.updated_by, updated_at: r.rule.updated_at } : it))) } : prev);
  }
  const kw = q.trim().toLowerCase();
  const vr = (it) => it.verify_status === 'verified' ? (it.updated_at ? 1 : 2) : 0;
  const shown = (data?.items || []).filter(it => (kindF === 'all' || it.kind === kindF) && (statusF === 'all' || it.verify_status === statusF) && (!kw || `${it.name} ${it.code} ${it.params}`.toLowerCase().includes(kw)))
    .sort((a, b) => vr(a) - vr(b) || (vr(a) === 1 ? String(a.updated_at).localeCompare(String(b.updated_at)) : 0)); /* 待核验优先，已核验按核验时间沉底 */
  const kindOptions = [['all', '全部类别'], ['tariffItems', '税则条目'], ['regimes', '管制制度'], ['labelRules', '标签规则'], ['ssgSnapshots', 'SSG 快照'], ['adminFees', '口岸规费'], ['ports', '口岸参数']];
  return <>
    <PageHeading eyebrow="RULE VERIFICATION" title="规则核验" description="对照官方来源逐条核验规则参数；核验后结论自动升级为「依据已核验」。"><span className="date-label">{data ? `共 ${data.total} 条 · 已核验 ${data.verified}` : '—'}</span></PageHeading>
    
    {data ? <section className="panel verify-panel">
      <div className="verify-stats">
        <div className="vstat"><small>待核验</small><strong className="snap-amber">{data.pending}</strong></div>
        <div className="vstat"><small>已核验</small><strong className="snap-green">{data.verified}</strong></div>
        <div className="vstat"><small>核验率</small><strong className="snap-blue">{data.verified_ratio}%</strong></div>
        <div className="vstat-actions"><Button onClick={() => { location.hash = 'assessment'; }}>去评估页看效果<ArrowUpRight size={14} /></Button></div>
      </div>
      <div className="kb-toolbar">
        <label className="search-field kb-search"><Search size={17} aria-hidden="true" /><input value={q} onChange={e => setQ(e.target.value)} placeholder="搜规则名 / 编码 / 参数" aria-label="搜索核验队列" />{q && <button aria-label="清空搜索" onClick={() => setQ('')}><X size={15} /></button>}</label>
        <div className="filter-pills">{kindOptions.map(([id, label]) => <button key={id} aria-pressed={kindF === id} className={kindF === id ? 'selected' : ''} onClick={() => setKindF(id)}>{label}</button>)}</div>
        <div className="filter-pills">{[['all', '全部状态'], ['needs_verification', '待核验'], ['verified', '已核验']].map(([id, label]) => <button key={id} aria-pressed={statusF === id} className={statusF === id ? 'selected' : ''} onClick={() => setStatusF(id)}>{label}</button>)}</div>
        <div className="filter-pills view-pills">{[['flat', '逐条清单'], ['source', '按来源聚类']].map(([id, label]) => <button key={id} aria-pressed={view === id} className={view === id ? 'selected' : ''} onClick={() => setView(id)}>{label}</button>)}</div>
        <span className="record-count">{shown.length} / {data.total} 条</span>
      </div>
      {view === 'source' ? <div className="vgroups">{(data.groups || []).filter(g => shown.some(it => g.source_id ? (it.sources || []).some(s => s.id === g.source_id) : !(it.sources || []).length)).map(g => {
        const rows = shown.filter(it => g.source_id ? (it.sources || []).some(s => s.id === g.source_id) : !(it.sources || []).length);
        const pendingRows = rows.filter(it => it.verify_status !== 'verified');
        const batch = pendingRows.map(it => `${it.code} ${it.name}｜依据：${(it.locator?.legal_titles || []).join('、') || '待补'}｜比對：${(it.locator?.fields_to_check || []).join(' / ')}`).join('\n');
        return <section key={g.source_id || 'unassigned'} className="vgroup">
          <header className="vgroup-head">
            <div><strong>{g.site}</strong><small>{g.total} 条待核规则挂在此来源 · 待核验 {g.pending} · {g.kinds_text}</small></div>
            <div className="vgroup-ops">
              {g.official_url && <a className="text-button" href={g.official_url} target="_blank" rel="noreferrer">打开官网<ExternalLink size={13} /></a>}
              {pendingRows.length > 0 && <button className="text-button" onClick={async () => setCopied(await copyText(batch, `g-${g.source_id}`))}>复制本组核验清单{copied === `g-${g.source_id}` ? '（已复制）' : ''}<Copy size={13} /></button>}
            </div>
          </header>
          <p className="vgroup-hint">一次进站可核完本组 {rows.length} 条：逐条点「站内检索」直接落到带关键词的结果页，复制条文粘贴到「AI 预检」即可比对参数。</p>
          <div className="vgroup-rows">{rows.map(it => <VerifyRowCard key={`g-${g.source_id}-${it.kind}-${it.code}`} it={it} busy={busy} copied={copied} setCopied={setCopied} onAssist={setAssistRow} onStatus={setStatus} />)}</div>
        </section>;
      })}</div> : <div className="table-scroll"><table className="product-table verify-table"><thead><tr><th>规则</th><th>关键参数 / 定位</th><th>来源</th><th>状态</th><th>核验人 / 时间</th><th>操作</th></tr></thead><tbody key={`v-${kw}-${kindF}-${statusF}`}>
        {shown.length ? shown.map(it => <tr key={`${it.kind}-${it.code}`}>
          <td><strong className="kb-name">{it.name}</strong><small className="kb-tags">{it.kind_label} · {it.code}</small></td>
          <td className="kb-fee">{it.params}<LocatorLine it={it} /></td>
          <td>{it.sources?.length ? it.sources.map(sc => <a key={sc.id} className="src-chip" href={sc.url} target="_blank" rel="noreferrer" title={sc.name}>{sc.id}</a>) : <span className="kb-fee">—</span>}</td>
          <td><Badge tone={it.verify_status === 'verified' ? 'green' : 'slate'}>{it.verify_status === 'verified' ? '已核验' : '待核验'}</Badge><RuleHomeLink it={it} /></td>
          <td className="kb-fee v-person">{it.updated_by ? <><span>{it.updated_by}</span><small>{it.updated_at ? new Date(it.updated_at).toLocaleDateString('zh-CN') : ''}</small></> : '—'}</td>
          <td className="verify-ops">
            <LocateButtons it={it} copied={copied} setCopied={setCopied} />
            {it.verify_status !== 'verified' && <button className="text-button" onClick={() => setAssistRow(it)}>AI 预检<Sparkles size={13} /></button>}
            {it.verify_status !== 'verified'
              ? <button className="text-button" disabled={busy === it.code} onClick={() => setStatus(it.kind, it.code, 'verified')}>{busy === it.code ? '核验中…' : '标记已核验'}<Check size={13} /></button>
              : <button className="text-button" disabled={busy === it.code} onClick={() => setStatus(it.kind, it.code, 'needs_verification')}>撤销核验<RotateCcw size={13} /></button>}
          </td>
        </tr>) : <tr><td colSpan="6" className="kb-empty">没有匹配的规则。</td></tr>}
      </tbody></table></div>}
      <div className="panel-foot"><span><span className="tiny-dot" />核验动作即时生效（引擎实时重建）；重新发布实例后核验记录重置，需重新核验</span></div>
    </section> : qwState === 'online' ? <section className="panel"><div className="scan-loading"><RotateCcw size={16} aria-hidden="true" />正在载入核验队列…</div></section> : <Empty title="引擎未连接" text="核验工作台需要服务端规则库。" action={<Button onClick={reconnect}><RotateCcw size={15} />重新连接引擎</Button>} />}
    {assistRow && <VerifyAssistModal row={assistRow} owner={owner} onClose={() => setAssistRow(null)} onVerified={() => { setStatus(assistRow.kind, assistRow.code, 'verified'); setAssistRow(null); }} />}
  </>;
}

/* 核验行的反向跳转：回到该规则的「家」。
   税则/SSG → 税则库定位；管制制度 → 法规库定位；其余三类无库页面 → 官方来源首页。
   与库页面的「去核验」构成双向闭环，核验人可随时看规则全貌再回来落章。 */
function RuleHomeLink({ it }) {
  if (it.kind === 'tariffItems' || it.kind === 'ssgSnapshots') {
    return <a className="text-button" href={`#tariff/q/${encodeURIComponent(it.code)}`}>查看原规则<ArrowUpRight size={12} /></a>;
  }
  if (it.kind === 'regimes') {
    return <a className="text-button" href={`#regulations/q/${encodeURIComponent(it.code)}`}>查看原规则<ArrowUpRight size={12} /></a>;
  }
  const home = (it.check_links || []).find((l) => l.official_url);
  return home ? <a className="text-button" href={home.official_url} target="_blank" rel="noreferrer" title={home.site}>官方来源<ArrowUpRight size={12} /></a> : null;
}

/* 定位三要素之二、三：依据法规名 + 该比对的参数（与规则库同源，服务端逐条给出） */
function LocatorLine({ it }) {
  const loc = it.locator || {};
  const hasTitles = (loc.legal_titles || []).length > 0;
  const hasFields = (loc.fields_to_check || []).length > 0;
  if (!hasTitles && !hasFields && !loc.locate_hint) return null;
  return <div className="v-loc">
    {hasTitles && <p><strong>依据</strong>{loc.legal_titles.join('、')}{(loc.articles || [])[0] ? ` · ${loc.articles[0]}` : ''}</p>}
    {loc.locate_hint && <p><strong>找这里</strong>{loc.locate_hint}</p>}
    {hasFields && <p><strong>比对</strong>{loc.fields_to_check.join(' / ')}</p>}
  </div>;
}

/* 定位要素之一：站内检索。用 site: 限定到该主管机关域名——系统不写死官方站内深链，
   各家端点格式不同且会改版，写死等于制造假链接。 */
function LocateButtons({ it, copied, setCopied }) {
  const tag = `q-${it.kind}-${it.code}`;
  const links = it.check_links || [];
  return <span className="v-locate">
    {links.map((l, i) => (l.search_url
      ? <a key={`${tag}-${i}`} className="text-button" href={l.search_url} target="_blank" rel="noreferrer" title={`在 ${l.site} 站内检索：${l.search_query}`}>站内检索<ExternalLink size={13} /></a>
      : null))}
    <button className="text-button" title={it.locator?.search_query || it.code} onClick={async () => setCopied(await copyText(it.locator?.search_query || it.code, tag))}>复制检索式{copied === tag ? '（已复制）' : ''}<Copy size={13} /></button>
  </span>;
}

function VerifyRowCard({ it, busy, copied, setCopied, onAssist, onStatus }) {
  return <article className={`vcard${it.verify_status === 'verified' ? ' vcard-done' : ''}`}>
    <div className="vcard-main"><strong>{it.name}</strong><small>{it.kind_label} · {it.code} · {it.params}</small><LocatorLine it={it} /></div>
    <div className="vcard-side">
      <Badge tone={it.verify_status === 'verified' ? 'green' : 'slate'}>{it.verify_status === 'verified' ? '已核验' : '待核验'}</Badge>
      <RuleHomeLink it={it} />
      <div className="verify-ops">
        <LocateButtons it={it} copied={copied} setCopied={setCopied} />
        {it.verify_status !== 'verified' && <button className="text-button" onClick={() => onAssist(it)}>AI 预检<Sparkles size={13} /></button>}
        {it.verify_status !== 'verified'
          ? <button className="text-button" disabled={busy === it.code} onClick={() => onStatus(it.kind, it.code, 'verified')}>标记已核验<Check size={13} /></button>
          : <button className="text-button" disabled={busy === it.code} onClick={() => onStatus(it.kind, it.code, 'needs_verification')}>撤销核验<RotateCcw size={13} /></button>}
      </div>
    </div>
  </article>;
}

/* AI 预检弹窗：粘贴官方文本 → 引擎抽取参数与规则库比对 → 一致/不一致/无法判断 + 证据；人工确认后才标记核验 */
function VerifyAssistModal({ row, owner, onClose, onVerified }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [err, setErr] = useState('');
  const SAMPLE = row?.kind === 'tariffItems' ? `税则号别 ${row.code} ${row.name}：关税税率 12%。` : '';
  async function run() {
    if (!text.trim()) return;
    setBusy(true); setErr(''); setResult(null);
    const r = await verifyAssistViaQw({ kind: row.kind, code: row.code, official_text: text }, { owner });
    setBusy(false);
    if (!r?.checks) { setErr('预检失败：引擎未连接或参数缺失，请检查后重试。'); return; }
    setResult(r);
  }
  const MATCH_ICON = { true: <><Badge tone="green">一致</Badge></>, false: <><Badge tone="red">不一致</Badge></>, null: <><Badge>无法判断</Badge></> };
  return <Modal title={`AI 预检 · ${row.name}`} onClose={onClose} wide>
    <p className="modal-intro">从官方来源复制相关条文 / 税则段落粘贴到下方，引擎自动抽取参数（税率 / 金额 / 周期）与规则库比对。<strong>预检结果仅供辅助，最终核验仍由人工确认——「已核验」的意义在人工背书。</strong></p>
    <div className="va-rule">
      <div><small>规则</small><strong>{row.kind_label} · {row.code}</strong></div>
      <div><small>关键参数</small><strong>{row.params}</strong></div>
      <div className="va-rule-src"><small>官方来源</small>{row.sources?.length ? row.sources.map(sc => <a key={sc.id} className="src-chip" href={sc.url} target="_blank" rel="noreferrer" title={sc.name}>{sc.name}</a>) : <span className="kb-fee">未绑定来源</span>}{(row.check_links || []).filter(l => l.search_url).map(l => <a key={`${l.source_id}-s`} className="text-button" href={l.search_url} target="_blank" rel="noreferrer" title={`在 ${l.site} 站内检索：${l.search_query}`}>站内检索该条<ExternalLink size={13} /></a>)}</div>
      {(row.locator?.fields_to_check || []).length > 0 && <div className="va-rule-src"><small>该比对参数</small><strong>{row.locator.fields_to_check.join(' / ')}</strong></div>}
    </div>
    <label className="field"><span>官方文本段落</span><textarea name="vaText" rows={5} maxLength={8000} value={text} onChange={e => setText(e.target.value)} placeholder="粘贴官方来源中与该规则相关的条文 / 税则 / 公告段落…" /><small>建议只贴相关段落，引擎按参数抽取比对。{SAMPLE && <button type="button" className="text-button" onClick={() => setText(SAMPLE)}>填入示例文本</button>}</small></label>
    <div className="lbl-actions"><Button variant="primary" icon={Search} onClick={run} disabled={busy || !text.trim()}>{busy ? '比对中…' : '运行预检'}</Button></div>
    {err && <div className="form-error" role="alert">{err}</div>}
    {result && <>
      <div className={`va-verdict ${result.verdict}`}>
        {result.verdict === 'consistent' ? <CircleCheck size={18} aria-hidden="true" /> : <TriangleAlert size={18} aria-hidden="true" />}
        <div><strong>{result.verdict_label}{result.verdict === 'consistent' ? ' · 建议核验' : result.verdict === 'mismatch' ? ' · 请先复核差异' : ' · 请人工判断'}</strong><p>{result.note}</p></div>
      </div>
      <div className="va-checks">
        {result.checks.map((c, i) => <div key={i} className="va-check">
          {MATCH_ICON[String(c.match)]}
          <div><strong>{c.field}</strong><small>规则值：{c.rule_value}</small>{c.evidence && <span className="va-ev">官方文本：…{c.evidence}…</span>}{c.note && <small>{c.note}</small>}</div>
        </div>)}
      </div>
    </>}
    <div className="modal-actions"><Button type="button" onClick={onClose}>关闭</Button><Button variant="primary" icon={Check} onClick={onVerified}>标记已核验（人工确认）</Button></div>
  </Modal>;
}

/* 法规变更登记（真功能）：官方来源必填 URL，非官方被服务端拦截；登记后即时评估 + 后续拉取持续包含 */
function ChangeFormModal({ owner, onClose, onRegistered }) {
  const [values, setValues] = useState({ title: '', source_name: '', source_url: '', effective_on: '', diff_type: 'label', affected_codes: '', affected_tag: '', summary: '' });
  const [official, setOfficial] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setValues(p => ({ ...p, [k]: v }));
  async function submit(e) {
    e.preventDefault();
    if (!values.title.trim()) { setError('请填写变更标题。'); return; }
    if (!values.source_name.trim()) { setError('请填写来源名称。'); return; }
    if (official && !/^https?:\/\//.test(values.source_url.trim())) { setError('官方来源须填写可追溯 URL（http/https）。'); return; }
    setBusy(true); setError('');
    const r = await registerChangeViaQw({
      title: values.title, source_name: values.source_name, source_url: values.source_url,
      source_kind: official ? 'official' : 'unofficial',
      diff_type: values.diff_type, effective_on: values.effective_on || null,
      affected_codes: values.affected_codes, affected_tags: values.affected_tag ? [values.affected_tag] : [],
      summary: values.summary, market: 'TW',
    }, { owner });
    setBusy(false);
    if (r?.error) { setError(r.error); return; }
    if (!r?.change) { setError('登记失败：引擎未连接，请稍后重试。'); return; }
    const mapped = (r.events || []).map(ev => ({ id: ev.id, title: ev.title, created: ev.created_at || new Date().toISOString(), productIds: ev.affected_product_ids || [], real: true, text: `${ev.impact || ''}${ev.cost_delta_pct != null ? ` 单件落地成本预计变动 ${ev.cost_delta_pct}%。` : ''} 来源：${ev.source_name || '运营录入'}${ev.source_url ? `（${ev.source_url}）` : ''}；生效 ${ev.effective_on || '未公布'}。` }));
    onRegistered(mapped);
  }
  return <Modal title="登记法规变更" onClose={onClose}><form onSubmit={submit}>
    <p className="modal-intro">登记一条真实的法规 / 政策变更（须为官方公开来源）。登记后引擎立即评估其对当前工作区产品的影响，并在后续拉取中持续包含；非官方转载消息会被拦截。</p>
    <div className="form-grid">
      <label className="field span-two"><span>变更标题 <em>*</em></span><input name="chgTitle" value={values.title} onChange={e => set('title', e.target.value)} placeholder="例如：包装食品标示用语加严" maxLength={80} /></label>
      <label className="field"><span>来源名称 <em>*</em></span><input name="chgSourceName" value={values.source_name} onChange={e => set('source_name', e.target.value)} placeholder="例如：卫生福利部食品药物管理署" maxLength={60} /></label>
      <label className="field"><span>来源 URL <em>*</em></span><input name="chgSourceUrl" type="url" value={values.source_url} onChange={e => set('source_url', e.target.value)} placeholder="https://www.fda.gov.tw/..." /></label>
      <label className="field"><span>变更类型</span><select name="chgType" value={values.diff_type} onChange={e => set('diff_type', e.target.value)}><option value="label">标签 / 标示要求</option><option value="rate">关税税率</option><option value="quarantine">检疫要求</option><option value="ssg">SSG 措施</option><option value="procedure">程序性规定</option></select></label>
      <label className="field"><span>生效日期</span><input name="chgEffective" type="date" value={values.effective_on} onChange={e => set('effective_on', e.target.value)} /></label>
      <label className="field"><span>影响 HS 前缀（可选）</span><input name="chgCodes" value={values.affected_codes} onChange={e => set('affected_codes', e.target.value)} placeholder="如 220299，逗号分隔" /></label>
      <label className="field"><span>影响品类（可选）</span><select name="chgTag" value={values.affected_tag} onChange={e => set('affected_tag', e.target.value)}><option value="">不限</option><option value="food">食品饮料</option><option value="cosmetic">化妆品</option><option value="plant_product">植物产品</option><option value="animal_product">动物产品</option><option value="bsmi_mandatory">强制检验品目</option><option value="rf_wireless">无线射频</option></select></label>
      <label className="field span-two"><span>变更概述</span><textarea name="chgSummary" rows={3} maxLength={300} value={values.summary} onChange={e => set('summary', e.target.value)} placeholder="一句话说明变更内容与影响" /></label>
      <label className="field span-two chg-official"><input type="checkbox" checked={official} onChange={e => setOfficial(e.target.checked)} /><span>本条来自官方公开来源（取消勾选将演示拦截边界）</span></label>
    </div>
    {error && <div className="form-error" role="alert">{error}</div>}
    <div className="modal-actions"><Button type="button" onClick={onClose}>取消</Button><Button type="submit" variant="primary" icon={Plus} disabled={busy}>{busy ? '登记中…' : '登记并评估影响'}</Button></div>
  </form></Modal>;
}

const TL_PER = { shipment: '每批重复', product: '产品级一次', importer: '主体级一次' };
const TL_RANGE = (d) => (Array.isArray(d) ? (d[0] === d[1] ? `约 ${d[0]} 天` : `${d[0]}–${d[1]} 天`) : '—');

/* 办理周期构成：把关键路径拆成「串行排队 / 并行准备 / 一次性前置 / 口岸放行」，
   让人看清这个数字是怎么加出来的，而不是系统给定的同一个数。 */
function TimelineDetail({ timeline }) {
  if (!timeline) return <div className="tl-wrap tl-na"><p className="tl-note">预计办理周期：待主管机关确认。当前输入不足以判定适用制度，系统不做天数估算。</p></div>;
  const seg = timeline.segments;
  if (timeline.applicable === false || !seg) {
    return <div className="tl-wrap tl-na"><div className="tl-head"><strong>{timeline.text || '不适用'}</strong></div><p className="tl-note">{timeline.note || '当前结论下不存在可办理的周期口径。'}</p></div>;
  }
  const rows = ['sequential', 'parallel', 'prerequisite'].map((k) => ({ key: k, ...(seg[k] || {}) })).filter((s) => s.items && s.items.length);
  return <div className="tl-wrap">
    <div className="tl-head"><strong>关键路径 {timeline.text}</strong>{timeline.landed_ready_text && <span>到港后可上架：{timeline.landed_ready_text}</span>}</div>
    <div className="tl-rows">{rows.map((s) => <div key={s.key} className={`tl-row tl-${s.key}`}>
      <span className="tl-tag">{s.label}</span>
      <ul>{s.items.map((i) => <li key={i.id}>{i.name}<b>{TL_RANGE(i.days)}</b><em>{TL_PER[i.applies_per] || ''}</em></li>)}</ul>
      <strong className="tl-sum">{s.key === 'sequential' ? `相加 ${TL_RANGE(s.days)}` : `取最长 ${TL_RANGE(s.days)}`}</strong>
    </div>)}</div>
    {seg.port_clearance && <div className="tl-row tl-port"><span className="tl-tag">{seg.port_clearance.label}</span><p>{seg.port_clearance.note}</p><strong className="tl-sum">{TL_RANGE(seg.port_clearance.days)}</strong></div>}
    {seg.shipping && <div className="tl-row tl-ship"><span className="tl-tag">{seg.shipping.label}</span><p>{seg.shipping.note}</p><strong className="tl-sum">另计</strong></div>}
    <p className="tl-note">{timeline.note}</p>
  </div>;
}

function QwResultPanel({ r, product, setModal }) {  const tone = QW_TONE[r.status] || 'slate';
  const checklist = [...(r.conditions || []), ...(r.missing_fields || []).map(m => `待补充：${m}`), ...(r.risks?.notes || []).slice(0, 2)];
  return <section className={`panel result-panel result-${tone}`}>
    <div className="result-top"><div className="result-product"><ProductIcon product={product} size="large" /><div><h2>{product.name}</h2><p>HS {product.hs || '待补充'}<span> / </span>{product.market}</p></div></div><button className="text-button" onClick={() => setModal({ type: 'product', product })}>编辑资料<Settings2 size={15} /></button></div>
    <div className="result-status"><span className={`status-symbol ${tone}`}>{r.status === 'permit_conditional' ? <ShieldCheck size={29} /> : <TriangleAlert size={29} />}</span><div><span className="result-eyebrow">准入结论 · 规则引擎 {r.rule_version}</span><h3>{r.status_label}</h3><p>{r.conclusion}</p></div><Badge tone={tone}>{r.verification?.usable_for_quotation ? '依据已核验' : '参考级结论'}</Badge></div>
    <div className="result-facts"><div><small>申请主体</small><strong>{r.applicant?.requires_local_importer ? '须当地进口商申报' : '可自行申报'}</strong></div><div><small>预计办理周期</small><strong>{r.timeline?.text || '待主管机关确认'}</strong></div><div><small>风险等级</small><strong>{r.risks?.label || '—'}</strong></div><div><small>Session</small><strong>{(r.session_id || '—').slice(0, 18)}</strong></div></div>
    <div className="result-body">
      {r.verification?.warning && <div className="inset-note"><TriangleAlert size={19} /><div><strong>核验警告 · 依据进度 {r.verification.total_rules - r.verification.unverified_rules}/{r.verification.total_rules}</strong><p>{r.verification.warning}</p><button className="text-button" onClick={() => { location.hash = 'verify'; }}>去核验规则<ArrowUpRight size={13} /></button></div></div>}
      {r.execution_variance && <div className="inset-note"><CircleHelp size={19} /><div><strong>执行口径差异</strong><p>{r.execution_variance.note} {r.execution_variance.action}</p></div></div>}
      <TimelineDetail timeline={r.timeline} />
      <h3 className="subheading">需要核验的关键事项</h3>
      <div className="check-list">{checklist.length ? checklist.map((item, i) => <div key={`${item}-${i}`}><span>{count(i + 1)}</span><p>{item}</p><Badge>待核验</Badge></div>) : <p className="body-copy">无附加前置条件。</p>}</div>
      {r.documents?.length > 0 && <>
        <h3 className="subheading">办理书件清单（{r.documents.length} 项 · 来源：规则库）</h3>
        <div className="check-list">{r.documents.slice(0, 10).map((d, i) => <div key={`doc-${i}`}><span>{count(i + 1)}</span><p>{typeof d === 'string' ? d : d.item}</p><Badge>{typeof d === 'object' && d.status ? d.status : '待准备'}</Badge></div>)}</div>
      </>}
      <h3 className="subheading">命中条例（{r.sources?.length || 0} 条，均可追溯）</h3>      {(r.sources || []).slice(0, 8).map((s, i) => <div className="hit-rule" key={`${s.rule_id}-${i}`}>
        <span className="source-ord" aria-hidden="true">{i + 1}</span>
        <div className="hit-rule-body"><strong>{s.title || s.scope || '管制制度'}</strong><small>{s.name} · 规则 {s.rule_id} · {s.verify_status === 'verified' ? '已核验' : '待核验'}</small></div>
        <a className="text-button" href={`#regulations/q/${encodeURIComponent(s.rule_id || '')}`} onClick={e => { e.preventDefault(); location.hash = `regulations/q/${encodeURIComponent(s.rule_id || '')}`; }}>查看条例<ArrowUpRight size={13} /></a>
      </div>)}
      <div className="inset-note"><CircleHelp size={19} /><div><strong>输出边界</strong><p>{r.disclaimer}</p></div></div>
    </div>
  </section>;
}

function QwCostPanel({ r, stale, setModal, product }) {
  const sign = r.currency === 'TWD' ? 'NT$' : '¥';
  const pending = (r.pending_items || []).filter(p => p.severity !== 'info');
  return <section className="panel cost-result" data-stale={stale ? '1' : undefined}>
    <div className="cost-result-header"><div><span className="eyebrow">RULE ENGINE · LANDED COST</span><h2>综合落地成本</h2></div>{stale ? <span className="recalc-badge"><RotateCcw size={13} aria-hidden="true" />参数已变，重算中…</span> : <Badge tone="blue">规则引擎 {r.rule_version}</Badge>}</div>
    {pending.length > 0 && <div className="pending-banner"><TriangleAlert size={17} /><div><strong>本结果不完整 · 待补 {pending.length} 项</strong>{pending.map((p, i) => <p key={i}>{p.label}</p>)}</div></div>}
    <div className="total-cost"><span>{sign}</span>{number(r.total)}<small>{r.currency}</small></div>
    <div className="cost-summary"><div><small>单位落地成本</small><strong>{sign}{number(r.unit_cost)}<span> / 件</span></strong></div><div><small>综合税负率 / CIF</small><strong>{Number(r.effective_tax_rate_pct).toFixed(2)}<span>%</span></strong></div></div>
    {r.rate_basis && <div className="rate-basis-note"><Lock size={14} aria-hidden="true" /><span>{r.rate_basis.mode === 'knowledge_base_rates'
      ? `规则库税率口径：关税 ${r.rate_basis.duty_rate_pct}% · 营业税 ${r.rate_basis.vat_rate_pct}%${r.rate_basis.matched_tariff ? ` · 税则 ${r.rate_basis.matched_tariff.code}（${r.rate_basis.matched_tariff.verify_status === 'verified' ? '已核验' : '待核验'}）` : ''}；表单中的假设税率未参与计算。`
      : `手工税率口径：关税 ${r.rate_basis.duty_rate_pct}% · 营业税 ${r.rate_basis.vat_rate_pct}%，均来自表单输入，引擎未查规则库。`}</span></div>}
    <div className="cost-lines">{(r.items || []).map(it => { const lineSign = it.currency && it.currency !== r.currency ? 'NT$' : sign; return <div key={it.name} className={it.fx_unconverted ? 'line-fx' : ''}><div><strong>{it.name}{it.fx_unconverted && <em className="fx-tag">{it.currency} 计征 · 未换算</em>}</strong><small>{it.formula}</small></div><span>{lineSign}{number(it.amount)}</span></div>; })}</div>
    {pending.length > 0 && <button className="text-button pending-action" onClick={() => setModal?.({ type: 'product', product })}><Settings2 size={14} />去补充产品资料（成分 / 液体总量等）</button>}
    {r.quote && <div className="preview-boundary"><Sparkles size={14} />建议报价带 {sign}{number(r.quote.low)} – {sign}{number(r.quote.high)}（已含缓冲 {r.quote.buffer_pct}%）</div>}
    {r.verification?.warning && <div className="inset-note"><TriangleAlert size={19} /><div><strong>核验警告 · 依据进度 {r.verification.total_rules - r.verification.unverified_rules}/{r.verification.total_rules}</strong><p>{r.verification.warning}</p><button className="text-button" onClick={() => { location.hash = 'verify'; }}>去核验规则<ArrowUpRight size={13} /></button></div></div>}
    <div className="preview-boundary">未计入项 {r.not_included?.length || 0} 条：{(r.not_included || []).slice(0, 3).join('；')} 等</div>
  </section>;
}

function QwComparePanel({ base, stressed }) {
  return <section className="panel compare-panel"><SectionTitle title="报价前，比较两个情景" description="规则引擎实时测算 · 非固定样例" icon={Layers3} />
    <div className="table-scroll"><table className="comparison-table"><thead><tr><th>测算情景</th><th>综合成本</th><th>单位成本</th><th>较基础情景增加</th><th>备注</th></tr></thead><tbody>
      <tr><td>SSG 未触发</td><td>{number(base.total)}</td><td>{number(base.unit_cost)}</td><td>—</td><td><Badge tone="blue">规则引擎</Badge></td></tr>
      <tr><td>SSG 触发加征{base.ssg_applied_rate ? ` ${base.ssg_applied_rate}%` : ''}</td><td>{number(stressed.total)}</td><td>{number(stressed.unit_cost)}</td><td className="amount-warning">+{number(stressed.total - base.total)}</td><td><Badge tone="amber">加征情景</Badge></td></tr>
    </tbody></table></div>
    <div className="preview-boundary">两情景同源同口径，仅 SSG 触发状态不同；未含通路毛利与仓配成本。</div>
  </section>;
}

createRoot(document.getElementById('root')).render(<App />);
