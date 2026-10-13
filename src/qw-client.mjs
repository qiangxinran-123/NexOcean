/**
 * 千问办公核心引擎接入客户端（React 前端唯一新增依赖）
 * ------------------------------------------------------------------
 * 约定：
 *  1) 只调用 /api/v1/* 契约接口（字段名与 docs/API-CONTRACT.md 对齐）；
 *  2) 任何失败（无后端、超时、非 2xx）一律返回 null，页面回落到原有演示数据，
 *     保证 React 原型在纯静态托管下行为与改造前完全一致；
 *  3) 不在前端做任何税费或准入计算——数字只来自服务端规则引擎；
 *  4) 探测失败不缓存：首屏失败立刻降级为「演示模式」，随后按 2s / 5s 自动重试，
 *     任一次成功即升级为「核心引擎已接入」，避免冷启动把整场演示锁死在静态样例；
 *  5) 轻量多租户：所有请求带 x-workspace 头，服务端按工作区隔离产品档案。
 *     这是数据隔离，不是身份鉴权——公开地址上任何人都可自称某个工作区。
 */

const TIMEOUT_MS = 4000;
const RETRY_DELAYS = [2000, 5000];
const DEFAULT_OWNER = 'demo-workspace';

let healthCache; /* 只缓存成功结果；失败允许下次重新探测 */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/* HTTP 头只接受 ISO-8859-1：中文企业名必须编码后发送，否则浏览器直接抛 TypeError、整个请求失败。
 * 服务端 ownerOf() 会先 decodeURIComponent 再清洗，两端对称。 */
const ownerHeader = (owner) => ({ 'x-workspace': encodeURIComponent(String(owner || '').trim().slice(0, 64) || DEFAULT_OWNER) });

/**
 * 探测核心引擎。
 * @param {boolean} force 忽略已成功缓存，重新探测（用于「重新连接引擎」按钮）
 * @param {(status:'online'|'offline', health:object|null)=>void} onUpdate 每次尝试后回调，
 *        让页面立刻显示降级状态，并在后台重试成功时自动升级
 */
export async function probeQw({ force = false, onUpdate = null } = {}) {
  if (!force && healthCache) return healthCache;
  let health = await get('/api/v1/health');
  if (health) healthCache = health;
  onUpdate?.(health ? 'online' : 'offline', health || null);
  if (health) return health;
  for (const delay of RETRY_DELAYS) {
    await sleep(delay);
    health = await get('/api/v1/health');
    if (health) { healthCache = health; onUpdate?.('online', health); return health; }
    onUpdate?.('offline', null);
  }
  return null;
}

/** 准入评估：直接接受产品档案对象（与交接 JSON 的 product 字段同构） */
export async function assessViaQw(product, attributes = [], { owner } = {}) {
  if (!product) return null;
  return post('/api/v1/admission', {
    product: {
      name: product.name, category: product.category, hs: product.hs,
      market: product.market, origin: product.origin, specs: product.specs,
    },
    attributes,
  }, owner);
}

/**
 * 成本测算：接受原型成本页的 costInputs（value/quantity/freight/insurance/dutyRate/vatRate/fee/ssgRate）
 * @param {boolean} useKbRates 是否采用规则库税率。缺省按「HS≥4 位」自动判断；
 *        显式传 false 即手工模式（表单税率生效），传 true 则表单税率被规则库覆盖。
 */
export async function costViaQw(costInputs, product, { ssgMode, useKbRates, owner } = {}) {
  const hs = product?.hs ? String(product.hs).replace(/\D/g, '') : '';
  return post('/api/v1/cost', {
    product: product ? { name: product.name, category: product.category, hs, market: product.market, origin: product.origin } : undefined,
    costInputs,
    ssg_mode: ssgMode,
    /* 无 HS 编码时引擎不猜测税率，退回用户假设税率（与原型语义一致），并明确标注来源为手工输入 */
    use_kb_rates: useKbRates ?? (hs.length >= 4),
  }, owner);
}

/** 法规变更影响：返回契约事件列表与被拦截的非官方条目 */
export async function eventsViaQw(products = [], { owner } = {}) {
  return post('/api/v1/regulation-events', { products }, owner);
}

/** 全球市场准入扫描：一个产品 × 规则库登记的全部市场（反向查询） */
export async function scanMarketsViaQw(product, { owner } = {}) {
  if (!product?.name) return null;
  return post('/api/v1/market-scan', {
    product: {
      id: product.id, name: product.name, category: product.category, hs: product.hs,
      origin: product.origin, specs: product.specs,
    },
  }, owner);
}

