// Абзац: интервалы, отступы, выравнивание, таблица паспорта (PR-01…PR-05, PR-08, PR-09).
import { describeSpec, fmt, msg, summary } from '../../i18n/rules-ru.ts';
import { expandRoles } from '../classify/index.ts';
import type { LineSpacing, Paragraph } from '../model/types.ts';
import { round } from '../units.ts';
import {
  checksIndent,
  finding,
  INDENT_WHITESPACE,
  paragraphsFor,
  unique,
  visibleRuns,
} from './helpers.ts';
import { bool, matches, num, numberSpec, str, strings, type NumberSpec } from './params.ts';
import type { Finding, Rule, RuleOutcome } from './types.ts';

const describeLine = (line: LineSpacing): string =>
  line.rule === 'auto' ? fmt(line.multiplier) : msg.lineExact(line.pt);

const lineMatches = (line: LineSpacing, spec: NumberSpec): boolean =>
  line.rule === 'auto' && matches(line.multiplier, spec);

// Общий шаблон «проверить свойство у каждого абзаца и сгруппировать».
function perParagraph(
  paragraphs: Paragraph[],
  problem: (p: Paragraph) => Finding | undefined,
): RuleOutcome {
  const findings = paragraphs.map(problem).filter((f): f is Finding => f !== undefined);
  return {
    checked: paragraphs.length,
    findings,
    unit: 'paragraphs',
    summary: summary.paragraphs(findings.length, paragraphs.length),
  };
}

const lineSpacing: Rule = {
  id: 'PR-01',
  category: 'paragraph',
  stage: 1,
  autoFixable: true,
  defaultParams: { mode: 'equals', value: 1.5, tolerance: 0.05, appliesTo: ['body', 'list-item'] },
  check(ctx, params) {
    const spec = numberSpec(params, '', { mode: 'equals', value: 1.5, tolerance: 0.05 });
    const expected = describeSpec(spec, '');
    return perParagraph(paragraphsFor(ctx, params, ['body', 'list-item']), (p) =>
      lineMatches(p.format.lineSpacing, spec)
        ? undefined
        : finding(
            ctx,
            true,
            msg.lineSpacing(describeLine(p.format.lineSpacing), expected),
            { paragraph: p },
            { expected },
          ),
    );
  },
};

const spacing: Rule = {
  id: 'PR-02',
  category: 'paragraph',
  stage: 1,
  autoFixable: true,
  defaultParams: { mode: 'equals', valuePt: 0, tolerancePt: 1, appliesTo: ['body', 'list-item'] },
  check(ctx, params) {
    const spec = numberSpec(params, 'Pt', { mode: 'equals', value: 0, tolerance: 1 });
    const expected = describeSpec(spec, 'pt');
    const headingSeverity = params.headingSeverity;
    const headings = expandRoles(['heading']);
    const main = paragraphsFor(ctx, params, ['body', 'list-item']);
    // Заголовки проверяем, только если профиль задал для них свою серьёзность.
    const extra =
      headingSeverity === 'error' || headingSeverity === 'warning' || headingSeverity === 'info'
        ? ctx.doc.paragraphs.filter((p) => !p.isEmpty && headings.has(p.role) && !main.includes(p))
        : [];
    const paragraphs = [...main, ...extra].sort((a, b) => a.index - b.index);
    return perParagraph(paragraphs, (p) => {
      const { spaceBeforePt: before, spaceAfterPt: after } = p.format;
      if (matches(before, spec) && matches(after, spec)) return undefined;
      const severity = extra.includes(p)
        ? (headingSeverity as 'error' | 'warning' | 'info')
        : undefined;
      return finding(
        ctx,
        true,
        msg.spacing(round(before, 1), round(after, 1), expected),
        { paragraph: p },
        { severity, expected },
      );
    });
  },
};

