// Лист «Текст работы»: упрощённый текст по абзацам с подсветкой мест из отчёта, линейка
// левого поля сверху и карта документа справа вместо полосы прокрутки.
// Это не копия Word: только текст, пустые абзацы видны как «¶». Текст вставляется
// через textContent и <mark>, никогда через innerHTML.
import type { Report } from '../core/engine/index.ts';
import type { Profile, Severity } from '../core/profiles/types.ts';
import { SEVERITY_NAMES, ru } from '../i18n/ru.ts';
import type { MapParagraph } from '../worker/protocol.ts';
import { renderDocMap } from './doc-map.ts';
import { el } from './dom.ts';
import { underline } from './marks.ts';
import { reducedMotion } from './motion.ts';

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

// Линейка левого поля: серая метка — «как надо», красная — «как сейчас». Когда в плане
// выбран пункт про поля, красная метка доезжает до серой: видно, что изменится.
const RULER_MM = 50; // линейка показывает первые 50 мм листа

function marginRuler(report: Report, profile: Profile): HTMLElement | undefined {
  const params = profile.rules['PG-02']?.params as { valueMm?: unknown } | undefined;
  const need = typeof params?.valueMm === 'number' ? params.valueMm : undefined;
  if (need === undefined || !profile.rules['PG-02']?.enabled) return undefined;
  const actualText = report.results
    .find((r) => r.ruleId === 'PG-02')
    ?.findings.find((f) => f.actual)?.actual;
  const now = actualText ? parseFloat(actualText.replace(',', '.')) : undefined;
  const at = (mm: number): string => `${Math.min(100, (mm / RULER_MM) * 100)}%`;

  const needTick = el('span', { class: 'tick need' });
  needTick.style.left = at(need);
  const needLabel = el('span', { class: 'label need' }, ru.rulerNeed(need));
  needLabel.style.left = at(need);
  const ruler = el(
    'div',
    {
      class: 'ruler',
      role: 'img',
      'aria-label': `${ru.rulerLabel}: ${ru.rulerNeed(need)}${now !== undefined ? `, ${ru.rulerNow(now)}` : ''}`,
    },
    needTick,
    needLabel,
  );
  if (now !== undefined && Number.isFinite(now) && now !== need) {
    const nowTick = el('span', { class: 'tick now' });
    nowTick.style.left = at(now);
    const nowLabel = el('span', { class: 'label now' }, ru.rulerNow(now));
    nowLabel.style.right = `calc(100% - ${at(now)})`;
    ruler.append(nowTick, nowLabel);
    // Сдвиг до серой метки в пикселях: проценты в transform считаются от самой метки.
    ruler.dataset.shift = String((need - now) / RULER_MM);
  }
  return ruler;
}

export interface SheetView {
  element: HTMLElement;
  show: (paragraphIndex: number, focus: boolean) => void;
  alignRuler: (active: boolean) => void; // наведение на пункт плана про поля
}

// Сколько абзацев добавлять за один шаг. Между шагами браузер успевает обработать
// клики и прокрутку, поэтому даже работа на 3 000 абзацев не «замораживает» страницу.
const CHUNK = 150;

export function renderPreview(
  report: Report,
  profile: Profile,
  map: MapParagraph[],
  dismissed: ReadonlySet<string>,
  onShowMark: (paragraphIndex: number) => void,
): SheetView {
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
  const scroller = el('div', { class: 'sheet-scroll' }, list);
  const ruler = marginRuler(report, profile);

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

  const show = (index: number, focus: boolean): void => {
    // Если до абзаца ещё не дошла очередь, дорисовываем сразу (номера абзацев идут с 1).
    renderUntil(index);
    const target = list.querySelector<HTMLElement>(`#para-${index}`);
    if (!target) return;
    target.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'center' });
    if (focus) target.focus({ preventScroll: true });
    list.querySelector('.target')?.classList.remove('target');
    target.classList.add('target');
    underline(target); // «карандаш» подчёркивает место
  };

  const docMap = renderDocMap(map, report, dismissed, scroller, {
    onShowParagraph: (index) => {
      show(index, true);
    },
    onShowMark,
  });

  const element = el(
    'section',
    { class: 'preview', 'aria-labelledby': 'preview-title', id: 'sheet' },
    el('h2', { id: 'preview-title' }, ru.previewTitle),
    el('p', { class: 'soft hint' }, ru.previewHint),
    ruler,
    el('div', { class: `sheet-body${docMap ? ' with-map' : ''}` }, scroller, docMap),
  );

  const alignRuler = (active: boolean): void => {
    if (!ruler?.dataset.shift) return;
    const now = ruler.querySelector<HTMLElement>('.tick.now');
    const shift = Number(ruler.dataset.shift) * ruler.clientWidth;
    if (now) now.style.transform = active ? `translateX(${shift}px)` : '';
  };

  return { element, show, alignRuler };
}
