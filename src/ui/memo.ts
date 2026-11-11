// Памятка требований на одну страницу: коротко, что нужно сделать в Word, по выбранным
// требованиям. Строки собираются из чисел профиля (memoLines — без DOM, проверяется тестом),
// памятку можно распечатать.
import type { Profile } from '../core/profiles/types.ts';
import { ru } from '../i18n/ru.ts';
import { el } from './dom.ts';

const ALIGN: Record<string, string> = {
  both: 'по ширине',
  left: 'по левому краю',
  center: 'по центру',
  right: 'по правому краю',
};
const POSITION: Record<string, string> = {
  'bottom-center': 'внизу по центру',
  'bottom-right': 'внизу справа',
  'top-center': 'вверху по центру',
  'top-right': 'вверху справа',
};

const fmt = (n: number): string => String(n).replace('.', ',');

// [что, как надо] — только для включённых правил с понятными числами.
export function memoLines(profile: Profile): [string, string][] {
  const on = (rule: string): Record<string, unknown> | undefined =>
    profile.rules[rule]?.enabled ? profile.rules[rule].params : undefined;
  const num = (rule: string, name: string): number | undefined => {
    const value = on(rule)?.[name];
    return typeof value === 'number' ? value : undefined;
  };
  const lines: [string, string][] = [];

  const margins = (
    [
      ['слева', num('PG-02', 'valueMm')],
      ['справа', num('PG-03', 'valueMm')],
      ['сверху', num('PG-04', 'valueMm')],
      ['снизу', num('PG-05', 'valueMm')],
    ] as const
  ).filter(([, v]) => v !== undefined);
  if (margins.length > 0)
    lines.push([
      ru.memo.margins,
      margins.map(([side, v]) => `${side} ${fmt(v ?? 0)} мм`).join(', '),
    ]);

  const fonts = on('FT-01')?.values;
  const size = num('FT-02', 'valuePt');
  if (Array.isArray(fonts) || size !== undefined)
    lines.push([
      ru.memo.font,
      [Array.isArray(fonts) ? fonts.join(' или ') : '', size !== undefined ? `${fmt(size)} pt` : '']
        .filter(Boolean)
        .join(', '),
    ]);

  const line = num('PR-01', 'value');
  const around = num('PR-02', 'valuePt');
  if (line !== undefined)
    lines.push([
      ru.memo.spacing,
      `${fmt(line)}${around !== undefined ? `; перед абзацем и после — ${fmt(around)} pt` : ''}`,
    ]);

  const indent = num('PR-03', 'valueCm');
  if (indent !== undefined)
    lines.push([ru.memo.indent, `${fmt(indent)} см, отступом, не пробелами`]);

  const align = on('PR-04')?.align;
  if (typeof align === 'string') lines.push([ru.memo.align, ALIGN[align] ?? align]);

  if (on('PR-06')) lines.push([ru.memo.empty, ru.memo.emptyRule]);

  const parts = profile.structure?.partsInOrder;
  if (parts && parts.length > 0)
    lines.push([
      ru.memo.parts,
      parts.map((p) => (p.optional ? `${p.title} (если есть)` : p.title)).join(' → '),
    ]);
  if (on('PB-01')) lines.push([ru.memo.pages, ru.memo.pagesRule]);

  const position = on('NM-02')?.position;
  if (on('NM-01'))
    lines.push([
      ru.memo.numbers,
      `${typeof position === 'string' ? (POSITION[position] ?? position) : 'есть'}${on('NM-03')?.noNumberOnTitlePage === true ? ', на титульном листе нет' : ''}`,
    ]);

  const minPages = num('VL-01', 'minPages');
  if (minPages !== undefined) lines.push([ru.memo.volume, `не меньше ${minPages} страниц текста`]);

  const minSources = num('RF-03', 'min');
  const order = on('RF-02')?.order;
  if (minSources !== undefined || order === 'alphabetical')
    lines.push([
      ru.memo.sources,
      [
        minSources !== undefined ? `не меньше ${minSources}` : '',
        order === 'alphabetical' ? 'по алфавиту' : '',
      ]
        .filter(Boolean)
        .join(', '),
    ]);

  const example = on('FN-01')?.example;
  if (typeof example === 'string') lines.push([ru.memo.fileName, example]);
  return lines;
}

export function renderMemo(profile: Profile): HTMLElement {
  const print = el('button', { type: 'button', class: 'secondary no-print' }, ru.memo.print);
  print.addEventListener('click', () => {
    // Печатаем только памятку: класс на <body> прячет всё остальное (styles.css).
    document.body.classList.add('printing-memo');
    window.addEventListener(
      'afterprint',
      () => {
        document.body.classList.remove('printing-memo');
      },
      { once: true },
    );
    window.print();
  });
  return el(
    'section',
    { class: 'memo', 'aria-labelledby': 'memo-title' },
    el('h2', { id: 'memo-title' }, ru.memo.title(profile.title)),
    el(
      'dl',
      {},
      ...memoLines(profile).flatMap(([what, how]) => [el('dt', {}, what), el('dd', {}, how)]),
    ),
    print,
  );
}
