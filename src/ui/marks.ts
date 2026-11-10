// Корректурные знаки у пунктов плана (по мотивам ГОСТ 7.62) и линии «карандаша».
// Знаки нарисованы нами как SVG-контуры: картинок и шрифтов-иконок нет, цвет берётся из CSS
// (currentColor), поэтому знаки сами меняются в тёмной теме.
import type { MarkName } from '../i18n/plan-ru.ts';
import { animate, durations, reducedMotion } from './motion.ts';

const SVG = 'http://www.w3.org/2000/svg';

// Контуры в квадрате 36 × 36. Каждый знак означает действие, а не просто украшает пункт.
const PATHS: Record<MarkName, string[]> = {
  // «Удалить» (делеатур): петля с хвостом.
  delete: [
    'M6 26c6-2 10-8 13-14 1.6-3.2 5.5-3.2 6 0 .6 3.6-3.6 6.2-7 4.6-2.6-1.3-1.6-5 1.5-4.4 3.5.6 6.5 5.5 10.5 7.8',
  ],
  // «Абзацный отступ»: уголок перед строкой.
  indent: ['M8 10h12v18M20 28H8', 'M24 14h6M24 20h6'],
  // «Перенести на новую страницу»: черта и стрелка вниз.
  page: ['M7 9h22M18 9v18m-6-6 6 6 6-6'],
  // «Поля»: две границы и строки между ними.
  margin: ['M9 6v24M27 6v24M13 12h10M13 18h10M13 24h7'],
  // «Вставить»: галочка вставки.
  insert: ['M8 26 18 10l10 16M14 30h8'],
  // «Сблизить»: дуги навстречу друг другу.
  close: ['M6 14c4 8 8 8 12 0M18 14c4 8 8 8 12 0M6 26c4-8 8-8 12 0M18 26c4-8 8-8 12 0'],
  // «Вставить пробел»: вертикальная черта с вилкой.
  space: ['M18 6v24M10 12l8 6 8-6M10 24l8-6 8 6'],
  // «Заменить»: зачёркнуто и вынесено на поле.
  replace: ['M6 22h16M8 26 20 14M24 10h7M27.5 6.5v7'],
};

function svg(viewBox: string, className: string): SVGSVGElement {
  const node = document.createElementNS(SVG, 'svg');
  node.setAttribute('viewBox', viewBox);
  node.setAttribute('class', className);
  node.setAttribute('aria-hidden', 'true');
  node.setAttribute('focusable', 'false');
  return node;
}

function stroke(d: string, width = '2.2'): SVGPathElement {
  const path = document.createElementNS(SVG, 'path');
  path.setAttribute('d', d);
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', width);
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  return path;
}

export function markIcon(name: MarkName): SVGSVGElement {
  const node = svg('0 0 36 36', 'mark-icon');
  for (const d of PATHS[name]) node.append(stroke(d));
  return node;
}

// «Карандаш»: линия рисуется от начала к концу (stroke-dashoffset), как от руки.
// pathLength=1 делает длину линии равной 1, поэтому смещение считается в долях.
function draw(path: SVGPathElement, duration: number): void {
  path.setAttribute('pathLength', '1');
  path.style.strokeDasharray = '1';
  if (reducedMotion()) return;
  path.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], {
    duration,
    easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)',
    fill: 'backwards',
  });
}

// Подчёркивание места в тексте работы. Старое подчёркивание убирается.
export function underline(target: HTMLElement): void {
  target.querySelector(':scope > .pencil')?.remove();
  const node = svg('0 0 100 8', 'pencil');
  node.setAttribute('preserveAspectRatio', 'none');
  const path = stroke('M1 5c20-3 40 2 60-1s30 1 38 0', '1.6');
  path.setAttribute('vector-effect', 'non-scaling-stroke');
  node.append(path);
  target.append(node);
  draw(path, 360);
}

// Галочка «сделал», нарисованная карандашом.
export function checkMark(): SVGSVGElement {
  const node = svg('0 0 20 20', 'check-icon');
  const path = stroke('M3.5 10.5 8 15l8.5-10', '2.4');
  node.append(path);
  draw(path, durations().ui * 1.5);
  return node;
}

// Зачёркивание старого числа при сравнении версий: «~~59~~ → 0».
export function strike(target: HTMLElement): void {
  const node = svg('0 0 100 10', 'strike');
  node.setAttribute('preserveAspectRatio', 'none');
  const path = stroke('M2 6c30-2 60 1 96-2', '2');
  path.setAttribute('vector-effect', 'non-scaling-stroke');
  node.append(path);
  target.append(node);
  draw(path, 320);
}

// Новое число проявляется после зачёркивания.
export function appear(target: HTMLElement): void {
  animate(
    target,
    [
      { opacity: 0, transform: 'translateX(-4px)' },
      { opacity: 1, transform: 'none' },
    ],
    { duration: durations().ui, delay: 260 },
  );
}
