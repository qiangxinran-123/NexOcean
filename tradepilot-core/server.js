/**
 * 知海 TradePilot · 核心引擎服务（零依赖 Node 22）
 * ------------------------------------------------------------------
 * 职责：静态托管前端 + 提供业务 API + 持久化 + 运营后台 + LLM 网关。
 * 关键设计：所有业务结论由 engine/*.mjs 计算，本文件只做编排与存储，
 *          不在服务端另写一套算法，避免前后端口径漂移。
 */

import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createCore } from './engine/index.mjs';
import { createRepo, COLLECTIONS } from './store/repo.mjs';
import { AppError, makeId } from './engine/util.mjs';
import { buildJourneyReportHtml } from './engine/report.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8081);
const HOST = process.env.HOST || '0.0.0.0';
const WEB_DIR = path.join(__dirname, 'web');            // 既有 React 前端构建产物
const CONSOLE_DIR = path.join(__dirname, 'console');    // 核心引擎自带控制台
const ENGINE_DIR = path.join(__dirname, 'engine');      // 共享引擎模块

/** 数据目录候选：显式配置 → 系统临时目录 → 应用目录 →（都不可写时由 repo 退化为内存） */
function resolveDataDir() {
  const candidates = [process.env.DATA_DIR, path.join(os.tmpdir(), 'tradepilot-core-data'), path.join(__dirname, 'data')].filter(Boolean);
  for (const dir of candidates) {
    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, '.writable'), '1');
      return dir;
    } catch { /* 尝试下一个候选 */ }
  }
  return candidates[candidates.length - 1];
}
const DATA_DIR = resolveDataDir();

const repo = createRepo({ dataDir: DATA_DIR });
console.log(`[boot] repo driver = ${repo.mode}${repo.dataDir ? ` (${repo.dataDir})` : ''}`);

let core = null;
let overrideCount = 0;

async function buildCore() {
  const rows = await repo.list('overrides', { limit: 5000 }).catch(() => []);
  const overrides = {};
  for (const r of rows) {
    const kind = r.kind;
    if (!kind) continue;
    overrides[kind] = overrides[kind] || [];
    overrides[kind].push(r.record || {});
  }
  overrideCount = rows.length;
  core = createCore({
    overrides,
    gateway: {
      baseUrl: process.env.LLM_BASE_URL,
      apiKey: process.env.LLM_API_KEY,
      model: process.env.LLM_MODEL,
      rpm: process.env.LLM_RPM,
    },
    onLlmCall: (rec) => {
      repo.insert('llm_calls', { id: makeId('LLM'), created_at: new Date().toISOString(), ...rec }).catch(() => {});
    },
  });
  console.log(`[boot] core ready · llm=${core.meta.llm_mode} · rules=${core.meta.rule_version} · overrides=${overrideCount}`);
  return core;
}

/* ----------------------------- 工具 ----------------------------- */
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon', '.map': 'application/json; charset=utf-8', '.woff2': 'font/woff2',
};

function send(res, status, body, headers = {}) {
  const buf = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers });
  res.end(buf);
}

const sendHtml = (res, html, status = 200) => send(res, status, html, { 'content-type': 'text/html; charset=utf-8' });

function readBody(req, limit = 1_500_000) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new AppError('请求体过大。', 'PAYLOAD_TOO_LARGE')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(new AppError('请求体不是合法 JSON。', 'BAD_JSON')); }
    });
    req.on('error', reject);
  });
}

/* 工作区（轻量多租户）：请求头 x-workspace / x-owner 指定企业名，缺省落到公共演示区。
 * 客户端一律 encodeURIComponent 后发送（HTTP 头不允许非 ASCII，中文企业名会直接被浏览器拒绝），
 * 这里先解码再清洗。只做「数据隔离」，不做「身份鉴权」——公开地址上任何人都可以自称某个 owner，
 * 因此这里承载的只能是演示数据，不得放企业敏感资料；正式多用户须接入账号体系与数据库。 */
