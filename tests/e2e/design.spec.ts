// Оформление и движение (docs/DESIGN.md): доступность с анимациями, клавиатура в плане,
// карта документа, клавиши J/K/?, «Сделал» и маршруты.
import { expect, test, type Page } from '@playwright/test';
import { FIXTURES } from '../../scripts/lib/fixtures.ts';
import { seriousViolations } from './axe.ts';

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

async function checkFile(page: Page, bytes: Uint8Array): Promise<void> {
  await page.locator('#file').setInputFiles({
    name: 'работа.docx',
    mimeType: DOCX,
    buffer: Buffer.from(bytes),
  });
  await expect(page.locator('#app > .status')).toContainText('Готово');
}

test('тёмная тема с анимациями: после появления отчёта нет серьёзных нарушений', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'no-preference' });
  await page.goto('./');
  expect(await seriousViolations(page)).toEqual([]);
  await checkFile(page, FIXTURES['PR-06']!.bad());
  expect(await seriousViolations(page)).toEqual([]);
});

test('с клавиатуры по плану: «Почему», «Все места» и переход к месту на листе', async ({
  page,
}) => {
  await page.goto('./');
  await checkFile(page, FIXTURES['PR-06']!.bad());
  // После проверки фокус стоит на вердикте, дальше идём клавишей Tab.
  await expect(page.locator(':focus')).toHaveText('Пока рано сдавать');
  const tabTo = async (pattern: RegExp): Promise<void> => {
    for (let i = 0; i < 60; i++) {
      await page.keyboard.press('Tab');
      const text = await page.evaluate(() => document.activeElement?.textContent ?? '');
      if (pattern.test(text)) return;
    }
    throw new Error(`Tab не дошёл до ${String(pattern)}`);
  };
  await tabTo(/^Почему$/);
  await page.keyboard.press('Enter');
  await expect(page.locator('button[aria-expanded="true"]:focus')).toHaveCount(1);

  await tabTo(/^Все места$/);
  await page.keyboard.press('Enter');
  await tabTo(/^Показать$/);
  await page.keyboard.press('Enter');
  // Фокус после перехода к месту — на листе с текстом работы.
  await expect(page.locator('.preview-list li:focus')).toHaveCount(1);
});

test('карта документа: засечка ведёт к пункту плана', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('./');
  // В файле: абзац, пустой, абзац, пустой, абзац, пустой, абзац — пустые №2, 4, 6 (PR-06).
  await checkFile(page, FIXTURES['PR-06']!.bad());
  const canvas = page.locator('.doc-map-canvas');
  await expect(canvas).toBeVisible();
  // Строка карты — 3 px; абзац №2 — вторая строка.
  await canvas.click({ position: { x: 4, y: 4 } });
  await expect(page.locator('.plan-item[data-rules~="PR-06"]')).toBeFocused();
});

test('клавиши: J ведёт к месту на листе, ? открывает подсказку', async ({ page }) => {
  await page.goto('./');
  await checkFile(page, FIXTURES['PR-06']!.bad());
  await page.keyboard.press('j');
  await expect(page.locator('.preview-list li:focus')).toHaveCount(1);
  await page.keyboard.press('Shift+?');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
});

test('«Сделал»: пункт уходит в конец плана и возвращается', async ({ page }) => {
  await page.goto('./');
  await checkFile(page, FIXTURES['PR-06']!.bad());
  const first = page.locator('.plan-item').first();
  const id = await first.getAttribute('id');
  await first.getByRole('button', { name: 'Сделал' }).click();
  await expect(page.locator('.plan-item').last()).toHaveAttribute('id', id ?? '');
  await expect(page.locator(`#${id}`)).toHaveClass(/done/);
  await page.locator(`#${id}`).getByRole('button', { name: 'Вернуть в план' }).click();
  await expect(page.locator('.plan-item').first()).toHaveAttribute('id', id ?? '');
});

test('маршруты: «Назад» в браузере возвращает на прошлый экран', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('link', { name: 'Как это работает' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Как это работает' })).toBeFocused();
  await page.goBack();
  await expect(page.getByRole('heading', { level: 1, name: /Проверьте работу/ })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
});

test('фильтр плана и «по одному»', async ({ page }) => {
  await page.goto('./');
  await checkFile(page, FIXTURES['PR-06']!.bad());
  const visible = page.locator('.plan-item:not(.folded)');
  const all = await visible.count();
  await page.getByRole('button', { name: 'Исправлю сам' }).click();
  await expect(visible).toHaveCount(1); // только пустые строки
  await page.getByRole('button', { name: 'Все', exact: true }).click();
  await expect(visible).toHaveCount(all);

  await page.getByRole('button', { name: 'По одному' }).click();
  await expect(visible).toHaveCount(1);
  await expect(page.locator('.left-count')).toContainText(`Осталось ${all}`);
  const first = await visible.getAttribute('id');
  await visible.getByRole('button', { name: 'Сделал' }).click();
  await expect(visible).toHaveCount(1);
  await expect(visible).not.toHaveAttribute('id', first ?? '');
});
