import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

// Edit public/logo-mark.svg, then run npm run brand:assets.
// QA_BROWSER can point to an installed Chrome when Playwright browsers are absent.
const source = await readFile(new URL('../public/logo-mark.svg', import.meta.url), 'utf8');
const variants = {
  'logo-mark-light.svg': source.replace('#4338CA', '#EEF0FE').replace('#F9F9FB', '#4338CA').replace('#F2BD61', '#925A18'),
  'logo-mark-mono.svg': source.replace('#4338CA', '#24242E').replace('#F2BD61', '#F9F9FB'),
  'favicon.svg': source,
  // Keep the previously published URL consistent for existing bookmarks.
  'favicon-v4.svg': source,
};
for (const [name, svg] of Object.entries(variants)) {
  await writeFile(new URL(`../public/${name}`, import.meta.url), svg);
}

const browser = await chromium.launch(process.env.QA_BROWSER ? { executablePath: process.env.QA_BROWSER } : {});
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  for (const [name, size, background] of [
    ['favicon-32.png', 32, 'transparent'],
    ['apple-touch-icon.png', 180, '#FAFAF7'],
  ]) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<html><body style="margin:0;background:${background}"><img width="${size}" height="${size}" src="data:image/svg+xml,${encodeURIComponent(source)}"></body></html>`);
    await page.locator('img').evaluate(img => img.decode());
    await page.screenshot({ path: fileURLToPath(new URL(`../public/${name}`, import.meta.url)), omitBackground: background === 'transparent' });
  }
} finally {
  await browser.close();
}
console.log('Generated brand variants, SVG favicon, 32px PNG and 180px Apple icon.');
