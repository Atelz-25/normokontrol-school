// Классификатор: кто есть кто в документе (бриф 6.2, RULES-SCHOOL раздел 4).
//
// Правила «основного текста» должны проверять только основной текст, иначе на
// титульном листе или в таблице паспорта будут ложные срабатывания. Поэтому
// каждый абзац получает:
//   zone — где он лежит: титульный лист, вводная часть (паспорт, содержание) или текст;
//   role — что это: заголовок части, строка содержания, обычный абзац, пункт списка…
import type { DocModel, Paragraph, ParagraphRole, Zone } from '../model/types.ts';
import type { PartDefinition } from '../profiles/types.ts';

// Части по умолчанию для профилей без structure (типовые названия из брифа).
export const DEFAULT_PARTS: PartDefinition[] = [
  { id: 'toc', title: 'Содержание', aliases: ['Содержание', 'Оглавление'], optional: false },
  { id: 'intro', title: 'Введение', aliases: ['Введение'], optional: false },
  { id: 'conclusion', title: 'Заключение', aliases: ['Заключение', 'Выводы'], optional: false },
  {
    id: 'literature',
    title: 'Список литературы',
    aliases: [
      'Список литературы',
      'Список источников',
      'Список использованных источников',
      'Литература',
    ],
    optional: false,
  },
  { id: 'appendix', title: 'Приложения', aliases: ['Приложение', 'Приложения'], optional: true },
];

export interface StructureInput {
  parts?: PartDefinition[];
  passportFields?: string[];
}

export interface Classification {
  parts: PartDefinition[];
  // id части → номер абзаца с её заголовком (только найденные части).
  partHeadings: Map<string, number>;
  titlePageEnd: number; // последний абзац титульного листа, 0 — титульного листа нет
  bodyStart: number; // первый абзац основного текста
}

const normalize = (text: string): string =>
  text
    .replace(/\u00a0/g, ' ')
    .replace(/ё/gi, 'е')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

// Текст заголовка без номера «I.», «II.I.», «1.2.», табуляции, регистра и точки в конце.
// Строка содержания («Введение<tab>4») заголовком не считается.
export function headingKey(text: string): string | undefined {
  const trimmed = text.replace(/\u00a0/g, ' ').trim();
  if (trimmed.length === 0 || trimmed.length > 100) return undefined;
  if (/(\t|\.{3,}|…)\s*\d+\s*$/.test(trimmed)) return undefined;
  const withoutNumber = trimmed.replace(/^(?:(?:[IVXLC]+|\d+)\.)+(?:[IVXLC]+|\d+)?(?=[\s\t])/i, '');
  return normalize(withoutNumber).replace(/[.:]$/, '').trim();
}

const SUB_HEADING_NUMBERED = /^\d+(\.\d+)*\.?\s+\S/;
const CAPTION_FIGURE = /^(рисунок|рис\.)\s*\d/i;
const CAPTION_TABLE = /^таблица\s*\d/i;
const MONOSPACE = /courier|consolas|mono/i;

// Эвристика подзаголовка: «1. Литературный обзор» или короткая подпись вида «Задачи:».
// Порог 40 знаков для подписи подобран на образце (sample-v2), см. PLAN.md.
function looksLikeSubHeading(p: Paragraph): boolean {
  const text = p.text.trim();
  if (p.list?.visible) return false;
  if (SUB_HEADING_NUMBERED.test(text) && text.length <= 70 && !text.endsWith('.')) return true;
  return text.endsWith(':') && text.length <= 40 && !text.includes('\n');
}

// Эвристика заголовка из брифа: короткий, без точки, полужирный, ПРОПИСНЫЕ или по центру.
function looksLikeHeading(p: Paragraph): boolean {
  const text = p.text.trim();
  if (text.length > 70 || /[.:;,]$/.test(text)) return false;
  const letters = text.replace(/[^\p{L}]/gu, '');
  const upper = letters.length > 3 && letters === letters.toUpperCase();
  const bold = p.runs.length > 0 && p.runs.every((r) => r.bold || r.start === r.end);
  return upper || bold || p.format.align === 'center';
}