export async function sourcesViaQw({ owner } = {}) {
  return get('/api/v1/sources', owner);
}

/* ---------------- 税则库 / 法规库（只读浏览） ---------------- */
export async function tariffViaQw({ owner } = {}) {
  return get('/api/v1/kb/tariff-items', owner);
}

export async function regulationsViaQw({ owner } = {}) {
  return get('/api/v1/kb/regulations', owner);
}

/* ---------------- 产品档案（工作区隔离，upsert 语义） ---------------- */
export async function productsViaQw({ owner } = {}) {
  return get('/api/v1/products', owner);
}

export async function saveProductViaQw(product, { owner } = {}) {
  if (!product?.name) return null;
  return post('/api/v1/products', {
    id: product.id, name: product.name, category: product.category, hs: product.hs,
    market: product.market, origin: product.origin, specs: product.specs,
    scenario: product.scenario, color: product.color, updated: product.updated,
    cost_value: product.cost_value === '' ? null : product.cost_value,
    cost_quantity: product.cost_quantity === '' ? null : product.cost_quantity,
  }, owner);
}

export async function deleteProductViaQw(id, { owner } = {}) {
  if (!id) return null;
  return del(`/api/v1/products/${encodeURIComponent(id)}`, owner);
}

/* ---------------- 规则核验工作台 ---------------- */
export async function verifyQueueViaQw({ owner } = {}) {
  return get('/api/v1/kb/verify-queue', owner);
}

export async function verifyAssistViaQw({ kind, code, official_text }, { owner } = {}) {
  return post('/api/v1/kb/verify-assist', { kind, code, official_text }, owner);
}

export async function verifyRuleViaQw({ kind, code, verify_status, note }, { owner } = {}) {
  return post('/api/v1/kb/verify', { kind, code, verify_status, verifier: owner, note }, owner);
}

/* ---------------- 法规变更登记（返回 {error} 而非 null，便于展示拦截原因） ---------------- */
export async function registerChangeViaQw(change, { owner } = {}) {
  try {
    const r = await fetch('/api/v1/regulation-changes', {
      method: 'POST',
      signal: AbortSignal.timeout(8000),
      headers: { 'content-type': 'application/json', 'x-client': 'tradepilot-react', ...ownerHeader(owner) },
      body: JSON.stringify({ change }),
    });
    if (!r.ok) {
      let msg = `登记失败（HTTP ${r.status}）`;
      try { msg = (await r.json()).error?.message || msg; } catch {}
      return { error: msg };
    }
    return await r.json();
  } catch {
    return { error: '登记失败：网络异常或引擎未连接' };
  }
}

/* ---------------- 标签与文案合规扫描（F1-3） ---------------- */
export async function labelScanViaQw({ text, market = 'TW', tags = ['food'] }, { owner } = {}) {
  if (!text?.trim()) return null;
  return post('/api/v1/label-scan', { text, market, tags }, owner);
}

/* ---------------- 竞品参考 / 出海方案报告 ---------------- */
export async function competitorsViaQw(product, { owner } = {}) {
  if (!product?.name) return null;
  return post('/api/v1/competitors', { product: { name: product.name, hs: product.hs, category: product.category, specs: product.specs, market: product.market || 'TW' } }, owner);
}

export async function reportViaQw({ product, costInputs, useKbRates }, { owner } = {}) {
  if (!product?.name) return null;
  return post('/api/v1/report', {
    product: { id: product.id, name: product.name, category: product.category, hs: product.hs, market: product.market, origin: product.origin, specs: product.specs },
    costInputs, use_kb_rates: useKbRates,
  }, owner);
}

/* ---------------- 内部 ---------------- */
async function get(path, owner) {
  try {
    const r = await fetch(path, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { 'x-client': 'tradepilot-react', ...ownerHeader(owner) } });
    if (!r.ok) return null;
    return r.json();
  } catch {
    return null;
  }
}

async function post(path, body, owner) {
  try {
    const r = await fetch(path, {
      method: 'POST',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'content-type': 'application/json', 'x-client': 'tradepilot-react', ...ownerHeader(owner) },
      body: JSON.stringify(body || {}),
    });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

async function del(path, owner) {
  try {
    const r = await fetch(path, { method: 'DELETE', signal: AbortSignal.timeout(TIMEOUT_MS), headers: { 'x-client': 'tradepilot-react', ...ownerHeader(owner) } });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}
