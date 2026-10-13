/**
 * 双模仓储层（Repository）
 * ------------------------------------------------------------------
 * 目的：把「持久化」从业务引擎里彻底剥离，引擎保持零依赖、可在浏览器直接运行。
 * 模式选择（按环境自动决定，业务代码无感）：
 *   supabase  —— 存在 SUPABASE_URL / SUPABASE_ANON_KEY 时走 PostgREST（需套餐开通数据库能力）
 *   jsonfile  —— 退化为服务端本地 JSON 文件（Page 实例重启即清空，用于演示与开发）
 *   memory    —— 无文件系统权限时的进程内存储
 * 浏览器端不使用本文件：前端在 API 不可用时直接调用同一套 engine/*.mjs + localStorage。
 */

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

export const COLLECTIONS = ['products', 'assessments', 'costs', 'messages', 'overrides', 'audit', 'llm_calls', 'changes'];

export function createRepo({ dataDir = 'data', logger = console } = {}) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;
  const driver = supabaseUrl && supabaseKey ? 'supabase' : (canUseFs(dataDir) ? 'jsonfile' : 'memory');

  const impl = driver === 'supabase'
    ? makeSupabaseDriver({ url: supabaseUrl, key: supabaseKey, logger })
    : driver === 'jsonfile'
      ? makeJsonDriver({ dataDir, logger })
      : makeMemoryDriver();

  return { mode: driver, dataDir: driver === 'jsonfile' ? path.resolve(dataDir) : null, ...impl };
}

function canUseFs(dataDir) {
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    const probe = path.join(dataDir, '.probe');
    fs.writeFileSync(probe, '1');
    fs.unlinkSync(probe);
    return true;
  } catch {
    return false;
  }
}

/* ----------------------------- JSON 文件驱动 ----------------------------- */
function makeJsonDriver({ dataDir, logger }) {
  fs.mkdirSync(dataDir, { recursive: true });
  const cache = new Map();
  const file = (c) => path.join(dataDir, `${c}.json`);

  function load(c) {
    if (cache.has(c)) return cache.get(c);
    let rows = [];
    try {
      rows = JSON.parse(fs.readFileSync(file(c), 'utf8'));
      if (!Array.isArray(rows)) rows = [];
    } catch { rows = []; }
    cache.set(c, rows);
    return rows;
  }

  async function save(c, rows) {
    cache.set(c, rows);
    const tmp = `${file(c)}.${process.pid}.tmp`;
    await fsp.writeFile(tmp, JSON.stringify(rows, null, 0), 'utf8');
    await fsp.rename(tmp, file(c));
  }

  return {
    async list(c, { owner, limit = 200, where } = {}) {
      let rows = load(c);
      if (owner) rows = rows.filter((r) => !r.owner || r.owner === owner);
      if (where) rows = rows.filter((r) => Object.entries(where).every(([k, v]) => r[k] === v));
      return rows.slice(-limit).reverse();
    },
    async get(c, id, owner) {
      return load(c).find((r) => r.id === id && (!owner || !r.owner || r.owner === owner)) || null;
    },
    async insert(c, rec) {
      const rows = load(c);
      rows.push(rec);
      await save(c, rows);
      return rec;
    },
    async update(c, id, patch, owner) {
      const rows = load(c);
      const i = rows.findIndex((r) => r.id === id && (!owner || !r.owner || r.owner === owner));
      if (i < 0) return null;
      rows[i] = { ...rows[i], ...patch, id: rows[i].id, updated_at: new Date().toISOString() };
      await save(c, rows);
      return rows[i];
    },
    async remove(c, id, owner) {
      const rows = load(c);
      const i = rows.findIndex((r) => r.id === id && (!owner || !r.owner || r.owner === owner));
      if (i < 0) return false;
      rows.splice(i, 1);
      await save(c, rows);
      return true;
    },
    async count(c, { owner } = {}) {
      const rows = load(c);
      return owner ? rows.filter((r) => !r.owner || r.owner === owner).length : rows.length;
    },
  };
}

