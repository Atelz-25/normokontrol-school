// Движение на сайте: только чтобы показать смену состояния (загрузка → проверка → отчёт,
// раскрытие, переход к месту). Без библиотек — Web Animations API.
//
// Правила (docs/DESIGN.md): анимируем только transform и opacity, кривая одна на весь сайт,
// длительности берём из tokens.css, чтобы они жили в одном месте. Если в системе включено
// «уменьшить движение», сдвиги убираются и остаётся только смена прозрачности.

const EASE = 'cubic-bezier(0.2, 0.7, 0.2, 1)';

export const reducedMotion = (): boolean =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// «180ms» из CSS-переменной → 180. Если переменной нет, берём запасное значение.
function token(name: string, fallback: number): number {
  const value = parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name));
  return Number.isFinite(value) ? value : fallback;
}

export const durations = (): { ui: number; reveal: number; stagger: number } => ({
  ui: token('--dur-ui', 180),
  reveal: token('--dur-reveal', 600),
  stagger: token('--stagger', 35),
});

type Frame = { opacity?: number; transform?: string };

// Анимация с учётом «уменьшить движение»: transform из кадров выбрасывается.
export function animate(
  element: Element,
  frames: Frame[],
  options: KeyframeAnimationOptions = {},
): Animation | undefined {
  const reduce = reducedMotion();
  const keyframes = reduce
    ? frames.map(({ opacity }) => (opacity === undefined ? {} : { opacity }))
    : frames;
  if (reduce && keyframes.every((frame) => Object.keys(frame).length === 0)) return undefined;
  return element.animate(keyframes, { easing: EASE, fill: 'backwards', ...options });
}

// Появление блоков один раз, по очереди с небольшой задержкой; общая длительность ≤ reveal.
export function revealInOrder(elements: Element[]): void {
  const { ui, reveal, stagger } = durations();
  const shown = elements.slice(0, Math.max(1, Math.floor((reveal - ui) / stagger) + 1));
  shown.forEach((element, i) => {
    animate(
      element,
      [
        { opacity: 0, transform: 'translateY(8px)' },
        { opacity: 1, transform: 'none' },
      ],
      { duration: ui * 1.5, delay: i * stagger },
    );
  });
}

// Раскрытие: содержимое проявляется и чуть съезжает вниз.
export function unfold(elements: Element[]): void {
  const { ui, stagger } = durations();
  elements.slice(0, 12).forEach((element, i) => {
    animate(
      element,
      [
        { opacity: 0, transform: 'translateY(-4px)' },
        { opacity: 1, transform: 'none' },
      ],
      { duration: ui, delay: i * (stagger / 2) },
    );
  });
}

// Число «докручивается» от прошлого значения до нового. format превращает число в текст.
export function countTo(
  node: HTMLElement,
  from: number,
  to: number,
  format: (n: number) => string,
): void {
  node.textContent = format(to);
  if (reducedMotion() || from === to) return;
  const duration = durations().reveal;
  const start = performance.now();
  node.textContent = format(from);
  const step = (now: number): void => {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - (1 - t) ** 3; // та же форма, что у кривой сайта: быстро, затем плавно
    node.textContent = format(Math.round(from + (to - from) * eased));
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
