// Сквозные тесты в настоящем браузере: загрузка → отчёт, профили, приватность,
// доступность, повреждённые файлы и большой файл.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { buildDocx, p } from '../../scripts/lib/docx-builder.ts';
import { FIXTURES } from '../../scripts/lib/fixtures.ts';

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

async function upload(page: Page, name: string, bytes: Uint8Array, mimeType = DOCX): Promise<void> {
  await page.locator('#file').setInputFiles({ name, mimeType, buffer: Buffer.from(bytes) });
}

// Любая необработанная ошибка на странице — провал теста.
test.beforeEach(({ page }) => {
  page.on('pageerror', (error) => {
    throw error;
  });
});

test('загрузка → отчёт с блоками школы и карточкой замечания', async ({ page }) => {
  await page.goto('./');
  await upload(page, 'работа.docx', FIXTURES['PR-06']!.bad());
  await expect(page.getByRole('status')).toContainText('Готово');
  await expect(
    page.getByRole('heading', { name: 'Из-за чего в прошлый раз снижали баллы' }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Базовые пять пунктов' })).toBeVisible();
  await expect(page.locator('#rule-PR-06')).toContainText('Пустой абзац между абзацами');
});

test('смена профиля перепроверяет тот же файл', async ({ page }) => {
  await page.goto('./');
  await upload(page, 'работа.docx', FIXTURES['FT-02']!.good());
  await expect(page.getByRole('status')).toContainText('Готово');
  // В типовом профиле размер шрифта 14 pt, а файл набран 12 pt.
  await page.getByLabel('Требования').selectOption('school-default');
  await expect(page.locator('#rule-FT-02')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Базовые пять пунктов' })).toHaveCount(0);
});

test('повреждённый и чужой файл: понятное сообщение, без падения', async ({ page }) => {
  await page.goto('./');
  await upload(page, 'сломан.docx', new TextEncoder().encode('это не docx'));
  await expect(page.getByRole('status')).toContainText('не похоже на файл Word');
  await upload(page, 'старый.doc', new Uint8Array([0xd0, 0xcf, 0x11, 0xe0]), 'application/msword');
  await expect(page.getByRole('status')).toContainText('.doc');
});

test('приватность: при проверке нет запросов на чужие адреса, CSP на месте', async ({
  page,
  baseURL,
}) => {
  const origin = new URL(baseURL ?? '').origin;
  const foreign: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.origin !== origin && url.protocol !== 'blob:' && url.protocol !== 'data:')
      foreign.push(url.href);
  });
  await page.goto('./');
  const csp = await page
    .locator('meta[http-equiv="Content-Security-Policy"]')
    .getAttribute('content');
  expect(csp).toContain("connect-src 'none'");
  await upload(page, 'работа.docx', FIXTURES['PB-01']!.bad());
  await expect(page.getByRole('status')).toContainText('Готово');
  expect(foreign).toEqual([]);
});

test('доступность: нет серьёзных нарушений на главной и в отчёте', async ({ page }) => {
  await page.goto('./');
  const serious = async (): Promise<string[]> =>
    (await new AxeBuilder({ page }).analyze()).violations
      .filter((v) => v.impact === 'serious' || v.impact === 'critical')
      .map((v) => v.id);
  expect(await serious()).toEqual([]);
  await upload(page, 'работа.docx', FIXTURES['PR-10']!.bad());
  await expect(page.getByRole('status')).toContainText('Готово');
  expect(await serious()).toEqual([]);
});

test('файл 10 МБ: проверка завершается, страница не зависает', async ({ page }) => {
  // 3000 абзацев текста и «картинка» на 9,5 МБ — как типичная работа с фотографиями.
  const body = Array.from({ length: 3000 }, (_, i) =>
    p(`Абзац номер ${i} с обычным текстом для проверки скорости.`),
  );
  const image = new Uint8Array(9.5 * 1024 * 1024).map((_, i) => (i * 2654435761) >>> 24);
  const big = buildDocx({ body, binaryParts: { 'word/media/image1.png': image } });
  expect(big.length).toBeGreaterThan(9.5 * 1024 * 1024);

  await page.goto('./');
  // «Длинная задача» — когда главный поток занят дольше 50 мс и страница не отвечает.
  // Считаем только задачи после выбора файла: передача 10 МБ из Playwright в страницу
  // (это не наш код) идёт раньше.
  await page.evaluate(() => {
    const w = window as unknown as { longest: number; chosenAt: number };
    w.longest = 0;
    w.chosenAt = Infinity;
    document.getElementById('file')?.addEventListener(
      'change',
      () => {
        w.chosenAt = performance.now();
      },
      { capture: true },
    );
    new PerformanceObserver((list) => {
      for (const task of list.getEntries()) {
        if (task.startTime > w.chosenAt) w.longest = Math.max(w.longest, task.duration);
      }
    }).observe({ type: 'longtask' });
  });
  const started = Date.now();
  await upload(page, 'большая.docx', big);
  await expect(page.getByRole('status')).toContainText('Готово', { timeout: 30_000 });
  const longest = await page.evaluate(() => (window as unknown as { longest: number }).longest);
  console.log(
    `10 МБ: ${Date.now() - started} мс, самая длинная задача главного потока ${Math.round(longest)} мс`,
  );
  expect(longest).toBeLessThan(200);
});
