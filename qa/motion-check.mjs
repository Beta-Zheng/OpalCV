import { createServer } from 'vite';
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

await mkdir('.export-qa', { recursive: true });
const server = await createServer({ server: { host: '127.0.0.1', port: 0, strictPort: false } });
await server.listen();
const browser = await chromium.launch(process.env.QA_BROWSER ? { executablePath: process.env.QA_BROWSER } : {});
const errors = [];
const results = [];
try {
  for (const reducedMotion of ['no-preference', 'reduce']) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, reducedMotion });
    await context.addInitScript(() => localStorage.setItem('opalcv-usage-guide', JSON.stringify({ version: 1, decision: 'skipped' })));
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(server.resolvedUrls.local[0]);
    await page.getByRole('heading', { name: '简历工作台', exact: true }).waitFor();
    const create = page.getByRole('button', { name: '新建简历', exact: true }).first();
    await create.click();
    const dialog = page.locator('[data-app-dialog]');
    await dialog.waitFor();
    await page.waitForFunction(() => Number(getComputedStyle(document.querySelector('[data-app-dialog]')).opacity) === 1);
    await page.keyboard.press('Escape');
    assert.equal(await dialog.count(), 1, 'Dialog must remain mounted during its exit animation');
    assert(await dialog.evaluate(el => !!el.closest('[inert]')), 'Exiting dialog must not capture keyboard input');
    assert(await create.evaluate(el => el === document.activeElement), 'Closing restores focus immediately');
    await create.click();
    await page.getByRole('dialog', { name: '创建简历', exact: true }).waitFor();
    assert.equal(await dialog.count(), 1, 'Reopening during exit must reuse the dialog');
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'detached' });

    await page.keyboard.press('Control+k');
    const command = page.locator('[data-command-surface] input');
    await command.waitFor();
    await page.keyboard.press('Escape');
    assert.equal(await command.count(), 1, 'Command palette must animate out');
    assert(await command.evaluate(el => !!el.closest('[inert]')), 'Exiting commands must not intercept input');
    await command.waitFor({ state: 'detached' });

    // Sample every animation frame, including the entry's initial transform.
    await page.evaluate(() => {
      window.__motionSamples = [];
      const sample = (time) => {
        const view = document.querySelector('.app-view');
        const dialog = document.querySelector('[data-app-dialog]');
        const command = document.querySelector('[data-command-surface]');
        const toasts = Array.from(document.querySelectorAll('button[aria-label="关闭提示"]')).map(button => getComputedStyle(button.parentElement).transform);
        window.__motionSamples.push({ time, view: view && getComputedStyle(view).transform, dialog: dialog && getComputedStyle(dialog).transform, command: command && getComputedStyle(command).transform, toasts });
        window.__motionFrame = requestAnimationFrame(sample);
      };
      window.__motionFrame = requestAnimationFrame(sample);
    });
    for (const name of ['模型与隐私', '数据管理', '投递记录', '工作台']) {
      await page.getByRole('button', { name, exact: true }).click();
    }
    await page.evaluate(async () => {
      const { useApp } = await import('/src/lib/store.ts');
      for (const message of ['第一条提示', '中间提示用于验证移除后的位置过渡', '最后一条提示']) useApp.getState().toast('info', message);
    });
    const dismiss = page.getByRole('button', { name: '关闭提示', exact: true });
    await dismiss.nth(1).click();
    await page.waitForFunction(() => document.querySelectorAll('button[aria-label="关闭提示"]').length === 2);
    await dismiss.first().click();
    await page.waitForFunction(() => document.querySelectorAll('button[aria-label="关闭提示"]').length === 1);
    await dismiss.click();
    await dismiss.waitFor({ state: 'detached' });
    await create.click();
    await page.getByRole('dialog', { name: '创建简历', exact: true }).waitFor();
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'detached' });
    await page.keyboard.press('Control+k');
    await command.waitFor();
    await page.keyboard.press('Escape');
    await command.waitFor({ state: 'detached' });
    const samples = await page.evaluate(() => {
      cancelAnimationFrame(window.__motionFrame);
      return window.__motionSamples;
    });
    assert(samples.length > 0);
    if (reducedMotion === 'reduce') {
      assert(samples.some(sample => sample.view));
      assert(samples.some(sample => sample.dialog));
      assert(samples.some(sample => sample.command));
      assert(samples.some(sample => sample.toasts.length));
      for (const sample of samples) {
        for (const transform of [sample.view, sample.dialog, sample.command, ...sample.toasts]) {
          assert(!transform || transform === 'none' || transform === 'matrix(1, 0, 0, 1, 0, 0)', `Reduced motion moved a surface: ${transform}`);
        }
      }
    }
    await page.setViewportSize({ width: 375, height: 812 });
    await page.getByRole('button', { name: '打开导航菜单', exact: true }).click();
    await page.mouse.click(350, 400);
    assert.equal(await page.getByRole('button', { name: '打开导航菜单', exact: true }).getAttribute('aria-expanded'), 'false', 'Backdrop must still dismiss the drawer');
    await page.getByRole('button', { name: '打开导航菜单', exact: true }).click();
    await page.getByRole('button', { name: '数据管理', exact: true }).click();
    await page.getByRole('heading', { name: '数据管理', exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: '打开导航菜单', exact: true }).getAttribute('aria-expanded'), 'false');
    await page.waitForFunction(() => document.querySelector('#app-root > nav').getBoundingClientRect().right <= 1 && Number(getComputedStyle(document.querySelector('.app-view')).opacity) === 1);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: `.export-qa/motion-${reducedMotion}-mobile.png` });
    const frameTimes = samples.slice(1).map((sample, index) => sample.time - samples[index].time).sort((a, b) => a - b);
    results.push({ reducedMotion, sampledFrames: samples.length, frameTimeP95Ms: Math.round(frameTimes[Math.floor(frameTimes.length * 0.95)] * 10) / 10, checks: ['dialog exit / inert / focus', 'rapid reopen', 'command exit / inert', 'toast stack / dismissal', 'repeated navigation', 'mobile drawer / backdrop dismissal'], reducedMotionTransforms: reducedMotion === 'reduce' ? 'stationary' : 'animated' });
    await context.close();
  }
  assert.deepEqual(errors, []);
  await writeFile('.export-qa/motion-results.json', JSON.stringify({ results, errors }, null, 2));
  console.log(JSON.stringify({ results, errors }, null, 2));
} finally {
  await browser.close();
  await server.close();
}
