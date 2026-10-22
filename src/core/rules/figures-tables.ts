// Рисунки и таблицы: подписи, нумерация, ссылки в тексте, размещение (FG-01…05, TB-01…04).
// Таблица паспорта проекта — не обычная таблица: правила TB-* её не трогают (RULES-SCHOOL).
import { msg } from '../../i18n/rules-ru.ts';
import type { Paragraph, Table } from '../model/types.ts';
import { finding } from './helpers.ts';
import { num, strings } from './params.ts';
import type { CheckContext, Finding, Rule, RuleOutcome } from './types.ts';

const none: RuleOutcome = { checked: 0, findings: [], unit: 'paragraphs' };

// «Рисунок 2 – Схема»: номер и правильное тире с пробелами.
const FIGURE_CAPTION = /^(?:Рисунок|Рис\.)\s*(\d+)/i;
const FIGURE_CAPTION_FORMAT = /^Рисунок\s+\d+\s+–\s+\S/;
const TABLE_CAPTION = /^Таблица\s*(\d+)/i;
const TABLE_CAPTION_FORMAT = /^Таблица\s+\d+\s+–\s+\S/;

const figures = (ctx: CheckContext): Paragraph[] =>
  ctx.doc.paragraphs.filter((p) => p.containsDrawing && !p.table && p.zone === 'body');

const captions = (ctx: CheckContext, pattern: RegExp): Paragraph[] =>
  ctx.doc.paragraphs.filter((p) => !p.isEmpty && !p.table && pattern.test(p.text.trim()));

// Ближайший абзац с текстом после (step = 1) или перед (step = −1) данным.
function neighbour(ctx: CheckContext, index: number, step: 1 | -1): Paragraph | undefined {
  for (let i = index - 1 + step; i >= 0 && i < ctx.doc.paragraphs.length; i += step) {
    const p = ctx.doc.paragraphs[i];
    if (p && !p.isEmpty) return p;
  }
  return undefined;
}

// Номера 1, 2, 3… без пропусков и повторов.
function numberingProblems(
  ctx: CheckContext,
  list: Paragraph[],
  pattern: RegExp,
  kind: 'рисунка' | 'таблицы',
): Finding[] {
  const findings: Finding[] = [];
  let expected = 1;
  for (const p of list) {
    const n = Number(pattern.exec(p.text.trim())?.[1]);
    if (n !== expected)
      findings.push(finding(ctx, false, msg.captionNumber(kind, n, expected), { paragraph: p }));
    expected = n + 1;
  }
  return findings;
}

// Упоминания «рисунок 2», «рис. 2», «таблица 3», «табл. 3» в тексте (не в самих подписях).
function mentioned(ctx: CheckContext, word: RegExp): Set<number> {
  const result = new Set<number>();
  for (const p of ctx.doc.paragraphs) {
    if (
      p.isEmpty ||
      p.role === 'caption-figure' ||
      p.role === 'caption-table' ||
      FIGURE_CAPTION.test(p.text.trim()) ||
      TABLE_CAPTION.test(p.text.trim())
    )
      continue;
    for (const m of p.text.matchAll(word)) result.add(Number(m[1]));
  }
  return result;
}

const textWidthMm = (ctx: CheckContext, sectionIndex: number): number => {
  const s = ctx.doc.sections[sectionIndex - 1] ?? ctx.doc.sections[0];
  return s ? s.pageWidthMm - s.marginsMm.left - s.marginsMm.right : 165;
};

const figureCaptioned: Rule = {
  id: 'FG-01',
  category: 'structure',
  stage: 3,
  autoFixable: false,
  defaultParams: {},
  check(ctx) {
    const list = figures(ctx);
    if (list.length === 0) return none;
    const findings = list
      .filter((p) => {
        const after = neighbour(ctx, p.index, 1);
        return !(
          FIGURE_CAPTION.test(p.text.trim()) ||
          (after && FIGURE_CAPTION.test(after.text.trim()))
        );
      })
      .map((p) => finding(ctx, false, msg.figureNoCaption(), { paragraph: p }));
    return { checked: list.length, findings, unit: 'paragraphs' };
  },
};

