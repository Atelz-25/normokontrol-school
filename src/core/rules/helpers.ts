import { expandRoles } from '../classify/index.ts';
import type { Paragraph, Run } from '../model/types.ts';
import type { Severity } from '../profiles/types.ts';
import { strings, type Params } from './params.ts';
import type { CheckContext, Finding } from './types.ts';

// Начало абзаца для карточки замечания: табуляции и переносы заменяем пробелом.
export function excerpt(text: string, max = 80): string {
  const flat = text
    .replace(/[\t\n]/g, ' ')
    .replace(/ {2,}/g, ' ')
    .trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

export function finding(
  ctx: CheckContext,
  autoFixable: boolean,
  message: string,
  where: { paragraph?: Paragraph; sectionIndex?: number; excerpt?: string },
  extra: { severity?: Severity; expected?: string; actual?: string } = {},
): Finding {
  const p = where.paragraph;
  return {
    ruleId: ctx.ruleId,
    severity: extra.severity ?? ctx.severity,
    message,
    expected: extra.expected,
    actual: extra.actual,
    location: {
      paragraphIndex: p?.index,
      sectionIndex: where.sectionIndex ?? p?.sectionIndex,
      // Номер страницы показываем, только если Word оставил отметки раскладки.
      approxPage: p && ctx.doc.hasLastRenderedPageBreaks ? p.approxPage : undefined,
      excerpt: where.excerpt ?? (p ? excerpt(p.text) : undefined),
    },
    autoFixable,
  };
}

// Непустые абзацы с ролями из параметра appliesTo (группы heading и caption раскрываются).
export function paragraphsFor(ctx: CheckContext, params: Params, fallback: string[]): Paragraph[] {
  const roles = expandRoles(strings(params, 'appliesTo', fallback));
  const excluded = expandRoles(strings(params, 'excludeRoles', []));
  return ctx.doc.paragraphs.filter((p) => !p.isEmpty && roles.has(p.role) && !excluded.has(p.role));
}

// Прогоны, в которых есть видимые символы (пробелы и табуляции не в счёт).
export function visibleRuns(p: Paragraph): Run[] {
  return p.runs.filter((run) => /\S/.test(p.text.slice(run.start, run.end)));
}

export const unique = <T>(items: T[]): T[] => [...new Set(items)];
