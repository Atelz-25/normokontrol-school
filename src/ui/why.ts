// «Почему это важно» в картинках: два кадра «у тебя в Word» → «у учителя».
// Кадры сменяются раз в 2,5 с только пока блок открыт, и не бесконечно: после четырёх смен
// показ останавливается, его можно запустить снова. При «уменьшить движение» кадры стоят рядом.
import { WHY_FRAMES, type WhyName } from '../i18n/plan-ru.ts';
import { ru } from '../i18n/ru.ts';
import { el } from './dom.ts';
import { reducedMotion } from './motion.ts';

const SVG = 'http://www.w3.org/2000/svg';
const SWITCH_MS = 2500;
const MAX_SWITCHES = 4;

type Shape = [kind: 'line' | 'head' | 'bad' | 'clip', x: number, y: number, w: number, h?: number];

// Лист 60 × 80. Строки — тонкие полоски, заголовок — тёмная, плохое место — красная.
const lines = (x: number, ys: number[], w = 40): Shape[] => ys.map((y): Shape => ['line', x, y, w]);

const PICTURES: Record<WhyName, [Shape[][], Shape[][]]> = {
  empty: [
    [[...lines(10, [10, 14, 18, 26, 30, 34, 42, 46, 50, 58, 62])]],
    [
      [
        ...lines(10, [10, 14, 18]),
        ['bad', 10, 24, 40, 12],
        ...lines(10, [40, 44]),
        ['bad', 10, 50, 40, 20],
      ],
    ],
  ],
  page: [
    [[...lines(10, [10, 14, 18, 22]), ['head', 10, 32, 24], ...lines(10, [40, 44, 48, 52, 56])]],
    [
      [
        ...lines(10, [10, 14, 18, 22, 26, 30, 34, 38, 42, 46, 50, 54, 58, 62]),
        ['head', 10, 70, 24],
        ['bad', 8, 67, 44, 7],
      ],
      [...lines(10, [10, 14, 18, 22, 26])],
    ],
  ],
  margin: [
    [[...lines(6, [10, 14, 18, 22, 30, 34, 38, 46, 50, 54], 48)]],
    [
      [
        ...lines(6, [10, 14, 18, 22, 30, 34, 38, 46, 50, 54], 48),
        ['clip', 0, 0, 12, 80],
        ['bad', 6, 8, 6, 50],
      ],
    ],
  ],
  indent: [
    [
      [
        ['line', 16, 10, 34],
        ...lines(10, [14, 18]),
        ['line', 16, 26, 34],
        ...lines(10, [30, 34]),
        ['line', 16, 42, 34],
        ...lines(10, [46, 50]),
      ],
    ],
    [
      [
        ['line', 13, 10, 37],
        ...lines(10, [14, 18]),
        ['line', 20, 26, 30],
        ...lines(10, [30, 34]),
        ['line', 16, 42, 34],
        ...lines(10, [46, 50]),
        ['bad', 8, 8, 14, 22],
      ],
    ],
  ],
};

function page(shapes: Shape[], x: number): SVGGElement {
  const g = document.createElementNS(SVG, 'g');
  g.setAttribute('transform', `translate(${x} 0)`);
  const sheet = document.createElementNS(SVG, 'rect');
  Object.entries({ x: '0.5', y: '0.5', width: '59', height: '79', class: 'w-page' }).forEach(
    ([k, v]) => {
      sheet.setAttribute(k, v);
    },
  );
  g.append(sheet);
  for (const [kind, sx, sy, w, h] of shapes) {
    const rect = document.createElementNS(SVG, 'rect');
    rect.setAttribute('x', String(sx));
    rect.setAttribute('y', String(sy));
    rect.setAttribute('width', String(w));
    rect.setAttribute('height', String(h ?? (kind === 'head' ? 3 : 1.6)));
    rect.setAttribute('class', `w-${kind}`);
    g.append(rect);
  }
  return g;
}

function frame(pages: Shape[][], index: number, caption: string): HTMLElement {
  const width = pages.length * 66 - 6;
  const picture = document.createElementNS(SVG, 'svg');
  picture.setAttribute('viewBox', `0 0 ${width} 80`);
  picture.setAttribute('aria-hidden', 'true');
  pages.forEach((shapes, i) => {
    picture.append(page(shapes, i * 66));
  });
  return el(
    'figure',
    { class: 'why-frame' },
    picture,
    el('figcaption', {}, el('b', {}, ru.whyFrame(index)), ` ${caption}`),
  );
}

// Картинка для блока «Почему» (есть не у всех действий).
export interface WhyPicture {
  element: HTMLElement;
  start: () => void; // блок открыли
  stop: () => void; // блок закрыли
}

export function whyPicture(name: WhyName): WhyPicture {
  const frames = PICTURES[name].map((pages, i) => frame(pages, i, WHY_FRAMES[name][i] ?? ''));
  const box = el('div', { class: 'why-anim' }, ...frames);
  const control = el('button', { type: 'button', class: 'link why-control' }, ru.whyPause);
  const wrap = el('div', { class: 'why' }, box, control);

  let timer: number | undefined;
  let shown = 0;
  let switches = 0;
  const show = (i: number): void => {
    shown = i;
    frames.forEach((f, n) => f.classList.toggle('current', n === i));
  };
  const stop = (): void => {
    window.clearInterval(timer);
    timer = undefined;
    control.textContent = ru.whyPlay;
  };
  const start = (): void => {
    if (reducedMotion()) return; // кадры и так видны рядом
    stop();
    switches = 0;
    show(0);
    control.textContent = ru.whyPause;
    timer = window.setInterval(() => {
      show(1 - shown);
      switches += 1;
      if (switches >= MAX_SWITCHES) stop();
    }, SWITCH_MS);
  };

  show(0);
  if (reducedMotion()) {
    box.classList.add('side');
    control.hidden = true;
  }
  control.addEventListener('click', () => {
    if (timer === undefined) start();
    else stop();
  });
  // Смена идёт только пока блок открыт: открывает и закрывает его план (plan-view.ts).
  return { element: wrap, start, stop };
}
