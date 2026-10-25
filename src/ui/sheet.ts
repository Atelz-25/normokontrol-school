// Лист А4 в зоне загрузки: рисует поля из выбранного профиля (PG-02…PG-05) и подписи «30 мм».
// Это картинка-подсказка, а не проверка: значения берутся из профиля, поэтому при смене
// требований лист меняется вместе с ними. Только DOM API, без innerHTML.
import type { Profile } from '../core/profiles/types.ts';
import { ru } from '../i18n/ru.ts';
import { el } from './dom.ts';
import { animate, durations, reducedMotion } from './motion.ts';

type Side = keyof typeof ru.sheetSides;

// Какое правило отвечает за какое поле и какая сторона листа задаёт масштаб (мм).
const SIDES: { side: Side; ruleId: string; pageMm: number }[] = [
  { side: 'left', ruleId: 'PG-02', pageMm: 210 },
  { side: 'right', ruleId: 'PG-03', pageMm: 210 },
  { side: 'top', ruleId: 'PG-04', pageMm: 297 },
  { side: 'bottom', ruleId: 'PG-05', pageMm: 297 },
];

// Число для подписи: «30» при mode=equals, «10 / 15» при mode=oneOf; нет значения — не рисуем.
function marginOf(profile: Profile, ruleId: string): { mm: number; label: string } | undefined {
  const config = profile.rules[ruleId];
  if (!config?.enabled) return undefined;
  const { valueMm, valuesMm } = config.params as { valueMm?: unknown; valuesMm?: unknown };
  if (typeof valueMm === 'number') return { mm: valueMm, label: String(valueMm) };
  if (Array.isArray(valuesMm) && valuesMm.every((v) => typeof v === 'number') && valuesMm.length) {
    const values = valuesMm;
    return { mm: Math.max(...values), label: values.join(' / ') };
  }
  return undefined;
}

export interface SheetView {
  element: HTMLElement;
  update: (profile: Profile) => void;
  startScan: () => void; // началась проверка
  stopScan: (ok: boolean) => void; // проверка закончилась
}

export function renderSheet(profile: Profile): SheetView {
  const labels = Object.fromEntries(
    SIDES.map(({ side }) => [side, el('span', { class: `dim dim-${side}` })]),
  ) as Record<Side, HTMLElement>;
  // Строки «текста» на листе — просто декор, ширина разная, чтобы было похоже на абзацы.
  // Ширину задаём через style.setProperty, а не атрибутом style: CSP сайта запрещает
  // встроенные стили в разметке, а изменение стилей из скрипта разрешено.
  // 0 — пустая строка между абзацами; первая строка — заголовок по центру.
  const widths = [
    40, 0, 92, 100, 96, 100, 64, 0, 100, 98, 100, 88, 100, 72, 0, 96, 100, 100, 58, 0, 100, 94, 100,
    100, 81,
  ];
  const lines = widths.map((width, i) => {
    const line = el('span', { class: i === 0 ? 'line title' : width === 0 ? 'line gap' : 'line' });
    line.style.setProperty('--w', `${width}%`);
    return line;
  });
  const scan = el('span', { class: 'scan' });
  const sheet = el(
    'div',
    { class: 'sheet', 'aria-hidden': 'true' },
    el('div', { class: 'sheet-area' }, ...lines),
    scan,
    ...Object.values(labels),
  );
  // Подпись для экранного диктора: на картинке те же числа видны у краёв листа.
  const caption = el('p', { class: 'visually-hidden' });
  const element = el('figure', { class: 'sheet-figure' }, sheet, caption);

  const update = (next: Profile): void => {
    const described: string[] = [];
    for (const { side, ruleId, pageMm } of SIDES) {
      const margin = marginOf(next, ruleId);
      // Без значения рисуем поле 20 мм, но без подписи: так лист не «прыгает».
      const mm = margin?.mm ?? 20;
      sheet.style.setProperty(`--m-${side}`, `${((mm / pageMm) * 100).toFixed(2)}%`);
      labels[side].textContent = margin ? ru.sheetMm(margin.label) : '';
      if (margin) described.push(ru.sheetMargin(ru.sheetSides[side], margin.label));
    }
    caption.textContent =
      described.length > 0 ? `${ru.sheetCaption}: ${described.join(', ')}.` : ru.sheetCaption;
  };
  update(profile);

  // Линия сканирования. Ядро не сообщает, какая доля правил уже проверена, поэтому
  // процентов не показываем: линия ровно ходит по листу, пока идёт проверка, а в конце
  // доходит до низа и исчезает. При «уменьшить движение» линия стоит и только проявляется.
  let running: Animation | undefined;
  const startScan = (): void => {
    running?.cancel();
    const { reveal } = durations();
    running = reducedMotion()
      ? animate(scan, [{ opacity: 0 }, { opacity: 1 }], { duration: reveal, fill: 'forwards' })
      : animate(
          scan,
          [
            { opacity: 1, transform: 'translateY(0)' },
            { opacity: 1, transform: 'translateY(98%)' },
          ],
          { duration: reveal * 2.5, iterations: Infinity, direction: 'alternate' },
        );
  };
  const stopScan = (ok: boolean): void => {
    const current = running;
    running = undefined;
    if (!current) return;
    const { ui } = durations();
    if (!ok) {
      current.cancel();
      return;
    }
    // Проверка закончилась: линия доходит до низа листа и гаснет.
    current.pause();
    const done = animate(
      scan,
      [
        { opacity: 1, transform: 'translateY(98%)' },
        { opacity: 0, transform: 'translateY(98%)' },
      ],
      {
        duration: ui,
        fill: 'forwards',
      },
    );
    current.cancel();
    void done?.finished.then(() => {
      done.cancel();
    });
  };
  return { element, update, startScan, stopScan };
}
