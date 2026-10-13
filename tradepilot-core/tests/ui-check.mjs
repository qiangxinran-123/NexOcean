/**
 * 前端端到端检查（真实浏览器：本机 Edge / Playwright channel）
 * 运行：node tests/ui-check.mjs
 * 三条线：
 *   A. React 既有前端（根路径）接入核心引擎后的真实数据展示
 *   B. 核心引擎控制台（/console/）全功能
 *   C. 后端不可用时的降级行为（React 回落固定样例；控制台回落本地引擎）
 * 失败条件：页面级 JS 异常、控制台 error、关键元素缺失、免责声明缺失、移动端横向溢出。
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = path.join(ROOT, 'docs', 'screenshots');
fs.mkdirSync(SHOTS, { recursive: true });

const PORT = Number(process.env.UI_PORT || 8141);
const BASE = `http://127.0.0.1:${PORT}`;
const CONSOLE = `${BASE}/console/`;

const server = spawn(process.execPath, ['server.js'], {
  cwd: ROOT,
  env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', DATA_DIR: path.join(ROOT, '..', 'tmp', 'ui-data', Date.now().toString(36)) },
  stdio: ['ignore', 'pipe', 'pipe'],
});
server.stderr.on('data', (d) => process.stderr.write(`[server:err] ${d}`));

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function up() {
  for (let i = 0; i < 60; i += 1) { try { const r = await fetch(`${BASE}/api/health`); if (r.ok) return; } catch { /* retry */ } await wait(250); }
  throw new Error('服务未启动');
}

const problems = [];
const steps = [];
const ok = (name) => steps.push(`✓ ${name}`);
const bad = (name, why) => { steps.push(`✗ ${name} → ${why}`); problems.push(name); };
const SHOT_CSS = '.skip-link{display:none!important}';
async function shot(page, file) {
  await page.addStyleTag({ content: SHOT_CSS }).catch(() => {});
  await page.screenshot({ path: path.join(SHOTS, file), fullPage: true });
}
async function exists(page, sel, name, timeout = 9000) {
  try { await page.waitForSelector(sel, { timeout }); ok(name); return true; } catch { bad(name, `未出现 ${sel}`); return false; }
}
const textOf = (page, sel) => page.textContent(sel).catch(() => '');

