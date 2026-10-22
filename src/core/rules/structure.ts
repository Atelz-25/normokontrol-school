// Структура работы: титульный лист, содержание, обязательные части, порядок, паспорт,
// надпись «Пояснительная записка», имя файла (ST-01…ST-08, ST-10, PS-01, FN-01).
import { msg, summary } from '../../i18n/rules-ru.ts';
import { headingKey } from '../classify/index.ts';
import type { Paragraph } from '../model/types.ts';
import type { PartDefinition } from '../profiles/types.ts';
import { finding } from './helpers.ts';
import { bool, num, str, strings, type Params } from './params.ts';
import type { CheckContext, Finding, Rule, RuleOutcome } from './types.ts';

const normalize = (text: string): string =>
  text
    .replace(/\u00a0/g, ' ')
    .replace(/ё/gi, 'е')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

const textOf = (paragraphs: Paragraph[]): string =>
  normalize(paragraphs.map((p) => p.text).join(' '));

const titlePage = (ctx: CheckContext): Paragraph[] =>
  ctx.doc.paragraphs.filter((p) => p.zone === 'title-page' && !p.isEmpty);

function isPartList(value: unknown): value is PartDefinition[] {
  return (
    Array.isArray(value) &&
    value.every((item) => typeof item === 'object' && item !== null && 'id' in item)
  );
}

const documentOutcome = (
  findings: Finding[],
  metrics: Record<string, unknown> = {},
): RuleOutcome => ({
  checked: 1,
  findings,
  unit: 'document',
  metrics,
});

// --- ST-01. Титульный лист ------------------------------------------------------------

// Особые элементы титульного листа из ответа на Q10; остальные ищутся как текст.
const ELEMENT_MATCHERS: Record<string, RegExp> = {
  школа: /школ|гимнази|лице[йя]|учреждени/,
  'город и год': /\b(19|20)\d{2}\b/,
};

const titleSheet: Rule = {
  id: 'ST-01',
  category: 'structure',
  stage: 2,
  autoFixable: false,
  defaultParams: { minSigns: 2, signs: ['проект', 'выполнил', 'руководитель'] },
  check(ctx, params) {
    const paragraphs = titlePage(ctx);
    if (paragraphs.length === 0)
      return documentOutcome([finding(ctx, false, msg.noTitlePage(), {})]);
    const text = textOf(paragraphs);
    const signs = strings(params, 'signs', ['проект', 'выполнил', 'руководитель']);
    const found = signs.filter((sign) => text.includes(normalize(sign)));
    const findings: Finding[] = [];
    if (found.length < num(params, 'minSigns', 2))
      findings.push(
        finding(ctx, false, msg.titleSigns(signs.filter((s) => !found.includes(s))), {}),
      );
    const layout = params.layout as { elements?: unknown } | undefined;
    const elements = Array.isArray(layout?.elements)
      ? layout.elements.filter((e): e is string => typeof e === 'string')
      : [];
    for (const element of elements) {
      const matcher = ELEMENT_MATCHERS[element];
      const present = matcher ? matcher.test(text) : text.includes(normalize(element));
      if (!present) findings.push(finding(ctx, false, msg.titleElement(element), {}));
    }
    return documentOutcome(findings, { signsFound: found.length });
  },
};

// --- ST-02, ST-05, ST-06, ST-07. Обязательная часть есть --------------------------------

function presence(id: string, fallback: string[], what: string): Rule {
  return {
    id,
    category: 'structure',
    stage: 2,
    autoFixable: false,
    defaultParams: { aliases: fallback },
    check(ctx, params) {
      const keys = new Set(strings(params, 'aliases', fallback).map((alias) => headingKey(alias)));
      const heading = ctx.doc.paragraphs.find(
        (p) => !p.isEmpty && !p.table && keys.has(headingKey(p.text)),
      );
      return documentOutcome(heading ? [] : [finding(ctx, false, msg.partMissing(what), {})], {
        headingParagraph: heading?.index,
      });
    },
  };
}

