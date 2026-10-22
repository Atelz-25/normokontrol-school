// Типографика этапа 1: двойные пробелы, пробелы у знаков препинания, дефис вместо тире.
// Каждое найденное место запоминаем с позицией в тексте, чтобы предпросмотр подсветил
// именно его, а не весь абзац.
import { msg, summary } from '../../i18n/rules-ru.ts';
import type { Paragraph } from '../model/types.ts';
import { finding } from './helpers.ts';
import type { CheckContext, Finding, Rule, RuleOutcome } from './types.ts';

type Range = [start: number, end: number];

// Титульный лист и строки ручного содержания выравнивают пробелами по-своему: их не трогаем.
const textParagraphs = (ctx: CheckContext): Paragraph[] =>
  ctx.doc.paragraphs.filter((p) => !p.isEmpty && p.role !== 'title-page' && p.role !== 'toc-entry');

// Все совпадения шаблона (с флагом g) как отрезки текста.
function rangesOf(text: string, pattern: RegExp): Range[] {
  return [...text.matchAll(pattern)].map((m) => [m.index, m.index + m[0].length]);
}

function countMatches(
  ctx: CheckContext,
  find: (text: string, p: Paragraph) => Range[],
  message: (n: number) => string,
): RuleOutcome {
  const paragraphs = textParagraphs(ctx);
  const findings: Finding[] = [];
  let total = 0;
  for (const p of paragraphs) {
    const ranges = find(p.text, p).sort((a, b) => a[0] - b[0]);
    if (ranges.length === 0) continue;
    total += ranges.length;
    const f = finding(ctx, true, message(ranges.length), { paragraph: p });
    f.location.ranges = ranges;
    findings.push(f);
  }
  return {
    checked: paragraphs.length,
    findings,
    unit: 'occurrences',
    summary: summary.occurrences(total, findings.length),
    metrics: { count: total },
  };
}

const doubleSpaces: Rule = {
  id: 'TY-01',
  category: 'typography',
  stage: 1,
  autoFixable: true,
  defaultParams: {},
  check: (ctx) =>
    countMatches(ctx, (text) => rangesOf(text, /(?<=\S) {2,}(?=\S)/g), msg.doubleSpaces),
};

// Ссылки и адреса (https://…, www.…) пропускаем: там свои правила записи. Заменяем их
// пробелами той же длины, чтобы позиции остальных мест в тексте не сдвинулись.
const withoutUrls = (text: string): string =>
  text.replace(/\b(?:https?:\/\/|www\.)\S+/gi, (url) => ' '.repeat(url.length));

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
        return [
          ...rangesOf(clean, before),
          ...rangesOf(clean, spaceBeforeDot),
          ...rangesOf(clean, noSpaceAfter),
        ];
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
      (text) => rangesOf(text, /(?<=\S)[ \u00a0]-[ \u00a0](?=\S)/g),
      msg.hyphenDash,
    ),
};

export const typographyRules: Rule[] = [doubleSpaces, punctuation, hyphenDash];
