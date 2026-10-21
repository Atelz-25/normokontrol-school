// Обход word/document.xml и построение модели DocModel.
//
// Главные ловушки (бриф, раздел 6.1):
//   - текст абзаца разбит на много w:r, собираем его целиком и запоминаем смещения;
//   - текст бывает внутри w:hyperlink, w:fldSimple, w:ins, w:sdt, w:smartTag;
//   - удалённый текст (w:del) — это правка, его в абзаце уже нет;
//   - mc:AlternateContent дублирует содержимое: берём только один вариант;
//   - сложное поле (fldChar begin/separate/end) может тянуться через несколько абзацев.
import type { DocModel, FieldInfo, Paragraph, Run, Section, Table } from '../model/types.ts';
import {
  mergePPr,
  readPPr,
  readRPr,
  styleChain,
  styleName,
  toEffectiveRun,
  toParagraphFormat,
  type PPr,
  type RPr,
  type StyleSheet,
} from '../styles/resolve.ts';
import { halfPointsToPt, round, twipsToMm } from '../units.ts';
import { NS, children, isElement, wAttr, wChild, wNum, type XmlElement } from '../xml.ts';
import type { NumberingLookup } from './numbering.ts';

interface OpenField {
  type: string;
  instruction: string;
  ownerParagraph: number;
  inResult: boolean;
}

interface WalkState {
  sheet: StyleSheet;
  numbering: NumberingLookup;
  paragraphs: Paragraph[];
  tables: Table[];
  sections: Section[];
  openFields: OpenField[];
  renderedBreaks: number;
}

interface TableContext {
  tableIndex: number;
  row: number;
  cell: number;
}

// Абзац пустой, если в нём нет ничего, кроме пробелов, неразрывных пробелов и табуляций
// (RULES-SCHOOL, PR-10), а также нет рисунка, поля, разрыва страницы и конца раздела.
export const BLANK_CHARS = /[ \u00a0\t]/g;
export const isBlankText = (text: string): boolean => text.replace(BLANK_CHARS, '') === '';

function fieldType(instruction: string): string {
  return instruction.trim().split(/\s+/)[0]?.toUpperCase() ?? '';
}

// Собирает текст и прогоны одного абзаца.
class ParagraphBuilder {
  text = '';
  runs: Run[] = [];
  fields: FieldInfo[] = [];
  containsDrawing = false;
  pageBreakAtStart = false;
  pageBreakAtEnd = false;
  renderedBreaks = 0;
  renderedBreakAtStart = false;
  private readonly state: WalkState;
  private readonly index: number;
  private readonly paragraphRPr: RPr;

  constructor(state: WalkState, index: number, paragraphRPr: RPr) {
    this.state = state;
    this.index = index;
    this.paragraphRPr = paragraphRPr;
  }

  private append(piece: string, rPr: RPr, inHyperlink: boolean): void {
    if (piece === '') return;
    // Текст после разрыва страницы значит, что разрыв был не в конце абзаца.
    if (/\S/.test(piece)) this.pageBreakAtEnd = false;
    const start = this.text.length;
    this.text += piece;
    const effective = toEffectiveRun(rPr, piece);
    const inField = this.state.openFields.some((f) => f.inResult && f.type === 'HYPERLINK');
    this.runs.push({
      start,
      end: this.text.length,
      ...effective,
      inHyperlink: inHyperlink || inField,
    });
  }

  private runRPr(run: XmlElement): RPr {
    const rPrEl = wChild(run, 'rPr');
    const charStyle = wAttr(wChild(rPrEl, 'rStyle'), 'val');
    let merged: RPr = this.paragraphRPr;
    for (const style of styleChain(this.state.sheet, charStyle))
      merged = { ...merged, ...style.rPr };
    return { ...merged, ...readRPr(rPrEl, this.state.sheet.theme) };
  }

  private fieldChar(el: XmlElement): void {
    const kind = wAttr(el, 'fldCharType');
    const fields = this.state.openFields;
    if (kind === 'begin') {
      fields.push({ type: '', instruction: '', ownerParagraph: this.index, inResult: false });
    } else if (kind === 'separate') {
      const field = fields.at(-1);
      if (field) field.inResult = true;
    } else if (kind === 'end') {
      fields.pop();
    }
  }

  private finishInstruction(): void {
    const field = this.state.openFields.at(-1);
    if (!field || field.type !== '') return;
    field.type = fieldType(field.instruction);
    if (field.ownerParagraph === this.index)
      this.fields.push({ type: field.type, instruction: field.instruction.trim() });
  }