// --- ST-03. Содержание собрано автоматически --------------------------------------------

const tocField: Rule = {
  id: 'ST-03',
  category: 'structure',
  stage: 2,
  autoFixable: false,
  defaultParams: { requireTocField: true },
  check(ctx, params) {
    if (!bool(params, 'requireTocField', true))
      return { checked: 0, findings: [], unit: 'document' };
    const tocHeading = ctx.classification.partHeadings.get('toc');
    if (tocHeading === undefined) return { checked: 0, findings: [], unit: 'document' };
    const hasField = ctx.doc.paragraphs.some((p) => p.fields.some((f) => f.type === 'TOC'));
    const heading = ctx.doc.paragraphs[tocHeading - 1];
    return documentOutcome(
      hasField
        ? []
        : [finding(ctx, false, msg.tocManual(), { paragraph: heading }, { ungrouped: true })],
    );
  },
};

// --- ST-04. Содержание соответствует заголовкам ------------------------------------------

interface TocEntry {
  p: Paragraph;
  key: string; // текст строки без номера, табуляции, точек и номера страницы
  page?: number;
}

export function parseTocEntry(p: Paragraph): TocEntry {
  const text = p.text.replace(/\u00a0/g, ' ').trim();
  const pageMatch = /(?:\t|\.{2,}|…|\s)\s*(\d+)\s*$/.exec(text);
  const withoutPage = pageMatch ? text.slice(0, pageMatch.index) : text;
  return {
    p,
    key: headingKey(withoutPage.replace(/[.…\s]+$/, '')) ?? '',
    page: pageMatch ? Number(pageMatch[1]) : undefined,
  };
}

const tocMatches: Rule = {
  id: 'ST-04',
  category: 'structure',
  stage: 2,
  autoFixable: false,
  defaultParams: { compareTitles: true, comparePages: 'ifKnown' },
  check(ctx, params) {
    const { doc, classification } = ctx;
    const entries = doc.paragraphs
      .filter((p) => p.role === 'toc-entry' && !p.isEmpty)
      .map(parseTocEntry);
    if (entries.length === 0) return { checked: 0, findings: [], unit: 'paragraphs' };

    // Какие строки считаются «заголовком части»: все алиасы части.
    const partKeys = new Map<string, string>();
    for (const part of classification.parts)
      for (const alias of part.aliases) partKeys.set(headingKey(alias) ?? '', part.id);
    const headingKeys = new Set(
      doc.paragraphs
        .filter(
          (p) =>
            !p.isEmpty && !p.table && ['part-heading', 'heading', 'sub-heading'].includes(p.role),
        )
        .map((p) => headingKey(p.text) ?? ''),
    );

    const findings: Finding[] = [];
    const listed = new Set<string>();
    for (const entry of entries) {
      const partId = partKeys.get(entry.key);
      if (partId) listed.add(partId);
      if (!partId && !headingKeys.has(entry.key))
        findings.push(finding(ctx, false, msg.tocUnknown(), { paragraph: entry.p }));
      if (
        bool(params, 'numberTab', false) &&
        /^(?:[IVXLC]+|\d+)(?:\.(?:[IVXLC]+|\d+))*\.? +\S/i.test(entry.p.text.trim())
      )
        findings.push(finding(ctx, false, msg.tocNumberTab(), { paragraph: entry.p }));
      const left = num(params, 'leftIndentCm', Number.NaN);
      if (!Number.isNaN(left) && Math.abs(entry.p.format.leftIndentCm - left) > 0.1)
        findings.push(
          finding(ctx, false, msg.tocIndent(entry.p.format.leftIndentCm, left), {
            paragraph: entry.p,
          }),
        );
    }

    // Первая строка содержания (в школе — «Паспорт проекта»).
    const firstEntry = str(params, 'firstEntry', '');
    const first = entries[0];
    if (firstEntry && first && first.key !== headingKey(firstEntry))
      findings.push(finding(ctx, false, msg.tocFirst(firstEntry), { paragraph: first.p }));

    // Каждая найденная часть (кроме самого содержания) должна быть в содержании.
    const includeAppendix = bool(params, 'includeAppendix', true);
    const tocIndex = classification.partHeadings.get('toc') ?? 0;
    for (const [partId, index] of classification.partHeadings) {
      if (partId === 'toc' || listed.has(partId) || (partId === 'appendix' && !includeAppendix))
        continue;
      // Части до содержания (паспорт) обязательны, только если этого требует firstEntry.
      if (index < tocIndex && !firstEntry) continue;
      const heading = doc.paragraphs[index - 1];
      findings.push(
        finding(
          ctx,
          false,
          msg.tocMissing(heading?.text.replace(/\s+/g, ' ').trim() ?? partId),
          { paragraph: heading },
          { ungrouped: true },
        ),
      );
    }

    // Номера страниц сравниваем, только если Word оставил отметки раскладки, и только как совет.
    if (str(params, 'comparePages', 'ifKnown') === 'ifKnown' && doc.hasLastRenderedPageBreaks) {
      for (const entry of entries) {
        const partId = partKeys.get(entry.key);
        const headingIndex = partId ? classification.partHeadings.get(partId) : undefined;
        const page = headingIndex ? doc.paragraphs[headingIndex - 1]?.approxPage : undefined;
        if (entry.page !== undefined && page !== undefined && Math.abs(entry.page - page) >= 1)
          findings.push(
            finding(
              ctx,
              false,
              msg.tocPage(entry.page, page),
              { paragraph: entry.p },
              { severity: 'info' },
            ),
          );
      }
    }
    return {
      checked: entries.length,
      findings,
      unit: 'occurrences',
      summary: summary.occurrences(
        findings.length,
        new Set(findings.map((f) => f.location.paragraphIndex)).size,
      ),
    };
  },
};