let browser;
try {
  await up();
  try { browser = await chromium.launch({ headless: true, channel: 'msedge' }); }
  catch { browser = await chromium.launch({ headless: true }); }

  /* ============ A. React 既有前端接入核心引擎 ============ */
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => problems.push(`React 页面异常：${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`React 控制台错误：${m.text()}`); });

  await page.goto(BASE, { waitUntil: 'networkidle' });
  if (await exists(page, '.sidebar', 'React 前端在根路径渲染')) {
    const badge = await textOf(page, '.demo-badge');
    badge.includes('核心引擎已接入') ? ok('React 前端探测到核心引擎并切换标识') : bad('React 引擎标识', badge);
    const foot = await textOf(page, '.footer-mode');
    /TW-CORE/.test(foot) ? ok('React 页脚展示规则版本与降级策略') : bad('React 页脚规则版本', foot);
    await shot(page, '20-React工作台-引擎已接入.png');
  }

  /* 客户界面不得出现开发者口径横幅（demo-notice 已全部移除，防止回归） */
  for (const hb of ['#assessment', '#cost', '#alerts', '#tariff', '#regulations', '#verify']) {
    await page.goto(`${BASE}${hb}`, { waitUntil: 'domcontentloaded' });
    await wait(500);
    const bn = await page.$$eval('.demo-notice', (n) => n.length).catch(() => 0);
    bn === 0 ? ok(`页面 ${hb} 无开发者口径横幅`) : bad(`横幅残留 ${hb}`, `${bn} 条`);
  }

  await page.click('a[href="#assessment"]');
  await page.waitForSelector('.result-panel');
  const aTxt = await textOf(page, '.result-panel');
  /规则引擎/.test(aTxt) ? ok('React 准入页展示规则引擎结论') : bad('React 准入结论来源', aTxt.slice(0, 60));
  /须当地进口商申报/.test(aTxt) ? ok('React 准入页展示申请主体结论') : bad('React 申请主体', '缺失');
  /执行口径/.test(aTxt) ? ok('React 准入页披露口岸执行口径差异') : bad('React 执行口径披露', '缺失');
  /参考级结论|依据已核验/.test(aTxt) ? ok('React 准入页展示核验等级') : bad('React 核验等级', '缺失');
  /不能替代官方许可/.test(aTxt) ? ok('React 准入页随结果展示免责') : bad('React 准入免责', '缺失');
  /* V21：办理周期拆解——串行相加 / 并行取最长 / 一次性前置单列 / 口岸放行另计 */
  await page.waitForSelector('.tl-wrap', { timeout: 10000 });
  const tlTxt = await textOf(page, '.tl-wrap');
  /关键路径/.test(tlTxt) && /14–45 天/.test(tlTxt) ? ok('准入结果展示关键路径周期（串行义务相加）') : bad('关键路径周期', tlTxt.slice(0, 70));
  /相加 14–45 天/.test(tlTxt) ? ok('周期拆解标注该段是「相加」得来，不是给定值') : bad('相加口径标注', tlTxt.slice(0, 70));
  /并行准备工作/.test(tlTxt) && /取最长 0–\d+ 天/.test(tlTxt) ? ok('并行准备项单列且只取最长（不吞并关键路径）') : bad('并行段', tlTxt.slice(0, 70));
  /一次性主体资格/.test(tlTxt) && /长期复用/.test(tlTxt) ? ok('一次性主体资格前置单列并说明可复用') : bad('前置段', tlTxt.slice(0, 70));
  /口岸查验放行/.test(tlTxt) && /到港后可上架/.test(tlTxt) ? ok('另计口岸查验放行并给出到港可上架合计') : bad('口岸放行段', tlTxt.slice(0, 70));
  /船期/.test(tlTxt) ? ok('明示船期/通路不在周期口径内') : bad('船期口径声明', tlTxt.slice(0, 70));
  await shot(page, '21b-React办理周期拆解.png');
  /* V12 起：引擎在线时演示详情页（评估结论/办理路径/依据 tabs）整体移除，核验状态改由命中条例区呈现 */
  (await page.$('.detail-panel')) === null ? ok('引擎在线时演示详情 tabs 已移除（不再与新结论并存）') : bad('演示详情残留', 'detail-panel 仍存在');
  const hitTxt = await textOf(page, '.result-panel');
  /待核验|已核验/.test(hitTxt) ? ok('命中条例区展示核验状态') : bad('核验状态', hitTxt.slice(0, 60));
  await shot(page, '21-React准入-引擎结论.png');

  /* ---- V7：单市场 / 全球扫描双模式 ---- */
  await page.waitForSelector('.mode-switch', { timeout: 9000 });
  ok('准入页提供「单市场评估 / 全球市场扫描」模式切换');
  await page.click('.mode-switch button:has-text("全球市场扫描")');
  await page.waitForSelector('.scan-table', { timeout: 15000 });
  await wait(700);
  const scanRows = await page.$$eval('.scan-table tbody tr', (r) => r.length);
  scanRows === 4 ? ok(`全球扫描渲染 ${scanRows} 个建库市场（台 / 日 / 美 / 欧）`) : bad('扫描市场数', `${scanRows} 行`);
  const scanTxt = await textOf(page, '.scan-panel');
  /准许入境（有条件）/.test(scanTxt) ? ok('已建库市场（中国台湾地区）给出真实引擎结论') : bad('建库市场结论', scanTxt.slice(0, 80));
  /食品卫生法/.test(scanTxt) && /FSVP/.test(scanTxt) ? ok('日 / 美市场结论引用各自法规（市场分流生效）') : bad('市场分流', scanTxt.slice(0, 80));
  (await page.$$eval('.scan-table tbody tr', (rs) => rs.every((r) => !r.textContent.includes('无法判定')))) ? ok('四个建库市场全部给出结论，无空骨架行') : bad('空骨架行', '仍存在无法判定行');
  /跨市场推测|不推测/.test(scanTxt) ? ok('扫描结果附带输出边界说明') : bad('扫描边界说明', '缺失');
  /已建库 4 个/.test(scanTxt) ? ok('扫描摘要披露建库数量') : bad('扫描摘要', '缺失');
  await shot(page, '29-React全球市场扫描.png');
  await page.click('.mode-switch button:has-text("单市场评估")');
  await wait(600);

  /* ---- V8：编辑资料改 HS 后结论必须自动重估，不得要求手动刷新 ---- */
  await page.waitForSelector('.result-panel .result-top .text-button', { timeout: 9000 });
  await page.click('.result-panel .result-top .text-button');
  await page.waitForSelector('.modal input[name="hs"]');
  await page.fill('.modal input[name="hs"]', '999999');
  await page.click('.modal button:has-text("保存并查看评估")');
  await wait(1800);
  let editTxt = await textOf(page, '.result-panel');
  /无法判定/.test(editTxt) ? ok('改 HS 为未收录编码后，结论自动更新为无法判定（无需手动刷新）') : bad('改 HS 自动重估', editTxt.slice(0, 60));
  /999999/.test(editTxt) ? ok('结果面板同步显示新 HS 编码') : bad('HS 显示同步', editTxt.slice(0, 60));
  await page.click('.result-panel .result-top .text-button');
  await page.waitForSelector('.modal input[name="hs"]');
  await page.fill('.modal input[name="hs"]', '220299');
  await page.click('.modal button:has-text("保存并查看评估")');
  await wait(1800);
  editTxt = await textOf(page, '.result-panel');
  /准许入境（有条件）/.test(editTxt) ? ok('改回已收录编码后，结论自动恢复（种子档案已还原）') : bad('HS 还原', editTxt.slice(0, 60));
  await shot(page, '30-React编辑HS自动重估.png');

  /* ---- V7：产品表准入状态改用引擎结论，表单移除演示场景开关 ---- */
  await page.click('a[href="#products"]');
  await page.waitForSelector('.product-table');
  const headTxt = await textOf(page, '.product-table thead');
  /引擎/.test(headTxt) ? ok('产品表准入状态标注为引擎结论') : bad('引擎标注', headTxt.slice(0, 40));
  await page.click('button:has-text("添加产品")');
  await page.waitForSelector('.modal');
  const modalTxt = await textOf(page, '.modal');
  /演示规则场景/.test(modalTxt) ? bad('演示场景开关', '仍留在表单中') : ok('新建产品表单已移除「演示规则场景」假开关');
  /准入结论如何产生/.test(modalTxt) && /规则引擎/.test(modalTxt) ? ok('表单改为说明结论由规则引擎产生') : bad('结论来源说明', '缺失');
  await page.keyboard.press('Escape');
  await wait(400);

  /* ---- V12：出海进度与待办（工作台） ---- */
  await page.goto(`${BASE}/#overview`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.journey-panel', { timeout: 15000 });
  await page.waitForSelector('.journey-steps .jstep', { timeout: 12000 });
  (await page.$$eval('.jstep', (n) => n.length)) === 9 ? ok('工作台显示九阶段出海进度条') : bad('阶段条', '数量不足');
  const snapTxt = await textOf(page, '.journey-snapshot');
  /准入状态/.test(snapTxt) && /成本完整度/.test(snapTxt) && /主要风险/.test(snapTxt) && /待补资料/.test(snapTxt) && /下一步/.test(snapTxt)
    ? ok('决策快照五要素齐备（准入/成本/风险/待补/下一步）') : bad('快照要素', snapTxt.slice(0, 60));
  await wait(2200); /* 等引擎结论缓存回填 */
  const jt = await textOf(page, '.journey-panel');
  /当前阶段 \d \/ 9/.test(jt) ? ok(`进度条标注当前阶段（${jt.match(/当前阶段 \d \/ 9[^·]*/)?.[0]}）`) : bad('当前阶段', '缺失');
  const todoRows = await page.$$eval('.jtodo', (n) => n.length);
  todoRows >= 4 ? ok(`待办清单 ${todoRows} 项（事项/状态/待补/角色/下一步）`) : bad('待办数量', `${todoRows}`);
  /角色：/.test(jt) ? ok('待办项显示处理角色') : bad('待办角色', '缺失');
  await shot(page, '34-React出海进度与待办.png');
  /* 人工记录复选：勾选「市场调研确认」后持久化（DOM click，避开 opacity:0 输入的 actionability 等待） */
  const hasResearch = await page.$('.jtodo .jcheck input[aria-label="市场调研确认"]');
  if (hasResearch) {
    await page.evaluate(() => document.querySelector('.jtodo .jcheck input[aria-label="市场调研确认"]').click());
    await wait(350);
    const flashNow = await page.$('.jtodo.flash');
    const stageLit = await page.$('.jstep.pulse');
    flashNow && stageLit ? ok('勾选触发点亮动画（行泛绿 + 对应阶段灯脉冲）') : bad('点亮动画', `row=${!!flashNow} stage=${!!stageLit}`);
    const stored = await page.evaluate(() => Object.keys(localStorage).some(k => k.includes('journey') && (localStorage.getItem(k) || '').includes('research')));
    stored ? ok('人工记录复选写入本地存储（市场调研确认）') : bad('人工复选持久化', '未存储');
    const numOf = (s) => Number(String(s).match(/当前阶段 (\d) \/ 9/)?.[1] || 0);
    const beforeN = numOf(jt);
    const jtAfter = await textOf(page, '.journey-panel');
    (/市场调研确认/.test(jtAfter) && /已记录/.test(jtAfter)) ? ok('勾选后条目保留并标记「已记录」，不直接消失') : bad('已记录保留', jtAfter.slice(0, 60));
    numOf(jtAfter) > beforeN ? ok(`勾选后阶段自动推进（${beforeN} → ${numOf(jtAfter)}）`) : bad('阶段推进', `${beforeN} → ${numOf(jtAfter)}`);
    await wait(900); /* 等点亮动画消退 */
    (await page.$('.jtodo.flash')) === null ? ok('点亮动画约 1 秒后自然消退') : bad('动画消退', '仍在高亮');
    /* 还原：清空该产品的人工记录，后续切换产品时 JourneyPanel 会重新读取 */
    await page.evaluate(() => { const k = Object.keys(localStorage).find(x => x.includes('journey') && x.includes('p-oat')); if (k) localStorage.setItem(k, '[]'); });
  } else bad('人工复选项', '未找到市场调研确认');

  /* 阻塞产品视角：切到无编码产品看待办 */
  await page.selectOption('.journey-panel .product-select select', 'p-protein');
  await wait(2000);
  const jtp = await textOf(page, '.journey-panel');
  /补充 HS 编码/.test(jtp) && /阻塞/.test(jtp) ? ok('无编码产品的待办正确标记「补充 HS 编码 · 阻塞」') : bad('阻塞待办', jtp.slice(0, 60));
  await page.selectOption('.journey-panel .product-select select', 'p-oat');
  await wait(1500);

  /* ---- V18：标签自查全流程（打开 → 示例文本 → 扫描命中 → 整改提示 → 标记完成点亮阶段 5） ---- */
  await page.click('.jtodo:has-text("标签与本地化自查") .text-button');
  await page.waitForSelector('.modal textarea[name="labelText"]', { timeout: 9000 });
  ok('「标签与本地化自查」提供打开自查入口（不再是无完成路径的死项）');
  await page.click('.modal button:has-text("填入示例文本")');
  await wait(400);
  const lblText = await page.inputValue('.modal textarea[name="labelText"]');
  /治療|高血压|高血壓/.test(lblText) ? ok('示例文本已填入（含违规宣称）') : bad('示例文本', lblText.slice(0, 40));
  await page.click('.modal button:has-text("开始扫描")');
  await page.waitForSelector('.lbl-verdict.fail', { timeout: 12000 });
  const lblHitCount = await page.$$eval('.lbl-hit', (n) => n.length);
  lblHitCount >= 3 ? ok(`标签扫描命中 ${lblHitCount} 条（含整改建议与依据）`) : bad('扫描命中数', `${lblHitCount}`);
  const lblHitTxt = await textOf(page, '.lbl-hits');
  /整改建议/.test(lblHitTxt) && /依据：/.test(lblHitTxt) ? ok('命中条目展示整改建议与规则依据') : bad('命中展示', lblHitTxt.slice(0, 60));
  (await page.$('.jstep:nth-child(5).done')) === null ? ok('阶段 5 在自查完成前不点亮（修正了误绑准入的旧逻辑）') : bad('阶段 5 判定', '提前点亮');
  await page.click('.modal button:has-text("标记自查完成")');
  await wait(900);
  const afterLbl = await textOf(page, '.journey-panel');
  /已记录/.test(afterLbl) ? ok('标记自查完成 → 条目保留并显示「已记录」') : bad('自查完成标记', afterLbl.slice(0, 60));
  (await page.$('.jstep:nth-child(5).done')) ? ok('阶段 5「合规与本地化」随自查完成点亮') : bad('阶段 5 点亮', '未点亮');
  /* 还原：清空该产品的人工记录（后续页面重挂载时生效） */
  await page.evaluate(() => { const k = Object.keys(localStorage).find(x => x.includes('journey') && x.includes('p-oat')); if (k) localStorage.setItem(k, '[]'); });

  /* ---- V12：评估页旧样例清除（引擎在线时无演示结论/演示路径） ---- */
  await page.goto(`${BASE}/#assessment`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.result-panel', { timeout: 15000 });
  await wait(1000);
  const assessTxt = await page.textContent('.assessment-grid');
  /演示规则|模拟评估|办理路径 · 待官方确认/.test(assessTxt) ? bad('旧样例残留', '引擎在线时仍出现演示结论/路径') : ok('引擎在线时无演示结论/办理路径旧样例');
  /办理书件清单/.test(assessTxt) ? ok('结果面板展示引擎书件清单') : bad('书件清单', '缺失');
  /去算落地成本/.test(assessTxt) ? ok('评估页底部下一步改为「去算落地成本」') : bad('下一步按钮', '仍是旧的交接按钮');

  /* ---- V12：成本页待补横幅 / 币种标注 / 重算指示 ---- */
  await page.goto(`${BASE}/#cost`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.cost-result', { timeout: 15000 });
  await wait(1200);
  const costTxt = await textOf(page, '.cost-result');
  /TWD 计征 · 未换算/.test(costTxt) ? ok('口岸规费行标注「TWD 计征 · 未换算」') : bad('币种标注', '缺失');
  /汇率换算/.test(costTxt) ? ok('汇率未换算进入待补披露') : bad('汇率披露', '缺失');
  const fxVal = await page.inputValue('input[name="value"]');
  await page.fill('input[name="value"]', String(Number(fxVal) + 5000));
  await page.waitForSelector('.recalc-badge', { timeout: 4000 }).then(() => ok('参数变更时显示「重算中」指示，旧结果不冒充新结果')).catch(() => bad('重算指示', '未出现'));
  await wait(1800);
  const costTxt2 = await textOf(page, '.cost-result');
  costTxt2 !== costTxt ? ok('重算完成后数字更新') : bad('重算更新', '总额未变');
  await page.fill('input[name="value"]', fxVal);
  await wait(1600);

  /* ---- V12：使用指南与实际能力对齐 ---- */
  await page.goto(`${BASE}/#overview`, { waitUntil: 'networkidle' });
  await page.click('button:has-text("演示使用指南")');
  await page.waitForSelector('.modal .guide-steps');
  const guideTxt = await page.textContent('.modal');
  /全球扫描|全球市场扫描/.test(guideTxt) && /税则库/.test(guideTxt) && /法规库/.test(guideTxt) ? ok('使用指南覆盖真实能力（扫描/税则库/法规库）') : bad('指南内容', guideTxt.slice(0, 60));
  /尚未接入|交给千问办公完成测算/.test(guideTxt) ? bad('指南过时文案', '仍声称千问办公未接入') : ok('指南不再含「尚未接入」过时表述');
  await page.keyboard.press('Escape');
  await wait(300);

  const navItems = await page.$$eval('.sidebar nav a', (a) => a.map((x) => x.textContent.trim()));
  navItems.includes('税则库') && navItems.includes('法规库') ? ok('导航新增「税则库 / 法规库」入口') : bad('导航入口', navItems.join(','));
  await page.goto(`${BASE}/#tariff`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.kb-table tbody tr', { timeout: 15000 });
  const tariffRows = await page.$$eval('.kb-table tbody tr', (r) => r.length);
  tariffRows >= 20 ? ok(`税则库渲染 ${tariffRows} 条税则`) : bad('税则库行数', `${tariffRows}`);
  const tariffTxt = await textOf(page, '.kb-table');
  /220299/.test(tariffTxt) && /12%/.test(tariffTxt) ? ok('税则库含 220299 关税 12% 口径') : bad('税则口径展示', tariffTxt.slice(0, 60));
  /* V24：库页面可跳转核验（税则库 → 核验工作台定位到该条） */
  await page.click('.kb-table a[href="#verify/q/220299"]');
  await page.waitForSelector('.verify-table tbody tr', { timeout: 15000 });
  await wait(600);
  const vqVal = await page.$eval('.kb-search input', (i) => i.value);
  const vqRows = await page.$$eval('.verify-table tbody tr', (r) => r.length);
  vqVal === '220299' && vqRows >= 1 && vqRows <= 3 ? ok(`税则库「去核验」直达核验台并定位（检索 ${vqVal}，${vqRows} 行）`) : bad('去核验定位', `${vqVal} / ${vqRows} 行`);
  await page.goto(`${BASE}/#tariff`, { waitUntil: 'networkidle' });
  await shot(page, '31-React税则库.png');
  await page.goto(`${BASE}/#regulations`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.reg-card', { timeout: 15000 });
  const regCards = await page.$$eval('.reg-card', (r) => r.length);
  regCards >= 10 ? ok(`法规库渲染 ${regCards} 条管制制度`) : bad('法规库卡片数', `${regCards}`);
  const regTxt = await textOf(page, '.reg-grid');
  /RG-IMP-01/.test(regTxt) && /须当地进口商/.test(regTxt) ? ok('法规库含申请主体与规则 ID') : bad('法规内容', regTxt.slice(0, 60));
  /书件清单/.test(regTxt) ? ok('法规库展示书件清单') : bad('书件清单', '缺失');
  await shot(page, '32-React法规库.png');
  await page.goto(`${BASE}/#assessment`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.result-panel');
  await wait(900);
  const ords = await page.$$eval('.result-panel .source-ord', (n) => n.map((x) => x.textContent.trim()));
  ords.length >= 1 && ords.every((t) => /^\d+$/.test(t)) ? ok(`依据来源灰色块改为序号（${ords.slice(0, 4).join(',')}…）`) : bad('来源序号', ords.join(','));
  const srcNote = await textOf(page, '.result-panel');
  /RG-/.test(srcNote) ? ok('规则 ID 保留在说明文字中（可追溯）') : bad('规则 ID 保留', srcNote.slice(0, 40));

  /* ---- V11：命中条例可跳转法规库并自动搜索 ---- */
  await page.waitForSelector('.hit-rule', { timeout: 9000 });
  const hitCount = await page.$$eval('.hit-rule', (n) => n.length);
  hitCount >= 3 ? ok(`评估结果列出 ${hitCount} 条命中条例（名称+机构+规则 ID）`) : bad('命中条例', `${hitCount} 条`);
  await page.click('.hit-rule:has-text("RG-") .text-button');
  await page.waitForSelector('.reg-card', { timeout: 15000 });
  await wait(600);
  const regQ = await page.inputValue('.kb-search input');
  /^RG-/.test(regQ) ? ok(`点击「查看条例」跳转法规库并自动搜索（${regQ}）`) : bad('条例跳转搜索', regQ);
  const regShown = await page.$$eval('.reg-card', (n) => n.length);
  regShown >= 1 && regShown < 13 ? ok(`法规库按规则 ID 过滤出 ${regShown} 条（非全量）`) : bad('条例过滤', `${regShown} 张卡片`);
  await page.fill('.kb-search input', '标示');
  await wait(500);
  const lblTxt = await textOf(page, '.kb-toolbar-wide');
  /条匹配/.test(lblTxt) ? ok(`法规库关键词搜索生效（${lblTxt.match(/\d+ \/ \d+ 条匹配/)?.[0]}）`) : bad('法规搜索', lblTxt.slice(0, 40));
  await page.fill('.kb-search input', '');
  await wait(400);

  /* ---- V11：税则库搜索 ---- */
  await page.goto(`${BASE}/#tariff`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.kb-table tbody tr', { timeout: 15000 });
  await page.fill('.kb-search input', '220299');
  await wait(500);
  const tRows = await page.$$eval('.kb-table tbody tr', (r) => r.length);
  tRows === 1 ? ok('税则库搜索 220299 精确命中 1 条') : bad('税则搜索', `${tRows} 行`);
  await page.fill('.kb-search input', '饮料');
  await wait(500);
  const tRows2 = await page.$$eval('.kb-table tbody tr', (r) => r.length);
  tRows2 >= 1 && tRows2 < 24 ? ok(`税则库搜索「饮料」命中 ${tRows2} 条（全字段过滤）`) : bad('税则模糊搜索', `${tRows2} 行`);
  await page.fill('.kb-search input', '不存在的关键词xyz');
  await wait(400);
  /没有匹配/.test(await textOf(page, '.kb-table')) ? ok('税则库无结果时给出提示而非空白') : bad('空态提示', '缺失');

  /* 营销海报模块已按需求移除（V16/V11 海报用例随之删除） */

  /* ---- V15：竞品分析 / 方案报告 ---- */
  const navAll = await page.$$eval('.sidebar nav a', (a) => a.map((x) => x.textContent.trim()));
  navAll.includes('竞品分析') && navAll.includes('方案报告') ? ok('导航新增「竞品分析 / 方案报告」入口') : bad('导航入口', navAll.join(','));

  await page.goto(`${BASE}/#competition`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.comp-table tbody tr', { timeout: 15000 });
  const compRows = await page.$$eval('.comp-table tbody tr', (r) => r.length);
  compRows >= 8 ? ok(`竞品分析渲染 ${compRows} 条快照`) : bad('竞品行数', `${compRows}`);
  const compTxt = await textOf(page, '.comp-panel, .panel');
  /每升/.test(compTxt) && /待核验/.test(compTxt) ? ok('竞品表含每升归一价格与待核验标注') : bad('竞品口径', compTxt.slice(0, 60));
  /NT\$\s*\d+\s*[–-]\s*\d+\s*\/\s*升/.test(compTxt) ? ok('竞品价格带汇总显示（NT$ X–Y/升）') : bad('价格带汇总', '缺失');
  await shot(page, '35-React竞品分析.png');

  await page.goto(`${BASE}/#report`, { waitUntil: 'networkidle' });
  await page.waitForSelector('button:has-text("生成报告")', { timeout: 12000 });
  await page.click('button:has-text("生成报告")');
  await page.waitForSelector('.report-sections', { timeout: 25000 });
  const secTxt = await textOf(page, '.report-panel');
  ['市场调研', '准入评估', '成本与收益', '风控预案', '下一步方案'].every((s) => secTxt.includes(s)) ? ok('方案报告五段齐备（调研/评估/成本/风控/方案）') : bad('报告五段', secTxt.slice(0, 60));
  /条风险预案/.test(secTxt) && /责任：/.test(secTxt) ? ok(`风控预案展示（${secTxt.match(/\d+ 条风险预案/)?.[0]}，含责任角色）`) : bad('预案展示', '缺失');
  const rptCount = await page.$$eval('.rplan-row', (n) => n.length);
  rptCount >= 4 ? ok(`预案清单 ${rptCount} 条`) : bad('预案行数', `${rptCount}`);
  const rptDlP = page.waitForEvent('download', { timeout: 12000 }).catch(() => null);
  await page.click('button:has-text("下载 HTML")');
  const rptDl = await rptDlP;
  rptDl ? ok(`报告 HTML 下载成功（${rptDl.suggestedFilename()}）`) : bad('报告下载', '未触发下载');
  await shot(page, '36-React方案报告.png');


  await page.goto(`${BASE}/#overview`, { waitUntil: 'networkidle' });
  /* ---- V19：规则核验工作台 / 变更登记 / 演示残留清理 ---- */
  await page.goto(`${BASE}/#verify`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.verify-table tbody tr', { timeout: 15000 });
  const vRows = await page.$$eval('.verify-table tbody tr', (r) => r.length);
  vRows >= 55 ? ok(`核验工作台渲染 ${vRows} 条规则（六类）`) : bad('核验队列', `${vRows}`);
  const vTxt = await textOf(page, '.verify-panel');
  /待核验/.test(vTxt) && /核验率/.test(vTxt) && /去评估页看效果/.test(vTxt) ? ok('核验统计（待核验/已核验/核验率）与引导展示') : bad('核验统计', vTxt.slice(0, 60));
  await page.fill('.kb-search input', '220210');
  await wait(400);
  const flipCode = (await textOf(page, '.verify-table tbody tr:first-child .kb-tags')).split('·').pop().trim();
  await page.click('.verify-table tbody tr:first-child button:has-text("AI 预检")');  await page.waitForSelector('.modal textarea[name="vaText"]', { timeout: 9000 });
  ok('核验行提供「AI 预检」入口（引擎比对，人工确认）');
  await page.click('.modal button:has-text("填入示例文本")');
  await wait(300);
  await page.click('.modal button:has-text("运行预检")');
  await page.waitForSelector('.va-verdict', { timeout: 10000 });
  const vaTxt = await textOf(page, '.modal');
  /参数一致/.test(vaTxt) && /关税税率/.test(vaTxt) ? ok('AI 预检抽取官方文本参数比对一致（关税 12%）') : bad('AI 预检结果', vaTxt.slice(0, 60));
  /人工确认/.test(vaTxt) ? ok('预检结果明示「最终由人工确认」边界') : bad('人工确认边界', '缺失');
  await page.click('.modal button:has-text("标记已核验（人工确认）")');
  await wait(1500);
  const vRowTxt = await page.$eval(`.verify-table tbody tr:has-text("${flipCode}")`, (el) => el.textContent).catch(() => '');
  /已核验/.test(vRowTxt) ? ok('预检一致后人工确认核验，该规则行即时翻转为已核验（引擎实时重建）') : bad('核验翻转', vRowTxt.slice(0, 60));
  await page.fill('.kb-search input', '');
  await wait(500);
  const seqAfter = await page.$$eval('.verify-table tbody tr', (rs) => rs.map((r) => ({ c: (r.querySelector('.kb-tags')?.textContent || '').split('·').pop().trim(), v: !!r.querySelector('.badge-green') })));
  const diag = await page.evaluate(() => ({
    q: document.querySelector('.verify-panel .kb-search input')?.value,
    pills: [...document.querySelectorAll('.verify-panel .filter-pills button[aria-pressed="true"], .verify-panel .view-pills button[aria-pressed="true"]')].map((b) => b.textContent),
    rows: document.querySelectorAll('.verify-table tbody tr').length,
  }));
  const flipIdx = seqAfter.findIndex((x) => x.c === flipCode);
  const ordered = flipIdx > 0 && seqAfter.slice(0, flipIdx).every((x) => !x.v) && seqAfter.slice(flipIdx).every((x) => x.v);
  ordered ? ok(`核验工作台排序：待核验优先，已核验沉底（${flipCode} 位于第 ${flipIdx + 1}/${seqAfter.length} 行）`) : bad('核验排序', JSON.stringify({ diag, seq: seqAfter.slice(0, 8), flipCode }));
  /* V27：核验行反向跳转——状态旁可回规则原籍（税则库/法规库/官方来源） */
  const homeHref = await page.$eval('.verify-table tbody tr a[href^="#tariff/q/"]', (a) => a.getAttribute('href')).catch(() => '');
  /^#tariff\/q\/\d/.test(homeHref) ? ok('核验行状态旁提供「查看原规则」反向跳转（税则类回税则库定位）') : bad('反向跳转', homeHref);
  await page.click('.verify-table tbody tr a[href^="#tariff/q/"]');
  await page.waitForSelector('.kb-table tbody tr', { timeout: 12000 });
  await wait(500);
  const backRows = await page.$$eval('.kb-table tbody tr', (r) => r.length);
  backRows >= 1 && backRows <= 3 ? ok(`反向跳转落地税则库并定位（${backRows} 行）`) : bad('反向跳转落地', `${backRows} 行`);
  await page.goto(`${BASE}/#verify`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.verify-table tbody tr', { timeout: 12000 });
  await page.fill('.kb-search input', '');
  await wait(300);
  await shot(page, '38-React规则核验.png');
  /* V22：定位三要素 + 按来源聚类（不必开官网首页再手搜） */
  await page.click('.view-pills button:has-text("按来源聚类")');
  await page.waitForSelector('.vgroup', { timeout: 10000 });
  const vgCount = await page.$$eval('.vgroup', (n) => n.length);
  vgCount >= 5 ? ok(`核验队列可切换为按来源聚类（${vgCount} 个来源组，一次进站核多条）`) : bad('来源分组', `${vgCount}`);
  const vgTxt = await textOf(page, '.vgroup');
  /打开官网/.test(vgTxt) && /复制本组核验清单/.test(vgTxt) ? ok('来源组提供官网入口与本组待核清单批量复制') : bad('分组入口', vgTxt.slice(0, 60));
  const searchHref = await page.$eval('.vcard a[href*="site%3A"]', (a) => a.getAttribute('href')).catch(() => '');
  /bing\.com\/search\?q=site%3A/.test(searchHref) ? ok(`站内检索用域名限定式（${new URL(searchHref).hostname}）而非写死官方深链`) : bad('站内检索式', String(searchHref).slice(0, 70));
  const cardTxt = await textOf(page, '.vcard');
  /比对/.test(cardTxt) && /依据|找这里/.test(cardTxt) ? ok('每条给出定位三要素：站点 / 检索式 / 该比对参数') : bad('定位三要素', cardTxt.slice(0, 80));
  const groupSites = await page.$$eval('.vgroup-head strong', (ns) => ns.map((n) => n.textContent.trim()));
  new Set(groupSites).size === groupSites.length ? ok(`来源分组各自命名正确（${groupSites.length} 组互不重名）`) : bad('分组命名', groupSites.join(','));
  const noInternalId = await page.$$eval('.vcard a[href*="site%3A"]', (as) => as.every((a) => !/RG-|LB-|AF-/.test(decodeURIComponent(a.href))));
  noInternalId ? ok('检索式不含内部规则 ID（内部 ID 拿去官网搜不到）') : bad('检索式净化', '出现内部 ID');
  await shot(page, '38b-React核验按来源聚类.png');
  await page.click('.view-pills button:has-text("逐条清单")');
  await page.waitForSelector('.verify-table tbody tr', { timeout: 10000 });
  /比对|依据/.test(await textOf(page, '.verify-table')) ? ok('逐条视图内嵌定位行，表格结构未膨胀') : bad('逐条定位行', '');
  /* V26：税则库排序——待核验优先（要干的活在前），已核验按核验时间沉底 */
  await page.goto(`${BASE}/#tariff`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.kb-table tbody tr', { timeout: 15000 });
  const vsortSeq = await page.$$eval('.kb-table tbody tr', (rows) => rows.map((r) => (r.textContent.includes('已核验') ? 1 : 0)));
  const firstV = vsortSeq.indexOf(1);
  firstV > 0 && vsortSeq.slice(firstV).every((v) => v === 1)
    ? ok(`税则库待核验条目优先展示，已核验沉底（已核验从第 ${firstV + 1}/${vsortSeq.length} 行起）`)
    : bad('税则库排序', `seq 前 12 = ${JSON.stringify(vsortSeq.slice(0, 12))}`);

  await page.goto(`${BASE}/#assessment`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.result-panel', { timeout: 15000 });
  await wait(900);
  const vWarn = await textOf(page, '.result-panel');
  /依据进度 \d+\/\d+/.test(vWarn) && /去核验规则/.test(vWarn) ? ok('核验警告展示依据进度与工作台入口') : bad('核验进度入口', vWarn.slice(0, 60));

  await page.goto(`${BASE}/#cost`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.cost-result', { timeout: 15000 });
  await wait(800);
  (await page.$('button:has-text("交给千问办公测算")')) === null ? ok('成本页引擎在线时不再显示演示交接按钮') : bad('交接残留', '按钮仍在');
  /去生成方案报告/.test(await textOf(page, '.assessment-bottom')) ? ok('成本页下一步改为「去生成方案报告」') : bad('成本页下一步', '缺失');

  await page.goto(`${BASE}/#alerts`, { waitUntil: 'networkidle' });
  await page.waitForSelector('button:has-text("登记法规变更")', { timeout: 12000 });
  ok('预警页提供「登记法规变更」真实入口（引擎在线）');
  await page.click('button:has-text("登记法规变更")');
  await page.waitForSelector('.modal input[name="chgTitle"]', { timeout: 9000 });
  await page.fill('input[name="chgTitle"]', '测试登记：标示用语加严');
  await page.fill('input[name="chgSourceName"]', '卫生福利部食品药物管理署');
  await page.fill('input[name="chgSourceUrl"]', 'https://www.fda.gov.tw/');
  await page.selectOption('select[name="chgType"]', 'label');
  await page.selectOption('select[name="chgTag"]', 'food');
  await page.click('.modal button:has-text("登记并评估影响")');
  await wait(1600);
  const chgRegTxt = await textOf(page, '.alerts-grid');
  /测试登记：标示用语加严/.test(chgRegTxt) ? ok('登记的变更立即进入通知列表（真实影响评估）') : bad('登记结果', chgRegTxt.slice(0, 60));
  await page.click('button:has-text("登记法规变更")');
  await page.waitForSelector('.modal input[name="chgTitle"]', { timeout: 9000 });
  await page.fill('input[name="chgTitle"]', '缺 URL 校验测试');
  await page.fill('input[name="chgSourceName"]', '财政部关务署');
  await page.fill('input[name="chgSourceUrl"]', '');
  await page.click('.modal button:has-text("登记并评估影响")');
  await wait(600);
  /可追溯 URL/.test(await textOf(page, '.modal .form-error')) ? ok('官方来源缺 URL 被表单校验拦截（服务端 422 拦截由接口测试覆盖）') : bad('URL 校验', '未拦截');
  await page.keyboard.press('Escape');
  await wait(300);

  await page.goto(`${BASE}/#overview`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.metric-card', { timeout: 15000 });
  const cards = await page.$$eval('.metric-grid .metric-card', (els) => els.map((el) => `${el.tagName}:${el.getAttribute('href') || 'modal'}`));
  const expectCards = ['A:#products', 'A:#products/attention', 'A:#assessment/scan', 'BUTTON:modal'];
  JSON.stringify(cards) === JSON.stringify(expectCards) ? ok('四卡目标重定：产品档案→档案页 / 需处理→档案页+筛选 / 目标市场→全球扫描 / 来源→弹窗') : bad('四卡目标', cards.join(', '));
  const metricFont = await page.$eval('.metric-card strong', (el) => getComputedStyle(el).fontFamily);
  /Quicksand/.test(metricFont) ? ok('总览卡片数字保持亲和字体（Quicksand）') : bad('亲和字体', metricFont);

  await page.click('.metric-card[href="#products/attention"]');
  await page.waitForSelector('.product-table', { timeout: 12000 });
  const filterVal = await page.$eval('.status-filter select', (el) => el.value);
  filterVal === 'attention' ? ok('「需处理产品」卡片进入档案页并自动套上需处理筛选') : bad('需处理筛选', filterVal);
  await page.waitForFunction(() => document.querySelectorAll('.verdict-cache-ready, .product-table tbody tr').length >= 1, null, { timeout: 12000 }).catch(() => {});
  await wait(2200); /* 等引擎结论缓存回填后再数行 */
  const attnRows = await page.$$eval('.product-table tbody tr', (r) => r.length);
  attnRows >= 1 && attnRows <= 3 ? ok(`需处理筛选生效（${attnRows} 行，非全量）`) : bad('需处理行数', `${attnRows}`);
  const attnText = await textOf(page, '.product-table');
  /无法判定|待补充/.test(attnText) ? ok('筛选结果均为引擎判定的需处理状态') : bad('需处理内容', attnText.slice(0, 60));

  await page.goto(`${BASE}/#overview`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.metric-card[href="#assessment/scan"]', { timeout: 12000 });
  await page.click('.metric-card[href="#assessment/scan"]');
  await page.waitForSelector('.scan-table', { timeout: 20000 });
  (await page.$$eval('.scan-table tbody tr', (r) => r.length)) === 4 ? ok('「一期目标市场」卡片直达全球扫描（4 个建库市场）') : bad('扫描直达', '未进入扫描');

  await page.goto(`${BASE}/#overview`, { waitUntil: 'networkidle' });
  await page.waitForSelector('button.metric-card', { timeout: 12000 });
  await page.click('button.metric-card');
  await page.waitForSelector('.modal .source-row', { timeout: 12000 });
  const srcCount = await page.$$eval('.modal .source-row', (n) => n.length);
  srcCount >= 8 ? ok(`「待核验来源」卡片打开来源弹窗（引擎登记 ${srcCount} 条）`) : bad('来源弹窗', `${srcCount} 条`);
  const srcTxt = await textOf(page, '.modal');
  /S0\d/.test(srcTxt) && /官方查询入口/.test(srcTxt) ? ok('来源弹窗显示引擎真实登记（S 编号 + 机构入口）') : bad('来源内容', srcTxt.slice(0, 60));
  await page.keyboard.press('Escape');
  await wait(400);

  await page.click('a[href="#cost"]');
  await page.waitForSelector('.cost-result');
  await wait(900);
  const cTxt = await textOf(page, '.cost-result');
  /RULE ENGINE/.test(cTxt) ? ok('React 成本页切换为规则引擎实时测算') : bad('React 成本来源', cTxt.slice(0, 60));
  /综合税负率/.test(cTxt) && /单位落地成本/.test(cTxt) ? ok('React 成本页展示税负率与单件成本') : bad('React 成本指标', '缺失');
  /未计入项/.test(cTxt) ? ok('React 成本页展示未计入项边界') : bad('React 未计入项', '缺失');
  const cmpTxt = await textOf(page, '.compare-panel');
  /规则引擎实时测算/.test(cmpTxt) ? ok('React 情景对比切换为引擎实时双情景') : bad('React 情景对比', cmpTxt.slice(0, 60));
  await shot(page, '22-React成本-引擎测算.png');

  /* ---- V4 ①：税率口径披露（消除「改税率没反应」的沉默失败） ---- */
  const lockedCount = await page.$$eval('.field-locked', (n) => n.length);
  lockedCount === 2 ? ok('规则库模式下两个假设税率输入被锁定') : bad('税率锁定', `锁定 ${lockedCount} 个`);
  const lockNote = await textOf(page, '.field-lock-note');
  /规则库采用\s*\d+(\.\d+)?%/.test(lockNote) ? ok('锁定项显示规则库实际采用的税率') : bad('锁定税率披露', lockNote.slice(0, 60));
  const modeRow = await textOf(page, '.rate-mode-row');
  /规则库模式/.test(modeRow) ? ok('成本页披露当前税率口径与覆盖范围') : bad('税率口径披露', modeRow.slice(0, 60));
  const basisNote = await textOf(page, '.rate-basis-note');
  /规则库税率口径/.test(basisNote) && /待核验/.test(basisNote) ? ok('结果区标注税率来源与核验状态') : bad('结果区税率口径', basisNote.slice(0, 60));
  const ssgNote = await textOf(page, '.ssg-boundary');
  /未列入规则库 SSG 清单|按规则库 SSG 税率/.test(ssgNote) ? ok('SSG 卡片说明本品目是否列入清单') : bad('SSG 口径说明', ssgNote.slice(0, 60));

  await page.check('.switch-row input[type="checkbox"]');
  await wait(1400);
  (await page.$$eval('.field-locked', (n) => n.length)) === 0 ? ok('切到手工口径后税率输入恢复可编辑') : bad('手工口径解锁', '仍被锁定');
  /手工税率口径/.test(await textOf(page, '.rate-basis-note')) ? ok('结果区同步标注为手工税率口径') : bad('手工口径标注', (await textOf(page, '.rate-basis-note')).slice(0, 60));
  await page.uncheck('.switch-row input[type="checkbox"]');
  await wait(1400);

  /* ---- V4 ③：产品档案默认货值 / 数量带入成本页 ---- */
  const valA = await page.inputValue('input[name="value"]');
  Number(valA) === 30000 ? ok('成本页货值从产品档案带入（低糖燕麦饮 30000）') : bad('默认货值带入', valA);
  /已从产品档案/.test(await textOf(page, '.product-default-note')) ? ok('页面说明参数来源为产品档案') : bad('默认值来源说明', '缺失');
  await page.selectOption('.product-select select', 'p-spark');
  await wait(1500);
  const valB = await page.inputValue('input[name="value"]');
  Number(valB) === 18000 ? ok('切换产品后货值随档案变化（无糖气泡水 18000）') : bad('切产品带入', valB);
  await shot(page, '25-React成本-税率口径与档案带入.png');

  /* ---- V4 ④：工作区（轻量多租户）隔离 ---- */
  await page.click('.workspace-button');
  await page.waitForSelector('input[name="ownerName"]');
  /数据隔离，不是账号鉴权/.test(await textOf(page, '.modal')) ? ok('工作区弹窗明示「隔离不等于鉴权」的边界') : bad('工作区边界说明', '缺失');
  await page.fill('input[name="ownerName"]', '评测企业A');
  await page.click('button:has-text("切换并同步档案")');
  await wait(2600);
  const wsName = await textOf(page, '.workspace-button strong');
  wsName.includes('评测企业A') ? ok('切换工作区后侧栏显示企业名') : bad('工作区显示', wsName);
  await page.click('a[href="#products"]');
  await page.waitForSelector('.product-toolbar');
  await wait(900);
  const wsRows = await page.$$eval('.product-table tbody tr', (r) => r.length);
  wsRows === 3 ? ok('新工作区载入并同步种子档案（3 条）') : bad('新工作区档案', `${wsRows} 行`);
  /按工作区隔离保存/.test(await textOf(page, '.storage-note')) ? ok('产品页说明工作区隔离与敏感数据边界') : bad('隔离说明', '缺失');
  await shot(page, '26-React工作区隔离.png');

  const cnHeader = encodeURIComponent('评测企业A');
  const isoA = await (await fetch(`${BASE}/api/v1/products`, { headers: { 'x-workspace': cnHeader } })).json();
  const isoB = await (await fetch(`${BASE}/api/v1/products`, { headers: { 'x-workspace': encodeURIComponent('评测企业B') } })).json();
  isoA.count === 3 && isoB.count === 0 ? ok('服务端按工作区隔离档案（中文企业名编码后可用）') : bad('服务端隔离', `A=${isoA.count} B=${isoB.count}`);
  isoA.owner === '评测企业A' ? ok('中文工作区名在请求头中正确还原') : bad('中文工作区名', isoA.owner);

  await page.click('a[href="#alerts"]');
  await page.waitForSelector('.page-heading');
  await page.click('button:has-text("拉取变更影响评估")');
  await wait(1200);
  const alTxt = await textOf(page, '.alerts-grid');
  /被拦截|拦截/.test(await textOf(page, '.toast')) || /来源：/.test(alTxt) ? ok('React 预警页接入真实影响评估') : bad('React 真实预警', alTxt.slice(0, 80));
  await shot(page, '23-React预警-真实影响.png');
  await ctx.close();

  /* ============ B. 核心引擎控制台 /console/ ============ */
  const bctx = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  const bp = await bctx.newPage();
  bp.on('pageerror', (e) => problems.push(`控制台页面异常：${e.message}`));
  bp.on('console', (m) => { if (m.type() === 'error') problems.push(`控制台错误：${m.text()}`); });

  await bp.goto(CONSOLE, { waitUntil: 'networkidle' });
  if (await exists(bp, '.shell', '控制台骨架渲染')) {
    const badge = await textOf(bp, '#modeBadge');
    badge.includes('服务端') ? ok('控制台识别服务端引擎') : bad('控制台模式', badge);
    await shot(bp, '01-工作台.png');
  }
  const disc = await textOf(bp, '.disclaimer-bar');
  disc.includes('不能替代官方许可') ? ok('控制台免责声明常驻') : bad('控制台免责', '缺失');

  await bp.click('a[data-nav="admission"]');
  await bp.waitForSelector('#admGo');
  await bp.click('#admGo');
  if (await exists(bp, '.verdict', '控制台准入结论渲染')) {
    const label = await textOf(bp, '.verdict h2');
    label.length > 1 ? ok(`控制台准入输出：${label}`) : bad('控制台准入输出', '空');
    await shot(bp, '02-准入评估.png');
  }
  await bp.fill('#admhs', '999999');
  await bp.click('#admGo');
  await bp.waitForSelector('.verdict');
  (await textOf(bp, '.verdict h2')).includes('无法判定') ? ok('控制台未收录编码降级为无法判定') : bad('控制台无法判定', '—');

  await bp.click('a[data-nav="cost"]');
  await bp.waitForSelector('#cGo');
  await bp.fill('#cHs', '170199'); /* 上一步故意填过无效编码，这里显式重置为已收录编码 */
  await bp.click('#cGo');
  if (await exists(bp, '.kpi', '控制台成本汇总渲染')) {
    const t = await textOf(bp, '#cOut');
    /综合税负率/.test(t) && /报价参考区间/.test(t) ? ok('控制台成本输出完整') : bad('控制台成本输出', t.slice(0, 60));
    await shot(bp, '03-成本测算.png');
  }

  await bp.click('a[data-nav="ssg"]');
  await bp.waitForSelector('#sGo');
  await bp.selectOption('#sCode', '690721');
  await bp.click('#sGo');
  if (await exists(bp, '.bar', '控制台 SSG 进度条渲染')) {
    const t = await textOf(bp, '#sOut');
    /触发后成本模拟/.test(t) && /仅供参考/.test(t) ? ok('控制台 SSG 模拟与数据提示完整') : bad('控制台 SSG', t.slice(0, 60));
    await shot(bp, '04-SSG预警.png');
  }

  await bp.click('a[data-nav="label"]');
  await bp.waitForSelector('#lGo');
  await bp.click('#lGo');
  if (await exists(bp, '.hit', '控制台标签命中渲染')) {
    const t = await textOf(bp, '#lOut');
    /繁体/.test(t) ? ok('控制台繁简归一命中说明可见') : bad('控制台繁简说明', '缺失');
    await shot(bp, '05-标签合规.png');
  }

  await bp.click('a[data-nav="products"]');
  await bp.waitForSelector('#pfSeed');
  await bp.click('#pfSeed');
  await bp.waitForSelector('table');
  (await bp.$$eval('tbody tr', (r) => r.length)) >= 3 ? ok('控制台示例产品载入') : bad('控制台示例产品', '行数不足');
  await shot(bp, '06-产品档案.png');

  await bp.click('a[data-nav="monitor"]');
  await bp.waitForSelector('#moGo');
  await bp.click('#moGo');
  await bp.waitForSelector('.kpi');
  /已拦截/.test(await textOf(bp, '#moOut')) ? ok('控制台非官方来源拦截可见') : bad('控制台拦截', '缺失');
  await shot(bp, '07-法规变更监测.png');

  await bp.click('a[data-nav="kb"]');
  await bp.waitForSelector('#kbTable table');
  (await bp.$$eval('#kbTable tbody tr', (r) => r.length)) >= 15 ? ok('控制台规则后台列表渲染') : bad('控制台规则后台', '行数不足');
  await shot(bp, '08-规则后台.png');

  await bp.click('a[data-nav="records"]');
  await bp.waitForSelector('table');
  ok('控制台评估记录页可用');
  await shot(bp, '09-评估记录.png');

  await bp.click('a[data-nav="about"]');
  await bp.waitForSelector('.flow');
  /规则优先/.test(await textOf(bp, '.view')) ? ok('控制台架构与风险页完整') : bad('控制台架构页', '缺失');
  await shot(bp, '10-架构与边界.png');

  const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const mp = await mctx.newPage();
  mp.on('pageerror', (e) => problems.push(`移动端页面异常：${e.message}`));
  await mp.goto(CONSOLE, { waitUntil: 'networkidle' });
  const overflow = await mp.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  overflow <= 2 ? ok(`控制台移动端无横向溢出（${overflow}px）`) : bad('控制台移动端', `溢出 ${overflow}px`);
  await shot(mp, '11-移动端工作台.png');
  /* 字体整体放大后，React 端在窄屏不得出现横向溢出 */
  await mp.goto(BASE, { waitUntil: 'networkidle' });
  await mp.waitForSelector('.sidebar');
  const rOverflow = await mp.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  rOverflow <= 2 ? ok(`React 工作台移动端无横向溢出（${rOverflow}px）`) : bad('React 移动端溢出', `${rOverflow}px`);
  await mp.goto(`${BASE}/#cost`, { waitUntil: 'networkidle' });
  await mp.waitForTimeout(1200);
  const cOverflow = await mp.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  cOverflow <= 2 ? ok(`React 成本页移动端无横向溢出（${cOverflow}px）`) : bad('React 成本页移动端溢出', `${cOverflow}px`);
  await shot(mp, '28-React移动端-字体放大.png');
  await mctx.close();
  await bctx.close();

  /* ============ C. 降级：后端不可用 ============ */
  const sctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const sp = await sctx.newPage();
  sp.on('pageerror', (e) => problems.push(`降级模式页面异常：${e.message}`));
  await sp.route('**/api/**', (r) => r.abort());

  await sp.goto(BASE, { waitUntil: 'domcontentloaded' });
  await wait(1500);
  const rBadge = await textOf(sp, '.demo-badge');
  rBadge.includes('演示模式') ? ok('React 在无后端时回落固定样例（行为与改造前一致）') : bad('React 降级标识', rBadge);
  /* ---- V4 ②：降级必须可见、可恢复，不能静默锁死在固定样例 ---- */
  await sp.$('.reconnect-button') ? ok('降级时提供「重新连接引擎」入口') : bad('重连入口', '缺失');
  /引擎未连接/.test(rBadge) ? ok('降级状态在顶栏明确标注') : bad('降级状态可见', rBadge);
  await sp.click('.reconnect-button');
  await wait(900);
  const rcToast = await textOf(sp, '.toast');
  /正在重新连接核心引擎|仍然连不上核心引擎/.test(rcToast) ? ok('点击重连有明确反馈，失败不静默') : bad('重连反馈', rcToast.slice(0, 60));
  await shot(sp, '27-React降级-可重连.png');
  await sp.click('a[href="#assessment"]');
  await sp.waitForSelector('.result-panel');
  /演示规则/.test(await textOf(sp, '.result-panel')) ? ok('React 降级后展示演示规则结论') : bad('React 降级结论', '—');
  await shot(sp, '24-React无后端降级.png');

  await sp.goto(CONSOLE, { waitUntil: 'domcontentloaded' });
  await wait(1500);
  const cBadge = await textOf(sp, '#modeBadge');
  cBadge.includes('本地引擎') ? ok('控制台在无后端时降级为浏览器本地引擎') : bad('控制台降级', cBadge);
  await sp.click('a[data-nav="admission"]');
  await sp.waitForSelector('#admGo');
  await sp.click('#admGo');
  await wait(1200);
  const v = await textOf(sp, '.verdict h2');
  v.length > 1 ? ok(`本地引擎同样产出结论：${v}`) : bad('本地引擎结论', v || '无');
  await shot(sp, '13-本地引擎降级.png');
  await sctx.close();
} catch (e) {
  problems.push(`测试脚本异常：${e.message}`);
} finally {
  if (browser) await browser.close();
  server.kill('SIGTERM');
}

console.log(steps.join('\n'));
console.log(`\n截图输出：${SHOTS}`);
if (problems.length) { console.log(`\n发现 ${problems.length} 个问题：`); problems.forEach((p) => console.log(` - ${p}`)); }
else console.log(`\n共 ${steps.length} 项检查全部通过，无 JS 异常与控制台错误。`);
process.exit(problems.length ? 1 : 0);