/* ----------------------------- 内存驱动 ----------------------------- */
function makeMemoryDriver() {
  const store = new Map(COLLECTIONS.map((c) => [c, []]));
  return {
    async list(c, { owner, limit = 200, where } = {}) {
      let rows = store.get(c) || [];
      if (owner) rows = rows.filter((r) => !r.owner || r.owner === owner);
      if (where) rows = rows.filter((r) => Object.entries(where).every(([k, v]) => r[k] === v));
      return rows.slice(-limit).reverse();
    },
    async get(c, id, owner) { return (store.get(c) || []).find((r) => r.id === id && (!owner || !r.owner || r.owner === owner)) || null; },
    async insert(c, rec) { store.get(c).push(rec); return rec; },
    async update(c, id, patch, owner) {
      const rows = store.get(c); const i = rows.findIndex((r) => r.id === id && (!owner || !r.owner || r.owner === owner));
      if (i < 0) return null;
      rows[i] = { ...rows[i], ...patch, id: rows[i].id, updated_at: new Date().toISOString() };
      return rows[i];
    },
    async remove(c, id, owner) {
      const rows = store.get(c); const i = rows.findIndex((r) => r.id === id && (!owner || !r.owner || r.owner === owner));
      if (i < 0) return false;
      rows.splice(i, 1); return true;
    },
    async count(c, { owner } = {}) { const rows = store.get(c) || []; return owner ? rows.filter((r) => !r.owner || r.owner === owner).length : rows.length; },
  };
}

/* ----------------------------- Supabase (PostgREST) 驱动 -----------------------------
 * 仅在平台开通数据库能力后生效。密钥由 Page 运行时注入，绝不下发到浏览器。
 * 表名使用裸名（如 products），不做 public. 限定。
 */
function makeSupabaseDriver({ url, key, logger }) {
  const base = String(url).replace(/\/$/, '');
  const headers = { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json' };

  async function req(pathname, init = {}) {
    const res = await fetch(`${base}/rest/v1/${pathname}`, { ...init, headers: { ...headers, ...(init.headers || {}) }, signal: AbortSignal.timeout(10000) });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      const err = new Error(`Supabase 请求失败 ${res.status}: ${body.slice(0, 200)}`);
      err.code = 'DB_ERROR';
      logger.warn(String(err.message));
      throw err;
    }
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  return {
    async list(c, { owner, limit = 200, where } = {}) {
      const qs = new URLSearchParams({ select: '*', order: 'created_at.desc', limit: String(limit) });
      if (owner) qs.set('owner', `eq.${owner}`);
      for (const [k, v] of Object.entries(where || {})) qs.set(k, `eq.${v}`);
      return await req(`${c}?${qs}`);
    },
    async get(c, id, owner) {
      const qs = new URLSearchParams({ id: `eq.${id}`, limit: '1' });
      if (owner) qs.set('owner', `eq.${owner}`);
      const rows = await req(`${c}?${qs}`);
      return rows?.[0] || null;
    },
    async insert(c, rec) {
      const rows = await req(c, { method: 'POST', headers: { prefer: 'return=representation' }, body: JSON.stringify(rec) });
      return rows?.[0] || rec;
    },
    async update(c, id, patch, owner) {
      const qs = owner ? `id=eq.${id}&owner=eq.${owner}` : `id=eq.${id}`;
      const rows = await req(`${c}?${qs}`, { method: 'PATCH', headers: { prefer: 'return=representation' }, body: JSON.stringify(patch) });
      return rows?.[0] || null;
    },
    async remove(c, id, owner) {
      const qs = owner ? `id=eq.${id}&owner=eq.${owner}` : `id=eq.${id}`;
      await req(`${c}?${qs}`, { method: 'DELETE' });
      return true;
    },
    async count(c, { owner } = {}) {
      const qs = new URLSearchParams({ select: 'count' });
      if (owner) qs.set('owner', `eq.${owner}`);
      const res = await fetch(`${base}/rest/v1/${c}?${qs}`, { headers: { ...headers, prefer: 'count=exact', range: '0/0' }, signal: AbortSignal.timeout(10000) });
      const cr = res.headers.get('content-range') || '';
      return Number(cr.split('/')[1] || 0);
    },
  };
}