// --- ST-08. Порядок частей ----------------------------------------------------------------

const partOrder: Rule = {
  id: 'ST-08',
  category: 'structure',
  stage: 2,
  autoFixable: false,
  defaultParams: { appendixOptional: true },
  check(ctx, params) {
    const parts = isPartList(params.order) ? params.order : ctx.classification.parts;
    const found = ctx.classification.partHeadings;
    const findings: Finding[] = [];
    let lastIndex = 0;
    let lastTitle = '';
    for (const part of parts) {
      const index = found.get(part.id);
      if (index === undefined) {
        const optional =
          part.optional || (part.id === 'appendix' && bool(params, 'appendixOptional', true));
        if (!optional) findings.push(finding(ctx, false, msg.partMissing(part.title), {}));
        continue;
      }
      if (index < lastIndex)
        findings.push(
          finding(
            ctx,
            false,
            msg.partOrder(part.title, lastTitle),
            { paragraph: ctx.doc.paragraphs[index - 1] },
            { ungrouped: true },
          ),
        );
      else {
        lastIndex = index;
        lastTitle = part.title;
      }
    }
    return documentOutcome(findings, { partHeadings: Object.fromEntries(found) });
  },
};

// --- ST-10. Надпись «Пояснительная записка» ---------------------------------------------

const documentTitle: Rule = {
  id: 'ST-10',
  category: 'structure',
  stage: 2,
  autoFixable: false,
  defaultParams: {
    requiredPhrase: 'Пояснительная записка',
    where: 'titlePage',
    forbidAsDocumentTitle: [],
  },
  check(ctx, params) {
    const phrase = normalize(str(params, 'requiredPhrase', 'Пояснительная записка'));
    const paragraphs = titlePage(ctx);
    const findings: Finding[] = [];
    if (!textOf(paragraphs).includes(phrase))
      findings.push(finding(ctx, false, msg.phraseMissing(str(params, 'requiredPhrase', '')), {}));
    // Весь документ не должен называться «Паспортом проекта»: паспорт — только его часть.
    const forbidden = new Set(
      strings(params, 'forbidAsDocumentTitle', []).map((t) => headingKey(t)),
    );
    const wrong = paragraphs.find((p) => forbidden.has(headingKey(p.text)));
    if (wrong)
      findings.push(
        finding(ctx, false, msg.wrongDocumentTitle(wrong.text.trim()), { paragraph: wrong }),
      );
    const property = ctx.doc.properties.title;
    if (property && forbidden.has(headingKey(property)))
      findings.push(finding(ctx, false, msg.wrongPropertyTitle(property), {}));
    return documentOutcome(findings);
  },
};

