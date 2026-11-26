import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';
const browser = await chromium.launch(
  process.env.PLAYWRIGHT_CHROME_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROME_PATH } : {},
);
try {
  const svg = await readFile(new URL('../assets/unicore-mark.svg', import.meta.url), 'utf8');
  const page = await browser.newPage({
    viewport: { width: 1024, height: 1024 },
    deviceScaleFactor: 1,
  });
  for (const [name, background, mono] of [
    ['icon.png', '#F5F3EF', false],
    ['android-icon-foreground.png', 'transparent', false],
    ['android-icon-monochrome.png', 'transparent', true],
  ]) {
    await page.setContent(
      `<style>html,body{margin:0;background:${background}}body{height:100vh;display:grid;place-items:center}svg{height:${name==='icon.png'?82:61}vh;width:auto}</style>${mono ? svg.replace('#142642','#FFFFFF') : svg}`,
    );
    await page.screenshot({ path: `assets/${name}`, omitBackground: true });
  }
  await page.setViewportSize({ width: 64, height: 64 });
  await page.setContent(
    `<style>html,body{margin:0;background:#F5F3EF}svg{width:64px;height:64px}</style>${svg}`,
  );
  await page.screenshot({ path: 'assets/favicon.png' });
} finally {
  await browser.close();
}