  run(run: XmlElement, inHyperlink: boolean): void {
    const rPr = this.runRPr(run);
    for (let node = run.firstChild; node; node = node.nextSibling) {
      if (!isElement(node)) continue;
      if (node.namespaceURI === NS.mc && node.localName === 'AlternateContent') {
        // Внутри обычно рисунок в двух вариантах; нам важен только факт рисунка.
        this.containsDrawing = true;
        continue;
      }
      if (node.namespaceURI !== NS.w) continue;
      switch (node.localName) {
        case 't':
          this.append(node.textContent ?? '', rPr, inHyperlink);
          break;
        case 'tab':
          this.append('\t', rPr, inHyperlink);
          break;
        case 'br':
        case 'cr':
          if (wAttr(node, 'type') === 'page') {
            if (isBlankText(this.text)) this.pageBreakAtStart = true;
            else this.pageBreakAtEnd = true;
          } else if (wAttr(node, 'type') !== 'column') {
            this.append('\n', rPr, inHyperlink);
          }
          break;
        case 'noBreakHyphen':
          this.append('\u2011', rPr, inHyperlink);
          break;
        case 'softHyphen':
          this.append('\u00ad', rPr, inHyperlink);
          break;
        case 'sym':
          this.append('\ufffd', rPr, inHyperlink);
          break;
        case 'lastRenderedPageBreak':
          this.renderedBreaks += 1;
          if (isBlankText(this.text)) this.renderedBreakAtStart = true;
          break;
        case 'drawing':
        case 'pict':
        case 'object':
          this.containsDrawing = true;
          break;
        case 'fldChar':
          if (wAttr(node, 'fldCharType') !== 'begin') this.finishInstruction();
          this.fieldChar(node);
          break;
        case 'instrText': {
          const field = this.state.openFields.at(-1);
          if (field && !field.inResult) field.instruction += node.textContent ?? '';
          break;
        }
        default:
          break; // delText, footnoteReference, rPr и прочее не дают видимого текста
      }
    }
  }

  // Содержимое абзаца: прогоны и «обёртки» вокруг них.
  inline(container: XmlElement, inHyperlink = false): void {
    for (const el of children(container)) {
      if (el.namespaceURI === NS.mc && el.localName === 'AlternateContent') {
        const choice = children(el, NS.mc, 'Choice')[0] ?? children(el, NS.mc, 'Fallback')[0];
        if (choice) this.inline(choice, inHyperlink);
        continue;
      }
      if (el.namespaceURI !== NS.w) continue;
      switch (el.localName) {
        case 'r':
          this.run(el, inHyperlink);
          break;
        case 'hyperlink':
          this.inline(el, true);
          break;
        case 'fldSimple': {
          const instruction = wAttr(el, 'instr') ?? '';
          this.fields.push({ type: fieldType(instruction), instruction: instruction.trim() });
          this.inline(el, inHyperlink || fieldType(instruction) === 'HYPERLINK');
          break;
        }
        case 'sdt':
          this.inline(wChild(el, 'sdtContent') ?? el, inHyperlink);
          break;
        case 'ins':
        case 'moveTo':
        case 'smartTag':
        case 'customXml':
        case 'dir':
        case 'bdo':
          this.inline(el, inHyperlink);
          break;
        default:
          break; // del, moveFrom (удалённый текст), закладки, комментарии
      }
    }
  }
}

function readSection(
  sectPr: XmlElement | undefined,
  index: number,
  lastParagraph: number,
): Section {
  const size = wChild(sectPr, 'pgSz');
  const margins = wChild(sectPr, 'pgMar');
  const width = wNum(size, 'w') ?? 11906;
  const height = wNum(size, 'h') ?? 16838;
  const mm = (name: string): number => round(twipsToMm(Math.abs(wNum(margins, name) ?? 0)), 1);
  return {
    index,
    pageWidthMm: round(twipsToMm(width), 1),
    pageHeightMm: round(twipsToMm(height), 1),
    orientation: wAttr(size, 'orient') === 'landscape' || width > height ? 'landscape' : 'portrait',
    marginsMm: { top: mm('top'), right: mm('right'), bottom: mm('bottom'), left: mm('left') },
    // Если тип раздела не указан, Word считает его «со следующей страницы».
    type: wAttr(wChild(sectPr, 'type'), 'val') ?? 'nextPage',
    lastParagraph,
  };
}

