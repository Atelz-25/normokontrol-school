// PDF в браузере: настоящая библиотека pdf.js, загружается только для PDF, без внешних запросов.
import { expect, test } from '@playwright/test';
import { bodyPage, buildPdf } from '../../scripts/lib/pdf-builder.ts';
import { seriousViolations } from './axe.ts';

test.beforeEach(({ page }) => {
  page.on('pageerror', (error) => {
    throw error;
  });
});

const pdf = (name: string, bytes: Uint8Array) => ({
  name,
  mimeType: 'application/pdf',
  buffer: Buffer.from(bytes),
});

test('PDF: вердикт и проверки, модуль PDF грузится только сейчас', async ({ page, baseURL }) => {
  const origin = new URL(baseURL ?? '').origin;
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  await page.goto('./');
  // До выбора PDF библиотека pdf.js не скачивается.
  expect(requests.some((url) => /pdf/i.test(new URL(url).pathname))).toBe(false);

  // 5 страниц с полем 20 мм вместо 30 и без номеров на первой — несколько замечаний.
  const pages = [bodyPage(), ...Array.from({ length: 4 }, (_, i) => bodyPage(i + 2))];
  await page.locator('#file').setInputFiles(pdf('работа.pdf', buildPdf(pages)));
  await expect(
    page.getByRole('heading', { level: 1, name: /рано сдавать|Почти готово/ }),
  ).toBeFocused();
  await expect(page.locator('#check-PDF-01')).toContainText('Все страницы A4');
  await expect(page.locator('#check-PDF-02')).toContainText('5'); // мало страниц
  await expect(page.locator('#check-PDF-05')).toContainText('12');
  await expect(page.getByRole('heading', { name: 'Что проверено по PDF' })).toBeVisible();

  // Никаких запросов на чужие адреса, а pdf.js пришёл с нашего сайта.
  expect(requests.filter((url) => url.startsWith('http') && !url.startsWith(origin))).toEqual([]);
  expect(requests.some((url) => /pdf\.worker/.test(url))).toBe(true);
  expect(await seriousViolations(page)).toEqual([]);
});

test('PDF без текста и повреждённый PDF: понятные сообщения', async ({ page }) => {
  await page.goto('./');
  await page
    .locator('#file')
    .setInputFiles(pdf('скан.pdf', buildPdf([{ lines: [] }, { lines: [] }])));
  await expect(page.locator('#check-PDF-00')).toContainText('скан');
  await page.getByRole('button', { name: 'Другой файл' }).waitFor();
  await page
    .locator('#file')
    .setInputFiles(pdf('сломан.pdf', new TextEncoder().encode('%PDF-1.4 мусор')));
  await expect(page.locator('#app > .status')).toContainText('повреждён');
});
