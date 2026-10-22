// Маленькая обёртка над @xmldom/xmldom. Почему не встроенный DOMParser:
// его нет в Web Worker и в Node, а ядро должно работать везде одинаково.
import { DOMParser, type Element as XmlElement, type Node as XmlNode } from '@xmldom/xmldom';

export type { XmlElement };

export const NS = {
  w: 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
  r: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
  a: 'http://schemas.openxmlformats.org/drawingml/2006/main',
  mc: 'http://schemas.openxmlformats.org/markup-compatibility/2006',
  dc: 'http://purl.org/dc/elements/1.1/',
  cp: 'http://schemas.openxmlformats.org/package/2006/metadata/core-properties',
  dcterms: 'http://purl.org/dc/terms/',
  rel: 'http://schemas.openxmlformats.org/package/2006/relationships',
  wp: 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing',
} as const;

export class XmlParseError extends Error {}

export function parseXml(text: string): XmlElement {
  const parser = new DOMParser({
    onError: (level, message) => {
      // Предупреждения xmldom не страшны, а «ошибка» и «фатальная ошибка» значат битый XML.
      if (level !== 'warning') throw new XmlParseError(message);
    },
  });
  const doc = parser.parseFromString(text, 'text/xml');
  const root = doc.documentElement;
  if (!root) throw new XmlParseError('пустой XML');
  return root;
}

const ELEMENT_NODE = 1;

export function isElement(node: XmlNode | null | undefined): node is XmlElement {
  return node?.nodeType === ELEMENT_NODE;
}

// Дочерние элементы по порядку. Префиксы бывают разными (w:, ns0:), поэтому
// сравниваем пространство имён и локальное имя, а не строку «w:p».
export function children(el: XmlElement, ns?: string, localName?: string): XmlElement[] {
  const result: XmlElement[] = [];
  for (let node = el.firstChild; node; node = node.nextSibling) {
    if (!isElement(node)) continue;
    if (ns !== undefined && node.namespaceURI !== ns) continue;
    if (localName !== undefined && node.localName !== localName) continue;
    result.push(node);
  }
  return result;
}

export function child(
  el: XmlElement | undefined,
  ns: string,
  localName: string,
): XmlElement | undefined {
  if (!el) return undefined;
  for (let node = el.firstChild; node; node = node.nextSibling) {
    if (isElement(node) && node.namespaceURI === ns && node.localName === localName) return node;
  }
  return undefined;
}

// Все потомки с таким именем, в порядке документа.
export function descendants(el: XmlElement, ns: string, localName: string): XmlElement[] {
  return Array.from(el.getElementsByTagNameNS(ns, localName));
}

export const wChild = (el: XmlElement | undefined, name: string): XmlElement | undefined =>
  child(el, NS.w, name);

export const wChildren = (el: XmlElement, name?: string): XmlElement[] => children(el, NS.w, name);

// Атрибут w:val и другие атрибуты в пространстве w. Пустая строка считается отсутствием.
export function wAttr(el: XmlElement | undefined, name: string): string | undefined {
  if (!el) return undefined;
  const value = el.getAttributeNS(NS.w, name);
  return value === null || value === '' ? undefined : value;
}

export function wNum(el: XmlElement | undefined, name: string): number | undefined {
  const raw = wAttr(el, name);
  if (raw === undefined) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

// «Переключатель» Word: <w:b/> = да, <w:b w:val="0"/> или "false" = нет.
export function wToggle(el: XmlElement | undefined, name: string): boolean | undefined {
  const node = wChild(el, name);
  if (!node) return undefined;
  const value = wAttr(node, 'val');
  return !(value === '0' || value === 'false' || value === 'off');
}

export function textOf(el: XmlElement | undefined): string {
  return el?.textContent ?? '';
}
