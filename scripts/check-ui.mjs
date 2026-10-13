import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { server } from './dev.mjs';
await mkdir('tmp/screenshots', { recursive: true });
let browser;
const launchErrors = [];
for (const options of [{ channel: 'msedge' }, { channel: 'chrome' }, {}]) {
  try { browser = await chromium.launch({ ...options, headless: true }); break; }
  catch (e) { launchErrors.push(e.message); }
}
if (!browser) { server.close(); throw new Error(`No browser available. ${launchErrors.join('\n')}`); }
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, locale: 'zh-CN' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const go = async (name) => { await page.locator('nav').getByRole('link', { name, exact: true }).click(); await page.waitForTimeout(80); };
  await page.goto('http://127.0.0.1:4173');
  await page.getByRole('heading', { name: '出海工作台', exact: true }).waitFor();
  await page.screenshot({ path: 'tmp/screenshots/overview-desktop.png', fullPage: true });
  // New product defaults to unknown; bad HS inputs produce a visible error.
  await page.getByRole('button', { name: '新建产品评估', exact: true }).click();
  await page.getByRole('textbox', { name: '产品名称' }).fill('浏览器测试产品');
  await page.getByRole('textbox', { name: 'HS 编码' }).fill('abc');
  await page.getByRole('button', { name: '保存并查看评估' }).click();
  assert.match(await page.getByRole('alert').innerText(), /6–11/);
  await page.getByRole('textbox', { name: 'HS 编码' }).fill('220299');
  await page.getByRole('button', { name: '保存并查看评估' }).click();
  await page.getByRole('heading', { name: '无法判定', exact: true }).waitFor();
  await page.reload();
  await page.getByRole('heading', { name: '浏览器测试产品', exact: true }).waitFor();
  await page.getByRole('button', { name: '编辑资料' }).click();
  await page.getByRole('textbox', { name: '规格 / 成分 / 关键参数' }).fill('250mL / 植物配方');
  await page.getByLabel('演示规则场景').selectOption('conditional');
  await page.getByRole('button', { name: '保存并查看评估' }).click();
  await page.getByRole('heading', { name: '需要专案核准', exact: true }).waitFor();
  await page.getByRole('tab', { name: '办理路径' }).click();
  await page.getByRole('heading', { name: '办理路径 · 待官方确认' }).waitFor();
  await page.getByRole('tab', { name: '依据与边界' }).click();
  await page.getByRole('heading', { name: '依据状态', exact: true }).waitFor();
  await page.getByRole('tab', { name: '评估结论' }).click();
  if (await page.getByRole('button', { name: '关闭提示' }).count()) await page.getByRole('button', { name: '关闭提示' }).click();
  await page.screenshot({ path: 'tmp/screenshots/assessment-desktop.png', fullPage: true });
  await page.getByRole('button', { name: '交给千问办公评估', exact: true }).click();
  const exported = page.waitForEvent('download');
  await page.getByRole('button', { name: '下载输入 JSON', exact: true }).click();
  const file = await exported;
  assert.match(file.suggestedFilename(), /assessment-input\.json/);
  assert.ok(!(await page.getByRole('textbox', { name: '任务输入' }).inputValue()).includes('scenario'), 'Do not send mock conclusions to Qwen Work');
  await page.keyboard.press('Escape');
  await go('成本测算');
  assert.match(await page.locator('.total-cost').innerText(), /37,467\.60/);
  await page.getByRole('checkbox', { name: '模拟 SSG 额外加征百分之十五' }).check();
  assert.match(await page.locator('.total-cost').innerText(), /42,495\.00/);
  await page.getByRole('spinbutton', { name: '出口数量' }).fill('0');
  assert.match(await page.getByRole('alert').innerText(), /正整数/);
  assert.equal(await page.locator('.total-cost').count(), 0);
  await page.getByRole('spinbutton', { name: '出口数量' }).fill('2000');
  await page.getByRole('spinbutton', { name: '货物价值' }).fill('35000');
  assert.match(await page.getByRole('alert').innerText(), /千问办公/);
  assert.equal(await page.locator('.total-cost').count(), 0, 'Edited parameters must not trigger a frontend calculation');
  await page.getByRole('spinbutton', { name: '货物价值' }).fill('30000');
  await page.screenshot({ path: 'tmp/screenshots/cost-desktop.png', fullPage: true });
  await go('法规与预警');
  await page.getByRole('button', { name: '模拟一条法规变更', exact: true }).click();
  assert.equal(await page.locator('.event').count(), 1);
  await page.getByRole('button', { name: '标为已读', exact: true }).click();
  assert.equal(await page.locator('.event-read').count(), 1);
  await go('产品档案');
  await page.getByRole('textbox', { name: '筛选产品档案' }).fill('浏览器测试产品');
  assert.equal(await page.locator('tbody tr').count(), 1);
  await page.getByRole('button', { name: '清空搜索', exact: true }).click();
  // Fresh context for responsive screenshots and navigation checks.
  const mobile = await browser.newContext({ viewport: { width: 375, height: 812 }, locale: 'zh-CN', reducedMotion: 'reduce' });
  const m = await mobile.newPage();
  await m.goto('http://127.0.0.1:4173');
  await m.getByRole('heading', { name: '出海工作台', exact: true }).waitFor();
  const widths = [375, 768, 1024, 1440];
  for (const width of widths) {
    await m.setViewportSize({ width, height: 900 });
    assert.ok(await m.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `No overflow at ${width}px`);
  }
  await m.setViewportSize({ width: 375, height: 812 });
  await m.screenshot({ path: 'tmp/screenshots/overview-mobile.png', fullPage: true });
  await m.getByRole('button', { name: '打开导航菜单', exact: true }).click();
  await m.locator('nav').getByRole('link', { name: '成本测算', exact: true }).click();
  await m.getByRole('heading', { name: '成本测算', exact: true }).waitFor();
  assert.ok(await m.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No mobile cost overflow');
  await m.screenshot({ path: 'tmp/screenshots/cost-mobile.png', fullPage: true });
  await m.goto('http://127.0.0.1:4173/#assessment');
  await m.getByRole('heading', { name: '准入评估', exact: true }).waitFor();
  assert.ok(await m.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No mobile assessment overflow');
  await m.screenshot({ path: 'tmp/screenshots/assessment-mobile.png', fullPage: true });
  await m.getByRole('button', { name: '新增产品', exact: true }).click();
  await m.getByRole('textbox', { name: '产品名称' }).fill('未覆盖市场测试');
  await m.getByRole('textbox', { name: 'HS 编码' }).fill('220299');
  await m.getByRole('textbox', { name: '规格 / 成分 / 关键参数' }).fill('测试参数');
  await m.getByLabel('目标市场').selectOption('新加坡');
  await m.getByLabel('演示规则场景').selectOption('allowed');
  await m.getByRole('button', { name: '保存并查看评估' }).click();
  await m.getByRole('heading', { name: '无法判定', exact: true }).waitFor();
  assert.ok(await m.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No mobile modal overflow');
  const offline = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const filePage = await offline.newPage();
  filePage.on('pageerror', e => errors.push(e.message));
  for (const entry of ['index.html', 'dist/index.html']) {
    await filePage.goto(pathToFileURL(resolve(entry)).href);
    await filePage.getByRole('heading', { name: '出海工作台', exact: true }).waitFor();
    await filePage.getByRole('button', { name: '开始准入评估', exact: true }).click();
    await filePage.getByRole('heading', { name: '准入评估', exact: true }).waitFor();
  }
  await offline.close();
  assert.deepEqual(errors, [], 'No browser runtime errors');
  await context.close(); await mobile.close();
  console.log('PASS: product validation, persistence, assessment tabs, fixed cost previews, Qwen Work handoff, no local tax computation, frontend-only scope, alerts, search, direct file opening, mobile navigation and 4 responsive widths.');
} finally { await browser.close(); server.close(); }
