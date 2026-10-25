// Оформление и движение (docs/DESIGN.md): доступность с анимациями, клавиатура в отчёте,
// карта документа.
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

test('с клавиатуры по отчёту: «Показать в тексте» и «Почему это важно»', async ({ page }) => {
  await page.goto('./');
  await checkFile(page, FIXTURES['PR-06']!.bad());
  // После проверки фокус стоит на заголовке отчёта, дальше идём клавишей Tab.
  await expect(page.locator(':focus')).toHaveText('Результат проверки');
  const tabTo = async (pattern: RegExp): Promise<void> => {
    for (let i = 0; i < 60; i++) {
      await page.keyboard.press('Tab');
      const text = await page.evaluate(() => document.activeElement?.textContent ?? '');
      if (pattern.test(text)) return;
    }
    throw new Error(`Tab не дошёл до ${String(pattern)}`);
  };
  await tabTo(/^Показать в тексте$/);
  await page.keyboard.press('Enter');
  await expect(page.locator('.preview-list li:focus')).toHaveCount(1);

  await tabTo(/^Почему это важно$/);
  await page.keyboard.press('Enter');
  await expect(page.locator('details[open] > summary:focus')).toHaveCount(1);
});

test('карта документа: засечка ведёт к карточке замечания', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('./');
  // В файле: абзац, пустой, абзац, пустой, абзац, пустой, абзац — пустые №2, 4, 6 (PR-06).
  await checkFile(page, FIXTURES['PR-06']!.bad());
  const canvas = page.locator('.doc-map-canvas');
  await expect(canvas).toBeVisible();
  await expect(canvas).toHaveAttribute('aria-hidden', 'true');
  // Строка карты — 3 px; абзац №2 — вторая строка.
  await canvas.click({ position: { x: 4, y: 4 } });
  await expect(page.locator('#rule-PR-06')).toBeFocused();
});
