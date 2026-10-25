// Проверка доступности axe для всех e2e-тестов.
//
// Сначала ждём, пока закончатся короткие анимации (появление отчёта, «набегающая» оценка):
// посреди движения axe может неверно определить фон под текстом и сообщить о контрасте,
// которого пользователь не увидит. Бесконечные анимации (линия «сканера») не ждём.
// В ответе — правило и элементы, чтобы при падении в CI было видно, что именно не так.
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';

export async function seriousViolations(page: Page): Promise<string[]> {
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => undefined)),
    ),
  );
  const { violations } = await new AxeBuilder({ page }).analyze();
  return violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}
