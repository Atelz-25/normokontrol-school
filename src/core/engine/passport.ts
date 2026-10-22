// «Паспорт документа» (бриф, раздел 8): статистика, а не правила. Оценку не меняет.
import type { DocModel, ParagraphRole, Zone } from '../model/types.ts';
import { round } from '../units.ts';

export interface DocumentPassport {
  words: number;
  chars: number; // знаки с пробелами
  charsNoSpaces: number;
  pagesBy1800: number; // объём в страницах: знаки с пробелами ÷ 1800
  approxPages?: number; // по отметкам Word, «примерно»
  paragraphs: number; // вне таблиц
  emptyParagraphs: number;
  sections: number;
  headings: number; // заголовки частей и подзаголовки
  figures: number;
  tables: number;
  sources: number;
}

// Абзац для предпросмотра: упрощённое отображение текста, не копия Word.
export interface PreviewParagraph {
  index: number;
  text: string;
  role: ParagraphRole;
  zone: Zone;
  isEmpty: boolean;
  inTable: boolean;
}

const HEADING_ROLES = new Set<ParagraphRole>(['part-heading', 'heading', 'sub-heading']);

export function documentPassport(doc: DocModel): DocumentPassport {
  const withText = doc.paragraphs.filter((p) => !p.isEmpty);
  const text = withText.map((p) => p.text).join(' ');
  const chars = withText.reduce((sum, p) => sum + p.text.length, 0);
  const outside = doc.paragraphs.filter((p) => !p.table);
  return {
    words: text.split(/\s+/).filter((word) => /[\p{L}\d]/u.test(word)).length,
    chars,
    charsNoSpaces: withText.reduce((sum, p) => sum + p.text.replace(/\s/g, '').length, 0),
    pagesBy1800: round(chars / 1800, 1),
    approxPages: doc.hasLastRenderedPageBreaks ? doc.paragraphs.at(-1)?.approxPage : undefined,
    paragraphs: outside.length,
    emptyParagraphs: outside.filter((p) => p.isEmpty).length,
    sections: doc.sections.length,
    headings: doc.paragraphs.filter((p) => HEADING_ROLES.has(p.role) && !p.text.trim().endsWith(':')).length,
    figures: doc.paragraphs.filter((p) => p.containsDrawing).length,
    tables: doc.tables.length,
    sources: doc.paragraphs.filter((p) => p.role === 'source-item').length,
  };
}

export function previewParagraphs(doc: DocModel): PreviewParagraph[] {
  return doc.paragraphs.map((p) => ({
    index: p.index,
    text: p.text,
    role: p.role,
    zone: p.zone,
    isEmpty: p.isEmpty,
    inTable: p.table !== undefined,
  }));
}