const decodeOwner = (v) => { try { return decodeURIComponent(String(v)); } catch { return String(v); } };
const sanitizeOwner = (v) => decodeOwner(v || '').replace(/[\u0000-\u001f<>"'`]/g, '').trim().replace(/\s+/g, ' ').slice(0, 64);
const ownerOf = (req) => sanitizeOwner(req.headers['x-workspace'] || req.headers['x-owner']) || 'demo-workspace';

/* 简易限流：每 IP 每分钟 240 次写操作 */
const buckets = new Map();
function rateLimited(key, capacity = 240, perMs = 60_000) {
  const nowMs = Date.now();
  const b = buckets.get(key) || { n: 0, reset: nowMs + perMs };
  if (nowMs > b.reset) { b.n = 0; b.reset = nowMs + perMs; }
  b.n += 1;
  buckets.set(key, b);
  if (buckets.size > 5000) buckets.clear();
  return b.n > capacity;
}

async function audit(req, action, target, after = null) {
  await repo.insert('audit', {
    id: makeId('AUD'), owner: ownerOf(req), actor: req.headers['x-actor'] || ownerOf(req),
    action, target: String(target || '').slice(0, 120), after, created_at: new Date().toISOString(),
  }).catch(() => {});
}

/* ----------------------------- 路由 ----------------------------- */
const routes = [];
const on = (method, pattern, handler) => routes.push({ method, pattern, handler });

on('GET', /^\/api\/health$/, async () => ({
  ok: true, service: 'tradepilot-core', ...core.meta, repo_mode: repo.mode, overrides: overrideCount, kb: core.kb.stats(),
  note: '本接口不含 /healthz（该路径由 Page 网关保留）。',
}));

on('GET', /^\/api\/meta$/, async () => ({
  rule_version: core.meta.rule_version,
  data_as_of: core.meta.data_as_of,
  disclaimer: core.meta.disclaimer,
  llm_mode: core.meta.llm_mode,
  repo_mode: repo.mode,
  markets: core.kb.raw.markets.map((m) => ({ code: m.code, name: m.name, currency: m.currency, coverage: m.coverage, vat_rate: m.vat_rate, note: m.note })),
  ports: core.kb.raw.ports,
  attributes: core.kb.raw.attributeTagMap,
  tariff_items: core.kb.raw.tariffItems.map((t) => ({ code: t.code, name: t.name, duty_rate: t.duty_rate, tags: t.tags, verify_status: t.verify_status })),
  ssg_items: core.kb.raw.ssgSnapshots.map((s) => ({ code: s.code, name: s.name, unit: s.unit, usage_pct: Math.round((s.accumulated / s.trigger_volume) * 1000) / 10, snapshot_date: s.snapshot_date })),
  sources: core.kb.raw.sources,
  kb: core.kb.stats(),
  kb_stats: core.kb.stats(),
  not_included: core.kb.raw.notIncluded,
  demo_changes: core.demoChangeFeed,
}));

on('POST', /^\/api\/admission$/, async (req, res, m, body) => {
  const result = await core.assess({ ...body, session_id: body.session_id || req.headers['x-session-id'] || null });
  const id = makeId('ASM');
  await repo.insert('assessments', {
    id, owner: ownerOf(req), product_id: body.product_id || null, name: body.name || '',
    market: body.market || 'TW', hs: body.hs || '', verdict: result.verdict.code, risk_level: result.risk?.level || 'unknown',
    rule_version: result.rule_version, payload: result, created_at: result.generated_at,
  }).catch(() => {});
  send(res, 200, { ...result, record_id: id });
});

on('POST', /^\/api\/cost$/, async (req, res, m, body) => {
  const result = await core.cost({ ...body, session_id: body.session_id || req.headers['x-session-id'] || null });
  const id = makeId('CST');
  await repo.insert('costs', {
    id, owner: ownerOf(req), product_id: body.product_id || null, hs: body.hs || '', market: body.market || 'TW',
    currency: result.market.currency, effective_tax_rate_pct: result.totals.effective_tax_rate_pct,
    unit_landed_cost: result.totals.unit_landed_cost, rule_version: result.rule_version, payload: result, created_at: result.generated_at,
  }).catch(() => {});
  send(res, 200, { ...result, record_id: id });
});

on('POST', /^\/api\/compare$/, async (req, res, m, body) => send(res, 200, core.compare(body)));
on('POST', /^\/api\/ssg$/, async (req, res, m, body) => send(res, 200, core.ssg(body)));
on('POST', /^\/api\/label$/, async (req, res, m, body) => send(res, 200, core.label({ ...body, session_id: body.session_id || req.headers['x-session-id'] || null })));

on('POST', /^\/api\/monitor$/, async (req, res, m, body) => {
  const products = body.products || await repo.list('products', { owner: ownerOf(req) });
  const changes = body.changes || core.demoChangeFeed;
  const result = core.monitor({ changes, products, defaultCostInputs: body.defaultCostInputs || null });
  for (const msg of result.messages) {
    await repo.insert('messages', { id: makeId('MSG'), owner: ownerOf(req), read_at: null, source: 'regulation_monitor', ...msg }).catch(() => {});
  }
  send(res, 200, result);
});

on('GET', /^\/api\/demo-changes$/, async () => ({ changes: core.demoChangeFeed }));

/* ============================ v1 契约接口 ============================
 * 字段名严格对齐前端仓库 docs/API-CONTRACT.md 的「建议输出字段」，
 * 使既有 React 页面无需猜测即可绑定。引擎原生结果仍保留在 /api/*。
 * 规则缺失一律 status='undetermined' / status_label='无法判定'，不推测。
 */
on('GET', /^\/api\/v1\/health$/, async () => ({
  ok: true, service: 'tradepilot-core', contract: 'v1',
  rule_version: core.meta.rule_version, data_as_of: core.meta.data_as_of,
  llm_mode: core.meta.llm_mode, repo_mode: repo.mode,
  disclaimer: core.meta.disclaimer, unverified_warning: core.meta.unverified_warning,
}));

on('GET', /^\/api\/v1\/sources$/, async () => ({
  sources: core.kb.raw.sources.map((s) => ({ id: s.id, name: s.name, category: s.scope, url: s.url, note: '官方查询入口；尚未绑定具体条款', status: s.status, last_checked: s.last_checked })),
  rule_version: core.meta.rule_version, disclaimer: core.meta.disclaimer,
}));

/* ---------- v1 产品档案（工作区隔离） ----------
 * 前端字段用 camelCase（cost_value/cost_quantity 例外，保持与表单同名），仓储字段用 snake_case，
 * 这里做双向映射，保证 React 端只调用 /api/v1/* 一条口径。
 * POST 采用 upsert 语义：浏览器本地档案首次同步时可重复提交而不产生副本。 */
const SCENARIOS = ['conditional', 'allowed', 'denied', 'unknown'];
const numOrNull = (v) => (v === '' || v === null || v === undefined ? null : (Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : null));
const toV1Product = (r) => ({
  id: r.id, name: r.name || '', category: r.category || '', hs: r.hs || '', market: r.market || '中国台湾地区',
  origin: r.origin || '中国大陆', specs: r.specs || '', scenario: SCENARIOS.includes(r.scenario) ? r.scenario : 'unknown',
  color: r.color || 'blue', cost_value: r.cost_value ?? null, cost_quantity: r.cost_quantity ?? null,
  updated: r.updated || String(r.created_at || '').slice(0, 10), created_at: r.created_at || null, updated_at: r.updated_at || null,
});
const persistenceNote = () => (repo.mode === 'supabase'
  ? '产品档案保存在数据库，可跨设备访问。'
  : repo.mode === 'jsonfile'
    ? '产品档案保存在托管实例的本地文件；实例重启或重新发布会清空，仅作演示用途，不含账号鉴权。'
    : '产品档案仅保存在进程内存，重启即清空。');

on('GET', /^\/api\/v1\/products$/, async (req) => {
  const owner = ownerOf(req);
  const rows = await repo.list('products', { owner, limit: 500 });
  return { items: rows.map(toV1Product), owner, count: rows.length, repo_mode: repo.mode, persistence_note: persistenceNote() };
});

on('POST', /^\/api\/v1\/products$/, async (req, res, m, body) => {
  const owner = ownerOf(req);
  const id = String(body.id || makeId('PRD')).replace(/[^\w.-]/g, '').slice(0, 64) || makeId('PRD');
  const rec = {
    id, owner,
    name: String(body.name || '').slice(0, 120),
    category: String(body.category || '').slice(0, 60),
    hs: String(body.hs || '').replace(/\D/g, '').slice(0, 11),
    market: String(body.market || '中国台湾地区').slice(0, 40),
    origin: String(body.origin || '中国大陆').slice(0, 40),
    specs: String(body.specs || '').slice(0, 2000),
    scenario: SCENARIOS.includes(body.scenario) ? body.scenario : 'unknown',
    color: String(body.color || 'blue').slice(0, 12),
    cost_value: numOrNull(body.cost_value),
    cost_quantity: numOrNull(body.cost_quantity),
    updated: String(body.updated || new Date().toISOString().slice(0, 10)).slice(0, 10),
    created_at: new Date().toISOString(),
  };
  if (!rec.name) throw new AppError('产品名称不能为空。', 'VALIDATION');
  if (rec.hs && rec.hs.length < 4) throw new AppError('HS 编码至少 4 位，或留空由系统标记为待补充。', 'VALIDATION');
  const exists = await repo.get('products', id, owner).catch(() => null);
  const saved = exists
    ? await repo.update('products', id, { ...rec, created_at: exists.created_at || rec.created_at }, owner)
    : await repo.insert('products', rec);
  await audit(req, exists ? 'upsert_product_v1' : 'create_product_v1', id, { name: rec.name, hs: rec.hs });
  send(res, exists ? 200 : 201, { product: toV1Product(saved), owner, repo_mode: repo.mode, upserted: !!exists });
});

on('PUT', /^\/api\/v1\/products\/([\w.-]+)$/, async (req, res, m, body) => {
  const owner = ownerOf(req);
  const patch = { ...body };
  for (const k of ['id', 'owner', 'created_at']) delete patch[k];
  if (patch.hs !== undefined) patch.hs = String(patch.hs || '').replace(/\D/g, '').slice(0, 11);
  if (patch.scenario !== undefined && !SCENARIOS.includes(patch.scenario)) delete patch.scenario;
  if (patch.cost_value !== undefined) patch.cost_value = numOrNull(patch.cost_value);
  if (patch.cost_quantity !== undefined) patch.cost_quantity = numOrNull(patch.cost_quantity);
  patch.updated_at = new Date().toISOString();
  const rec = await repo.update('products', m[1], patch, owner);
  if (!rec) throw new AppError('产品档案不存在，或不属于当前工作区。', 'NOT_FOUND');
  await audit(req, 'update_product_v1', m[1], patch);
  send(res, 200, { product: toV1Product(rec), owner });
});

on('DELETE', /^\/api\/v1\/products\/([\w.-]+)$/, async (req, res, m) => {
  const owner = ownerOf(req);
  const gone = await repo.remove('products', m[1], owner);
  if (!gone) throw new AppError('产品档案不存在，或不属于当前工作区。', 'NOT_FOUND');
  await audit(req, 'delete_product_v1', m[1]);
  send(res, 200, { ok: true, owner });
});

/* ---------- v1 税则库 / 法规库（只读浏览，数据同源规则库） ---------- */
on('GET', /^\/api\/v1\/kb\/tariff-items$/, async () => ({
  items: core.kb.raw.tariffItems.map((t) => ({
    code: t.code, name: t.name, tags: t.tags || [],
    duty_type: t.duty_type, duty_rate: t.duty_rate,
    ssg_rate: t.ssg?.rate ?? null,
    excise: t.excise ? { name: t.excise.name, mode: t.excise.mode } : null,
    levy: t.levy ? { name: t.levy.name, rate: t.levy.rate } : null,
    verify_status: t.verify_status, source_ids: t.source_ids || [],
  })),
  count: core.kb.raw.tariffItems.length,
  rule_version: core.meta.rule_version, data_as_of: core.meta.data_as_of,
  disclaimer: core.meta.disclaimer,
}));

on('GET', /^\/api\/v1\/kb\/regulations$/, async () => ({
  items: core.kb.raw.regimes.map((r) => ({
    id: r.id, name: r.name, agency: r.agency,
    applies_to: r.applies_to?.any_tags || ['*'],
    can_mainland_apply: r.applicant_rule?.can_mainland_apply ?? false,
    requires_local_importer: r.applicant_rule?.requires_local_importer ?? true,
    applicant_note: r.applicant_rule?.note || '',
    documents: r.documents || [],
    duration_days: r.duration_days || null, fee_note: r.fee_note || '',
    legal_basis: (r.legal_basis || []).map((b) => ({ title: b.title, article: b.article, verify_status: b.verify_status })),
    risk: r.risk || '', source_ids: r.source_ids || [],
    verify_status: r.legal_basis?.[0]?.verify_status || 'needs_verification',
  })),
  count: core.kb.raw.regimes.length,
  rule_version: core.meta.rule_version, data_as_of: core.meta.data_as_of,
  disclaimer: core.meta.disclaimer,
}));

/* ---------- v1 竞品参考（公开渠道检索快照，非实时爬取） ---------- */
on('POST', /^\/api\/v1\/competitors$/, async (req, res, m, body) => {
  const product = body.product || body;
  const mkt = core.kb.findMarket(product?.market || 'TW');
  const marketCode = mkt ? mkt.code : String(product?.market || 'TW').toUpperCase();
  const r = core.kb.findCompetitors({ hs: product?.hs, category: product?.category, tags: ['food'], name: product?.name, specs: product?.specs, market: marketCode });
  const withPerLiter = (c) => ({ ...c, twd_per_liter: c.volume_liters ? Math.round(c.price_twd[1] / c.volume_liters) : null, local_per_liter: c.volume_liters && c.price_local ? Math.round(c.price_local[1] / c.volume_liters * 100) / 100 : null });
  const lvlLabel = { subcategory: `已按细分品类（${r.subcategory_label}）匹配`, text: '已按品名相似度匹配到直接竞品', category: '未识别出细分品类或相似竞品，按 HS 品类粗匹配（在产品资料写明品类关键词或更完整的品名可匹配更准）' };
  const fxNote = marketCode !== 'TW' ? '非台湾市场价格为当地渠道本地币种快照，TWD 列为参考折算（汇率未核验）；价格带与每升单价以本地币种为准。' : '';
  send(res, 200, {
    items: r.items.map(withPerLiter),
    direct: r.direct.map(withPerLiter),
    substitutes: r.substitutes.map(withPerLiter),
    match_level: r.match_level, subcategory: r.subcategory,
    market: marketCode, market_name: mkt ? mkt.name : marketCode,
    known_category_words: r.known_category_words || [],
    band: r.band, band_direct: r.band_direct, band_all: r.band_all, count: r.count,
    retrieved_dates: [...new Set(r.items.map((c) => c.retrieved_at))],
    match_reasons: r.direct.map((c) => ({ id: c.id, reason: c.match_reason })),
    note: `${lvlLabel[r.match_level] || ''}：直接竞品 ${r.direct.length} 条、替代品 ${r.substitutes.length} 条。价格为公开零售渠道检索快照（非实时爬取），全部待核验；价格带按每升单价归一。${fxNote}`,
    disclaimer: core.meta.disclaimer,
  });
});

/* ---------- v1 标签与文案合规扫描（F1-3，供前端标签自查） ---------- */
on('POST', /^\/api\/v1\/label-scan$/, async (req, res, m, body) => {
  const text = String(body.text || '');
  if (!text.trim()) throw new AppError('请粘贴需要检查的标签或文案文本。', 'VALIDATION');
  const r = core.label({ text, market: body.market || 'TW', tags: body.tags || ['food'] });
  send(res, 200, {
    passed: !(r.hits || []).length,
    summary: r.summary,
    hits: (r.hits || []).map((h) => ({
      rule_id: h.rule_id, rule_name: h.rule_name, severity: h.severity,
      matched: h.matched, why: h.why, suggestion: h.suggestion || null,
      legal_basis: h.legal_basis || [], caveat: h.caveat || null,
    })),
    checked_at: r.generated_at,
    rule_version: r.rule_version,
    limitations: r.limitations,
    disclaimer: r.disclaimer,
  });
});

/* ---------- v1 规则核验工作台：对照官方来源逐条核验，核验后结论自动升级 ---------- */
const VERIFY_KIND_META = [
  { kind: 'tariffItems', key: 'verify_key', label: '税则条目' },
  { kind: 'regimes', key: 'id', label: '管制制度' },
  { kind: 'labelRules', key: 'id', label: '标签规则' },
  { kind: 'ssgSnapshots', key: 'code', label: 'SSG 快照' },
  { kind: 'adminFees', key: 'id', label: '口岸规费' },
  { kind: 'ports', key: 'code', label: '口岸参数' },
];
const VERIFY_KEY_OF = Object.fromEntries(VERIFY_KIND_META.map((k) => [k.kind, k.key]));
const LEAD_PHASE_LABEL = { sequential: '占关键路径（串行相加）', parallel: '并行准备（不叠加）', prerequisite: '一次性前置（长期复用）' };

/* ------------------------------------------------------------------ */
/* 核验定位三要素：站点 → 站内检索式 → 该比对的参数                      */
/* ------------------------------------------------------------------ */
/* 目的很实在：核验人不必打开官网首页再自己搜一遍。                      */
/* 检索式刻意用通用搜索引擎的 site: 限定到该主管机关域名，而不是写死官方 */
/* 站内检索端点——各家端点格式不同且会改版，写死深链反而是更大的幻觉源；  */
/* 这里只承诺「限定在该站 + 该条目的编码与法规名」。                     */
const hostOf = (u) => { try { return new URL(u).hostname; } catch (e) { return ''; } };
const cleanBasis = (s) => String(s || '').replace(/[（(][^）)]*(待核验|待补录|待确认)[^）)]*[）)]/g, '').trim();
/* 站内检索关键词：只有税则号/SSG 号/口岸码是官方可搜的编码；
   RG-FOOD-01、LB-03 这类是我们自己的内部 ID，拿去官网搜等于搜不到，必须排除。 */
