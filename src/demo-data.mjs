export const DISCLAIMER = '本系统仅为信息参考，不能替代官方许可与报关行专业意见。';
export const DEMO_NOTICE = '当前为演示模式，规则、税率和预警均为模拟数据，不用于实际贸易决策。';
export const sources = [
  { id: 'S01', name: '经济部国际贸易署', category: '商品输入规定', url: 'https://www.trade.gov.tw/', note: '官方查询入口；尚未接入具体条款', status: '待核验' },
  { id: 'S02', name: '财政部关务署', category: '税则与特别防卫措施', url: 'https://web.customs.gov.tw/', note: '官方查询入口；尚未接入实时税则', status: '待核验' },
  { id: 'S03', name: '卫生福利部食品药物管理署', category: '食品与标签规定', url: 'https://www.fda.gov.tw/', note: '官方查询入口；尚未接入具体条款', status: '待核验' },
];
export const initialProducts = [
  { id: 'p-oat', name: '低糖燕麦饮', category: '食品饮料', hs: '220299', market: '中国台湾地区', origin: '中国大陆', specs: '250mL / 常温保存 / 植物配方', scenario: 'conditional', updated: '2026-10-07', color: 'blue', cost_value: 30000, cost_quantity: 2000 },
  { id: 'p-spark', name: '无糖气泡水', category: '食品饮料', hs: '220210', market: '中国台湾地区', origin: '中国大陆', specs: '330mL / 无糖 / 含气', scenario: 'allowed', updated: '2026-10-06', color: 'cyan', cost_value: 18000, cost_quantity: 3000 },
  { id: 'p-protein', name: '植物蛋白饮', category: '食品饮料', hs: '', market: '中国台湾地区', origin: '中国大陆', specs: '配方成分待补充', scenario: 'unknown', updated: '2026-10-05', color: 'orange', cost_value: 12000, cost_quantity: 1000 },
];
export const scenarios = {
  conditional: { label: '需要专案核准', short: '需核准', tone: 'amber', subtitle: '演示场景：申请条件与产品资料仍需核验', explanation: '此结论仅用于展示“需核准”的交互流程。真实准入状态、申请主体与办理材料必须以已核验的官方条款为准。', checklist: ['核对当地完整商品分类编码', '确认可申请主体与当地进口方要求', '核验成分、标签及检测材料', '向主管机关确认申请流程与周期'] },
  allowed: { label: '准许入境', short: '准许入境', tone: 'green', subtitle: '演示场景：模拟满足准入条件', explanation: '此场景模拟规则已满足的结果，并不表示该产品真实获准进口。正式评估仍需查验原产地限制与商品输入规定。', checklist: ['核验商品编码与原产地条件', '确认必要标签和检验要求', '与进口方核对申报文件'] },
  denied: { label: '禁止入境', short: '禁止入境', tone: 'red', subtitle: '演示场景：模拟命中禁止规则', explanation: '此场景仅用于测试禁止结果的呈现。禁止原因必须绑定具体官方条款；当前未接入真实禁止规则。', checklist: ['核验具体禁止条款及适用范围', '暂停以当前假设继续报价', '咨询主管机关或专业报关人员'] },
  unknown: { label: '无法判定', short: '待补充', tone: 'slate', subtitle: '缺少经过核验的规则或产品信息', explanation: '尚未接入经人工审核的正式规则库，无法作出真实准入结论。请补齐当地编码、原产地与产品成分，核验官方规则后再评估。', checklist: ['补充完整商品编码', '补充产品成分及关键参数', '接入经审核的官方规则'] },
};
// UI fixture selection only. This is not a market-access engine.
export function getDemoAssessment(product) {
  const scenario = product.market !== '中国台湾地区' || !product.hs || !product.specs ? 'unknown' : product.scenario;
  return { ...scenarios[scenario || 'unknown'], scenario: scenario || 'unknown', simulated: true, version: 'DEMO-2026.10-v1' };
}
export const defaultCost = { value: 30000, quantity: 2000, freight: 1800, insurance: 120, dutyRate: 10, vatRate: 5, fee: 600, ssgRate: 0 };
// Two fixed illustration snapshots. Changed inputs must be handed to Qwen Work.
// The frontend deliberately contains no tariff/tax calculation engine.
export function getDemoCostPreview(input) {
  const names = Object.keys(defaultCost);
  const x = {};
  for (const key of names) {
    if (input[key] === '' || input[key] == null) throw new Error('请填写所有成本参数。');
    x[key] = Number(input[key]);
    if (!Number.isFinite(x[key]) || x[key] < 0) throw new Error('成本参数必须是有效的非负数。');
  }
  if (!Number.isSafeInteger(x.quantity) || x.quantity <= 0) throw new Error('出口数量必须为正整数。');
  if (x.value <= 0) throw new Error('货值必须大于零。');
  for (const key of ['dutyRate', 'vatRate', 'ssgRate']) if (x[key] > 100) throw new Error('税率必须在 0–100% 之间。');
  if (names.some(key => key !== 'ssgRate' && x[key] !== defaultCost[key]) || ![0, 15].includes(x.ssgRate))
    throw new Error('参数已修改，请交给千问办公测算。网页不在本地推算税费。');
  const snapshots = {
    0: { cif: 31920, duty: 3192, ssg: 0, vat: 1755.6, tax: 4947.6, total: 37467.6, unit: 18.73, rate: 15.5 },
    15: { cif: 31920, duty: 3192, ssg: 4788, vat: 1995, tax: 9975, total: 42495, unit: 21.25, rate: 31.25 },
  };
  return { ...snapshots[x.ssgRate], inputs: x, isDemo: true, provenance: 'STATIC_UI_FIXTURE' };
}
export function readStore(key, fallback) {
  try { const value = JSON.parse(localStorage.getItem(key)); return Array.isArray(value) ? value : fallback; } catch { return fallback; }
}
export function writeStore(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; } }
export function today() { return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' }).format(new Date()); }

/* ---------------- 工作区（轻量多租户） ----------------
 * 本地按工作区分桶存储，服务端按 x-workspace 头隔离，两层口径一致。
 * 注意：这是数据隔离演示，不是账号鉴权——公开地址上任何人都可自称某个工作区，
 * 因此不得录入真实企业敏感数据；正式多用户需接入注册登录与数据库。 */
export const DEFAULT_OWNER = '演示企业';
export function readOwner() {
  try { const v = String(localStorage.getItem('tradepilot.owner.v1') || '').trim(); return v.slice(0, 32) || DEFAULT_OWNER; } catch { return DEFAULT_OWNER; }
}
export function writeOwner(name) { try { localStorage.setItem('tradepilot.owner.v1', String(name).trim().slice(0, 32)); return true; } catch { return false; } }
export const scopedKey = (key, owner) => `${key}::${String(owner || DEFAULT_OWNER).trim()}`;
