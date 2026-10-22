// Этап 3 в браузере: сравнение двух версий и «Темы проекта» в редакторе.
import { expect, test, type Page } from '@playwright/test';
import { FIXTURES } from '../../scripts/lib/fixtures.ts';

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

async function upload(page: Page, name: string, bytes: Uint8Array): Promise<void> {
  await page.locator('#file').setInputFiles({ name, mimeType: DOCX, buffer: Buffer.from(bytes) });
  await expect(page.getByRole('status')).toContainText('Готово');
}

test.beforeEach(({ page }) => {
  page.on('pageerror', (error) => {
    throw error;
  });
});

test('новая версия файла: блок «было / стало» с исправленными замечаниями', async ({ page }) => {
  await page.goto('./');
  await upload(page, 'версия-1.docx', FIXTURES['PR-06']!.bad());
  await expect(page.getByRole('heading', { name: 'Сравнение с прошлой версией' })).toHaveCount(0);
  await upload(page, 'версия-2.docx', FIXTURES['PR-06']!.good());
  const block = page.locator('.compare');
  // 3 пустых абзаца (PR-06) и доля пустых абзацев (VL-02).
  await expect(block).toContainText('Исправлено: 4');
  await expect(block).toContainText('Оценка: было');
});

test('редактор: «Темы проекта» включают подсказку TH-03', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Редактор требований' }).click();
  await page.getByLabel('Темы проекта').fill('История кино: люмьер, немое кино');
  await page.getByRole('button', { name: 'Применить' }).click();
  await expect(page.getByRole('status')).toContainText('применён');
  await upload(page, 'работа.docx', FIXTURES['TH-02']!.good());
  await expect(page.locator('#rule-TH-03')).toContainText('История кино');
});
