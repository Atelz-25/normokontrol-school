// Документ в целом: правки и примечания (DC-01), выделение маркером (DC-02), заготовки
// шаблона (DC-03), свойства файла (DC-04), слишком длинные абзацы (DC-05).

// DC-01. Не удалены правки (режим рецензирования) и примечания.
import { msg } from '../../i18n/rules-ru.ts';
import type { Severity } from '../profiles/types.ts';
import { finding, profilePattern, visibleRuns } from './helpers.ts';
import { strings } from './params.ts';
import type { Finding, Rule } from './types.ts';

const revisions: Rule = {
  id: 'DC-01',
  category: 'document',
  stage: 1,
  autoFixable: false,
  defaultParams: {},
  check(ctx) {
    const { revisions: count, comments } = ctx.doc;
    const findings: Finding[] = [];
    if (count > 0) findings.push(finding(ctx, false, msg.revisions(count), {}));
    if (comments > 0) findings.push(finding(ctx, false, msg.comments(comments), {}));
    return { checked: 1, findings, unit: 'document', metrics: { revisions: count, comments } };
  },
};

// DC-02. Цветное выделение текста маркером. Серьёзность зависит от цвета (colorSeverity):
// белая подсветка невидима, поэтому только совет; цветная — замечание.
const highlight: Rule = {
  id: 'DC-02',
  category: 'document',
  stage: 3,
  autoFixable: false,
  defaultParams: { colorSeverity: { '*': 'warning' } },
  check(ctx, params) {
    const map = (
      typeof params.colorSeverity === 'object' && params.colorSeverity !== null
        ? params.colorSeverity
        : {}
    ) as Record<string, string>;
    const severityOf = (color: string): Severity => {
      const value = map[color] ?? map['*'] ?? ctx.severity;
      return value === 'error' || value === 'warning' || value === 'info' ? value : ctx.severity;
    };
    const findings: Finding[] = [];
    const colors: Record<string, number> = {};
    let runs = 0;
    for (const p of ctx.doc.paragraphs.filter((x) => !x.isEmpty)) {
      const marked = visibleRuns(p).filter((r) => r.highlight !== undefined);
      if (marked.length === 0) continue;
      runs += marked.length;
      for (const r of marked) colors[r.highlight ?? ''] = (colors[r.highlight ?? ''] ?? 0) + 1;
      const paragraphColors = [...new Set(marked.map((r) => r.highlight ?? ''))];
      // Серьёзность места — самая строгая из цветов в абзаце.
      const order: Severity[] = ['error', 'warning', 'info'];
      const severity =
        order.find((s) => paragraphColors.some((c) => severityOf(c) === s)) ?? 'info';
      findings.push(
        finding(ctx, false, msg.highlight(paragraphColors), { paragraph: p }, { severity }),
      );
    }
    return {
      checked: ctx.doc.paragraphs.filter((p) => !p.isEmpty).length,
      findings,
      unit: 'paragraphs',
      metrics: { runs, paragraphs: findings.length, colors },
    };
  },
};

// DC-03. Заготовки шаблона: «Lorem ipsum», «[Фамилия]», «ХХХ», «Введите текст».
const placeholders: Rule = {
  id: 'DC-03',
  category: 'document',
  stage: 3,
  autoFixable: false,
  defaultParams: {
    patterns: ['lorem ipsum', '\\[Фамилия\\]', 'ХХХ', 'Введите текст', '<[^>]{1,40}>'],
    ignoreUnderscoreLines: true,
  },
  check(ctx, params) {
    const patterns = strings(params, 'patterns', []).flatMap(
      (source) => profilePattern(source) ?? [],
    );
    const ignoreLines = params.ignoreUnderscoreLines !== false;
    const paragraphs = ctx.doc.paragraphs.filter(
      (p) => !p.isEmpty && !(ignoreLines && /^[\s_]+$/.test(p.text)),
    );
    const findings = paragraphs
      .filter((p) => patterns.some((pattern) => pattern.test(p.text)))
      .map((p) => finding(ctx, false, msg.placeholder(), { paragraph: p }));
    return { checked: paragraphs.length, findings, unit: 'paragraphs' };
  },
};

// DC-04. Свойства файла: показываем автора, название и даты. Замечание — только если в
// профиле задан ожидаемый автор, а в файле другой (например, файл скопирован у одноклассника).
const properties: Rule = {
  id: 'DC-04',
  category: 'document',
  stage: 3,
  autoFixable: false,
  defaultParams: { expectedAuthor: '' },
  check(ctx, params) {
    const { title, creator, created, modified } = ctx.doc.properties;
    const expected = typeof params.expectedAuthor === 'string' ? params.expectedAuthor.trim() : '';
    const wrong = expected !== '' && (creator ?? '').toLowerCase() !== expected.toLowerCase();
    return {
      checked: 1,
      findings: wrong ? [finding(ctx, false, msg.author(creator ?? '—', expected), {})] : [],
      unit: 'document',
      metrics: { title, creator, created, modified },
    };
  },
};

// DC-05. Слишком длинный абзац: больше maxWords слов трудно читать.
const longParagraph: Rule = {
  id: 'DC-05',
  category: 'document',
  stage: 3,
  autoFixable: false,
  defaultParams: { maxWords: 250 },
  check(ctx, params) {
    const max = typeof params.maxWords === 'number' ? params.maxWords : 250;
    const paragraphs = ctx.doc.paragraphs.filter(
      (p) => !p.isEmpty && !p.table && p.zone === 'body',
    );
    const findings = paragraphs
      .map((p) => ({ p, words: p.text.split(/\s+/).filter((w) => /[\p{L}\d]/u.test(w)).length }))
      .filter(({ words }) => words > max)
      .map(({ p, words }) => finding(ctx, false, msg.longParagraph(words, max), { paragraph: p }));
    return { checked: paragraphs.length, findings, unit: 'paragraphs' };
  },
};

export const documentRules: Rule[] = [
  revisions,
  highlight,
  placeholders,
  properties,
  longParagraph,
];
