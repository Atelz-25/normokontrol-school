// Содержание работы: ссылки в теории, темы теории, элементы заключения, приложение,
// элементы введения (TH-02, TH-03, CN-01…CN-05, AP-01, ST-09).
// CN-* и TH-03 работают по ключевым словам — это подсказка, а не приговор (эвристика).
import { msg, summary } from '../../i18n/rules-ru.ts';
import { finding, partParagraphs, profilePattern } from './helpers.ts';
import { num, str, strings } from './params.ts';
import type { Finding, Rule, RuleOutcome } from './types.ts';

const notApplicable: RuleOutcome = { checked: 0, findings: [], unit: 'document' };

const textOf = (paragraphs: { text: string }[]): string => paragraphs.map((p) => p.text).join('\n');

const theoryCitations: Rule = {
  id: 'TH-02',
  category: 'structure',
  stage: 3,
  autoFixable: false,
  defaultParams: { partId: 'theory', minCitations: 3, citationPattern: '\\[\\d+[\\d,;–\\s-]*\\]' },
  check(ctx, params) {
    const paragraphs = partParagraphs(ctx, str(params, 'partId', 'theory'));
    const pattern = profilePattern(str(params, 'citationPattern', '\\[\\d+[\\d,;–\\s-]*\\]'), true);
    if (!paragraphs || !pattern) return notApplicable;
    const citations = paragraphs.flatMap((p) => p.text.match(pattern) ?? []);
    const min = num(params, 'minCitations', 3);
    const heading =
      ctx.doc.paragraphs[
        (ctx.classification.partHeadings.get(str(params, 'partId', 'theory')) ?? 1) - 1
      ];
    return {
      checked: 1,
      findings:
        citations.length < min
          ? [
              finding(
                ctx,
                false,
                msg.fewCitations(citations.length, min),
                { paragraph: heading },
                { ungrouped: true },
              ),
            ]
          : [],
      unit: 'document',
      metrics: {
        citations: citations.length,
        paragraphs: paragraphs.filter((p) => (p.text.match(pattern) ?? []).length > 0).length,
      },
    };
  },
};

interface Topic {
  title: string;
  keywords: string[];
}

function readTopics(value: unknown): Topic[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item !== 'object' || item === null) return [];
    const { title, keywords } = item as { title?: unknown; keywords?: unknown };
    if (typeof title !== 'string' || !Array.isArray(keywords)) return [];
    return [{ title, keywords: keywords.filter((k): k is string => typeof k === 'string') }];
  });
}

// TH-03: темы теории — из блока «Темы проекта» профиля (решение В4). Пусто — правило неприменимо.
const theoryTopics: Rule = {
  id: 'TH-03',
  category: 'structure',
  stage: 3,
  autoFixable: false,
  heuristic: true,
  defaultParams: { partId: 'theory', topics: [] },
  check(ctx, params) {
    const topics = readTopics(params.topics);
    const paragraphs = partParagraphs(ctx, str(params, 'partId', 'theory'));
    if (topics.length === 0 || !paragraphs) return notApplicable;
    const text = textOf(paragraphs).toLowerCase().replace(/ё/g, 'е');
    const counts: Record<string, number> = {};
    const findings: Finding[] = [];
    for (const topic of topics) {
      counts[topic.title] = topic.keywords.reduce((sum, keyword) => {
        const key = keyword.toLowerCase().replace(/ё/g, 'е');
        return key === '' ? sum : sum + text.split(key).length - 1;
      }, 0);
      if (counts[topic.title] === 0)
        findings.push(finding(ctx, false, msg.topicMissing(topic.title), {}));
    }
    return { checked: topics.length, findings, unit: 'occurrences', metrics: { topics: counts } };
  },
};

// CN-01…CN-05: элемент заключения найден, если сработал хотя бы один шаблон из профиля.
function conclusionElement(id: string, element: string, fallback: string[]): Rule {
  return {
    id,
    category: 'structure',
    stage: 3,
    autoFixable: false,
    heuristic: true,
    defaultParams: { partId: 'conclusion', patterns: fallback },
    check(ctx, params) {
      const paragraphs = partParagraphs(ctx, str(params, 'partId', 'conclusion'));
      if (!paragraphs) return notApplicable;
      const text = textOf(paragraphs);
      const found = strings(params, 'patterns', fallback).some(
        (source) => profilePattern(source)?.test(text) ?? false,
      );
      const heading =
        ctx.doc.paragraphs[
          (ctx.classification.partHeadings.get(str(params, 'partId', 'conclusion')) ?? 1) - 1
        ];
      return {
        checked: 1,
        findings: found
          ? []
          : [
              finding(
                ctx,
                false,
                msg.conclusionMissing(element),
                { paragraph: heading },
                { ungrouped: true },
              ),
            ],
        unit: 'document',
      };
    },
  };
}