const firstLineIndent: Rule = {
  id: 'PR-03',
  category: 'paragraph',
  stage: 1,
  autoFixable: true,
  defaultParams: {
    mode: 'equals',
    valueCm: 1.25,
    toleranceCm: 0.1,
    appliesTo: ['body'],
    requireConsistent: false,
    leadInBeforeList: 'require',
  },
  check(ctx, params) {
    const spec = numberSpec(params, 'Cm', { mode: 'equals', value: 1.25, tolerance: 0.1 });
    const expected = describeSpec(spec, 'см');
    const leadIns = str(params, 'leadInBeforeList', 'require');
    const paragraphs = paragraphsFor(ctx, params, ['body']).filter(
      (p) => leadIns === 'require' || !p.isListLeadIn,
    );
    const outcome = perParagraph(paragraphs, (p) => {
      const actual = round(p.format.firstLineIndentCm, 2);
      return matches(actual, spec)
        ? undefined
        : finding(ctx, true, msg.firstLine(actual, expected), { paragraph: p }, { expected });
    });
    // Разброс значений помогает понять, что отступы «каждый раз разные».
    const spread: Record<string, number> = {};
    for (const p of paragraphs) {
      const key = fmt(round(p.format.firstLineIndentCm, 2));
      spread[key] = (spread[key] ?? 0) + 1;
    }
    if (bool(params, 'requireConsistent', false) && outcome.findings.length > 0) {
      const values = Object.entries(spread)
        .map(([value, count]) => `${value} см — ${count}`)
        .join(', ');
      outcome.summary = `${outcome.summary ?? ''} ${msg.indentSpread(values)}`;
    }
    outcome.metrics = { spread };
    return outcome;
  },
};

const alignment: Rule = {
  id: 'PR-04',
  category: 'paragraph',
  stage: 1,
  autoFixable: true,
  defaultParams: { align: 'both', appliesTo: ['body', 'list-item'] },
  check(ctx, params) {
    const align = str(params, 'align', 'both');
    return perParagraph(paragraphsFor(ctx, params, ['body', 'list-item']), (p) =>
      p.format.align === align
        ? undefined
        : finding(ctx, true, msg.align(p.format.align), { paragraph: p }),
    );
  },
};

// Отступ пробелами: строка только из пробелов (так «двигают» текст на титульном листе)
// или текст, начатый с двух пробелов либо табуляции. Строки ручного содержания
// не проверяем: их табуляции — тема правила ST-03.
const spaceIndent: Rule = {
  id: 'PR-05',
  category: 'paragraph',
  stage: 1,
  autoFixable: true,
  defaultParams: { forbidSpacesTabsAsIndent: true },
  check(ctx, params) {
    if (!bool(params, 'forbidSpacesTabsAsIndent', true))
      return { checked: 0, findings: [], unit: 'paragraphs' };
    const paragraphs = ctx.doc.paragraphs.filter(checksIndent);
    // Абзац из одних пробелов — это пустой абзац: о нём сообщают PR-06/PR-10, и исправляется он
    // одним действием (удалить). Второе замечание на то же место было бы шумом, поэтому
    // PR-05 смотрит только на пробелы и табуляции перед текстом.
    return perParagraph(paragraphs, (p) => {
      if (!p.isEmpty && INDENT_WHITESPACE.test(p.text))
        return finding(ctx, true, msg.leadingWhitespace(), { paragraph: p });
      return undefined;
    });
  },
};

