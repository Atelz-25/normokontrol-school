// «Эффективное» форматирование (бриф, раздел 6.1.1).
//
// Word хранит свойство там, где его задали: прямо в абзаце, в стиле, в стиле,
// на котором основан стиль (basedOn), или в docDefaults. Чтобы узнать настоящее
// значение, складываем «слои» снизу вверх: каждый следующий слой перекрывает
// только те свойства, которые в нём заданы.
//   абзац: docDefaults → нумерация → стили абзаца (от базового к своему) → прямое
//   символ: docDefaults → стили абзаца → стили символа → прямое
import type { Align, LineSpacing, ParagraphFormat } from '../model/types.ts';
import { halfPointsToPt, lineAutoToMultiplier, ptToCm, twipsToCm, twipsToPt } from '../units.ts';
import { NS, child, wAttr, wChild, wChildren, wNum, wToggle, type XmlElement } from '../xml.ts';

export interface PPr {
  line?: number;
  lineRule?: string;
  before?: number;
  after?: number;
  left?: number;
  right?: number;
  firstLine?: number; // twips; выступ (hanging) храним как отрицательное число
  firstLineChars?: number; // сотые доли символа
  jc?: string;
  keepNext?: boolean;
  pageBreakBefore?: boolean;
  outlineLvl?: number;
  numId?: number;
  ilvl?: number;
}

export interface RPr {
  ascii?: string;
  hAnsi?: string;
  sz?: number; // полупункты
  b?: boolean;
  i?: boolean;
  u?: boolean;
  caps?: boolean;
  color?: string;
  highlight?: string;
}

interface Style {
  type: string;
  name?: string;
  basedOn?: string;
  pPr: PPr;
  rPr: RPr;
}

export interface ThemeFonts {
  major?: string;
  minor?: string;
}

export interface StyleSheet {
  styles: Map<string, Style>;
  defaultParagraphStyle?: string;
  defaultPPr: PPr;
  defaultRPr: RPr;
  theme: ThemeFonts;
}

// Убираем undefined, чтобы при слиянии они не затирали значения нижнего слоя.
function defined<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as Partial<T>;
}

export function readPPr(pPr: XmlElement | undefined): PPr {
  if (!pPr) return {};
  const spacing = wChild(pPr, 'spacing');
  const ind = wChild(pPr, 'ind');
  const numPr = wChild(pPr, 'numPr');
  const hanging = wNum(ind, 'hanging');
  const hangingChars = wNum(ind, 'hangingChars');
  return defined({
    line: wNum(spacing, 'line'),
    lineRule: wAttr(spacing, 'lineRule'),
    before: wNum(spacing, 'before'),
    after: wNum(spacing, 'after'),
    left: wNum(ind, 'left') ?? wNum(ind, 'start'),
    right: wNum(ind, 'right') ?? wNum(ind, 'end'),
    firstLine: hanging !== undefined ? -hanging : wNum(ind, 'firstLine'),
    firstLineChars: hangingChars !== undefined ? -hangingChars : wNum(ind, 'firstLineChars'),
    jc: wAttr(wChild(pPr, 'jc'), 'val'),
    keepNext: wToggle(pPr, 'keepNext'),
    pageBreakBefore: wToggle(pPr, 'pageBreakBefore'),
    outlineLvl: wNum(wChild(pPr, 'outlineLvl'), 'val'),
    numId: wNum(wChild(numPr, 'numId'), 'val'),
    ilvl: wNum(wChild(numPr, 'ilvl'), 'val'),
  });
}

function themeFont(theme: ThemeFonts, ref: string | undefined): string | undefined {
  if (!ref) return undefined;
  return ref.startsWith('major') ? theme.major : ref.startsWith('minor') ? theme.minor : undefined;
}

export function readRPr(rPr: XmlElement | undefined, theme: ThemeFonts): RPr {
  if (!rPr) return {};
  const fonts = wChild(rPr, 'rFonts');
  const underline = wAttr(wChild(rPr, 'u'), 'val');
  return defined({
    // Ссылка на тему (asciiTheme) главнее явного имени шрифта на том же уровне.
    ascii: themeFont(theme, wAttr(fonts, 'asciiTheme')) ?? wAttr(fonts, 'ascii'),
    hAnsi: themeFont(theme, wAttr(fonts, 'hAnsiTheme')) ?? wAttr(fonts, 'hAnsi'),
    sz: wNum(wChild(rPr, 'sz'), 'val'),
    b: wToggle(rPr, 'b'),
    i: wToggle(rPr, 'i'),
    u: wChild(rPr, 'u') ? underline !== 'none' : undefined,
    caps: wToggle(rPr, 'caps'),
    color: wAttr(wChild(rPr, 'color'), 'val'),
    highlight: wAttr(wChild(rPr, 'highlight'), 'val'),
  });
}

export function mergePPr(base: PPr, over: PPr): PPr {
  const merged = { ...base, ...over };
  // Отступ первой строки «в символах» главнее отступа в twips, если задан в том же слое.
  if (over.firstLine !== undefined && over.firstLineChars === undefined)
    delete merged.firstLineChars;
  return merged;
}