const appendixContent: Rule = {
  id: 'AP-01',
  category: 'structure',
  stage: 3,
  autoFixable: false,
  defaultParams: { requireContentIfReferenced: true, referencePattern: 'в\\s+приложени' },
  check(ctx, params) {
    const pattern = profilePattern(str(params, 'referencePattern', 'в\\s+приложени'));
    if (!pattern) return notApplicable;
    const appendixIndex = ctx.classification.partHeadings.get('appendix');
    const references = ctx.doc.paragraphs.filter(
      (p) =>
        !p.isEmpty &&
        p.role !== 'toc-entry' &&
        p.role !== 'part-heading' &&
        (appendixIndex === undefined || p.index < appendixIndex) &&
        pattern.test(p.text),
    );
    if (references.length === 0) return { ...notApplicable, metrics: { referenceParagraphs: [] } };
    // Содержимое приложения: абзацы с текстом, рисунки или таблицы после заголовка.
    const after =
      appendixIndex === undefined
        ? []
        : ctx.doc.paragraphs.filter(
            (p) => p.index > appendixIndex && (!p.isEmpty || p.containsDrawing),
          );
    const findings =
      after.length > 0
        ? []
        : references.map((p) =>
            finding(ctx, false, msg.appendixEmpty(appendixIndex !== undefined), { paragraph: p }),
          );
    return {
      checked: references.length,
      findings,
      unit: 'paragraphs',
      metrics: {
        referenceParagraphs: references.map((p) => p.index),
        paragraphsAfterAppendixHeading: after.length,
      },
    };
  },
};

const introElements: Rule = {
  id: 'ST-09',
  category: 'structure',
  stage: 3,
  autoFixable: false,
  defaultParams: {
    elements: ['актуальность', 'проблема', 'цель', 'задачи', 'гипотеза', 'методы', 'продукт'],
    optionalElements: [],
  },
  check(ctx, params) {
    const paragraphs = partParagraphs(ctx, 'intro');
    if (!paragraphs) return notApplicable;
    const text = textOf(paragraphs).toLowerCase().replace(/ё/g, 'е');
    const optional = new Set(strings(params, 'optionalElements', []));
    const required = strings(params, 'elements', []).filter((e) => !optional.has(e));
    // Ищем по основе слова: «задачи» найдётся и как «задач», «цель» — как «цел».
    const stem = (word: string): string =>
      (word.length > 4 ? word.slice(0, -1) : word).toLowerCase().replace(/ё/g, 'е');
    const missing = required.filter((element) => !text.includes(stem(element)));
    return {
      checked: required.length,
      findings: missing.map((element) => finding(ctx, false, msg.introMissing(element), {})),
      unit: 'occurrences',
      summary: missing.length > 0 ? summary.occurrences(missing.length, 1) : undefined,
    };
  },
};

export const contentRules: Rule[] = [
  theoryCitations,
  theoryTopics,
  conclusionElement('CN-01', 'достигнута ли цель', [
    'цел\\p{L}*[^.]{0,60}достигнут',
    'достигнут\\p{L}*[^.]{0,60}цел',
  ]),
  conclusionElement('CN-02', 'какие были сложности', ['сложн', 'трудн', 'проблем']),
  conclusionElement('CN-03', 'что на что заменили и что не получилось', [
    'заменил',
    'пришлось\\s+отказ',
    'не\\s+получилось',
    'не\\s+удалось',
    'вместо',
  ]),
  conclusionElement('CN-04', 'как удалось выйти из ситуации', [
    'решил',
    'вышел\\s+из',
    'выход',
    'справил',
  ]),
  conclusionElement('CN-05', 'что сделали бы иначе в следующий раз', [
    'в\\s+следующий\\s+раз',
    'изменил\\s+бы',
    'улучшил\\s+бы',
    'если\\s+бы',
  ]),
  appendixContent,
  introElements,
];
