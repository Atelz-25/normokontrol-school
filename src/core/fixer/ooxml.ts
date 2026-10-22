// Аккуратная правка XML Word. Порядок дочерних элементов в w:pPr, w:rPr и w:sectPr задан
// схемой OOXML: если вставить свойство не на своё место, Word скажет «нечитаемое содержимое».
// Поэтому новое свойство вставляется перед первым соседом, который по схеме идёт позже.
import type { Element as XmlElement } from '@xmldom/xmldom';
import { NS, isElement } from '../xml.ts';

// Порядок по схеме ECMA-376 (часть 1, CT_PPr, CT_RPr, CT_SectPr) — только то, что нам нужно знать.
const ORDER: Record<string, string[]> = {
  pPr: [
    'pStyle',
    'keepNext',
    'keepLines',
    'pageBreakBefore',
    'framePr',
    'widowControl',
    'numPr',
    'suppressLineNumbers',
    'pBdr',
    'shd',
    'tabs',
    'suppressAutoHyphens',
    'kinsoku',
    'wordWrap',
    'overflowPunct',
    'topLinePunct',
    'autoSpaceDE',
    'autoSpaceDN',
    'bidi',
    'adjustRightInd',
    'snapToGrid',
    'spacing',
    'ind',
    'contextualSpacing',
    'mirrorIndents',
    'suppressOverlap',
    'jc',
    'textDirection',
    'textAlignment',
    'textboxTightWrap',
    'outlineLvl',
    'divId',
    'cnfStyle',
    'rPr',
    'sectPr',
    'pPrChange',
  ],
  rPr: [
    'rStyle',
    'rFonts',
    'b',
    'bCs',
    'i',
    'iCs',
    'caps',
    'smallCaps',
    'strike',
    'dstrike',
    'outline',
    'shadow',
    'emboss',
    'imprint',
    'noProof',
    'snapToGrid',
    'vanish',
    'webHidden',
    'color',
    'spacing',
    'w',
    'kern',
    'position',
    'sz',
    'szCs',
    'highlight',
    'u',
    'effect',
    'bdr',
    'shd',
    'fitText',
    'vertAlign',
    'rtl',
    'cs',
    'em',
    'lang',
    'eastAsianLayout',
    'specVanish',
    'oMath',
    'rPrChange',
  ],
  sectPr: [
    'headerReference',
    'footerReference',
    'footnotePr',
    'endnotePr',
    'type',
    'pgSz',
    'pgMar',
    'paperSrc',
    'pgBorders',
    'lnNumType',
    'pgNumType',
    'cols',
    'formProt',
    'vAlign',
    'noEndnote',
    'titlePg',
    'textDirection',
    'bidi',
    'rtlGutter',
    'docGrid',
    'printerSettings',
    'sectPrChange',
  ],
};

function ownerOf(el: XmlElement) {
  const doc = el.ownerDocument;
  if (!doc) throw new Error('элемент без документа');
  return doc;
}

export function wElements(parent: XmlElement, name?: string): XmlElement[] {
  const result: XmlElement[] = [];
  for (let node = parent.firstChild; node; node = node.nextSibling) {
    if (
      isElement(node) &&
      node.namespaceURI === NS.w &&
      (name === undefined || node.localName === name)
    )
      result.push(node);
  }
  return result;
}

// Найти дочерний w:name или создать его на правильном месте.
export function ensureChild(parent: XmlElement, name: string): XmlElement {
  const existing = wElements(parent, name)[0];
  if (existing) return existing;
  const created = ownerOf(parent).createElementNS(NS.w, `w:${name}`);
  const order = ORDER[parent.localName ?? ''] ?? [];
  const rank = order.indexOf(name);
  const later = wElements(parent).find((el) => order.indexOf(el.localName ?? '') > rank);
  parent.insertBefore(created, later ?? null);
  return created;
}

// w:pPr — всегда первый ребёнок w:p, w:rPr — первый ребёнок w:r.
export function ensureFirst(parent: XmlElement, name: 'pPr' | 'rPr'): XmlElement {
  const existing = wElements(parent, name)[0];
  if (existing) return existing;
  const created = ownerOf(parent).createElementNS(NS.w, `w:${name}`);
  parent.insertBefore(created, parent.firstChild);
  return created;
}

export function setAttr(el: XmlElement, name: string, value: string): void {
  el.setAttributeNS(NS.w, `w:${name}`, value);
}

export function removeAttr(el: XmlElement, name: string): void {
  el.removeAttributeNS(NS.w, name);
}