function findPartHeadings(doc: DocModel, parts: PartDefinition[]): Map<string, number> {
  const found = new Map<string, number>();
  const aliasToPart = new Map<string, string>();
  for (const part of parts) {
    for (const alias of part.aliases) aliasToPart.set(headingKey(alias) ?? '', part.id);
  }
  for (const p of doc.paragraphs) {
    if (p.isEmpty || p.table) continue;
    const key = headingKey(p.text);
    const partId = key === undefined ? undefined : aliasToPart.get(key);
    if (partId && !found.has(partId)) found.set(partId, p.index);
  }
  return found;
}

// Граница титульного листа: заголовок паспорта, если он есть в профиле;
// иначе первый разрыв страницы или раздела, либо заголовок «Содержание».
function findTitlePageEnd(doc: DocModel, partHeadings: Map<string, number>): number {
  const passport = partHeadings.get('passport');
  if (passport !== undefined) return passport - 1;

  const candidates: number[] = [];
  const toc = partHeadings.get('toc');
  if (toc !== undefined) candidates.push(toc - 1);
  for (const p of doc.paragraphs) {
    if (p.table) continue;
    if (p.pageBreakAtEnd || p.endsSection) {
      candidates.push(p.index);
      break;
    }
    // Абзац из одного разрыва (Ctrl+Enter на пустой строке) ещё относится к титульному листу.
    if (p.pageBreakAtStart && p.text.trim() === '') {
      candidates.push(p.index);
      break;
    }
    if ((p.pageBreakAtStart || p.format.pageBreakBefore) && p.index > 1) {
      candidates.push(p.index - 1);
      break;
    }
  }
  return candidates.length > 0 ? Math.min(...candidates) : 0;
}

function findBodyStart(
  parts: PartDefinition[],
  partHeadings: Map<string, number>,
  titleEnd: number,
): number {
  const intro = partHeadings.get('intro');
  if (intro !== undefined) return intro;
  const frontIds = new Set(['passport', 'toc']);
  const later = parts
    .filter((part) => !frontIds.has(part.id))
    .map((part) => partHeadings.get(part.id))
    .filter((index): index is number => index !== undefined);
  return later.length > 0 ? Math.min(...later) : titleEnd + 1;
}

// Абзацы между заголовком части и следующим заголовком любой части.
function partRange(
  partId: string,
  partHeadings: Map<string, number>,
  total: number,
): [number, number] | undefined {
  const start = partHeadings.get(partId);
  if (start === undefined) return undefined;
  const next = [...partHeadings.values()].filter((index) => index > start);
  return [start + 1, next.length > 0 ? Math.min(...next) - 1 : total];
}

function classifyTables(
  doc: DocModel,
  partHeadings: Map<string, number>,
  passportFields: string[],
): void {
  const passport = partHeadings.get('passport');
  const labels = passportFields.map(normalize);
  let assigned = false;
  for (const table of doc.tables) {
    const afterHeading = passport !== undefined && table.firstParagraph > passport && !assigned;
    const matches = table.firstColumnTexts.filter((text) =>
      labels.some((label) => label !== '' && normalize(text).startsWith(label)),
    ).length;
    if (afterHeading || matches >= 4) {
      table.role = 'passport-table';
      assigned = true;
    }
  }
}

