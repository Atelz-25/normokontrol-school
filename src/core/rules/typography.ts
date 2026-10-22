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
  count: (text: string, p: Paragraph) => number,
  message: (n: number) => string,
): RuleOutcome {
  const paragraphs = textParagraphs(ctx);
  const findings: Finding[] = [];
  let total = 0;
  for (const p of paragraphs) {
    const n = count(p.text, p);
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
      (text, p) => {
        const clean = withoutUrls(text);
        // В списке литературы « : » и « ; » — норма ГОСТ Р 7.0.100 («Москва : Стандартинформ»).
        const before = p.role === 'source-item' ? /(?<=\S) +[,!?]/g : /(?<=\S) +[,;:!?]/g;
        // Пробел перед точкой — ошибка, только если за точкой не идут буквы или цифры:
        // « .docx» и «Node.js» — имена файлов, а не конец предложения.
        const spaceBeforeDot = /(?<=[\p{L}\d]) +\.(?![\p{L}\d.])/gu;
        // Двоеточие внутри слова (w:p, 10:30) пробела после себя не требует.
        const noSpaceAfter = /(?:[,;!?]|(?<![\p{L}\d]):)(?=\p{L})/gu;
        return (
          matchCount(clean, before) +
          matchCount(clean, spaceBeforeDot) +
          matchCount(clean, noSpaceAfter)
        );
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
