import { expandRoles } from '../classify/index.ts';
import type { Paragraph, Run } from '../model/types.ts';
import type { Severity } from '../profiles/types.ts';
import { strings, type Params } from './params.ts';
import type { CheckContext, Finding, FindingGroup } from './types.ts';

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
  // ungrouped: замечание о документе в целом (например, разрыв перед частью),
  // его не относим к «содержанию» или «титульному листу», даже если абзац там.
  extra: { severity?: Severity; expected?: string; actual?: string; ungrouped?: boolean } = {},
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
      group: p && !extra.ungrouped ? groupOf(p) : undefined,
    },
    autoFixable,
  };
}

// Замечания на титульном листе и в содержании отчёт показывает отдельными группами
// (RULES-SCHOOL, раздел 10): там свои правила вёрстки, и их не смешивают с текстом работы.
export function groupOf(p: Paragraph): FindingGroup | undefined {
  if (p.zone === 'title-page') return 'title-page';
  if (p.role === 'toc-entry' || p.partId === 'toc') return 'toc';
  return undefined;
}

// Абзацы части (между её заголовком и заголовком следующей части), только с текстом.
// undefined — части в документе нет.
export function partParagraphs(ctx: CheckContext, partId: string): Paragraph[] | undefined {
  const { partHeadings } = ctx.classification;
  const start = partHeadings.get(partId);
  if (start === undefined) return undefined;
  const next = [...partHeadings.values()].filter((index) => index > start);
  const end = next.length > 0 ? Math.min(...next) : ctx.doc.paragraphs.length + 1;
  return ctx.doc.paragraphs.filter((p) => p.index > start && p.index < end && !p.isEmpty);
}

// Шаблон из профиля: флаги «u» (Юникод, \p{L}) и «i» (без учёта регистра). Битый шаблон — undefined.
export function profilePattern(source: string, global = false): RegExp | undefined {
  try {
    return new RegExp(source, global ? 'giu' : 'iu');
  } catch {
    return undefined;
  }
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
