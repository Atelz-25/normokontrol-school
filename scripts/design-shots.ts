// Скриншоты состояний сайта для обсуждения дизайна: npm run design:shots
//
// Нужна собранная версия на http://127.0.0.1:4173 (npm run build, затем npx vite preview
// --host 127.0.0.1 --port 4173). Снимки кладутся в docs/design/: пустой экран, перетаскивание,
// проверка, отчёт, ошибка файла — в светлой и тёмной теме, шириной 1280 и 390 px.
// Анимации выключены (prefers-reduced-motion), чтобы кадры были одинаковыми при каждом запуске.
//
// Отчёт снимается по личной работе fixtures/real/sample-v2.docx, если она есть: такие снимки
// содержат текст работы и в git не попадают (*-sample-v2.png в .gitignore). Без личного файла
// отчёт снимается по образцовой работе с вымышленными данными.
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { chromium, type Page } from '@playwright/test';

const BASE = 'http://127.0.0.1:4173/normokontrol-school/';
const OUT = 'docs/design';
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const sample = existsSync('fixtures/real/sample-v2.docx')
  ? { path: 'fixtures/real/sample-v2.docx', tag: 'sample-v2' }
  : { path: 'fixtures/good/model-note.docx', tag: 'model-note' };

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL });

async function open(page: Page): Promise<void> {
  await page.goto(BASE);
  await page.evaluate(() => document.fonts.ready);
}

async function upload(page: Page, name: string, buffer: Buffer): Promise<void> {
  await page.locator('#file').setInputFiles({ name, mimeType: DOCX, buffer });
}

for (const theme of ['light', 'dark'] as const) {
  for (const width of [1280, 390]) {
    const page = await browser.newPage({
      viewport: { width, height: width > 600 ? 860 : 844 },
      colorScheme: theme,
      reducedMotion: 'reduce',
    });
    const shot = (name: string): Promise<Buffer> =>
      page.screenshot({ path: `${OUT}/${name}-${theme}-${width}.png` });

    await open(page);
    await shot('1-empty');

    await page.locator('#drop').evaluate((drop) => {
      drop.classList.add('over');
    });
    await shot('2-dragover');
    await page.locator('#drop').evaluate((drop) => {
      drop.classList.remove('over');
    });

    // Состояние «идёт проверка» показываем без настоящего файла: класс и текст статуса.
    await page.evaluate(() => {
      document.getElementById('drop')?.classList.add('busy');
      const status = document.querySelector('#app > .status');
      if (status) status.textContent = 'Проверяю «Иванов, И. Пояснительная записка.docx»…';
    });
    await shot('3-checking');

    await open(page);
    await upload(page, 'Иванов, И. Пояснительная записка.docx', readFileSync(sample.path));
    await page.locator('#app > .status').filter({ hasText: 'Готово' }).waitFor();
    await page.locator('.results').evaluate((node) => {
      node.scrollIntoView();
    });
    await page.screenshot({ path: `${OUT}/4-report-${theme}-${width}-${sample.tag}.png` });
    await page.locator('.findings-title').evaluate((node) => {
      node.scrollIntoView();
    });
    await page.screenshot({ path: `${OUT}/5-findings-${theme}-${width}-${sample.tag}.png` });

    await open(page);
    await upload(page, 'работа.docx', Buffer.from('это не docx'));
    await page.locator('#app > .status.error').waitFor();
    await shot('6-file-error');

    await page.close();
  }
}

await browser.close();
console.log(`Готово: снимки в ${OUT}/ (отчёт по ${sample.tag}).`);
