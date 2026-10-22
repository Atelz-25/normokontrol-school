// Сквозные тесты этапа 2: оценка, предпросмотр, редактор требований, ссылка на профиль,
// отметка «здесь это есть», образцовая работа без замечаний.
import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { FIXTURES } from '../../scripts/lib/fixtures.ts';
import { BUILTIN_PROFILES } from '../../src/core/profiles/builtin.ts';
import { profileToHash } from '../../src/core/profiles/share.ts';

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

test('образцовая работа: замечаний нет, оценка 100', async ({ page }) => {
  await page.goto('./');
  const model = readFileSync(new URL('../../fixtures/good/model-note.docx', import.meta.url));
  await upload(page, 'Иванов, И. Пояснительная записка.docx', model);
  await expect(page.getByText(/^Замечаний нет\./)).toBeVisible();
  await expect(page.locator('.score-value')).toHaveText('100 из 100');
});

test('оценка и «Показать в тексте» переводят к абзацу в предпросмотре', async ({ page }) => {
  await page.goto('./');
  await upload(page, 'работа.docx', FIXTURES['PR-06']!.bad());
  await expect(page.getByRole('heading', { name: 'Оценка оформления' })).toBeVisible();
  await page
    .locator('#rule-PR-06')
    .getByRole('button', { name: /Показать в тексте/ })
    .first()
    .click();
  await expect(page.locator('.preview-list li:focus')).toHaveCount(1);
});

test('редактор: выключенное правило пропадает из отчёта и запоминается', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Редактор требований' }).click();
  await page.locator('#en-PR-06').uncheck();
  await page.getByRole('button', { name: 'Применить' }).click();
  await expect(page.getByRole('status')).toContainText('применён');
  await expect(page.getByLabel('Требования')).toHaveValue('school-custom-my');

  await upload(page, 'работа.docx', FIXTURES['PR-06']!.bad());
  await expect(page.locator('#rule-PR-06')).toHaveCount(0);

  // После перезагрузки профиль на месте (localStorage этого браузера).
  await page.reload();
  await expect(page.getByLabel('Требования')).toHaveValue('school-custom-my');
});

test('профиль из ссылки #profile=… выбирается сам', async ({ page }) => {
  const typical = BUILTIN_PROFILES.find((p) => p.id === 'school-default')!;
  await page.goto(`./${profileToHash({ ...typical, title: 'Профиль учителя' })}`);
  await expect(page.getByRole('status')).toContainText('Профиль учителя');
  await expect(page.getByLabel('Требования')).toHaveValue('school-default-link');
});

test('эвристика: отметка «здесь это есть» убирает правило из оценки', async ({ page }) => {
  await page.goto('./');
  await upload(page, 'работа.docx', FIXTURES['HD-01']!.bad());
  const card = page.locator('#rule-HD-01');
  await card.getByRole('button', { name: 'Здесь это есть' }).click();
  await expect(page.locator('#rule-HD-01')).toContainText('Вы отметили');
  await expect(
    page.locator('#rule-HD-01').getByRole('button', { name: 'Вернуть замечание' }),
  ).toBeVisible();
});

test('доступность: отчёт с предпросмотром и открытый редактор', async ({ page }) => {
  await page.goto('./');
  await upload(page, 'работа.docx', FIXTURES['PB-01']!.bad());
  await page.getByRole('button', { name: 'Редактор требований' }).click();
  const violations = (await new AxeBuilder({ page }).analyze()).violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.nodes.length}`);
  expect(violations).toEqual([]);
});
