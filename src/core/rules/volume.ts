// Объём: теоретическая часть (TH-01), доля пустых абзацев (VL-02), напоминание про PDF (OUT-01).
// Страницы считаем только через знаки (1 800 знаков с пробелами ≈ страница), а не по номерам:
// номеров страниц в .docx нет.
import { msg } from '../../i18n/rules-ru.ts';
import { round } from '../units.ts';
import { finding } from './helpers.ts';
import { num, str } from './params.ts';
import type { Rule } from './types.ts';

const theoryVolume: Rule = {
  id: 'TH-01',
  category: 'structure',
  stage: 2,
  autoFixable: false,
  defaultParams: { minChars: 5400, recommendedChars: 7200, charsPerPage: 1800, partId: 'theory' },
  check(ctx, params) {
    const partId = str(params, 'partId', 'theory');
    const { partHeadings } = ctx.classification;
    const start = partHeadings.get(partId);
    if (start === undefined) return { checked: 0, findings: [], unit: 'document' };
    // Часть заканчивается перед заголовком следующей части.
    const end = Math.min(
      ...[...partHeadings.values()].filter((i) => i > start),
      ctx.doc.paragraphs.length + 1,
    );
    // «Основательный текст» — абзацы с текстом; подзаголовки и списки входят.
    const paragraphs = ctx.doc.paragraphs.filter(
      (p) => p.index > start && p.index < end && !p.isEmpty,
    );
    const chars = paragraphs.reduce((sum, p) => sum + p.text.length, 0);
    const minChars = num(params, 'minChars', 5400);
    const recommended = num(params, 'recommendedChars', 7200);
    const perPage = num(params, 'charsPerPage', 1800);
    const heading = ctx.doc.paragraphs[start - 1];
    return {
      checked: 1,
      findings:
        chars < minChars
          ? [
              finding(
                ctx,
                false,
                msg.theoryShort(
                  chars,
                  round(chars / perPage, 2),
                  minChars - chars,
                  recommended - chars,
                ),
                { paragraph: heading },
                { ungrouped: true },
              ),
            ]
          : [],
      unit: 'document',
      metrics: {
        paragraphs: paragraphs.length,
        chars,
        pages: round(chars / perPage, 2),
        missingToMin: Math.max(0, minChars - chars),
        missingToRecommended: Math.max(0, recommended - chars),
      },
    };
  },
};

const emptyShare: Rule = {
  id: 'VL-02',
  category: 'document',
  stage: 2,
  autoFixable: false,
  defaultParams: { warnIfEmptyShareAbove: 0.1, charsPerPage: 1800 },
  check(ctx, params) {
    const outside = ctx.doc.paragraphs.filter((p) => !p.table);
    const empty = outside.filter((p) => p.isEmpty).length;
    const share = outside.length > 0 ? empty / outside.length : 0;
    // Знаки с пробелами во всех абзацах с текстом, включая таблицы.
    const textChars = ctx.doc.paragraphs
      .filter((p) => !p.isEmpty)
      .reduce((sum, p) => sum + p.text.length, 0);
    const pages = round(textChars / num(params, 'charsPerPage', 1800), 1);
    const threshold = num(params, 'warnIfEmptyShareAbove', 0.1);
    return {
      checked: 1,
      findings:
        share > threshold
          ? [finding(ctx, false, msg.emptyShare(Math.round(share * 100), pages), {})]
          : [],
      unit: 'document',
      metrics: { empty, of: outside.length, share: round(share, 3), textChars, pagesBy1800: pages },
    };
  },
};

// OUT-01 — не проверка файла, а напоминание в конце отчёта. Замечаний не даёт.
const pdfReminder: Rule = {
  id: 'OUT-01',
  category: 'document',
  stage: 2,
  autoFixable: false,
  defaultParams: { message: '' },
  check(_ctx, params) {
    return {
      checked: 1,
      findings: [],
      unit: 'document',
      metrics: { message: str(params, 'message', '') },
    };
  },
};

// VL-01. Общий объём: страницы считаем по знакам (1 800 на страницу). Пока школа не назвала
// норму (minPages = null), правило неприменимо.
const totalVolume: Rule = {
  id: 'VL-01',
  category: 'document',
  stage: 3,
  autoFixable: false,
  defaultParams: { minPages: null, charsPerPage: 1800 },
  check(ctx, params) {
    const minPages = typeof params.minPages === 'number' ? params.minPages : undefined;
    if (minPages === undefined) return { checked: 0, findings: [], unit: 'document' };
    const chars = ctx.doc.paragraphs
      .filter((p) => !p.isEmpty)
      .reduce((sum, p) => sum + p.text.length, 0);
    const pages = round(chars / num(params, 'charsPerPage', 1800), 1);
    return {
      checked: 1,
      findings: pages < minPages ? [finding(ctx, false, msg.volumeShort(pages, minPages), {})] : [],
      unit: 'document',
      metrics: { chars, pages },
    };
  },
};

export const volumeRules: Rule[] = [theoryVolume, emptyShare, pdfReminder, totalVolume];
