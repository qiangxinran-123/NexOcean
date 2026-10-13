import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { server } from './dev.mjs';
const out = 'tmp/responsive-check';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ locale: 'zh-CN' });
  // Isolate layout verification from business APIs and external services.
  await page.route('**/api/**', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }));
  await page.goto('http://127.0.0.1:4173', { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: '出海工作台', exact: true }).waitFor();
  const sizes = [[1440, 1000], [1280, 720], [1024, 600], [800, 450], [768, 480], [375, 600], [667, 375], [320, 568]];
  for (const [width, height] of sizes) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => { window.scrollTo(0, 0); document.querySelector('.sidebar').scrollTop = 0; });
    if (width <= 767) {
      await page.getByRole('button', { name: '打开导航菜单', exact: true }).click();
      await page.waitForFunction(() => document.querySelector('.sidebar').getBoundingClientRect().left >= -1);
    }
    const sidebar = page.locator('.sidebar');
    const stats = await sidebar.evaluate(el => ({ height: el.clientHeight, scrollHeight: el.scrollHeight, overflowY: getComputedStyle(el).overflowY }));
    assert.ok(stats.height <= height, `${width}×${height}: sidebar fits viewport`);
    assert.equal(stats.overflowY, 'auto');
    const box = await sidebar.boundingBox();
    const initialPageScroll = await page.evaluate(() => scrollY);
    await page.mouse.move(box.x + box.width / 2, Math.min(height - 30, 250));
    await page.mouse.wheel(0, 2400);
    await page.waitForTimeout(220);
    const scrollTop = await sidebar.evaluate(el => el.scrollTop);
    if (stats.scrollHeight > stats.height) assert.ok(scrollTop > 0, `${width}×${height}: mouse wheel scrolls sidebar`);
    assert.equal(await page.evaluate(() => scrollY), initialPageScroll, 'Sidebar wheel does not move main content');
    const help = page.getByRole('button', { name: '演示使用指南', exact: true });
    await help.scrollIntoViewIfNeeded();
    const helpBox = await help.boundingBox();
    assert.ok(helpBox.y >= 0 && helpBox.y + helpBox.height <= height + 1, `${width}×${height}: bottom help reachable`);
    await page.locator('.profile').scrollIntoViewIfNeeded();
    const finalBox = await page.locator('.profile').boundingBox();
    assert.ok(finalBox.y >= 0 && finalBox.y + finalBox.height <= height + 1, `${width}×${height}: profile reachable`);
    const links = sidebar.locator('nav a');
    for (let i = 0; i < await links.count(); i++) {
      await links.nth(i).scrollIntoViewIfNeeded();
      const linkBox = await links.nth(i).boundingBox();
      assert.ok(linkBox.y >= 0 && linkBox.y + linkBox.height <= height + 1, 'Every navigation link is reachable');
    }
    await help.scrollIntoViewIfNeeded();
    await help.click();
    await page.getByRole('dialog').waitFor();
    await page.keyboard.press('Escape');
    await page.getByRole('dialog').waitFor({ state: 'detached' });
    await page.screenshot({ path: `${out}/sidebar-${width}x${height}.png` });
    if (width <= 767) await page.getByRole('button', { name: '关闭导航菜单', exact: true }).click({ position: { x: width - 8, y: 12 } });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}×${height}: no page overflow`);
    if (width === 800) await page.screenshot({ path: `${out}/window-800x450.png` });
    console.log(`PASS ${width}×${height}: wheel scrolling, all links, bottom controls, dialog and content width`);
  }
} finally { await browser.close(); server.close(); }