export function classify(doc: DocModel, input: StructureInput = {}): Classification {
  const parts = input.parts && input.parts.length > 0 ? input.parts : DEFAULT_PARTS;
  const partHeadings = findPartHeadings(doc, parts);
  const titlePageEnd = findTitlePageEnd(doc, partHeadings);
  const bodyStart = Math.max(findBodyStart(parts, partHeadings, titlePageEnd), titlePageEnd + 1);
  classifyTables(doc, partHeadings, input.passportFields ?? []);

  const headingToPart = new Map([...partHeadings].map(([id, index]) => [index, id]));
  const total = doc.paragraphs.length;
  const inRange = (range: [number, number] | undefined, index: number): boolean =>
    range !== undefined && index >= range[0] && index <= range[1];
  const tocRange = partRange('toc', partHeadings, total);
  const literatureRange = partRange('literature', partHeadings, total);

  const zoneByPosition = (index: number): Zone =>
    index <= titlePageEnd ? 'title-page' : index < bodyStart ? 'front-matter' : 'body';

  // Пустой абзац относится к зоне предыдущего непустого (PLAN.md, 2.8).
  let lastZone: Zone | undefined;
  for (const p of doc.paragraphs) {
    p.zone = p.isEmpty && !p.table && lastZone !== undefined ? lastZone : zoneByPosition(p.index);
    if (!p.isEmpty && !p.table) lastZone = p.zone;
  }

  const roleOf = (p: Paragraph): { role: ParagraphRole; heuristic?: boolean; partId?: string } => {
    if (p.isEmpty) return { role: 'empty' };
    if (p.table) return { role: 'table-cell' };
    const partId = headingToPart.get(p.index);
    if (partId) return { role: 'part-heading', partId };
    if (p.zone === 'title-page') return { role: 'title-page' };
    if (inRange(tocRange, p.index) || p.fields.some((f) => f.type === 'TOC'))
      return { role: 'toc-entry' };
    if (inRange(literatureRange, p.index)) return { role: 'source-item' };
    if (/^heading \d$/i.test(p.styleName ?? '') || (p.format.outlineLevel ?? 9) < 9)
      return { role: 'heading' };
    const text = p.text.trim();
    if (
      CAPTION_FIGURE.test(text) ||
      p.fields.some((f) => f.type === 'SEQ' && /рисун/i.test(f.instruction))
    )
      return { role: 'caption-figure' };
    if (CAPTION_TABLE.test(text) || p.fields.some((f) => f.type === 'SEQ'))
      return { role: 'caption-table' };
    if (p.list?.visible) return { role: 'list-item' };
    // Абзац, в котором только рисунок, — не текст: красная строка и интервалы к нему не относятся.
    if (p.containsDrawing && p.text.trim() === '') return { role: 'other' };
    if (p.runs.length > 0 && p.runs.every((r) => MONOSPACE.test(r.font))) return { role: 'code' };
    if (p.zone !== 'body') return { role: 'other' };
    if (looksLikeSubHeading(p)) return { role: 'sub-heading', heuristic: true };
    if (looksLikeHeading(p)) return { role: 'heading', heuristic: true };
    return { role: 'body' };
  };

  for (const p of doc.paragraphs) {
    const { role, heuristic, partId } = roleOf(p);
    p.role = role;
    p.roleConfidence = heuristic ? 'heuristic' : 'sure';
    p.partId = partId;
  }

  // Подводка к списку: абзац на «:», за которым идёт пункт списка.
  const nonEmpty = doc.paragraphs.filter((p) => !p.isEmpty && !p.table);
  nonEmpty.forEach((p, i) => {
    p.isListLeadIn =
      p.role === 'body' && p.text.trim().endsWith(':') && nonEmpty[i + 1]?.role === 'list-item';
  });

  return { parts, partHeadings, titlePageEnd, bodyStart };
}

// Группы ролей для параметра appliesTo в профиле (PLAN.md, 2.6).
export const ROLE_GROUPS: Record<string, ParagraphRole[]> = {
  heading: ['part-heading', 'heading', 'sub-heading'],
  caption: ['caption-figure', 'caption-table'],
};

export function expandRoles(names: readonly string[]): Set<ParagraphRole> {
  const result = new Set<ParagraphRole>();
  for (const name of names) {
    for (const role of ROLE_GROUPS[name] ?? [name as ParagraphRole]) result.add(role);
  }
  return result;
}
