// Скриншоты состояний сайта для обсуждения дизайна: npm run design:shots
//
// Нужна собранная версия на http://127.0.0.1:4173 (npm run build, затем npm run preview)
// или адрес в SHOTS_BASE. Снимки кладутся в docs/design/: старт, перетаскивание, проверка,
// результат, раскрытый пункт плана, текст работы, «можно сдавать», ошибка файла и режим
// учителя — в светлой и тёмной теме, шириной 1280 и 390 px.
// Анимации выключены (prefers-reduced-motion), чтобы кадры были одинаковыми при каждом запуске.
//
// Результат снимается по синтетической работе fixtures/synthetic/docs/30-mix.docx: это
// образцовая записка с вымышленным текстом и внесёнными ошибками, поэтому снимки можно
// хранить в git. Личную работу (fixtures/real) скрипт не трогает.
import { mkdirSync, readFileSync } from 'node:fs';
import { chromium, type Page } from '@playwright/test';

const BASE = process.env.SHOTS_BASE ?? 'http://127.0.0.1:4173/normokontrol-school/';
const OUT = process.env.SHOTS_OUT ?? 'docs/design';
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const DEMO = readFileSync('fixtures/synthetic/docs/30-mix.docx');
const MODEL = readFileSync('fixtures/good/model-note.docx');
const DEMO_NAME = 'Иванов, И. Пояснительная записка.docx';

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL });

async function open(page: Page, hash = ''): Promise<void> {
  await page.goto(`${BASE}${hash}`);
  await page.evaluate(() => document.fonts.ready);
}

async function upload(page: Page, name: string, buffer: Buffer): Promise<void> {
  await page.locator('#file').setInputFiles({ name, mimeType: DOCX, buffer });
  await page.locator('#app > .status').filter({ hasText: 'Готово' }).waitFor();
  await page.waitForTimeout(300); // карта и шрифт текста работы
}

for (const theme of ['light', 'dark'] as const) {
  for (const width of [1280, 390]) {
    const page = await browser.newPage({
      viewport: { width, height: width > 600 ? 900 : 844 },
      colorScheme: theme,
      reducedMotion: 'reduce',
    });
    const shot = (name: string): Promise<Buffer> =>
      page.screenshot({ path: `${OUT}/${name}-${theme}-${width}.png` });

    await open(page);
    await shot('1-start');

    await page.locator('#drop').evaluate((drop) => {
      drop.classList.add('over');
    });
    await shot('2-dragover');

    // «Идёт проверка» без настоящего файла: показываем шаги, два из них уже сделаны.
    await page.evaluate((name) => {
      document.getElementById('drop')?.classList.remove('over');
      document.getElementById('drop')?.classList.add('busy');
      document.querySelector<HTMLElement>('.start-text:not(.checking)')?.setAttribute('hidden', '');
      const checking = document.querySelector<HTMLElement>('.checking');
      checking?.removeAttribute('hidden');
      const title = checking?.querySelector('h1');
      if (title) title.textContent = `Проверяю «${name}»`;
      checking?.querySelectorAll('li').forEach((li, i) => {
        li.className = i < 2 ? 'done' : i === 2 ? 'now' : 'wait';
      });
    }, DEMO_NAME);
    await shot('3-checking');

    await open(page);
    await upload(page, DEMO_NAME, DEMO);
    await shot('4-result');

    // Раскрытый пункт плана: «Почему» с картинкой и «Все места».
    const first = page.locator('.plan-item').first();
    await first.getByRole('button', { name: 'Почему' }).click();
    await first.getByRole('button', { name: 'Все места' }).click();
    await first.evaluate((node) => {
      node.scrollIntoView({ block: 'start' });
      window.scrollBy(0, -80);
    });
    await shot('5-plan-open');

    // Текст работы: на телефоне — вкладка «Текст работы», на компьютере — переход клавишей J.
    await open(page);
    await upload(page, DEMO_NAME, DEMO);
    if (width < 1024) await page.getByRole('button', { name: 'Текст работы' }).click();
    await page.keyboard.press('j');
    await page.waitForTimeout(200);
    await shot('6-text');

    await open(page);
    await upload(page, 'Петров, П. Пояснительная записка.docx', MODEL);
    await shot('7-ready');

    await open(page);
    await page.locator('#file').setInputFiles({
      name: 'работа.docx',
      mimeType: DOCX,
      buffer: Buffer.from('это не docx'),
    });
    await page.locator('#app > .status.error').waitFor();
    await shot('8-file-error');

    await open(page, '#/teacher');
    await page.locator('.teacher input[type=file]').setInputFiles([
      { name: 'Работа 1.docx', mimeType: DOCX, buffer: DEMO },
      { name: 'Работа 2.docx', mimeType: DOCX, buffer: MODEL },
      {
        name: 'Работа 3.docx',
        mimeType: DOCX,
        buffer: readFileSync('fixtures/synthetic/docs/33-mix.docx'),
      },
    ]);
    await page.locator('.teacher [role=status]').filter({ hasText: 'Проверено работ' }).waitFor();
    await shot('9-teacher');

    await page.close();
  }
}

await browser.close();
console.log(`Готово: снимки в ${OUT}/.`);