const figureCaptionFormat: Rule = {
  id: 'FG-02',
  category: 'structure',
  stage: 3,
  autoFixable: false,
  defaultParams: {},
  check(ctx) {
    const list = captions(ctx, FIGURE_CAPTION);
    if (list.length === 0) return none;
    const findings: Finding[] = [];
    for (const p of list) {
      const problems: string[] = [];
      if (!FIGURE_CAPTION_FORMAT.test(p.text.trim())) problems.push('нужно «Рисунок N – Название»');
      if (p.format.align !== 'center') problems.push('подпись по центру');
      const before = neighbour(ctx, p.index, -1);
      if (!before?.containsDrawing && !p.containsDrawing) problems.push('подпись под рисунком');
      if (problems.length > 0)
        findings.push(finding(ctx, false, msg.captionFormat(problems), { paragraph: p }));
    }
    return { checked: list.length, findings, unit: 'paragraphs' };
  },
};

const figureNumbers: Rule = {
  id: 'FG-03',
  category: 'structure',
  stage: 3,
  autoFixable: false,
  defaultParams: {},
  check(ctx) {
    const list = captions(ctx, FIGURE_CAPTION);
    if (list.length === 0) return none;
    return {
      checked: list.length,
      findings: numberingProblems(ctx, list, FIGURE_CAPTION, 'рисунка'),
      unit: 'paragraphs',
    };
  },
};

const figureReferenced: Rule = {
  id: 'FG-04',
  category: 'structure',
  stage: 3,
  autoFixable: false,
  defaultParams: {},
  check(ctx) {
    const list = captions(ctx, FIGURE_CAPTION);
    if (list.length === 0) return none;
    const refs = mentioned(ctx, /рис(?:унок|унке|унка|унком|унки|\.)?\s*(\d+)/giu);
    const findings = list
      .filter((p) => !refs.has(Number(FIGURE_CAPTION.exec(p.text.trim())?.[1])))
      .map((p) => finding(ctx, false, msg.notReferenced('рисунок'), { paragraph: p }));
    return { checked: list.length, findings, unit: 'paragraphs' };
  },
};

const figurePlacement: Rule = {
  id: 'FG-05',
  category: 'structure',
  stage: 3,
  autoFixable: false,
  defaultParams: {},
  check(ctx) {
    const list = figures(ctx);
    if (list.length === 0) return none;
    const findings: Finding[] = [];
    for (const p of list) {
      const problems: string[] = [];
      if (p.format.align !== 'center') problems.push('рисунок по центру');
      if (p.drawings.some((d) => d.anchored)) problems.push('положение «В тексте», без обтекания');
      const width = Math.max(0, ...p.drawings.map((d) => d.widthMm ?? 0));
      if (width > textWidthMm(ctx, p.sectionIndex) + 1)
        problems.push('рисунок шире текста и выходит за поля');
      if (problems.length > 0)
        findings.push(finding(ctx, false, msg.figurePlacement(problems), { paragraph: p }));
    }
    return { checked: list.length, findings, unit: 'paragraphs' };
  },
};

// Обычные таблицы: всё, кроме ролей из excludeRoles (по умолчанию — таблица паспорта).
const tables = (ctx: CheckContext, params: Record<string, unknown>): Table[] => {
  const excluded = new Set(strings(params, 'excludeRoles', ['passport-table']));
  return ctx.doc.tables.filter((t) => !excluded.has(t.role));
};

const tableCaption = (ctx: CheckContext, table: Table): Paragraph | undefined =>
  neighbour(ctx, table.firstParagraph, -1);

