// Пустые абзацы: одиночные (PR-06) и серии («дырки», PR-10).
//
// Каждый пустой абзац входит ровно в одну «серию» — непрерывный ряд пустых абзацев
// вне таблиц. PR-06 смотрит серии длины 1, PR-10 — длины 2 и больше. Так ни один
// пустой абзац не считается дважды (RULES-SCHOOL, PR-06).
import { msg, summary } from '../../i18n/rules-ru.ts';
import type { DocModel, Paragraph, Zone } from '../model/types.ts';
import type { Severity } from '../profiles/types.ts';
import { finding } from './helpers.ts';
import { num, str } from './params.ts';
import type { Finding, Rule } from './types.ts';

export function emptySeries(doc: DocModel): Paragraph[][] {
  const series: Paragraph[][] = [];
  let current: Paragraph[] = [];
  for (const p of doc.paragraphs) {
    if (!p.table && p.isEmpty) {
      current.push(p);
      continue;
    }
    // Таблица или непустой абзац прерывают серию.
    if (current.length > 0) series.push(current);
    current = [];
  }
  if (current.length > 0) series.push(current);

  // Word требует абзац после таблицы в самом конце документа: его не считаем.
  const last = doc.paragraphs.at(-1);
  const previous = last ? doc.paragraphs[last.index - 2] : undefined;
  const lastSeries = series.at(-1);
  if (last?.isEmpty && previous?.table && lastSeries?.length === 1 && lastSeries[0] === last)
    series.pop();
  return series;
}

const severityParam = (value: unknown): Severity | undefined =>
  value === 'error' || value === 'warning' || value === 'info' ? value : undefined;

function countByZone(items: { zone: Zone }[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const item of items) result[item.zone] = (result[item.zone] ?? 0) + 1;
  return result;
}

const singleEmpty: Rule = {
  id: 'PR-06',
  category: 'paragraph',
  stage: 1,
  autoFixable: true,
  // Во встроенных профилях — как в брифе: все пустые абзацы в основном тексте.
  defaultParams: { runs: 'all' },
  check(ctx, params) {
    const mode = str(params, 'runs', 'all');
    const titleSeverity = severityParam(params.titlePageSeverity);
    const series = emptySeries(ctx.doc);
    const empties =
      mode === 'single'
        ? series.filter((s) => s.length === 1).flat()
        : series.flat().filter((p) => p.zone === 'body');
    const findings: Finding[] = empties.map((p) =>
      finding(
        ctx,
        true,
        msg.emptyParagraph(p.list !== undefined),
        { paragraph: p, excerpt: '' },
        {
          severity: p.zone === 'title-page' ? titleSeverity : undefined,
        },
      ),
    );
    const outside = ctx.doc.paragraphs.filter((p) => !p.table).length;
    return {
      checked: outside,
      findings,
      unit: 'paragraphs',
      summary: summary.empties(findings.length, outside),
      metrics: {
        single: empties.length,
        byZone: countByZone(empties),
        emptyNumbered: empties.filter((p) => p.list !== undefined).length,
      },
    };
  },
};

const emptyRuns: Rule = {
  id: 'PR-10',
  category: 'paragraph',
  stage: 1,
  autoFixable: true,
  defaultParams: { minRunLength: 2 },
  check(ctx, params) {
    const minRun = num(params, 'minRunLength', 2);
    const titleSeverity = severityParam(params.titlePageSeverity);
    const { doc } = ctx;
    const series = emptySeries(doc).filter((s) => s.length >= minRun);

    const beforeHeadings: Record<string, number> = {};
    const findings: Finding[] = [];
    for (const run of series) {
      const first = run[0] as Paragraph;
      const last = run[run.length - 1] as Paragraph;
      const next = doc.paragraphs[last.index]; // абзац сразу после серии
      const heading = next?.role === 'part-heading' ? next : undefined;
      if (heading) beforeHeadings[String(heading.index)] = run.length;
      findings.push(
        finding(
          ctx,
          true,
          msg.emptySeries(run.length, heading?.text.replace(/\s+/g, ' ').trim()),
          { paragraph: first, excerpt: '' },
          {
            severity: first.zone === 'title-page' ? titleSeverity : undefined,
          },
        ),
      );
    }
    const inSeries = series.reduce((sum, run) => sum + run.length, 0);
    const longest = Math.max(0, ...series.map((run) => run.length));
    return {
      checked: doc.paragraphs.filter((p) => !p.table).length,
      findings,
      unit: 'occurrences',
      summary: summary.series(series.length, inSeries, longest),
      metrics: {
        series: series.length,
        emptyParagraphsInSeries: inSeries,
        longest,
        byZone: countByZone(series.map((run) => ({ zone: (run[0] as Paragraph).zone }))),
        seriesBeforePartHeadings: beforeHeadings,
        emptyBeforePartHeadingsTotal: Object.values(beforeHeadings).reduce((a, b) => a + b, 0),
      },
    };
  },
};

export const emptyRules: Rule[] = [singleEmpty, emptyRuns];
