// Карта документа — полоса прокрутки листа «Текст работы». Каждый абзац — штрих (длина по
// длине абзаца), пустой абзац — пропуск, место с замечанием — засечка (красная — ошибка,
// охра — замечание). Рамка показывает, какая часть работы сейчас видна на листе.
//
// Карта рисуется на <canvas>: абзацев бывает несколько тысяч, и тысячи элементов страницы
// были бы тяжелее. Для экранного диктора карта скрыта: те же места есть в плане и в тексте
// работы, куда можно попасть с клавиатуры. Текста абзацев здесь нет (MapParagraph).
import type { Report } from '../core/engine/index.ts';
import type { Severity } from '../core/profiles/types.ts';
import { ru } from '../i18n/ru.ts';
import type { MapParagraph } from '../worker/protocol.ts';
import { el } from './dom.ts';

const ORDER: Severity[] = ['error', 'warning', 'info'];
const ROW = 3; // высота строки карты в пикселях, если документ короткий
const MARGIN = 7; // поле слева под засечки
const DRAG = 4; // сдвиг мыши в пикселях, после которого щелчок считается перетаскиванием

// Самое серьёзное замечание у каждого абзаца.
function collectMarks(report: Report, dismissed: ReadonlySet<string>): Map<number, Severity> {
  const marks = new Map<number, Severity>();
  for (const result of report.results) {
    if (result.status !== 'fail' || dismissed.has(result.ruleId)) continue;
    for (const f of result.findings) {
      const index = f.location.paragraphIndex;
      if (index === undefined || f.severity === 'info') continue;
      const known = marks.get(index);
      if (!known || ORDER.indexOf(f.severity) < ORDER.indexOf(known)) marks.set(index, f.severity);
    }
  }
  return marks;
}

export interface DocMapActions {
  onShowParagraph: (index: number) => void; // щелчок: показать этот абзац на листе
  onShowMark: (index: number) => void; // щёлкнули по абзацу с замечанием: отметить пункт плана
}

// scroller — лист с текстом работы, у которого карта служит полосой прокрутки.
export function renderDocMap(
  map: MapParagraph[],
  report: Report,
  dismissed: ReadonlySet<string>,
  scroller: HTMLElement,
  actions: DocMapActions,
): HTMLElement | undefined {
  if (map.length === 0) return undefined;
  const marks = collectMarks(report, dismissed);
  const longest = Math.max(1, ...map.map((p) => p.length));
  const canvas = el('canvas', { class: 'doc-map-canvas' });
  const frame = el('span', { class: 'doc-map-frame' });
  const element = el(
    'div',
    { class: 'doc-map no-print', title: ru.docMapHint, 'aria-hidden': 'true' },
    canvas,
    frame,
  );

  let rowHeight = ROW;
  const draw = (): void => {
    const style = getComputedStyle(element);
    const color = (name: string): string => style.getPropertyValue(name).trim();
    const width = canvas.clientWidth;
    // Вся работа помещается в высоту листа: строки сжимаются, но не растут больше ROW.
    const available = Math.max(120, scroller.clientHeight);
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
    const line = Math.max(1, rowHeight * 0.6);
    map.forEach((p, i) => {
      const y = i * rowHeight;
      if (!p.empty) {
        const textWidth = Math.max(2, ((width - MARGIN) * p.length) / longest);
        const heading = p.role === 'heading' || p.role === 'part-heading';
        ctx.fillStyle = color(heading ? '--graphite' : '--rule-strong');
        ctx.fillRect(
          MARGIN,
          y,
          heading ? Math.min(textWidth, (width - MARGIN) / 2) : textWidth,
          line,
        );
      }
      const mark = marks.get(p.index);
      if (mark) {
        ctx.fillStyle = color(mark === 'error' ? '--pencil' : '--ochre');
        ctx.fillRect(0, y - 0.5, MARGIN - 3, Math.max(2, line + 1));
      }
    });
    placeFrame();
  };

  // Рамка «где я»: её высота — доля видимой части листа. Сдвиг рамки при прокрутке делает
  // CSS (animation-timeline: scroll(), styles.css); где браузер этого не умеет, двигаем сами.
  const scrollDriven = CSS.supports('animation-timeline: scroll()');
  function placeFrame(): void {
    const total = Math.max(1, scroller.scrollHeight);
    const mapHeight = canvas.clientHeight;
    const frameHeight = Math.max(12, (scroller.clientHeight / total) * mapHeight);
    const travel = Math.max(0, mapHeight - frameHeight);
    frame.style.height = `${frameHeight}px`;
    element.style.setProperty('--travel', `${travel}px`);
    if (!scrollDriven) {
      const range = Math.max(1, total - scroller.clientHeight);
      frame.style.transform = `translateY(${(scroller.scrollTop / range) * travel}px)`;
    }
  }
  if (!scrollDriven) scroller.addEventListener('scroll', placeFrame, { passive: true });

  // Щелчок: ближайшая засечка ведёт к пункту плана, иначе — к абзацу в тексте работы.
  // Карта работает как полоса прокрутки: щелчок ведёт к этому месту листа,
  // а если зажать кнопку и вести мышь, лист прокручивается следом.
  // Раньше щелчок рядом с засечкой уводил к пункту плана, а не к тексту, — из-за густых
  // засечек казалось, что карта срабатывает через раз.
  let pressedAt: number | undefined;
  let dragging = false;
  const scrollTo = (clientY: number): void => {
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientY - rect.top) / Math.max(1, rect.height)));
    scroller.scrollTop = ratio * scroller.scrollHeight - scroller.clientHeight / 2;
  };
  canvas.addEventListener('pointerdown', (event) => {
    pressedAt = event.clientY;
    dragging = false;
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', (event) => {
    if (pressedAt === undefined) return;
    if (!dragging && Math.abs(event.clientY - pressedAt) < DRAG) return;
    dragging = true;
    scrollTo(event.clientY);
  });
  canvas.addEventListener('pointerup', (event) => {
    const wasDrag = dragging;
    pressedAt = undefined;
    dragging = false;
    if (wasDrag) return;
    const row = Math.floor((event.clientY - canvas.getBoundingClientRect().top) / rowHeight);
    const p = map[Math.min(map.length - 1, Math.max(0, row))];
    if (!p) return;
    actions.onShowParagraph(p.index);
    if (marks.has(p.index)) actions.onShowMark(p.index);
  });
  canvas.addEventListener('pointercancel', () => {
    pressedAt = undefined;
    dragging = false;
  });

  // Рисуем, когда карта попала на страницу, и заново при смене размера листа или темы.
  // Когда отчёт перерисован и карты больше нет, отписываемся.
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
  observer.observe(scroller);
  // Абзацы дорисовываются порциями — высота текста растёт, рамку надо пересчитать.
  if (scroller.firstElementChild) observer.observe(scroller.firstElementChild);
  theme.addEventListener('change', redraw);
  return element;
}