const passportTable: Rule = {
  id: 'PR-08',
  category: 'paragraph',
  stage: 1,
  autoFixable: false,
  defaultParams: {
    lineSpacing: 1.0,
    tolerance: 0.05,
    spaceBeforePt: 0,
    spaceAfterPt: 0,
    font: 'Times New Roman',
    fontPt: 12,
  },
  check(ctx, params) {
    const tables = ctx.doc.tables.filter((t) => t.role === 'passport-table');
    const paragraphs = ctx.doc.paragraphs.filter((p) =>
      tables.some((t) => p.index >= t.firstParagraph && p.index <= t.lastParagraph),
    );
    const line: NumberSpec = {
      mode: 'equals',
      value: num(params, 'lineSpacing', 1),
      tolerance: num(params, 'tolerance', 0.05),
    };
    const before = num(params, 'spaceBeforePt', 0);
    const after = num(params, 'spaceAfterPt', 0);
    const font = str(params, 'font', 'Times New Roman');
    const size = num(params, 'fontPt', 12);
    // Проверяем все абзацы таблицы, и пустые тоже: пустой абзац с интервалом 1,5 тоже растягивает строку.
    const outcome = perParagraph(paragraphs, (p) => {
      const problems: string[] = [];
      if (!lineMatches(p.format.lineSpacing, line))
        problems.push(`интервал ${describeLine(p.format.lineSpacing)}`);
      if (
        Math.abs(p.format.spaceBeforePt - before) > 1 ||
        Math.abs(p.format.spaceAfterPt - after) > 1
      )
        problems.push(
          `интервалы ${fmt(p.format.spaceBeforePt, 1)}/${fmt(p.format.spaceAfterPt, 1)} pt`,
        );
      const runs = visibleRuns(p);
      const fonts = unique(runs.map((r) => r.font)).filter((f) => f !== font);
      const sizes = unique(runs.map((r) => r.sizePt)).filter((s) => s !== size);
      if (fonts.length > 0) problems.push(`шрифт ${fonts.join(', ')}`);
      if (sizes.length > 0) problems.push(`размер ${sizes.map((s) => fmt(s, 1)).join(', ')} pt`);
      return problems.length > 0
        ? finding(ctx, false, msg.passportTable(problems), { paragraph: p })
        : undefined;
    });
    const withText = paragraphs.filter((p) => !p.isEmpty).length;
    outcome.summary = summary.passport(outcome.findings.length, paragraphs.length, withText);
    outcome.metrics = { cellParagraphs: withText, allParagraphs: paragraphs.length };
    return outcome;
  },
};

const rightIndent: Rule = {
  id: 'PR-09',
  category: 'paragraph',
  stage: 1,
  autoFixable: true,
  defaultParams: {
    mode: 'equals',
    valueCm: 0,
    toleranceCm: 0.1,
    appliesTo: ['body', 'list-item', 'heading', 'toc-entry', 'source-item'],
  },
  check(ctx, params) {
    const spec = numberSpec(params, 'Cm', { mode: 'equals', value: 0, tolerance: 0.1 });
    const expected = describeSpec(spec, 'см');
    const roles = strings(params, 'appliesTo', [
      'body',
      'list-item',
      'heading',
      'toc-entry',
      'source-item',
    ]);
    // Титульный лист и таблицы исключены всегда (RULES-SCHOOL, PR-09).
    const paragraphs = paragraphsFor(ctx, { ...params, appliesTo: roles }, roles).filter(
      (p) => p.zone !== 'title-page' && !p.table,
    );
    return perParagraph(paragraphs, (p) => {
      const actual = round(p.format.rightIndentCm, 2);
      return matches(actual, spec)
        ? undefined
        : finding(ctx, true, msg.rightIndent(actual, expected), { paragraph: p }, { expected });
    });
  },
};

// Ручной перенос строки (Shift+Enter) внутри абзаца: при другой ширине строки остаётся «дыра».
const manualBreaks: Rule = {
  id: 'PR-07',
  category: 'paragraph',
  stage: 2,
  autoFixable: false,
  defaultParams: { forbidManualLineBreaks: true },
  check(ctx, params) {
    if (!bool(params, 'forbidManualLineBreaks', true))
      return { checked: 0, findings: [], unit: 'paragraphs' };
    // Титульный лист и таблицы верстают строками по-своему.
    const paragraphs = ctx.doc.paragraphs.filter(
      (p) => !p.isEmpty && !p.table && p.zone !== 'title-page',
    );
    return perParagraph(paragraphs, (p) =>
      p.text.includes('\n')
        ? finding(ctx, false, msg.manualBreak((p.text.match(/\n/g) ?? []).length), { paragraph: p })
        : undefined,
    );
  },
};

export const paragraphRules: Rule[] = [
  manualBreaks,
  lineSpacing,
  spacing,
  firstLineIndent,
  alignment,
  spaceIndent,
  passportTable,
  rightIndent,
];
