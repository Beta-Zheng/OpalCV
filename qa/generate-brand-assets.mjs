import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

// Edit public/favicon.svg, then run pnpm brand:assets.
// QA_BROWSER can point to an installed Chrome when Playwright browsers are absent.
const source = await readFile(new URL('../public/favicon.svg', import.meta.url), 'utf8');

const browser = await chromium.launch(process.env.QA_BROWSER ? { executablePath: process.env.QA_BROWSER } : {});
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  for (const [name, size, iconSize, background] of [
    ['favicon-32.png', 32, 32, 'transparent'],
    ['apple-touch-icon.png', 180, 148, '#F8FAFF'],
  ]) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(
      `<!doctype html><html><body style="margin:0;background:${background};width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center">${source.replace(
        'width="64" height="64"',
        `width="${iconSize}" height="${iconSize}"`
      )}</body></html>`
    );
    await page.screenshot({
      path: fileURLToPath(new URL(`../public/${name}`, import.meta.url)),
      omitBackground: background === 'transparent',
    });
  }
} finally {
  await browser.close();
}
console.log('Generated 32px PNG favicon and 180px Apple touch icon.');