export function readTheme(
  xml: string | undefined,
  parse: (text: string) => XmlElement,
): ThemeFonts {
  if (!xml) return {};
  const root = parse(xml);
  const latin = (kind: string): string | undefined => {
    const font = root.getElementsByTagNameNS(NS.a, kind).item(0) ?? undefined;
    const typeface = child(font, NS.a, 'latin')?.getAttribute('typeface');
    return typeface ?? undefined;
  };
  return { major: latin('majorFont'), minor: latin('minorFont') };
}

export function readStyleSheet(root: XmlElement | undefined, theme: ThemeFonts): StyleSheet {
  const sheet: StyleSheet = { styles: new Map(), defaultPPr: {}, defaultRPr: {}, theme };
  if (!root) return sheet;

  const defaults = wChild(root, 'docDefaults');
  sheet.defaultPPr = readPPr(wChild(wChild(defaults, 'pPrDefault'), 'pPr'));
  sheet.defaultRPr = readRPr(wChild(wChild(defaults, 'rPrDefault'), 'rPr'), theme);

  for (const el of wChildren(root, 'style')) {
    const id = wAttr(el, 'styleId');
    if (!id) continue;
    const type = wAttr(el, 'type') ?? 'paragraph';
    sheet.styles.set(id, {
      type,
      name: wAttr(wChild(el, 'name'), 'val'),
      basedOn: wAttr(wChild(el, 'basedOn'), 'val'),
      pPr: readPPr(wChild(el, 'pPr')),
      rPr: readRPr(wChild(el, 'rPr'), theme),
    });
    if (type === 'paragraph' && wAttr(el, 'default') === '1') sheet.defaultParagraphStyle = id;
  }
  return sheet;
}

// Цепочка стилей от самого базового к самому стилю. Защита от циклов basedOn.
export function styleChain(sheet: StyleSheet, styleId: string | undefined): Style[] {
  const chain: Style[] = [];
  const seen = new Set<string>();
  let id = styleId;
  while (id && !seen.has(id) && chain.length < 20) {
    seen.add(id);
    const style = sheet.styles.get(id);
    if (!style) break;
    chain.unshift(style);
    id = style.basedOn;
  }
  return chain;
}

export function styleName(sheet: StyleSheet, styleId: string | undefined): string | undefined {
  return styleId ? sheet.styles.get(styleId)?.name : undefined;
}

// Значения Word «по умолчанию», если свойство не задано нигде.
const WORD_DEFAULT_FONT = 'Times New Roman';
const WORD_DEFAULT_SIZE = 20; // 10 pt

function toAlign(jc: string | undefined): Align {
  switch (jc) {
    case 'both':
    case 'distribute':
      return 'both';
    case 'center':
      return 'center';
    case 'right':
    case 'end':
      return 'right';
    default:
      return 'left';
  }
}

export function toParagraphFormat(p: PPr, fontSizePt: number): ParagraphFormat {
  const line = p.line ?? 240;
  const rule = p.lineRule ?? 'auto';
  const lineSpacing: LineSpacing =
    rule === 'auto'
      ? { rule: 'auto', multiplier: lineAutoToMultiplier(line) }
      : { rule: rule === 'exact' ? 'exact' : 'atLeast', pt: twipsToPt(line) };
  // firstLineChars: сотые доли «символа», а символ — это размер шрифта абзаца.
  const firstLineCm =
    p.firstLineChars !== undefined && p.firstLineChars !== 0
      ? ptToCm((p.firstLineChars / 100) * fontSizePt)
      : twipsToCm(p.firstLine ?? 0);
  return {
    lineSpacing,
    spaceBeforePt: twipsToPt(p.before ?? 0),
    spaceAfterPt: twipsToPt(p.after ?? 0),
    firstLineIndentCm: firstLineCm,
    leftIndentCm: twipsToCm(p.left ?? 0),
    rightIndentCm: twipsToCm(p.right ?? 0),
    align: toAlign(p.jc),
    keepNext: p.keepNext ?? false,
    pageBreakBefore: p.pageBreakBefore ?? false,
    outlineLevel: p.outlineLvl,
  };
}

export interface EffectiveRun {
  font: string;
  sizePt: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  caps: boolean;
  color: string;
  highlight?: string;
}

// Для кириллицы Word берёт шрифт hAnsi, для латиницы и цифр — ascii.
export function toEffectiveRun(r: RPr, text: string): EffectiveRun {
  // Есть ли символ вне видимой латиницы (пробел…тильда), табуляции и переноса.
  const hasNonAscii = /[^ -~\t\n]/.test(text);
  const font = (hasNonAscii ? (r.hAnsi ?? r.ascii) : (r.ascii ?? r.hAnsi)) ?? WORD_DEFAULT_FONT;
  return {
    font,
    sizePt: halfPointsToPt(r.sz ?? WORD_DEFAULT_SIZE),
    bold: r.b ?? false,
    italic: r.i ?? false,
    underline: r.u ?? false,
    caps: r.caps ?? false,
    color: r.color ?? 'auto',
    highlight: r.highlight === 'none' ? undefined : r.highlight,
  };
}
