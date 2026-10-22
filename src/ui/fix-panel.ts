// Панель «Исправить автоматически» под отчётом: галочки по правилам, которые программа
// умеет исправлять безопасно (src/core/fixer). Исходный файл не меняется.
import type { Report } from '../core/engine/index.ts';
import { FIXABLE } from '../core/fixer/fixable.ts';
import { RULE_TEXTS } from '../i18n/rules-ru.ts';
import { ru } from '../i18n/ru.ts';
import { el } from './dom.ts';

export function renderFixPanel(
  report: Report,
  onFix: (ruleIds: string[]) => void,
): HTMLElement | undefined {
  const fixable = report.results.filter((r) => r.status === 'fail' && FIXABLE.includes(r.ruleId));
  if (fixable.length === 0) return undefined;

  const boxes = fixable.map((r) => {
    const input = el('input', { type: 'checkbox', id: `fix-${r.ruleId}`, value: r.ruleId });
    input.checked = true;
    const label = el(
      'label',
      { for: input.id },
      ru.fixRuleLine(RULE_TEXTS[r.ruleId]?.title ?? r.ruleId, r.ruleId, r.findings.length),
    );
    return { input, row: el('li', { class: 'param-check' }, input, label) };
  });

  const button = el('button', { type: 'button', class: 'primary' }, ru.fixButton);
  // Не role=status: главный статус страницы один, здесь достаточно aria-live.
  const hint = el('p', { class: 'muted', 'aria-live': 'polite' });
  button.addEventListener('click', () => {
    const ruleIds = boxes.filter((b) => b.input.checked).map((b) => b.input.value);
    if (ruleIds.length === 0) {
      hint.textContent = ru.fixNothing;
      return;
    }
    hint.textContent = ru.fixWorking;
    onFix(ruleIds);
  });

  return el(
    'section',
    { class: 'block fix no-print', 'aria-labelledby': 'fix-title' },
    el('h2', { id: 'fix-title' }, ru.fixTitle),
    el('p', {}, ru.fixIntro),
    el('ul', { class: 'checklist' }, ...boxes.map((b) => b.row)),
    button,
    hint,
  );
}
