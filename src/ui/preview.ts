// Предпросмотр: упрощённый текст работы по абзацам с подсветкой мест из отчёта.
// Это не копия Word: только текст, пустые абзацы видны как «¶». Текст вставляется
// через textContent и <mark>, никогда через innerHTML.
import type { Report } from '../core/engine/index.ts';
import type { Severity } from '../core/profiles/types.ts';
import { SEVERITY_NAMES, ru } from '../i18n/ru.ts';
import { el } from './dom.ts';

const ORDER: Severity[] = ['error', 'warning', 'info'];

interface Mark {
  severity: Severity;
  ranges: [number, number][];
}

// Какой абзац подсветить и какими отрезками.
function collectMarks(report: Report, dismissed: ReadonlySet<string>): Map<number, Mark> {
  const marks = new Map<number, Mark>();
  for (const result of report.results) {
    if (result.status !== 'fail' || dismissed.has(result.ruleId)) continue;
    for (const f of result.findings) {
      const index = f.location.paragraphIndex;
      if (index === undefined) continue;
      const mark = marks.get(index) ?? { severity: f.severity, ranges: [] };
      if (ORDER.indexOf(f.severity) < ORDER.indexOf(mark.severity)) mark.severity = f.severity;
      mark.ranges.push(...(f.location.ranges ?? []));
      marks.set(index, mark);
    }
  }
  return marks;
}

// Текст с <mark> на отрезках. Отрезки сортируем и склеиваем, если они пересекаются.
function highlighted(text: string, ranges: [number, number][]): (Node | string)[] {
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  const parts: (Node | string)[] = [];
  let position = 0;
  for (const [start, end] of sorted) {
    if (end <= position) continue;
    const from = Math.max(start, position);
    parts.push(text.slice(position, from), el('mark', {}, text.slice(from, end)));
    position = end;
  }
  parts.push(text.slice(position));
  return parts.filter((part) => part !== '');
}

export interface PreviewView {
  element: HTMLElement;
  show: (paragraphIndex: number) => void;
}

// Сколько абзацев добавлять за один шаг. Между шагами браузер успевает обработать
// клики и прокрутку, поэтому даже работа на 3 000 абзацев не «замораживает» страницу.
const CHUNK = 150;

export function renderPreview(report: Report, dismissed: ReadonlySet<string>): PreviewView {
  const marks = collectMarks(report, dismissed);
  const item = (index: number): HTMLElement => {
    const p = report.preview[index];
    if (!p) return el('li', {});
    const mark = marks.get(p.index);
    const classes = [
      'para',
      p.isEmpty ? 'empty' : '',
      p.inTable ? 'cell' : '',
      mark ? `flag flag-${mark.severity}` : '',
    ]
      .filter(Boolean)
      .join(' ');
    // Табуляцию показываем стрелкой, чтобы её было видно, как в Word со знаком ¶.
    const text = p.text.replace(/\t/g, '→');
    return el(
      'li',
      { id: `para-${p.index}`, class: classes, tabindex: '-1', value: String(p.index) },
      mark
        ? el('span', { class: 'visually-hidden' }, `${SEVERITY_NAMES[mark.severity]}: `)
        : undefined,
      p.inTable ? el('span', { class: 'cell-label' }, `${ru.previewTable}: `) : undefined,
      ...(p.isEmpty ? [ru.previewEmpty] : highlighted(text, mark?.ranges ?? [])),
    );
  };

  const list = el('ol', { class: 'preview-list' });
  const element = el(
    'section',
    { class: 'preview', 'aria-labelledby': 'preview-title' },
    el('h2', { id: 'preview-title' }, ru.previewTitle),
    el('p', { class: 'muted' }, ru.previewHint),
    list,
  );

  // Добавляет абзацы до номера until (не включая) — порциями или сразу.
  let rendered = 0;
  const renderUntil = (until: number): void => {
    const fragment = document.createDocumentFragment();
    for (; rendered < Math.min(until, report.preview.length); rendered++)
      fragment.append(item(rendered));
    list.append(fragment);
  };
  const step = (): void => {
    renderUntil(rendered + CHUNK);
    if (rendered < report.preview.length) setTimeout(step, 0);
  };
  step();

  const show = (index: number): void => {
    // Если до абзаца ещё не дошла очередь, дорисовываем сразу (номера абзацев идут с 1).
    renderUntil(index);
    const target = list.querySelector<HTMLElement>(`#para-${index}`);
    if (!target) return;
    const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    target.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'center' });
    target.focus({ preventScroll: true });
    target.classList.add('pulse');
    setTimeout(() => {
      target.classList.remove('pulse');
    }, 1500);
  };

  return { element, show };
}
