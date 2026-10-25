// Этап 5 в браузере: работа без сети, доступность в тёмной теме, работа с клавиатуры.
import { expect, test } from '@playwright/test';
import { FIXTURES } from '../../scripts/lib/fixtures.ts';
import { seriousViolations } from './axe.ts';

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

test('без сети: после первого открытия сайт загружается и проверяет файл', async ({
  page,
  context,
}) => {
  await page.goto('./');
  // Ждём, пока service worker начнёт управлять страницей, и открываем её ещё раз:
  // теперь все файлы сайта прошли через него и лежат в кэше.
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
    .toBe(true);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Нормоконтроль' })).toBeVisible();
  await page.locator('#file').setInputFiles({
    name: 'работа.docx',
    mimeType: DOCX,
    buffer: Buffer.from(FIXTURES['PR-06']!.bad()),
  });
  await expect(page.locator('#app > .status')).toContainText('Готово');
  await context.setOffline(false);
});

test('доступность в тёмной теме: нет серьёзных нарушений', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await page.goto('./');
  await page.locator('#file').setInputFiles({
    name: 'работа.docx',
    mimeType: DOCX,
    buffer: Buffer.from(FIXTURES['PB-01']!.bad()),
  });
  await expect(page.locator('#app > .status')).toContainText('Готово');
  expect(await seriousViolations(page)).toEqual([]);
});

test('с клавиатуры: Tab доходит до «Выбрать файл», Enter открывает выбор файла', async ({
  page,
}) => {
  await page.goto('./');
  const chooser = page.waitForEvent('filechooser');
  for (let i = 0; i < 15; i++) {
    await page.keyboard.press('Tab');
    const label = await page.evaluate(() => document.activeElement?.textContent ?? '');
    if (label === 'Выбрать файл') break;
  }
  await expect(page.locator(':focus')).toHaveText('Выбрать файл');
  await page.keyboard.press('Enter');
  await chooser;
});