// --- PS-01. Паспорт проекта: все поля на месте -------------------------------------------

const passportFields: Rule = {
  id: 'PS-01',
  category: 'structure',
  stage: 2,
  autoFixable: false,
  defaultParams: { requireNonEmptyValues: true },
  check(ctx, params) {
    const fields = strings(params, 'fields', []);
    if (fields.length === 0) return { checked: 0, findings: [], unit: 'document' };
    const optional = new Set(strings(params, 'optionalFields', []).map(normalize));
    const table = ctx.doc.tables.find((t) => t.role === 'passport-table');
    if (!table)
      return documentOutcome([finding(ctx, false, msg.passportMissing(), {})], {
        fieldsFound: 0,
        of: fields.length,
      });

    const findings: Finding[] = [];
    let foundCount = 0;
    for (const field of fields) {
      const key = normalize(field);
      const row = table.cells.find((cells) => {
        const label = normalize(cells[0] ?? '');
        return label === key || label.startsWith(key) || key.startsWith(label + ' (');
      });
      if (!row) {
        if (!optional.has(key)) findings.push(finding(ctx, false, msg.passportField(field), {}));
        continue;
      }
      foundCount += 1;
      const value = row.slice(1).join(' ').trim();
      if (bool(params, 'requireNonEmptyValues', true) && value === '' && !optional.has(key))
        findings.push(finding(ctx, false, msg.passportEmpty(field), {}));
    }
    return documentOutcome(findings, { fieldsFound: foundCount, of: fields.length });
  },
};

// --- FN-01. Имя файла ---------------------------------------------------------------------

// Подсказка правильного имени по строке «Автор проекта: Фамилия Имя …» с титульного листа.
export function suggestFileName(titleText: string): string | undefined {
  const match = /[Аа]втор[^:]*:\s*([А-ЯЁ][а-яё-]+)\s+([А-ЯЁ])/u.exec(titleText);
  return match ? `${match[1]}, ${match[2]}. Пояснительная записка.docx` : undefined;
}

const fileName: Rule = {
  id: 'FN-01',
  category: 'structure',
  stage: 2,
  autoFixable: false,
  defaultParams: { pattern: '' },
  check(ctx, params: Params) {
    const pattern = str(params, 'pattern', '');
    // Имя знает только интерфейс (файл, выбранный пользователем); в тестах его может не быть.
    if (!ctx.fileName || pattern === '') return { checked: 0, findings: [], unit: 'document' };
    let ok: boolean;
    try {
      ok = new RegExp(pattern, 'u').test(ctx.fileName);
    } catch {
      return { checked: 0, findings: [], unit: 'document' };
    }
    const suggestion =
      suggestFileName(
        titlePage(ctx)
          .map((p) => p.text)
          .join('\n'),
      ) ?? str(params, 'example', '');
    return documentOutcome(
      ok ? [] : [finding(ctx, false, msg.fileName(ctx.fileName, suggestion), {})],
    );
  },
};

export const structureRules: Rule[] = [
  titleSheet,
  presence('ST-02', ['Содержание', 'Оглавление'], 'Содержание'),
  tocField,
  tocMatches,
  presence('ST-05', ['Введение'], 'Введение'),
  presence('ST-06', ['Заключение', 'Выводы'], 'Заключение'),
  presence('ST-07', ['Список литературы', 'Список источников'], 'Список литературы'),
  partOrder,
  documentTitle,
  passportFields,
  fileName,
];