const OFFICIAL_CODE_KINDS = new Set(['tariffItems', 'ssgSnapshots', 'ports']);
const nameWords = (r) => String(r.name || r.title || '').replace(/[（(].*$/, '').trim().slice(0, 30);
/* 「到哪个表/页面找」——指引性文案（不是法条引用，故不含任何税率或条号断言） */
const DOC_HINT = {
  tariffItems: (r) => `进口税则查询页：输入税号 ${r.code}，比对「普通税率 / 优惠税率」栏位`,
  ssgSnapshots: (r) => `SSG 特别防卫措施公告表：找税号 ${r.code} 列的加征税率与累积量`,
  regimes: (r) => `下列法规正文：核对义务性质、申请主体与办理时限`,
  labelRules: () => `标示 / 广告专法的标示事项与罚则条文`,
  adminFees: (r) => `规费表：核对「${nameWords(r)}」的金额与计费单位`,
  ports: (r) => `该关别通关时效与查验率公告：${nameWords(r)}`,
};
const CHECK_FIELDS = {
  tariffItems: (r) => [`关税税率 ${r.duty_rate}%`, r.ssg ? `SSG 加征 ${r.ssg.rate}%` : '本编码无 SSG', r.excise ? `货物税：${r.excise.name}` : '无从量货物税'],
  regimes: (r) => [`主管机关 ${r.agency || '—'}`, `义务性质 ${r.obligation || '—'}`, `办理周期 ${r.duration_days ? `${r.duration_days[0]}–${r.duration_days[1]} 天` : '—'}`, `周期角色 ${LEAD_PHASE_LABEL[r.lead_phase] || '串行关键路径'}`, `是否须当地进口商 ${r.applicant_rule?.requires_local_importer ? '是' : '否'}`],
  labelRules: (r) => [`违规模式 ${String(r.pattern || r.detector || '—').slice(0, 40)}`, `严重度 ${r.severity || '—'}`],
  ssgSnapshots: (r) => [`SSG 税率 ${r.ssg_rate}%`, `快照日期 ${r.snapshot_date || '—'}`, `累积量/配额 ${r.accumulated ?? r.quantity ?? '—'}`],
  adminFees: (r) => [`金额 ${r.amount} ${r.currency || 'TWD'}`, `计费单位 ${r.per || '每票'}`],
  ports: (r) => [`通关天数 ${(r.clearance_days || []).join('–')}`, `查验强度 ${r.inspection_intensity || '—'}`, `操作费 ${r.handling_per_teu ?? r.air_per_100kg ?? '—'}`],
};
function buildLocator(kind, code, r) {
  const bases = [...(r.legal_basis || []), ...(r.basis || [])];
  const titles = [...new Set(bases.map((b) => cleanBasis(b.title)).filter(Boolean))];
  const articles = [...new Set(bases.map((b) => cleanBasis(b.article)).filter(Boolean))];
  const fields = (CHECK_FIELDS[kind] || (() => []))(r).filter(Boolean);
  return {
    rule_code: code,
    legal_titles: titles, articles,
    fields_to_check: fields,
    locate_hint: (DOC_HINT[kind] || (() => ''))(r) || '',
    search_query: [OFFICIAL_CODE_KINDS.has(kind) ? (r.code || code) : '', nameWords(r), titles[0] || ''].filter(Boolean).join(' ').slice(0, 90),
  };
}
const linksFor = (srcs, q) => (srcs.length ? srcs : [{ id: null, name: '未指定来源（该规则缺 source_ids，须先补录出处）', url: '' }]).map((s) => {
  const host = s.url ? hostOf(s.url) : '';
  return {
    source_id: s.id, site: s.name, official_url: s.url || null,
    search_query: q,
    search_url: host ? `https://www.bing.com/search?q=${encodeURIComponent(`site:${host} ${q}`)}` : null,
  };
});
function summarizeRule(kind, r) {
  if (kind === 'tariffItems') return `关税 ${r.duty_rate}%${r.ssg ? ` · SSG ${r.ssg.rate}%` : ' · 无 SSG'}${r.excise ? ` · ${r.excise.name}` : ''}`;
  if (kind === 'regimes') return `${r.agency || ''} · 周期 ${r.duration_days ? `${r.duration_days[0]}–${r.duration_days[1]} 天` : '—'} · ${LEAD_PHASE_LABEL[r.lead_phase] || '串行关键路径'}`;
  if (kind === 'labelRules') return r.pattern ? `模式：${String(r.pattern).slice(0, 28)}` : `检测器：${r.detector || '—'}`;
  if (kind === 'ssgSnapshots') return `SSG ${r.ssg_rate}% · 快照 ${r.snapshot_date || '—'}`;
  if (kind === 'adminFees') return `${r.amount} TWD / 票`;
  if (kind === 'ports') return `通关 ${r.clearance_days || '—'} 天 · 查验 ${r.inspection_intensity || '—'}`;
  return '';
}

on('GET', /^\/api\/v1\/kb\/verify-queue$/, async (req, res) => {
  const srcMap = new Map((core.kb.raw.sources || []).map((x) => [x.id, { id: x.id, name: x.name, url: x.url }]));
  const items = [];
  for (const { kind, key, label } of VERIFY_KIND_META) {
    for (const r of core.kb.raw[kind] || []) {
      const code = String(r[key]);
      const sources = (r.source_ids || []).map((id) => srcMap.get(id)).filter(Boolean);
      const locator = buildLocator(kind, code, r);
      items.push({
        kind, kind_label: label, code,
        name: r.name || r.title || code,
        params: summarizeRule(kind, r),
        verify_status: r.verify_status || 'needs_verification',
        updated_by: r.updated_by || null, updated_at: r.updated_at || null,
        sources, locator,
        check_links: linksFor(sources, locator.search_query),
      });
    }
  }
  const verified = items.filter((i) => i.verify_status === 'verified').length;
  /* 按来源聚类：一次进站可核完该站的多条规则，避免逐条开网站重复检索 */
  const bySource = new Map();
  for (const it of items) {
    const ids = it.sources.length ? it.sources.map((s) => s.id) : [null];
    for (const id of ids) {
      /* 分组标题必须取自「本组对应的来源」，不能取该条目的第一个来源——
         一条规则常挂多个机关，取错就会让八个分组全显示成同一个机关名。 */
      const own = it.sources.find((s) => s.id === id) || { name: '未指定来源（该规则缺 source_ids，须先补录出处）', url: '' };
      const g = bySource.get(id) || {
        source_id: id, site: own.name, official_url: own.url || null,
        host: own.url ? hostOf(own.url) : '', total: 0, pending: 0, kinds: {},
      };
      g.total += 1;
      if (it.verify_status !== 'verified') g.pending += 1;
      g.kinds[it.kind_label] = (g.kinds[it.kind_label] || 0) + 1;
      bySource.set(id, g);
    }
  }
  const groups = [...bySource.values()]
    .map((g) => ({ ...g, kinds_text: Object.entries(g.kinds).map(([k, v]) => `${k} ${v}`).join('、') }))
    .sort((a, b) => b.pending - a.pending || (a.source_id ? 0 : 1));
  return ({
    items, groups, total: items.length, verified, pending: items.length - verified,
    verified_ratio: Math.round((verified / Math.max(1, items.length)) * 1000) / 10,
    rule_version: core.meta.rule_version,
    note: '核验 = 对照官方来源逐条确认规则参数。每条给出定位三要素（站点 / 站内检索式 / 要比对的参数），并按来源聚类，一次进站可核完该站多条规则。检索式为通用搜索引擎 site: 限定到该主管机关域名——系统不写死官方站内深链（各家端点不同且会改版，写死即制造幻觉），落到该站后再以条文标题定位。支持「AI 预检」：粘贴官方文本由引擎自动比对参数，最终核验仍由人工确认。核验记录保存在当前实例，重新发布会重置。',
    disclaimer: core.meta.disclaimer,
  });
});

on('POST', /^\/api\/v1\/kb\/verify$/, async (req, res, m, body) => {
  const kind = body.kind;
  const code = String(body.code || '');
  const keyOf = VERIFY_KEY_OF[kind];
  if (!keyOf) throw new AppError('未知规则类别。', 'VALIDATION');
  const status = body.verify_status;
  if (!['verified', 'needs_verification'].includes(status)) throw new AppError('verify_status 须为 verified 或 needs_verification。', 'VALIDATION');
  const base = (core.kb.raw[kind] || []).find((r) => String(r[keyOf]) === code);
  if (!base) throw new AppError(`规则 ${kind}/${code} 不存在。`, 'NOT_FOUND');
  const verifier = String(body.verifier || ownerOf(req)).slice(0, 64);
  const note = String(body.note || '').slice(0, 300);
  const record = { ...base, verify_status: status, updated_by: verifier, updated_at: new Date().toISOString(), ...(note ? { verify_note: note } : {}) };
  /* 管制制度的证据状态取自其法规条文（legal_basis[].verify_status）：
     核验一条制度 = 连同其法规依据一并核验，否则评估端的依据进度不会翻转。 */
  if (kind === 'regimes' && Array.isArray(record.legal_basis)) {
    record.legal_basis = record.legal_basis.map((bs) => ({ ...bs, verify_status: status }));
  }
  const existing = (await repo.list('overrides', { limit: 5000 })).find((o) => o.kind === kind && String(o.record?.[keyOf]) === code);
  if (existing) await repo.update('overrides', existing.id, { record, updated_at: record.updated_at });
  else await repo.insert('overrides', { id: makeId('OVR'), kind, record, created_at: record.updated_at });
  await audit(req, 'verify_rule', `${kind}/${code}`, { verify_status: status, verifier, note });
  await buildCore();
  send(res, 200, {
    ok: true,
    rule: { kind, code: String(record[keyOf]), name: record.name || record.title || code, verify_status: status, updated_by: verifier, updated_at: record.updated_at },
    llm_mode: core.meta.llm_mode,
  });
});

/* ---------- v1 核验 AI 预检：抽取官方文本参数与规则库比对（规则化引擎；最终核验由人工确认） ---------- */
on('POST', /^\/api\/v1\/kb\/verify-assist$/, async (req, res, m, body) => {
  const kind = body.kind;
  const code = String(body.code || '');
  const text = String(body.official_text || '').trim();
  const keyOf = VERIFY_KEY_OF[kind];
  if (!keyOf) throw new AppError('未知规则类别。', 'VALIDATION');
  if (!text) throw new AppError('请粘贴官方来源的相关文本段落。', 'VALIDATION');
  if (text.length > 8000) throw new AppError('文本过长（≤ 8000 字）。', 'VALIDATION');
  const rule = (core.kb.raw[kind] || []).find((r) => String(r[keyOf]) === code);
  if (!rule) throw new AppError(`规则 ${kind}/${code} 不存在。`, 'NOT_FOUND');

  /* 参数抽取：百分比 / 金额 / 每升税额 / 办理周期区间 */
  const pcts = [...text.matchAll(/(\d+(?:\.\d+)?)\s*%/g)].map((x) => Number(x[1]));
  const amounts = [...text.matchAll(/(\d[\d,]*(?:\.\d+)?)\s*(?:元|TWD|新台币|NT\$)/gi)].map((x) => Number(x[1].replace(/,/g, '')));
  const perLiters = [...text.matchAll(/(?:每升|每公升|公升)[^\d]{0,8}(\d+(?:\.\d+)?)\s*元/g)].map((x) => Number(x[1]));
  const dayRanges = [...text.matchAll(/(\d+)\s*[-–~至]\s*(\d+)\s*(?:日|天|工作日)/g)].map((x) => [Number(x[1]), Number(x[2])]);
  const contextOf = (needle) => { const i = text.indexOf(needle); return i < 0 ? null : text.slice(Math.max(0, i - 26), i + needle.length + 26).replace(/\s+/g, ' ').trim(); };
  const pctHit = (v) => pcts.some((p) => Math.abs(p - v) < 0.011);
  const amtHit = (v) => amounts.some((x) => Math.abs(x - v) < 0.011);
  const perLHit = (v) => perLiters.some((x) => Math.abs(x - v) < 0.011);

  const checks = [];
  const addPct = (field, v) => {
    if (v == null) return;
    const needle = `${v}%`;
    checks.push({ field, rule_value: needle, match: pctHit(v) ? true : (pcts.length ? false : null), evidence: contextOf(needle) });
  };
  if (kind === 'tariffItems') {
    addPct('关税税率', rule.duty_rate);
    if (rule.ssg?.rate != null) addPct('SSG 加征税率', rule.ssg.rate);
    if (rule.excise?.mode === 'specific' && rule.excise?.amount_per_liter != null) {
      const v = rule.excise.amount_per_liter;
      checks.push({ field: `货物税（${rule.excise.name || '从量'}）`, rule_value: `每升 ${v} 元`, match: perLHit(v) ? true : (perLiters.length ? false : null), evidence: contextOf(`每升 ${v} 元`) });
    }
    if (rule.levy?.rate != null) addPct(`捐费（${rule.levy.name}）`, rule.levy.rate);
  } else if (kind === 'adminFees') {
    const v = rule.amount;
    checks.push({ field: '规费金额', rule_value: `${v} 元/票`, match: amtHit(v) ? true : (amounts.length ? false : null), evidence: contextOf(String(v)) || contextOf(v.toLocaleString('en-US')) });
  } else if (kind === 'ssgSnapshots') {
    addPct('SSG 税率', rule.ssg_rate);
  } else if (kind === 'regimes') {
    if (rule.duration_days) {
      const [a, b] = rule.duration_days;
      checks.push({ field: '办理周期', rule_value: `${a}–${b} 天`, match: dayRanges.some(([x, y]) => x === a && y === b) ? true : (dayRanges.length ? false : null), evidence: null });
    }
    const title = rule.legal_basis?.[0]?.title;
    if (title) checks.push({ field: '法规名称', rule_value: title, match: text.includes(title) ? true : null, evidence: contextOf(title.slice(0, 6)) });
  } else if (kind === 'ports') {
    if (rule.clearance_days) {
      const v = rule.clearance_days;
      checks.push({ field: '通关天数', rule_value: `${v} 天`, match: new RegExp(`${v}\s*(?:日|天)`).test(text) ? true : null, evidence: null });
    }
  } else if (kind === 'labelRules') {
    checks.push({ field: '规则主题', rule_value: rule.name, match: null, evidence: null, note: '标签规则以人工判断为主，预检不做自动比对' });
  }

  const fails = checks.filter((c) => c.match === false);
  const trues = checks.filter((c) => c.match === true);
  const verdict = fails.length ? 'mismatch' : (trues.length ? 'consistent' : 'unclear');
  const srcMap = new Map((core.kb.raw.sources || []).map((x) => [x.id, x]));
  send(res, 200, {
    rule: { kind, code: String(rule[keyOf]), name: rule.name || rule.title || code },
    checks, verdict,
    verdict_label: { consistent: '参数一致', mismatch: '存在不一致', unclear: '无法自动判断' }[verdict],
    llm_mode: core.meta.llm_mode,
    sources: (rule.source_ids || []).map((id) => srcMap.get(id)).filter(Boolean),
    note: '预检为规则化参数比对（当前未接入大模型语义比对）：自动抽取文本中的税率 / 金额 / 周期与规则库核对。最终核验仍需人工确认——核验的意义在人工背书。',
    disclaimer: core.meta.disclaimer,
  });
});

/* ---------- v1 法规变更登记：真实登记（存储 + 即时影响评估，后续拉取自动包含） ---------- */
on('POST', /^\/api\/v1\/regulation-changes$/, async (req, res, m, body) => {
  const c = body.change || body;
  const title = String(c.title || '').trim();
  const source_name = String(c.source_name || '').trim();
  if (!title) throw new AppError('请填写变更标题。', 'VALIDATION');
  if (!source_name) throw new AppError('请填写来源名称（官方机关 / 公报名）。', 'VALIDATION');
  const source_kind = c.source_kind === 'unofficial' ? 'unofficial' : 'official';
  const source_url = String(c.source_url || '').trim();
  if (source_kind !== 'official') throw new AppError('非官方公开来源不纳入规则库：只登记官方公告 / 公报，转载与自媒体消息会被拦截。', 'VALIDATION');
  if (!/^https?:\/\//.test(source_url)) throw new AppError('官方来源必须填写可追溯的 URL（http/https）。', 'VALIDATION');
  const rec = {
    id: makeId('CHG'), owner: ownerOf(req), title: title.slice(0, 200),
    market: c.market || 'TW',
    diff_type: ['rate', 'label', 'quarantine', 'ssg', 'procedure', 'list_add', 'list_remove'].includes(c.diff_type) ? c.diff_type : 'procedure',
    affected_codes: (Array.isArray(c.affected_codes) ? c.affected_codes : String(c.affected_codes || '').split(/[,，\s]+/)).filter(Boolean).map(String),
    affected_tags: Array.isArray(c.affected_tags) ? c.affected_tags : [],
    summary: String(c.summary || '').slice(0, 500),
    source_name: source_name.slice(0, 120), source_url: source_url.slice(0, 500), source_kind: 'official',
    effective_on: c.effective_on || null,
    published_on: new Date().toISOString().slice(0, 10),
    registered_by: ownerOf(req), created_at: new Date().toISOString(),
  };
  await repo.insert('changes', rec);
  await audit(req, 'register_change', rec.id, { title: rec.title, source: rec.source_name });
  /* 立即按当前工作区产品评估影响（与拉取同口径） */
  const products = await repo.list('products', { owner: ownerOf(req), limit: 500 });
  const r = core.monitor({ changes: [rec], products, defaultCostInputs: null });
  send(res, 200, {
    change: rec,
    events: r.impacts.map((i, idx) => ({
      id: `${i.change_id}-${i.product_id || idx}`,
      title: i.title, summary: i.summary, impact: i.actions.join('；'),
      affected_product_ids: [i.product_id].filter(Boolean),
      cost_delta_pct: i.cost_delta?.uplift_pct ?? null,
      source_name: i.source.name, source_url: i.source.url,
      effective_on: i.effective_on, level: i.impact_level,
      created_at: new Date().toISOString(),
    })),
    rejected_non_official: r.rejected_non_official.length,
    scanned_changes: r.scanned_changes,
    rule_version: core.meta.rule_version, disclaimer: r.disclaimer,
  });
});

/* ---------- v1 出海方案报告（调研 → 评估 → 成本 → 风控 → 方案） ---------- */
on('POST', /^\/api\/v1\/report$/, async (req, res, m, body) => {
  const product = body.product;
  if (!product?.name) throw new AppError('请先提供产品名称。', 'VALIDATION');
  const r = await core.journeyReport({ product, costInputs: body.costInputs || {}, useKbRates: body.use_kb_rates !== false });
  const a = r.data.assessment;
  const report = {
    product: { name: product.name, hs: product.hs || '', market: product.market || '中国台湾地区', origin: product.origin || '' },
    research: { scan: { built: r.data.scan.built, skeleton: r.data.scan.skeleton, rows: r.data.scan.rows }, competitors: r.data.competitors },
    admission: {
      verdict: a.verdict, applicant: a.applicant, timeline: a.timeline,
      evidence_count: (a.evidence || []).length, documents: a.document_checklist || [], risks: a.risk || null,
    },
    cost: r.data.cost ? {
      totals: r.data.cost.totals, quote: r.data.cost.quote, pending_items: r.data.cost.pending_items,
      lines: r.data.cost.lines, mode: r.data.cost.mode,
    } : null,
    cost_error: r.data.costError,
    plan: r.data.plan,
  };
  const html = buildJourneyReportHtml({ ...report, rule_version: core.meta.rule_version, data_as_of: core.meta.data_as_of, generated_at: new Date().toISOString() });
  const id = makeId('RPT');
  await repo.insert('assessments', {
    id, owner: ownerOf(req), product_id: product.id || null, name: String(product.name).slice(0, 120),
    market: product.market || 'TW', hs: product.hs || '', verdict: 'journey_report', risk_level: 'unknown',
    rule_version: core.meta.rule_version, payload: { kind: 'journey_report', risks: r.data.plan.risks.length },
    created_at: new Date().toISOString(),
  }).catch(() => {});
  send(res, 200, {
    report, markdown: r.markdown, html,
    record_id: id, rule_version: core.meta.rule_version, generated_at: new Date().toISOString(),
    disclaimer: core.meta.disclaimer, provenance: 'RULE_ENGINE',
  });
});

/* ---------- v1 市场准入扫描（一个产品 × 全部登记市场，反向查询） ---------- */
on('POST', /^\/api\/v1\/market-scan$/, async (req, res, m, body) => {
  const product = body.product || body;
  if (!product?.name) throw new AppError('请先提供产品名称。', 'VALIDATION');
  const scan = core.scanMarkets(product);
  await repo.insert('assessments', {
    id: makeId('SCAN'), owner: ownerOf(req), product_id: product.id || null,
    name: String(product.name).slice(0, 120), market: 'MULTI', hs: product.hs || '',
    verdict: 'market_scan', risk_level: 'unknown', rule_version: scan.rule_version,
    payload: { kind: 'market_scan', built: scan.built, skeleton: scan.skeleton, rows: scan.rows },
    created_at: scan.generated_at,
  }).catch(() => {});
  send(res, 200, {
    markets: scan.rows,
    built: scan.built,
    skeleton: scan.skeleton,
    note: scan.note,
    rule_version: scan.rule_version,
    data_as_of: core.meta.data_as_of,
    generated_at: scan.generated_at,
    session_id: body.session_id || req.headers['x-session-id'] || null,
    disclaimer: scan.disclaimer,
    provenance: 'RULE_ENGINE',
  });
});

on('POST', /^\/api\/v1\/admission$/, async (req, res, m, body) => {
  const product = body.product || body;
  const result = await core.assess({ ...product, attributes: body.attributes || [], session_id: body.session_id || req.headers['x-session-id'] || null });
  const id = makeId('ASM');
  await repo.insert('assessments', {
    id, owner: ownerOf(req), product_id: body.product_id || null, name: product.name || '',
    market: product.market || 'TW', hs: product.hs || '', verdict: result.verdict.code,
    risk_level: result.risk?.level || 'unknown', rule_version: result.rule_version, payload: result, created_at: result.generated_at,
  }).catch(() => {});
  send(res, 200, {
    status: result.verdict.code,
    status_label: result.verdict.code === 'undetermined' ? '无法判定' : result.verdict.label,
    conclusion: result.verdict.reason,
    applicant: result.applicant,
    documents: result.document_checklist,
    timeline: result.timeline ? {
      applicable: result.timeline.applicable,
      days: result.timeline.critical_path_days, text: result.timeline.text, note: result.timeline.note,
      landed_ready_days: result.timeline.landed_ready_days ?? null, landed_ready_text: result.timeline.landed_ready_text ?? null,
      segments: result.timeline.segments || null,
    } : null,
    missing_fields: result.missing_fields || [],
    conditions: result.conditions || [],
    risks: result.risk,
    execution_variance: result.execution_variance || null,
    business_inputs: result.business_inputs || [],
    sources: (result.evidence || []).flatMap((e) => (e.sources || []).map((s) => ({ ...s, rule_id: e.rule_id, title: e.title, verify_status: e.verify_status }))),
    rule_version: result.rule_version,
    data_as_of: result.data_as_of,
    generated_at: result.generated_at,
    session_id: result.session_id,
    verification: result.verification,
    disclaimer: result.disclaimer,
    simulated: false,
    provenance: 'RULE_ENGINE',
    record_id: id,
  });
});

on('POST', /^\/api\/v1\/cost$/, async (req, res, m, body) => {
  const ci = body.costInputs || body;
  const product = body.product || null;
  const hs = product?.hs ? String(product.hs).replace(/\D/g, '') : '';
  const useKb = body.use_kb_rates !== false && hs.length >= 4;
  const result = await core.cost({
    hs: hs || null, market: product?.market || 'TW',
    value: ci.value, quantity: ci.quantity, freight: ci.freight ?? 0, insurance: ci.insurance ?? 0,
    fee: ci.fee ?? 0, dutyRate: ci.dutyRate, vatRate: ci.vatRate, ssgRate: ci.ssgRate,
    use_kb_rates: useKb, ssg_mode: body.ssg_mode || 'off', port: body.port || null,
    /* 手工模式默认关闭扩展费项，以与前端原型静态快照保持同口径；知识库模式默认开启 */
    include_extended_fees: body.include_extended_fees ?? useKb,
    session_id: body.session_id || req.headers['x-session-id'] || null,
  });
  const id = makeId('CST');
  await repo.insert('costs', {
    id, owner: ownerOf(req), product_id: body.product_id || null, hs, market: product?.market || 'TW',
    currency: body.currency || 'CNY', effective_tax_rate_pct: result.totals.effective_tax_rate_pct,
    unit_landed_cost: result.totals.unit_landed_cost, rule_version: result.rule_version, payload: result, created_at: result.generated_at,
  }).catch(() => {});
  send(res, 200, {
    items: result.lines.map((l) => ({ name: l.label, amount: l.amount, currency: l.currency || body.currency || 'CNY', fx_unconverted: !!l.fx_unconverted, formula: l.formula, source: l.rule_ref, verify_status: l.verify_status })),
    total: result.totals.grand_total,
    unit_cost: result.totals.unit_landed_cost,
    effective_tax_rate_pct: result.totals.effective_tax_rate_pct,
    customs_value: result.totals.customs_value,
    taxes_total: result.totals.taxes_total,
    currency: body.currency || 'CNY',
    currency_note: '总额币种与输入货值一致（默认 CNY）。口岸规费以 TWD 计征、未换算按同值计入，见分项 currency 标注与 pending_items。',
    ssg_applied_rate: result.lines.find((l) => l.key === 'ssg')?.rate || 0,
    /* 税率口径披露：让前端能说明「哪些输入被采用、哪些被规则库覆盖」，
     * 避免出现用户改税率而结果不变的沉默失败。 */
    rate_basis: {
      mode: result.mode,
      duty_rate_pct: result.inputs.dutyRate,
      vat_rate_pct: result.inputs.vatRate,
      ssg_rate_pct: result.inputs.ssgRate,
      matched_tariff: result.matched_tariff
        ? {
          code: result.matched_tariff.code, name: result.matched_tariff.name,
          duty_rate: result.matched_tariff.duty_rate,
          ssg_rate: result.matched_tariff.ssg?.rate ?? null,
          verify_status: result.lines.find((l) => l.key === 'customs_duty')?.verify_status || 'needs_verification',
        }
        : null,
      ssg_listed: !!result.matched_tariff?.ssg,
      ignored_inputs: useKb ? ['dutyRate', 'vatRate'] : [],
      note: useKb
        ? `已按规则库税率计算${result.matched_tariff ? `（税则 ${result.matched_tariff.code} · ${result.matched_tariff.name}）` : ''}；表单中的「假设基础关税率 / 假设增值税率」未被采用。`
        : '未命中规则库或已切换为手工模式，全部按表单中的假设税率计算。',
    },
    quote: { low: result.quote.suggested_low, mid: result.quote.suggested_mid, high: result.quote.suggested_high, buffer_pct: result.quote.buffer_pct },
    not_included: result.not_included,
    pending_items: result.pending_items,
    sources: result.sources,
    verification: result.verification,
    rule_version: result.rule_version,
    generated_at: result.generated_at,
    session_id: result.session_id,
    disclaimer: result.disclaimer,
    provenance: useKb ? 'RULE_ENGINE' : 'RULE_ENGINE_MANUAL_RATES',
    record_id: id,
  });
});

on('POST', /^\/api\/v1\/regulation-events$/, async (req, res, m, body) => {
  const products = body.products?.length ? body.products : await repo.list('products', { owner: ownerOf(req) });
  const stored = await repo.list('changes', { owner: ownerOf(req), limit: 200 }).catch(() => []);
  const r = core.monitor({ changes: body.changes || [...core.demoChangeFeed, ...stored], products, defaultCostInputs: body.defaultCostInputs || null });
  send(res, 200, {
    events: r.impacts.map((i, idx) => ({
      id: `${i.change_id}-${i.product_id || idx}`,
      title: i.title,
      summary: i.summary,
      impact: i.actions.join('；'),
      affected_product_ids: [i.product_id].filter(Boolean),
      cost_delta_pct: i.cost_delta?.uplift_pct ?? null,
      source_name: i.source.name,
      source_url: i.source.url,
      effective_on: i.effective_on,
      level: i.impact_level,
      created_at: new Date().toISOString(),
    })),
    rejected_non_official: r.rejected_non_official.length,
    scanned_changes: r.scanned_changes,
    rule_version: core.meta.rule_version,
    disclaimer: r.disclaimer,
  });
});

/* ---------- 产品档案 ---------- */
on('GET', /^\/api\/products$/, async (req) => ({ items: await repo.list('products', { owner: ownerOf(req) }) }));
on('POST', /^\/api\/products$/, async (req, res, m, body) => {
  const rec = {
    id: body.id || makeId('PRD'), owner: ownerOf(req),
    name: String(body.name || '').slice(0, 120), category: String(body.category || '').slice(0, 60),
    hs: String(body.hs || '').slice(0, 20), market: body.market || 'TW', origin: body.origin || '中国大陆',
    specs: String(body.specs || '').slice(0, 2000), attributes: Array.isArray(body.attributes) ? body.attributes.slice(0, 20) : [],
    default_cost_inputs: body.default_cost_inputs || null,
    created_at: new Date().toISOString(),
  };
  if (!rec.name) throw new AppError('产品名称不能为空。', 'VALIDATION');
  await repo.insert('products', rec);
  await audit(req, 'create_product', rec.id, { name: rec.name, hs: rec.hs });
  send(res, 201, rec);
});
on('PUT', /^\/api\/products\/([\w-]+)$/, async (req, res, m, body) => {
  const patch = { ...body }; delete patch.id; delete patch.owner;
  const rec = await repo.update('products', m[1], patch, ownerOf(req));
  if (!rec) throw new AppError('产品档案不存在或无权限修改。', 'NOT_FOUND');
  await audit(req, 'update_product', m[1], patch);
  send(res, 200, rec);
});
on('DELETE', /^\/api\/products\/([\w-]+)$/, async (req, res, m) => {
  const ok = await repo.remove('products', m[1], ownerOf(req));
  if (!ok) throw new AppError('产品档案不存在。', 'NOT_FOUND');
  await audit(req, 'delete_product', m[1]);
  send(res, 200, { ok: true });
});

/* ---------- 历史记录 ---------- */
on('GET', /^\/api\/records$/, async (req, res, m, body, url) => {
  const type = url.searchParams.get('type') === 'costs' ? 'costs' : 'assessments';
  return { type, items: await repo.list(type, { owner: ownerOf(req), limit: 60 }) };
});

/* ---------- 消息中心 ---------- */
on('GET', /^\/api\/messages$/, async (req) => {
  const owner = ownerOf(req);
  const items = await repo.list('messages', { owner, limit: 80 });
  const unread = items.filter((i) => !i.read_at).length;
  return { items, unread };
});
on('POST', /^\/api\/messages\/read$/, async (req, res, m, body) => {
  const ids = Array.isArray(body.ids) ? body.ids : [body.id].filter(Boolean);
  for (const id of ids) await repo.update('messages', id, { read_at: new Date().toISOString() }, ownerOf(req));
  return { ok: true, updated: ids.length };
});

/* ---------- 看板聚合 ---------- */
on('GET', /^\/api\/dashboard$/, async (req) => {
  const owner = ownerOf(req);
  const [products, assessments, costs, messages] = await Promise.all([
    repo.list('products', { owner, limit: 500 }), repo.list('assessments', { owner, limit: 500 }),
    repo.list('costs', { owner, limit: 500 }), repo.list('messages', { owner, limit: 500 }),
  ]);
  const verdicts = {};
  for (const a of assessments) verdicts[a.verdict] = (verdicts[a.verdict] || 0) + 1;
  const rates = costs.map((c) => c.effective_tax_rate_pct).filter((n) => Number.isFinite(n));
  const ssgAlerts = core.ssgAlerts({ thresholdPct: 90 });
  return {
    products: products.length,
    assessments: assessments.length,
    costs: costs.length,
    unread_messages: messages.filter((m) => !m.read_at).length,
    verdict_distribution: verdicts,
    risk_distribution: assessments.reduce((acc, a) => { acc[a.risk_level || 'unknown'] = (acc[a.risk_level || 'unknown'] || 0) + 1; return acc; }, {}),
    avg_effective_tax_rate: rates.length ? Math.round((rates.reduce((a, b) => a + b, 0) / rates.length) * 100) / 100 : null,
    max_effective_tax_rate: rates.length ? Math.max(...rates) : null,
    high_risk_products: assessments.filter((a) => ['critical', 'high'].includes(a.risk_level)).slice(0, 8)
      .map((a) => ({ id: a.id, name: a.name, verdict: a.verdict, risk: a.risk_level, created_at: a.created_at })),
    ssg_watch: ssgAlerts,
    recent: [...assessments.map((a) => ({ kind: '准入', id: a.id, name: a.name, at: a.created_at, verdict: a.verdict })),
      ...costs.map((c) => ({ kind: '成本', id: c.id, name: c.payload?.matched_tariff?.name || c.hs, at: c.created_at, rate: c.effective_tax_rate_pct }))]
      .sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 10),
    kb: core.kb.stats(),
    rule_version: core.meta.rule_version,
    data_as_of: core.meta.data_as_of,
    disclaimer: core.meta.disclaimer,
  };
});

/* ---------- 规则知识库运营后台 ---------- */
on('GET', /^\/api\/kb\/rules$/, async (req) => {
  const url = new URL(req.url, 'http://x');
  const kind = url.searchParams.get('kind') || 'tariffItems';
  const q = (url.searchParams.get('q') || '').toLowerCase();
  const rows = core.kb.raw[kind] || [];
  const overrides = await repo.list('overrides', { limit: 5000 });
  const keyOf = { tariffItems: 'code', regimes: 'id', labelRules: 'id', ssgSnapshots: 'code', ports: 'code', adminFees: 'id', mainlandProhibited: 'code_prefix', sources: 'id' }[kind] || 'id';
  const filtered = rows.filter((r) => !q || JSON.stringify(r).toLowerCase().includes(q));
  return {
    kind, key_field: keyOf, rows: filtered,
    overridden_ids: overrides.filter((o) => o.kind === kind).map((o) => o.record?.[keyOf]),
    verified_ratio: Math.round((rows.filter((r) => r.verify_status === 'verified').length / Math.max(1, rows.length)) * 1000) / 10,
  };
});

on('PUT', /^\/api\/kb\/rules\/([\w]+)\/([\w.-]+)$/, async (req, res, m, body) => {
  const [kind, code] = [m[1], m[2]];
  const keyOf = { tariffItems: 'code', regimes: 'id', labelRules: 'id', ssgSnapshots: 'code', ports: 'code', adminFees: 'id', mainlandProhibited: 'code_prefix', sources: 'id' }[kind];
  if (!keyOf) throw new AppError('未知规则类别。', 'VALIDATION');
  const base = (core.kb.raw[kind] || []).find((r) => String(r[keyOf]) === code);
  if (!base) throw new AppError(`规则 ${code} 不存在，请使用新增接口。`, 'NOT_FOUND');
  const record = { ...base, ...body.record, [keyOf]: code, updated_by: body.updated_by || ownerOf(req), updated_at: new Date().toISOString(), verify_status: body.record?.verify_status || base.verify_status };
  const existing = (await repo.list('overrides', { limit: 5000 })).find((o) => o.kind === kind && String(o.record?.[keyOf]) === code);
  if (existing) await repo.update('overrides', existing.id, { record, updated_at: record.updated_at });
  else await repo.insert('overrides', { id: makeId('OVR'), kind, record, created_at: record.updated_at });
  await audit(req, 'update_rule', `${kind}/${code}`, { verify_status: record.verify_status, changed: Object.keys(body.record || {}) });
  await buildCore();
  send(res, 200, { ok: true, record, llm_mode: core.meta.llm_mode });
});

on('POST', /^\/api\/kb\/reset$/, async (req, res) => {
  const rows = await repo.list('overrides', { limit: 5000 });
  for (const r of rows) await repo.remove('overrides', r.id);
  await audit(req, 'reset_overrides', 'kb');
  await buildCore();
  send(res, 200, { ok: true, removed: rows.length, llm_mode: core.meta.llm_mode });
});

/* ---------- 报告导出 ---------- */
on('GET', /^\/api\/report\/(admission|cost)\/([\w-]+)$/, async (req, res, m, body, url) => {
  const coll = m[1] === 'cost' ? 'costs' : 'assessments';
  const rec = await repo.get(coll, m[2], ownerOf(req));
  if (!rec) throw new AppError('记录不存在或无权限访问。', 'NOT_FOUND');
  const format = url.searchParams.get('format') || 'html';
  if (format === 'json') return rec.payload;
  const html = core.report(m[1], { ...rec.payload, session_id: rec.payload.session_id || rec.id });
  if (format === 'markdown') return send(res, 200, core.report(m[1], rec.payload, { format: 'markdown' }), { 'content-type': 'text/markdown; charset=utf-8', 'content-disposition': `attachment; filename="report-${m[2]}.md"` });
  return sendHtml(res, html);
});

on('GET', /^\/api\/export\/(assessments|costs|products|messages)$/, async (req, res, m, body, url) => {
  const coll = m[1];
  const items = await repo.list(coll, { owner: ownerOf(req), limit: 1000 });
  send(res, 200, { exported_at: new Date().toISOString(), collection: coll, count: items.length, items }, { 'content-disposition': `attachment; filename="${coll}.json"` });
});

/* ---------- 手动触发 SSG 告警入消息中心 ---------- */
on('POST', /^\/api\/ssg\/scan$/, async (req) => {
  const alerts = core.ssgAlerts({ thresholdPct: Number(req.__url?.searchParams?.get('threshold') || 90) });
  for (const a of alerts) {
    await repo.insert('messages', {
      id: makeId('MSG'), owner: ownerOf(req), read_at: null, source: 'ssg_scan', level: a.usage_pct >= 100 ? 'critical' : 'high',
      title: `SSG 告警：${a.name}`, body: `累积量已达触发点的 ${a.usage_pct}%，剩余 ${a.remaining} ${a.unit}，按现速约 ${(a.remaining / Math.max(1, a.monthly_rate)).toFixed(2)} 个月触发。`, created_at: new Date().toISOString(),
    }).catch(() => {});
  }
  return { alerts };
});

/* ----------------------------- 服务器 ----------------------------- */
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  req.__url = url;

  if (url.pathname.startsWith('/api/')) {
    if (req.method !== 'GET' && rateLimited(`${req.socket.remoteAddress}:${req.method}`)) {
      return send(res, 429, { error: { message: '请求过于频繁，请稍后再试。', code: 'RATE_LIMITED' } });
    }
    let body = {};
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      try { body = await readBody(req); } catch (e) { return send(res, e.code === 'PAYLOAD_TOO_LARGE' ? 413 : 400, { error: { message: e.message, code: e.code || 'BAD_REQUEST' } }); }
    }
    for (const r of routes) {
      if (r.method !== req.method) continue;
      const m = url.pathname.match(r.pattern);
      if (!m) continue;
      try {
        const out = await r.handler(req, res, m, body, url);
        if (out !== undefined && !res.writableEnded) send(res, 200, out);
      } catch (e) {
        const status = e.code === 'NOT_FOUND' ? 404 : e.code === 'VALIDATION' || e.code === 'UNKNOWN_MARKET' || e.code === 'NO_RATE_DATA' ? 422 : e.code === 'RATE_LIMITED' ? 429 : 500;
        if (status >= 500) console.error('[api-error]', e);
        send(res, status, { error: { message: e.message || '服务内部错误。', code: e.code || 'INTERNAL', ...(e.meta || {}) } });
      }
      return;
    }
    return send(res, 404, { error: { message: `未知接口 ${req.method} ${url.pathname}`, code: 'NOT_FOUND' } });
  }

  /* 静态资源：
       /          → web/      既有 React 前端（GPT 交付的构建产物拷贝，SPA 回落 index.html）
       /console/  → console/  核心引擎自带的运维与验证控制台
       /engine/   → engine/   共享引擎模块（控制台以相对路径 import，保证同口径） */
  const BLOCKED = /^\/(data|store|tests|node_modules)(\/|$)/;
  const serveFrom = (root, rel, fallback) => {
    let filePath = path.join(root, path.normalize(rel || 'index.html').replace(/^(\.\.[/\\])+/, ''));
    if (!filePath.startsWith(root)) return null;
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      if (!fallback) return null;
      filePath = fallback;
    }
    return filePath;
  };
  try {
    if (BLOCKED.test(url.pathname)) return send(res, 404, 'Not found', { 'content-type': 'text/plain; charset=utf-8' });
    let filePath = null;
    if (url.pathname.startsWith('/console')) {
      filePath = serveFrom(CONSOLE_DIR, url.pathname.slice('/console'.length).replace(/^\//, ''), path.join(CONSOLE_DIR, 'index.html'));
    } else if (url.pathname.startsWith('/engine/')) {
      filePath = serveFrom(ENGINE_DIR, url.pathname.slice('/engine/'.length), null);
    } else {
      filePath = serveFrom(WEB_DIR, url.pathname === '/' ? 'index.html' : url.pathname.slice(1), path.join(WEB_DIR, 'index.html'));
    }
    if (!filePath) return send(res, 404, 'Not found', { 'content-type': 'text/plain; charset=utf-8' });
    const data = await fsp.readFile(filePath);
    send(res, 200, data, { 'content-type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-cache' });
  } catch (e) {
    send(res, 404, 'Not found', { 'content-type': 'text/plain; charset=utf-8' });
  }
});

await buildCore();
server.listen(PORT, HOST, () => {
  console.log(`[boot] TradePilot core listening on http://${HOST}:${PORT}`);
});

const shutdown = () => { console.log('[boot] shutting down'); server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 3000); };
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
