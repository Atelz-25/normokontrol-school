// Заголовки: стили, точка в конце, иерархия, оформление, «не оторван от текста», нумерация
// (HD-01…HD-07, бриф раздел 8; оформление по уровням — ответ автора на Q7).
import { fmt, msg, summary } from '../../i18n/rules-ru.ts';
import type { Paragraph } from '../model/types.ts';
import { round } from '../units.ts';
import { finding, visibleRuns } from './helpers.ts';
import { matches, num, str, type Params } from './params.ts';
import type { CheckContext, Finding, Rule, RuleOutcome } from './types.ts';

// Уровни заголовков школьной работы (Q7):
//   front      — «ПАСПОРТ…» и «СОДЕРЖАНИЕ»;
//   part       — части «I.», «II.», …;
//   subPart    — «II.I.», «II.II.»;
//   subHeading — подзаголовки «1. Литературный обзор».
export type HeadingLevel = 'front' | 'part' | 'subPart' | 'subHeading';

const FRONT_PARTS = new Set(['passport', 'toc']);
const SUB_PART_NUMBER = /^(?:[IVXLC]+|\d+)\.(?:[IVXLC]+|\d+)\.?(?=[\s\t])/i;
// Номер в начале заголовка: «II.I.», «1.», «2.1» — до пробела или табуляции.
const NUMBER_PREFIX = /^((?:[IVXLC]+|\d+)(?:\.(?:[IVXLC]+|\d+))*\.?)([\s\t]+)/i;

// Подписи вида «Задачи:» классификатор считает подзаголовками, но это не заголовки разделов.
const isLabel = (p: Paragraph): boolean => p.role === 'sub-heading' && p.text.trim().endsWith(':');

export function headingLevel(p: Paragraph): HeadingLevel | undefined {
  if (p.isEmpty || p.table) return undefined;
  const text = p.text.trim();
  if (p.role === 'part-heading') {
    if (p.partId && FRONT_PARTS.has(p.partId)) return 'front';
    return SUB_PART_NUMBER.test(text) ? 'subPart' : 'part';
  }
  if (p.role === 'heading' || (p.role === 'sub-heading' && !isLabel(p))) {
    // Заголовок со стилем: уровень по outlineLvl (0 — часть, 1 — подраздел части).
    if (p.format.outlineLevel === 0) return 'part';
    if (p.format.outlineLevel === 1) return 'subPart';
    return 'subHeading';
  }
  return undefined;
}

const headings = (ctx: CheckContext): { p: Paragraph; level: HeadingLevel }[] =>
  ctx.doc.paragraphs.flatMap((p) => {
    const level = headingLevel(p);
    return level ? [{ p, level }] : [];
  });

function grouped(paragraphs: Paragraph[], findings: Finding[]): RuleOutcome {
  return {
    checked: paragraphs.length,
    findings,
    unit: 'paragraphs',
    summary: summary.paragraphs(
      new Set(findings.map((f) => f.location.paragraphIndex)).size,
      paragraphs.length,
    ),
  };
}

const hasHeadingStyle = (p: Paragraph): boolean =>
  /^heading \d$/i.test(p.styleName ?? '') || p.format.outlineLevel !== undefined;

const styled: Rule = {
  id: 'HD-01',
  category: 'structure',
  stage: 2,
  autoFixable: false,
  heuristic: true,
  defaultParams: {},
  check(ctx) {
    // «ПАСПОРТ» и «СОДЕРЖАНИЕ» в автоматическое содержание не входят, им стиль не нужен.
    const list = headings(ctx)
      .filter(({ level }) => level !== 'front')
      .map(({ p }) => p);
    return grouped(
      list,
      list
        .filter((p) => !hasHeadingStyle(p))
        .map((p) => finding(ctx, false, msg.headingNoStyle(), { paragraph: p })),
    );
  },
};

const trailingDot: Rule = {
  id: 'HD-02',
  category: 'structure',
  stage: 2,
  autoFixable: true,
  defaultParams: { forbidTrailingDot: true },
  check(ctx) {
    const list = headings(ctx).map(({ p }) => p);
    return grouped(
      list,
      list
        .filter((p) => /[^.]\.$/.test(p.text.trim()))
        .map((p) => finding(ctx, true, msg.headingDot(), { paragraph: p })),
    );
  },
};

