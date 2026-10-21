// Маленький помощник для создания элементов. Текст всегда кладётся через textContent:
// в документе может оказаться что угодно, и это не должно стать HTML-кодом (защита от XSS).

type Child = Node | string | undefined | false;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (name === 'class') node.className = value;
    else node.setAttribute(name, value);
  }
  for (const child of children) {
    if (child === undefined || child === false) continue;
    node.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}

// Раскрывающийся блок <details>, например «Почему это важно».
export function disclosure(summary: string, body: string): HTMLDetailsElement {
  return el('details', {}, el('summary', {}, summary), el('p', {}, body));
}
