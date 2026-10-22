// Внутренняя модель документа (бриф, раздел 5). Правила работают только с ней
// и ничего не знают про XML.

export type Align = 'left' | 'center' | 'right' | 'both';

// Межстрочный интервал: множитель («1,5») или точное значение в пунктах.
export type LineSpacing =
  { rule: 'auto'; multiplier: number } | { rule: 'exact' | 'atLeast'; pt: number };

export interface ParagraphFormat {
  lineSpacing: LineSpacing;
  spaceBeforePt: number;
  spaceAfterPt: number;
  firstLineIndentCm: number; // отрицательное значение — выступ
  leftIndentCm: number;
  rightIndentCm: number;
  align: Align;
  keepNext: boolean;
  pageBreakBefore: boolean;
  outlineLevel?: number;
}

export interface Run {
  start: number; // смещения в тексте абзаца
  end: number;
  font: string;
  sizePt: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  caps: boolean;
  color: string; // 'auto' или RRGGBB
  highlight?: string;
  inHyperlink: boolean;
}

export interface FieldInfo {
  type: string; // PAGE, TOC, SEQ …
  instruction: string;
}

export interface ListInfo {
  numId: number;
  level: number;
  format: string; // decimal, bullet, none …
  visible: boolean; // false, если номер невидим (формат none или пустой текст номера)
}

// Зона документа: титульный лист, «вводная часть» (паспорт, содержание) и основной текст.
export type Zone = 'title-page' | 'front-matter' | 'body';

export type ParagraphRole =
  | 'title-page'
  | 'part-heading'
  | 'heading'
  | 'sub-heading'
  | 'toc-entry'
  | 'body'
  | 'list-item'
  | 'source-item'
  | 'caption-figure'
  | 'caption-table'
  | 'table-cell'
  | 'code'
  | 'empty'
  | 'other';

export interface Paragraph {
  index: number; // сквозной номер w:p в документе (включая ячейки таблиц), с 1
  sectionIndex: number; // с 1
  text: string; // \t — табуляция, \n — ручной перенос строки
  runs: Run[];
  format: ParagraphFormat;
  styleName?: string;
  list?: ListInfo;
  fields: FieldInfo[];
  containsDrawing: boolean;
  isEmpty: boolean;
  // Разрыв страницы <w:br w:type="page"/>: в начале абзаца (до текста) и в конце (после текста).
  pageBreakAtStart: boolean;
  pageBreakAtEnd: boolean;
  // Абзац заканчивает раздел (в его свойствах лежит w:sectPr).
  endsSection?: { type: string };
  lastRenderedPageBreaks: number;
  approxPage?: number;
  table?: { tableIndex: number; row: number; cell: number };
  // Заполняет классификатор (src/core/classify).
  zone: Zone;
  role: ParagraphRole;
  roleConfidence: 'sure' | 'heuristic';
  partId?: string; // для заголовка части: id из structure.partsInOrder
  isListLeadIn?: boolean;
}

export type TableRole = 'passport-table' | 'generic';

export interface Table {
  index: number;
  rows: number;
  firstParagraph: number;
  lastParagraph: number;
  firstColumnTexts: string[];
  cells: string[][]; // текст каждой ячейки, по строкам
  role: TableRole;
}

// Колонтитул: где номер страницы и как он выровнен (правила NM-*).
export interface HeaderFooter {
  part: string; // имя части в архиве, например word/footer1.xml
  paragraphs: { text: string; align: Align; fields: FieldInfo[] }[];
}

export type HeaderFooterKind = 'default' | 'first' | 'even';

export interface Section {
  index: number;
  pageWidthMm: number;
  pageHeightMm: number;
  orientation: 'portrait' | 'landscape';
  marginsMm: { top: number; right: number; bottom: number; left: number };
  type: string;
  lastParagraph: number; // последний абзац раздела
  // Ссылки на колонтитулы (имена частей). Раздел без своей ссылки наследует её у предыдущего.
  headers: Partial<Record<HeaderFooterKind, string>>;
  footers: Partial<Record<HeaderFooterKind, string>>;
  titlePage: boolean; // «Особый колонтитул для первой страницы»
  pageNumberStart?: number; // нумерация начата заново с этого числа
}

export interface DocModel {
  paragraphs: Paragraph[];
  tables: Table[];
  sections: Section[];
  revisions: number; // w:ins, w:del и подобные
  comments: number;
  hasLastRenderedPageBreaks: boolean;
  properties: { title?: string; creator?: string };
  headerFooters: Record<string, HeaderFooter>;
}