// Иерархия видна только у заголовков со стилями (уровень структуры outlineLvl).
const hierarchy: Rule = {
  id: 'HD-03',
  category: 'structure',
  stage: 2,
  autoFixable: false,
  defaultParams: {},
  check(ctx) {
    const list = ctx.doc.paragraphs.filter(
      (p) => !p.isEmpty && !p.table && p.format.outlineLevel !== undefined,
    );
    const findings: Finding[] = [];
    let previous = -1;
    for (const p of list) {
      const level = p.format.outlineLevel ?? 0;
      if (level > previous + 1)
        findings.push(
          finding(ctx, false, msg.headingSkip(previous + 1, level + 1), { paragraph: p }),
        );
      previous = level;
    }
    return grouped(list, findings);
  },
};

interface LevelSpec {
  sizePt?: number;
  bold?: boolean;
  align?: string;
  tabAfterNumber?: boolean;
  firstLineIndentCm?: number;
  rightIndentCm?: number;
}

const ALIGN_SHORT: Record<string, string> = {
  left: 'по левому краю',
  center: 'по центру',
  right: 'по правому краю',
  both: 'по ширине',
};

function levelProblems(p: Paragraph, spec: LevelSpec, tolerance: number): string[] {
  const problems: string[] = [];
  const runs = visibleRuns(p);
  const sizes = [...new Set(runs.map((r) => r.sizePt))];
  if (spec.sizePt !== undefined && sizes.some((s) => s !== spec.sizePt))
    problems.push(
      `размер ${sizes.map((s) => fmt(s, 1)).join(', ')} pt вместо ${fmt(spec.sizePt, 1)} pt`,
    );
  if (spec.bold !== undefined && runs.some((r) => r.bold !== spec.bold))
    problems.push(spec.bold ? 'нужен полужирный' : 'полужирный не нужен');
  if (spec.align !== undefined && p.format.align !== spec.align)
    problems.push(
      `выравнивание ${ALIGN_SHORT[p.format.align] ?? p.format.align}, нужно ${ALIGN_SHORT[spec.align] ?? spec.align}`,
    );
  const numbered = NUMBER_PREFIX.exec(p.text.trim());
  if (spec.tabAfterNumber && numbered && !numbered[2]?.includes('\t'))
    problems.push('после номера нужна табуляция, а не пробел');
  const check = (actual: number, expected: number | undefined, what: string): void => {
    if (
      expected !== undefined &&
      !matches(round(actual, 2), { mode: 'equals', value: expected, tolerance })
    )
      problems.push(`${what} ${fmt(actual)} см вместо ${fmt(expected)} см`);
  };
  check(p.format.firstLineIndentCm, spec.firstLineIndentCm, 'красная строка');
  check(p.format.rightIndentCm, spec.rightIndentCm, 'правый отступ');
  return problems;
}

const LEVEL_KEYS: HeadingLevel[] = ['front', 'part', 'subPart', 'subHeading'];

function readLevels(params: Params): Partial<Record<HeadingLevel, LevelSpec>> | undefined {
  const raw = params.levels;
  if (typeof raw !== 'object' || raw === null) return undefined;
  const result: Partial<Record<HeadingLevel, LevelSpec>> = {};
  for (const key of LEVEL_KEYS) {
    const spec = (raw as Record<string, unknown>)[key];
    if (typeof spec === 'object' && spec !== null) result[key] = spec;
  }
  return result;
}

// Без явных требований (типовой профиль) сравниваем заголовки одного уровня с первым из них.
function sampleSpec(p: Paragraph): LevelSpec {
  const runs = visibleRuns(p);
  return {
    sizePt: runs[0]?.sizePt,
    bold: runs[0]?.bold,
    align: p.format.align,
    firstLineIndentCm: round(p.format.firstLineIndentCm, 2),
  };
}

const headingFormat: Rule = {
  id: 'HD-04',
  category: 'structure',
  stage: 2,
  autoFixable: false,
  defaultParams: { toleranceCm: 0.1 },
  check(ctx, params) {
    const tolerance = num(params, 'toleranceCm', 0.1);
    const levels = readLevels(params);
    const list = headings(ctx);
    const firstOfLevel = new Map<HeadingLevel, LevelSpec>();
    const findings: Finding[] = [];
    for (const { p, level } of list) {
      let spec = levels?.[level];
      if (!levels) {
        spec = firstOfLevel.get(level);
        if (!spec) {
          firstOfLevel.set(level, sampleSpec(p));
          continue;
        }
      }
      if (!spec) continue;
      const problems = levelProblems(p, spec, tolerance);
      if (problems.length > 0)
        findings.push(
          finding(ctx, false, levels ? msg.headingFormat(problems) : msg.headingDiffers(problems), {
            paragraph: p,
          }),
        );
    }
    return grouped(
      list.map(({ p }) => p),
      findings,
    );
  },
};

