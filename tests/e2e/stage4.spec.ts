// Этап 4 в браузере: автоисправление со скачиванием и режим учителя с CSV.
import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { FIXTURES } from '../../scripts/lib/fixtures.ts';
import { readDocx } from '../../src/core/reader/index.ts';

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const file = (name: string, bytes: Uint8Array) => ({
  name,
  mimeType: DOCX,
  buffer: Buffer.from(bytes),
});

async function upload(page: Page, name: string, bytes: Uint8Array): Promise<void> {
  await page.locator('#file').setInputFiles(file(name, bytes));
  await expect(page.getByRole('status').first()).toContainText('Готово');
}

test.beforeEach(({ page }) => {
  page.on('pageerror', (error) => {
    throw error;
  });
});

test('автоисправление: скачивается «…_исправлено.docx», отчёт показывает, что исправлено', async ({
  page,
}) => {
  await page.goto('./');
  await upload(page, 'работа.docx', FIXTURES['PR-06']!.bad());
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Исправить и скачать' }).click();
  const saved = await download;
  expect(saved.suggestedFilename()).toBe('работа_исправлено.docx');
  // Скачанный файл читается, и пустых абзацев в нём больше нет.
  const fixed = readDocx(readFileSync(await saved.path()));
  expect(fixed.paragraphs.filter((p) => p.isEmpty)).toHaveLength(0);
  await expect(page.locator('#app > .status')).toContainText('Исправлено автоматически');
  await expect(page.locator('.compare')).toContainText('Исправлено: 4');
});

test('режим учителя: таблица по нескольким работам, сортировка, CSV и полный отчёт', async ({
  page,
}) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Режим учителя' }).click();
  await page
    .locator('.teacher input[type=file]')
    .setInputFiles([
      file('Иванов.docx', FIXTURES['PR-06']!.good()),
      file('Петров.docx', FIXTURES['PR-06']!.bad()),
      file('сломан.docx', new TextEncoder().encode('не docx')),
    ]);
  await expect(page.locator('.teacher [role=status]')).toContainText('Проверено работ: 3');
  await expect(page.locator('.teacher-table tbody tr')).toHaveCount(3);
  await expect(page.locator('.teacher-table')).toContainText('не читается');

  await page.getByRole('button', { name: 'Сортировать по столбцу «Оценка»' }).click();
  await expect(page.locator('.teacher-table th[aria-sort=ascending]')).toHaveCount(1);

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Скачать таблицу CSV' }).click();
  const csv = readFileSync(await (await download).path(), 'utf8');
  expect(csv.startsWith('\ufeff"Файл";"Оценка"')).toBe(true);
  expect(csv).toContain('"Петров.docx"');

  await page
    .locator('.teacher-table tr', { hasText: 'Петров.docx' })
    .getByRole('button', { name: 'Открыть отчёт' })
    .click();
  await expect(page.locator('#rule-PR-06')).toBeVisible();

  const serious = (await new AxeBuilder({ page }).analyze()).violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  );
  expect(serious.map((v) => v.id)).toEqual([]);
});