function paragraph(state: WalkState, el: XmlElement, table?: TableContext): void {
  const { sheet, numbering } = state;
  const index = state.paragraphs.length + 1;
  const pPrEl = wChild(el, 'pPr');
  const direct = readPPr(pPrEl);
  const styleId = wAttr(wChild(pPrEl, 'pStyle'), 'val') ?? sheet.defaultParagraphStyle;
  const chain = styleChain(sheet, styleId);

  let stylePPr: PPr = {};
  let styleRPr: RPr = {};
  for (const style of chain) {
    stylePPr = mergePPr(stylePPr, style.pPr);
    styleRPr = { ...styleRPr, ...style.rPr };
  }

  // Нумерация может прийти из стиля или прямо из абзаца. numId = 0 значит «без списка».
  const numId = direct.numId ?? stylePPr.numId;
  const ilvl = direct.ilvl ?? stylePPr.ilvl ?? 0;
  const level = numId ? numbering(numId, ilvl) : undefined;

  let pPr = mergePPr(sheet.defaultPPr, level?.pPr ?? {});
  pPr = mergePPr(mergePPr(pPr, stylePPr), direct);
  const paragraphRPr: RPr = { ...sheet.defaultRPr, ...styleRPr };

  const builder = new ParagraphBuilder(state, index, paragraphRPr);
  builder.inline(el);

  const sectPr = wChild(pPrEl, 'sectPr');
  const sectionIndex = state.sections.length + 1;
  if (sectPr) state.sections.push(readSection(sectPr, sectionIndex, index));

  const fontSizePt = halfPointsToPt(paragraphRPr.sz ?? 20);
  const pageStart = 1 + state.renderedBreaks + (builder.renderedBreakAtStart ? 1 : 0);
  state.renderedBreaks += builder.renderedBreaks;

  const text = builder.text;
  const isEmpty =
    isBlankText(text) &&
    !builder.containsDrawing &&
    builder.fields.length === 0 &&
    !builder.pageBreakAtStart &&
    !builder.pageBreakAtEnd &&
    !sectPr;

  state.paragraphs.push({
    index,
    sectionIndex,
    text,
    runs: builder.runs,
    format: toParagraphFormat(pPr, fontSizePt),
    styleName: styleName(sheet, styleId),
    list:
      numId && level
        ? {
            numId,
            level: ilvl,
            format: level.format,
            visible: level.format !== 'none' && level.text !== '',
          }
        : undefined,
    fields: builder.fields,
    containsDrawing: builder.containsDrawing,
    isEmpty,
    pageBreakAtStart: builder.pageBreakAtStart,
    pageBreakAtEnd: builder.pageBreakAtEnd,
    endsSection: sectPr ? { type: wAttr(wChild(sectPr, 'type'), 'val') ?? 'nextPage' } : undefined,
    lastRenderedPageBreaks: builder.renderedBreaks,
    approxPage: pageStart,
    table,
    // Заполнит классификатор.
    zone: 'body',
    role: isEmpty ? 'empty' : 'other',
    roleConfidence: 'sure',
  });
}

function tableElement(state: WalkState, el: XmlElement): void {
  const tableIndex = state.tables.length + 1;
  const record: Table = {
    index: tableIndex,
    rows: 0,
    firstParagraph: state.paragraphs.length + 1,
    lastParagraph: state.paragraphs.length,
    firstColumnTexts: [],
    role: 'generic',
  };
  state.tables.push(record);

  children(el, NS.w, 'tr').forEach((tr, row) => {
    record.rows += 1;
    children(tr, NS.w, 'tc').forEach((tc, cell) => {
      const before = state.paragraphs.length;
      block(state, tc, { tableIndex, row, cell });
      if (cell === 0) {
        const texts = state.paragraphs.slice(before).map((p) => p.text.trim());
        record.firstColumnTexts.push(texts.filter(Boolean).join(' '));
      }
    });
  });
  record.lastParagraph = state.paragraphs.length;
}

// Блочный уровень: абзацы, таблицы и обёртки вокруг них.
function block(state: WalkState, container: XmlElement, table?: TableContext): void {
  for (const el of children(container)) {
    if (el.namespaceURI === NS.mc && el.localName === 'AlternateContent') {
      const choice = children(el, NS.mc, 'Choice')[0] ?? children(el, NS.mc, 'Fallback')[0];
      if (choice) block(state, choice, table);
      continue;
    }
    if (el.namespaceURI !== NS.w) continue;
    switch (el.localName) {
      case 'p':
        paragraph(state, el, table);
        break;
      case 'tbl':
        tableElement(state, el);
        break;
      case 'sdt':
        block(state, wChild(el, 'sdtContent') ?? el, table);
        break;
      case 'customXml':
      case 'ins':
      case 'moveTo':
        block(state, el, table);
        break;
      default:
        break;
    }
  }
}

const REVISION_TAGS = [
  'ins',
  'del',
  'moveFrom',
  'moveTo',
  'rPrChange',
  'pPrChange',
  'sectPrChange',
];

export function buildModel(
  documentRoot: XmlElement,
  sheet: StyleSheet,
  numbering: NumberingLookup,
  extra: { comments: number; title?: string; creator?: string },
): DocModel {
  const body = wChild(documentRoot, 'body');
  const state: WalkState = {
    sheet,
    numbering,
    paragraphs: [],
    tables: [],
    sections: [],
    openFields: [],
    renderedBreaks: 0,
  };
  if (body) block(state, body);

  // Последний раздел описан в конце body, а не в абзаце.
  state.sections.push(
    readSection(wChild(body, 'sectPr'), state.sections.length + 1, state.paragraphs.length),
  );

  let revisions = 0;
  for (const tag of REVISION_TAGS)
    revisions += documentRoot.getElementsByTagNameNS(NS.w, tag).length;
  const commentRefs = documentRoot.getElementsByTagNameNS(NS.w, 'commentReference').length;

  return {
    paragraphs: state.paragraphs,
    tables: state.tables,
    sections: state.sections,
    revisions,
    comments: Math.max(extra.comments, commentRefs),
    hasLastRenderedPageBreaks: state.renderedBreaks > 0,
    properties: { title: extra.title, creator: extra.creator },
  };
}
