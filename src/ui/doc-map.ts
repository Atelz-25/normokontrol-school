// Карта документа: узкая полоса рядом с отчётом. Каждый абзац — штрих, его длина зависит
// от длины абзаца; пустые абзацы — пропуски; места с замечаниями — засечки на полях
// (красная — ошибка, охра — замечание). Видно сразу, где в работе «дырки» и где скопились ошибки.
//
// Карта рисуется на <canvas>: абзацев бывает несколько тысяч, и тысячи элементов страницы
// были бы тяжелее. Для экранного диктора карта скрыта: те же места есть в карточках
// замечаний и в тексте работы, куда можно попасть с клавиатуры.
// Текста абзацев здесь нет — только роль, «пустой или нет» и длина (MapParagraph).
import type { Report } from '../core/engine/index.ts';
import type { Severity } from '../core/profiles/types.ts';
import { ru } from '../i18n/ru.ts';
import type { MapParagraph } from '../worker/protocol.ts';
import { el } from './dom.ts';

const ORDER: Severity[] = ['error', 'warning', 'info'];
const ROW = 3; // высота строки карты в пикселях при «полном» масштабе
const MARGIN = 10; // поле слева под засечки
const HIT = 6; // насколько близко к засечке нужно щёлкнуть, в пикселях

interface Mark {
  severity: Severity;
  cardId: string; // карточка, к которой ведёт засечка
}

// Самое серьёзное замечание у каждого абзаца и карточка, в которой оно лежит.
function collectMarks(report: Report, dismissed: ReadonlySet<string>): Map<number, Mark> {
  const marks = new Map<number, Mark>();
  for (const result of report.results) {
    if (result.status !== 'fail' || dismissed.has(result.ruleId)) continue;
    for (const f of result.findings) {
      const index = f.location.paragraphIndex;
      if (index === undefined || f.severity === 'info') continue;
      const group = f.location.group;
      const cardId = group ? `rule-${result.ruleId}-${group}` : `rule-${result.ruleId}`;
      const known = marks.get(index);
      if (!known || ORDER.indexOf(f.severity) < ORDER.indexOf(known.severity))
        marks.set(index, { severity: f.severity, cardId });
    }
  }
  return marks;
}

export interface DocMapActions {
  onShowParagraph: (index: number) => void; // щелчок по абзацу без замечаний
  onShowCard: (cardId: string) => void; // щелчок по засечке
}

export function renderDocMap(
  map: MapParagraph[],
  report: Report,
  dismissed: ReadonlySet<string>,
  actions: DocMapActions,
): HTMLElement | undefined {
  if (map.length === 0) return undefined;
  const marks = collectMarks(report, dismissed);
  const longest = Math.max(1, ...map.map((p) => p.length));
  const canvas = el('canvas', { class: 'doc-map-canvas', 'aria-hidden': 'true' });
  const element = el(
    'div',
    { class: 'doc-map no-print', title: ru.docMapHint },
    el('p', { class: 'doc-map-label', 'aria-hidden': 'true' }, ru.docMapTitle),
    canvas,
  );

  // Высота строки: полная, если документ помещается, иначе карта сжимается до высоты окна.
  let rowHeight = ROW;

  const draw = (): void => {
    const style = getComputedStyle(element);
    const color = (name: string): string => style.getPropertyValue(name).trim();
    const width = canvas.clientWidth;
    const available = Math.max(200, window.innerHeight - 120);
    rowHeight = Math.min(ROW, available / map.length);
    const height = Math.ceil(rowHeight * map.length);
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.clearRect(0, 0, width, height);

    // Красная линия полей, как в тетради.
    ctx.fillStyle = color('--margin-line');
    ctx.fillRect(MARGIN - 3, 0, 1, height);

    const line = Math.max(1, rowHeight * 0.6);
    map.forEach((p, i) => {
      if (p.empty) return; // пропуск — это и есть пустой абзац
      const y = i * rowHeight;
      const textWidth = Math.max(2, ((width - MARGIN) * Math.min(p.length, longest)) / longest);
      const heading = p.role === 'heading' || p.role === 'part-heading';
      ctx.fillStyle = color(heading ? '--graphite' : '--rule-strong');
      ctx.fillRect(
        MARGIN,
        y,
        heading ? Math.min(textWidth, (width - MARGIN) * 0.5) : textWidth,
        line,
      );
      const mark = marks.get(p.index);
      if (mark) {
        ctx.fillStyle = color(mark.severity === 'error' ? '--pencil' : '--ochre');
        ctx.fillRect(0, y - 0.5, MARGIN - 5, Math.max(2, line + 1));
      }
    });
    // Пустые абзацы с замечанием (PR-06, PR-10) тоже получают засечку.
    map.forEach((p, i) => {
      const mark = p.empty ? marks.get(p.index) : undefined;
      if (!mark) return;
      ctx.fillStyle = color(mark.severity === 'error' ? '--pencil' : '--ochre');
      ctx.fillRect(0, i * rowHeight - 0.5, MARGIN - 5, Math.max(2, line + 1));
    });
  };

  // Щелчок: ближайшая засечка ведёт к карточке, иначе — к абзацу в тексте работы.
  canvas.addEventListener('click', (event) => {
    const y = event.clientY - canvas.getBoundingClientRect().top;
    const row = Math.floor(y / rowHeight);
    const reach = Math.ceil(HIT / rowHeight);
    for (let d = 0; d <= reach; d++) {
      for (const i of [row - d, row + d]) {
        const p = map[i];
        const mark = p ? marks.get(p.index) : undefined;
        if (mark) {
          actions.onShowCard(mark.cardId);
          return;
        }
      }
    }
    const p = map[Math.min(map.length - 1, Math.max(0, row))];
    if (p) actions.onShowParagraph(p.index);
  });

  // Рисуем, когда карта попала на страницу, и заново при смене размера окна или темы.
  // Когда отчёт перерисован и карты на странице больше нет, отписываемся: ResizeObserver
  // сообщает и об удалении элемента со страницы.
  const theme = window.matchMedia('(prefers-color-scheme: dark)');
  const observer = new ResizeObserver(() => {
    redraw();
  });
  function redraw(): void {
    if (!element.isConnected) {
      observer.disconnect();
      theme.removeEventListener('change', redraw);
      return;
    }
    draw();
  }
  observer.observe(canvas);
  theme.addEventListener('change', redraw);
  return element;
}