const keepWithNext: Rule = {
  id: 'HD-05',
  category: 'structure',
  stage: 2,
  autoFixable: true,
  defaultParams: { requireKeepNext: true },
  check(ctx) {
    const list = headings(ctx).map(({ p }) => p);
    return grouped(
      list,
      list
        .filter((p) => !p.format.keepNext)
        .map((p) => finding(ctx, true, msg.headingKeepNext(), { paragraph: p })),
    );
  },
};

const caseAndAlign: Rule = {
  id: 'HD-06',
  category: 'structure',
  stage: 2,
  autoFixable: false,
  defaultParams: { case: 'any', align: 'any' },
  check(ctx, params) {
    const wantedCase = str(params, 'case', 'any');
    const wantedAlign = str(params, 'align', 'any');
    const list = headings(ctx)
      .filter(({ level }) => level === 'part')
      .map(({ p }) => p);
    const findings: Finding[] = [];
    for (const p of list) {
      const letters = p.text.replace(/[^\p{L}]/gu, '');
      const upper = letters === letters.toUpperCase() || p.runs.every((r) => r.caps);
      const sentence = !upper && letters.charAt(0) === letters.charAt(0).toUpperCase();
      const caseOk =
        wantedCase === 'any' ||
        (wantedCase === 'upper' && upper) ||
        (wantedCase === 'sentence' && sentence);
      const alignOk = wantedAlign === 'any' || p.format.align === wantedAlign;
      if (!caseOk || !alignOk)
        findings.push(
          finding(ctx, false, msg.headingCase(wantedCase, wantedAlign), { paragraph: p }),
        );
    }
    return grouped(list, findings);
  },
};

const ROMAN: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100 };

// «IV» → 4, «12» → 12. Римские цифры читаем справа налево: меньшая перед большей вычитается.
export function numberValue(token: string): number {
  if (/^\d+$/.test(token)) return Number(token);
  let total = 0;
  let previous = 0;
  for (const char of token.toUpperCase().split('').reverse()) {
    const value = ROMAN[char] ?? 0;
    total += value < previous ? -value : value;
    previous = Math.max(previous, value);
  }
  return total;
}

const numbering: Rule = {
  id: 'HD-07',
  category: 'structure',
  stage: 2,
  autoFixable: false,
  defaultParams: { acceptRomanPartNumbers: true },
  check(ctx) {
    const list = headings(ctx).filter(({ level }) => level !== 'front');
    const findings: Finding[] = [];
    // Счётчики: номер части, номер подраздела в части, номер подзаголовка в подразделе.
    let part = 0;
    let subPart = 0;
    let subHeading = 0;
    let numberedCount = 0;
    for (const { p, level } of list) {
      const prefix = NUMBER_PREFIX.exec(p.text.trim())?.[1];
      if (!prefix) continue;
      numberedCount += 1;
      const tokens = prefix.split('.').filter(Boolean).map(numberValue);
      let expected: number[];
      if (level === 'part') {
        expected = [part + 1];
        part = tokens[0] ?? part + 1;
        subPart = 0;
        subHeading = 0;
      } else if (level === 'subPart') {
        expected = [part, subPart + 1];
        subPart = tokens[1] ?? subPart + 1;
        subHeading = 0;
      } else {
        expected = [subHeading + 1];
        subHeading = tokens.at(-1) ?? subHeading + 1;
        // Подзаголовок «2.1» внутри раздела 2: сравниваем только последнюю цифру.
        if (tokens.length > 1) expected = [...tokens.slice(0, -1), subHeading];
      }
      if (tokens.join('.') !== expected.join('.'))
        findings.push(finding(ctx, false, msg.headingNumber(prefix), { paragraph: p }));
    }
    const outcome = grouped(
      list.map(({ p }) => p),
      findings,
    );
    return numberedCount === 0 ? { ...outcome, checked: 0 } : outcome;
  },
};

export const headingRules: Rule[] = [
  styled,
  trailingDot,
  hierarchy,
  headingFormat,
  keepWithNext,
  caseAndAlign,
  numbering,
];
