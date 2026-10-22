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

// --- Этап 3 ---------------------------------------------------------------------

function simple(
  id: string,
  find: (text: string, p: Paragraph) => Range[],
  message: (n: number) => string,
  autoFixable = false,
): Rule {
  return {
    id,
    category: 'typography',
    stage: 3,
    autoFixable,
    defaultParams: {},
    check: (ctx) => countMatches(ctx, find, message),
  };
}

// TY-04. Кавычки: «ёлочки», а внутри — „лапки“. Прямые "…" и английские “…” — замечание.
function quoteProblems(text: string): Range[] {
  const ranges = rangesOf(text, /["”]/g);
  let openLapki = 0;
  for (const m of text.matchAll(/[„“]/g)) {
    if (m[0] === '„') openLapki += 1;
    else if (openLapki > 0)
      openLapki -= 1; // “ закрывает „
    else ranges.push([m.index, m.index + 1]);
  }
  return ranges;
}

// TY-07. Латинская буква внутри русского слова: «мoе» с латинской o.
function mixedScripts(text: string): Range[] {
  const ranges: Range[] = [];
  for (const m of text.matchAll(/\p{L}+/gu)) {
    if (/[а-яё]/i.test(m[0]) && /[a-z]/i.test(m[0])) ranges.push([m.index, m.index + m[0].length]);
  }
  return ranges;
}

// TY-10. Многоточие: в одном тексте и «...», и «…» — замечание; «!!» и «??» — тоже.
function ellipsisProblems(text: string, mixed: boolean): Range[] {
  return [...(mixed ? rangesOf(text, /\.{3}/g) : []), ...rangesOf(text, /[!?]{2,}/g)];
}

const sourceSafe = (p: Paragraph, text: string): string =>
  p.role === 'source-item' ? withoutUrls(text) : text;

const stage3: Rule[] = [
  simple('TY-04', (text, p) => quoteProblems(sourceSafe(p, text)), msg.quotes),
  simple('TY-05', (text) => rangesOf(text, /[(«[] +| +[)»\]]/g), msg.innerSpaces, true),
  simple('TY-06', (text) => rangesOf(text, /^[ \t]+|[ \t]+$/g), msg.edgeSpaces, true),
  simple('TY-07', (text, p) => mixedScripts(sourceSafe(p, text)), msg.mixedScripts),
  // TY-08. Неразрывный пробел нужен: число + единица, «№ 5», инициалы «А. С. Пушкин».
  simple(
    'TY-08',
    (text) =>
      rangesOf(
        text,
        /(?<=\d) (?=(?:мм|см|м|км|г|кг|пт|pt|%|руб\.|р\.|с\.|мин|ч)(?![\p{L}]))|(?<=№) (?=\d)|(?<=(?<![\p{L}])[А-ЯЁ]\.) (?=[А-ЯЁ])/gu,
      ),
    msg.nbsp,
  ),
  // TY-09. Диапазон чисел через дефис «10-15» вместо тире «10–15» (не номера вроде «ECMA-376»).
  simple(
    'TY-09',
    (text, p) => rangesOf(sourceSafe(p, text), /(?<![\p{L}\d.-])\d+-\d+(?![\d-])/gu),
    msg.numberRange,
    true,
  ),
  simple(
    'TY-11',
    (text) => rangesOf(text, /(?<!\p{L})(\p{L}+)\s+\1(?!\p{L})/giu),
    msg.repeatedWord,
  ),
];

// TY-10 смотрит на весь документ: смешаны ли «...» и «…».
const ellipsis: Rule = {
  id: 'TY-10',
  category: 'typography',
  stage: 3,
  autoFixable: false,
  defaultParams: {},
  check(ctx) {
    const all = textParagraphs(ctx)
      .map((p) => p.text)
      .join('\n');
    const mixed = all.includes('...') && all.includes('…');
    return countMatches(ctx, (text) => ellipsisProblems(text, mixed), msg.ellipsis);
  },
};

export const typographyRules: Rule[] = [doubleSpaces, punctuation, hyphenDash, ...stage3, ellipsis];
