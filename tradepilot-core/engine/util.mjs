/** 通用工具：数字/日期/校验。所有引擎依赖，确定性、无随机、无副作用。 */

export const now = () => new Date();

export function todayISO(d = new Date()) {
  const f = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai', dateStyle: 'short', timeStyle: 'medium' });
  return f.format(d).replace(' ', 'T');
}

export function dateOnly(iso) { return String(iso || '').slice(0, 10); }

export const round = (n, d = 2) => {
  const p = 10 ** d;
  return Math.round((Number(n) + Number.EPSILON) * p) / p;
};

export const isFiniteNumber = (v) => typeof v === 'number' && Number.isFinite(v);

export function num(v, name, { min = 0, max = Infinity, required = true, integer = false } = {}) {
  if (v === '' || v === null || v === undefined) {
    if (required) throw new AppError(`${name}不能为空。`, 'VALIDATION', { field: name });
    return null;
  }
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[,\s，]/g, ''));
  if (!Number.isFinite(n)) throw new AppError(`${name}必须是有效数字。`, 'VALIDATION', { field: name });
  if (integer && !Number.isSafeInteger(n)) throw new AppError(`${name}必须是整数。`, 'VALIDATION', { field: name });
  if (n < min) throw new AppError(`${name}不能小于 ${min}。`, 'VALIDATION', { field: name });
  if (n > max) throw new AppError(`${name}不能大于 ${max}。`, 'VALIDATION', { field: name });
  return n;
}

export function str(v, name, { max = 500, required = false } = {}) {
  const s = v === null || v === undefined ? '' : String(v).trim();
  if (!s && required) throw new AppError(`${name}不能为空。`, 'VALIDATION', { field: name });
  if (s.length > max) throw new AppError(`${name}长度不能超过 ${max} 字。`, 'VALIDATION', { field: name });
  return s;
}

export class AppError extends Error {
  constructor(message, code = 'ERROR', meta = {}) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.meta = meta;
  }
}

/** 简单深拷贝（结构均为 JSON 兼容数据） */
export const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

/** 稳定排序：按 key 函数排序副本 */
export function sortBy(arr, keyFn, dir = 1) {
  return [...arr].sort((a, b) => {
    const ka = keyFn(a); const kb = keyFn(b);
    if (ka === kb) return 0;
    return (ka > kb ? 1 : -1) * dir;
  });
}

/** 生成可读 ID（时间戳 + 随机后缀），用于业务单据 */
export function makeId(prefix = 'ID') {
  const t = Date.now().toString(36).toUpperCase();
  const r = Array.from({ length: 4 }, () => '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ'[Math.floor(Math.random() * 34)]).join('');
  return `${prefix}-${t}-${r}`;
}

/** 区间文案 */
export function rangeText([a, b], unit = '天') {
  if (a === b) return `约 ${a} ${unit}`;
  return `${a}–${b} ${unit}`;
}

export function addDays(iso, days) {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

/** 计算两值差异百分比（用于成本模拟对比） */
export function deltaPct(from, to) {
  if (!from) return null;
  return round(((to - from) / from) * 100, 2);
}
