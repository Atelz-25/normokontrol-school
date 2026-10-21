// Типографика этапа 1: двойные пробелы, пробелы у знаков препинания, дефис вместо тире.
import { msg, summary } from '../../i18n/rules-ru.ts';
import type { Paragraph } from '../model/types.ts';
import { finding } from './helpers.ts';
import type { CheckContext, Finding, Rule, RuleOutcome } from './types.ts';

// Титульный лист и строки ручного содержания выравнивают пробелами по-своему: их не трогаем.
const textParagraphs = (ctx: CheckContext): Paragraph[] =>
  ctx.doc.paragraphs.filter((p) => !p.isEmpty && p.role !== 'title-page' && p.role !== 'toc-entry');

function countMatches(
  ctx: CheckContext,
  count: (text: string) => number,
  message: (n: number) => string,
): RuleOutcome {
  const paragraphs = textParagraphs(ctx);
  const findings: Finding[] = [];
  let total = 0;
  for (const p of paragraphs) {
    const n = count(p.text);
    if (n === 0) continue;
    total += n;
    findings.push(finding(ctx, true, message(n), { paragraph: p }));
  }
  return {
    checked: paragraphs.length,
    findings,
    unit: 'occurrences',
    summary: summary.occurrences(total, findings.length),
    metrics: { count: total },
  };
}

const matchCount = (text: string, pattern: RegExp): number => (text.match(pattern) ?? []).length;

const doubleSpaces: Rule = {
  id: 'TY-01',
  category: 'typography',
  stage: 1,
  autoFixable: true,
  defaultParams: {},
  check: (ctx) =>
    countMatches(ctx, (text) => matchCount(text, /(?<=\S) {2,}(?=\S)/g), msg.doubleSpaces),
};

// Ссылки и адреса (https://…, www.…) пропускаем: там свои правила записи.
const withoutUrls = (text: string): string => text.replace(/\b(?:https?:\/\/|www\.)\S+/gi, ' ');

const punctuation: Rule = {
  id: 'TY-02',
  category: 'typography',
  stage: 1,
  autoFixable: true,
  defaultParams: {},
  check: (ctx) =>
    countMatches(
      ctx,
      (text) => {
        const clean = withoutUrls(text);
        const spaceBefore =
          matchCount(clean, /(?<=\S) +[,;:!?]/g) + matchCount(clean, /(?<=[\p{L}\d]) +\.(?!\.)/gu);
        const noSpaceAfter = matchCount(clean, /[,;:!?](?=\p{L})/gu);
        return spaceBefore + noSpaceAfter;
      },
      msg.punctuation,
    ),
};

// « - » между словами: дефис, окружённый пробелами (в том числе неразрывными).
const hyphenDash: Rule = {
  id: 'TY-03',
  category: 'typography',
  stage: 1,
  autoFixable: true,
  defaultParams: {},
  check: (ctx) =>
    countMatches(
      ctx,
      (text) => matchCount(text, /(?<=\S)[ \u00a0]-[ \u00a0](?=\S)/g),
      msg.hyphenDash,
    ),
};

export const typographyRules: Rule[] = [doubleSpaces, punctuation, hyphenDash];
