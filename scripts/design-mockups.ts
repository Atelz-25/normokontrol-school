// Снимки схемы экранов v2 (docs/design/v2/mockup.html): npm run design:mockups
//
// Нужен запущенный dev-сервер (npm run dev, порт 5173) или адрес в MOCKUP_BASE.
// Схема статичная, тексты абзацев вымышленные, поэтому снимки можно хранить в git.
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const BASE =
  process.env.MOCKUP_BASE ?? 'http://127.0.0.1:5173/normokontrol-school/docs/design/v2/mockup.html';
const OUT = 'docs/design/v2';

// Экран и, для телефона, вкладка «Текст работы».
const SCREENS = [
  { name: '1-start', query: 's=start' },
  { name: '2-checking', query: 's=checking' },
  { name: '3-result', query: 's=result' },
  { name: '3-result-text', query: 's=result&tab=text', phoneOnly: true },
  { name: '4-ready', query: 's=ready' },
  { name: '5-teacher', query: 's=teacher' },
];

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL });
for (const theme of ['light', 'dark'] as const) {
  for (const width of [1280, 390]) {
    const page = await browser.newPage({
      viewport: { width, height: width > 600 ? 900 : 844 },
      colorScheme: theme,
    });
    for (const screen of SCREENS) {
      if (screen.phoneOnly && width > 600) continue;
      await page.goto(`${BASE}?${screen.query}`);
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: `${OUT}/${screen.name}-${theme}-${width}.png` });
    }
    await page.close();
  }
}
await browser.close();
console.log(`Готово: снимки схемы в ${OUT}/`);