const tableCaptioned: Rule = {
  id: 'TB-01',
  category: 'structure',
  stage: 3,
  autoFixable: false,
  defaultParams: { excludeRoles: ['passport-table'] },
  check(ctx, params) {
    const list = tables(ctx, params);
    if (list.length === 0) return { ...none, unit: 'occurrences' };
    const findings: Finding[] = [];
    for (const table of list) {
      const caption = tableCaption(ctx, table);
      const first = ctx.doc.paragraphs[table.firstParagraph - 1];
      if (!caption || !TABLE_CAPTION.test(caption.text.trim())) {
        findings.push(finding(ctx, false, msg.tableNoCaption(), { paragraph: first }));
        continue;
      }
      const problems: string[] = [];
      if (!TABLE_CAPTION_FORMAT.test(caption.text.trim()))
        problems.push('нужно «Таблица N – Название»');
      if (caption.format.align !== 'left' && caption.format.align !== 'both')
        problems.push('подпись по левому краю');
      if (problems.length > 0)
        findings.push(finding(ctx, false, msg.captionFormat(problems), { paragraph: caption }));
    }
    return { checked: list.length, findings, unit: 'occurrences' };
  },
};

const tableNumbers: Rule = {
  id: 'TB-02',
  category: 'structure',
  stage: 3,
  autoFixable: false,
  defaultParams: { excludeRoles: ['passport-table'] },
  check(ctx, params) {
    const list = tables(ctx, params)
      .map((t) => tableCaption(ctx, t))
      .filter((p): p is Paragraph => p !== undefined && TABLE_CAPTION.test(p.text.trim()));
    if (list.length === 0) return none;
    return {
      checked: list.length,
      findings: numberingProblems(ctx, list, TABLE_CAPTION, 'таблицы'),
      unit: 'paragraphs',
    };
  },
};

const tableReferenced: Rule = {
  id: 'TB-03',
  category: 'structure',
  stage: 3,
  autoFixable: false,
  defaultParams: { excludeRoles: ['passport-table'] },
  check(ctx, params) {
    const list = tables(ctx, params)
      .map((t) => tableCaption(ctx, t))
      .filter((p): p is Paragraph => p !== undefined && TABLE_CAPTION.test(p.text.trim()));
    if (list.length === 0) return none;
    const refs = mentioned(ctx, /табл(?:ица|ице|ицы|ицу|ицей|\.)?\s*(\d+)/giu);
    const findings = list
      .filter((p) => !refs.has(Number(TABLE_CAPTION.exec(p.text.trim())?.[1])))
      .map((p) => finding(ctx, false, msg.notReferenced('таблицу'), { paragraph: p }));
    return { checked: list.length, findings, unit: 'paragraphs' };
  },
};

const tableLayout: Rule = {
  id: 'TB-04',
  category: 'structure',
  stage: 3,
  autoFixable: false,
  defaultParams: { excludeRoles: ['passport-table'], longTableRows: 20 },
  check(ctx, params) {
    const list = tables(ctx, params);
    if (list.length === 0) return { ...none, unit: 'occurrences' };
    const findings: Finding[] = [];
    for (const table of list) {
      const first = ctx.doc.paragraphs[table.firstParagraph - 1];
      const problems: string[] = [];
      if (
        table.widthMm !== undefined &&
        table.widthMm > textWidthMm(ctx, first?.sectionIndex ?? 1) + 1
      )
        problems.push('таблица шире текста');
      if (table.rows >= num(params, 'longTableRows', 20) && !table.headerRepeat)
        problems.push('у длинной таблицы не повторяется строка заголовка');
      if (problems.length > 0)
        findings.push(finding(ctx, false, msg.tableLayout(problems), { paragraph: first }));
    }
    return { checked: list.length, findings, unit: 'occurrences' };
  },
};

export const figureTableRules: Rule[] = [
  figureCaptioned,
  figureCaptionFormat,
  figureNumbers,
  figureReferenced,
  figurePlacement,
  tableCaptioned,
  tableNumbers,
  tableReferenced,
  tableLayout,
];
