// Список литературы и ссылки на него (RF-01…RF-08).
// Источник — абзац с ролью source-item (между «Литературой» и следующей частью).
import { msg } from '../../i18n/rules-ru.ts';
import type { Paragraph } from '../model/types.ts';
import { finding } from './helpers.ts';
import { bool, num, str } from './params.ts';
import type { CheckContext, Finding, Rule, RuleOutcome } from './types.ts';

export interface Source {
  p: Paragraph;
  number?: number; // номер источника, если он есть
  body: string; // текст без номера
}

// Ручной номер «[3] …», «3. …», «3) …» или автонумерация списка.
export function parseSources(ctx: CheckContext): Source[] {
  const paragraphs = ctx.doc.paragraphs.filter((p) => p.role === 'source-item' && !p.isEmpty);
  let auto = 0;
  return paragraphs.map((p) => {
    const text = p.text.trim();
    const manual = /^\[(\d+)\]\s*|^(\d+)[.)]\s+/.exec(text);
    if (manual)
      return { p, number: Number(manual[1] ?? manual[2]), body: text.slice(manual[0].length) };
    if (p.list?.visible && p.list.format !== 'bullet') {
      auto += 1;
      return { p, number: auto, body: text };
    }
    return { p, body: text };
  });
}

// Номера в ссылках вида [3], [3, с. 14], [2–4], [1; 5]. Диапазон раскрываем: [2–4] → 2, 3, 4.
export function citedNumbers(text: string): { raw: string; numbers: number[] }[] {
  const result: { raw: string; numbers: number[] }[] = [];
  for (const match of text.matchAll(/\[([^\]]{1,40})\]/g)) {
    const inside = (match[1] ?? '').replace(/,?\s*(с|стр|p)\.\s*\d+([–-]\d+)?/gi, '');
    if (!/^[\d\s,;–—-]+$/.test(inside)) continue; // это не ссылка на источник
    const numbers: number[] = [];
    for (const part of inside.split(/[,;]/)) {
      const range = /^\s*(\d+)\s*[–—-]\s*(\d+)\s*$/.exec(part);
      if (range) {
        for (let n = Number(range[1]); n <= Number(range[2]) && n - Number(range[1]) < 100; n++)
          numbers.push(n);
      } else if (/^\s*\d+\s*$/.test(part)) numbers.push(Number(part));
    }
    if (numbers.length > 0) result.push({ raw: match[0], numbers });
  }
  return result;
}

// Абзацы основного текста, где могут стоять ссылки (не сам список и не содержание).
const citingParagraphs = (ctx: CheckContext): Paragraph[] =>
  ctx.doc.paragraphs.filter(
    (p) => !p.isEmpty && p.zone === 'body' && p.role !== 'source-item' && p.role !== 'toc-entry',
  );

const none: RuleOutcome = { checked: 0, findings: [], unit: 'paragraphs' };

const numbered: Rule = {
  id: 'RF-01',
  category: 'structure',
  stage: 3,
  autoFixable: false,
  defaultParams: { numberFormats: ['[N]', 'N.'] },
  check(ctx) {
    const sources = parseSources(ctx);
    if (sources.length === 0) return none;
    const findings = sources
      .filter((s) => s.number === undefined)
      .map((s) => finding(ctx, false, msg.sourceNoNumber(), { paragraph: s.p }));
    return { checked: sources.length, findings, unit: 'paragraphs' };
  },
};

const order: Rule = {
  id: 'RF-02',
  category: 'structure',
  stage: 3,
  autoFixable: false,
  defaultParams: { order: 'any' },
  check(ctx, params) {
    const sources = parseSources(ctx);
    const mode = str(params, 'order', 'any');
    if (sources.length < 2 || mode === 'any')
      return { checked: sources.length < 2 ? 0 : 1, findings: [], unit: 'document' };
    const findings: Finding[] = [];
    if (mode === 'alphabetical') {
      const collator = new Intl.Collator('ru');
      sources.forEach((s, i) => {
        const previous = sources[i - 1];
        if (previous && collator.compare(previous.body, s.body) > 0)
          findings.push(finding(ctx, false, msg.sourceOrderAlphabet(), { paragraph: s.p }));
      });
    } else {
      // По порядку упоминания: номера впервые встречаются в тексте по возрастанию.
      const seen: number[] = [];
      for (const p of citingParagraphs(ctx))
        for (const c of citedNumbers(p.text))
          for (const n of c.numbers) if (!seen.includes(n)) seen.push(n);
      seen.forEach((n, i) => {
        if (i > 0 && n < (seen[i - 1] ?? 0)) {
          const source = sources.find((s) => s.number === n);
          findings.push(finding(ctx, false, msg.sourceOrderMention(n), { paragraph: source?.p }));
        }
      });
    }
    return { checked: 1, findings, unit: 'document' };
  },
};

const minimum: Rule = {
  id: 'RF-03',
  category: 'structure',
  stage: 3,
  autoFixable: false,
  defaultParams: { min: 5 },
  check(ctx, params) {
    if (!ctx.classification.partHeadings.has('literature')) return none;
    const count = parseSources(ctx).length;
    const min = num(params, 'min', 5);
    return {
      checked: 1,
      findings: count < min ? [finding(ctx, false, msg.fewSources(count, min), {})] : [],
      unit: 'document',
      metrics: { sources: count },
    };
  },
};

const URL_PATTERN = /\b(?:https?:\/\/|www\.)\S+/i;

const entryShape: Rule = {
  id: 'RF-04',
  category: 'structure',
  stage: 3,
  autoFixable: false,
  defaultParams: {},
  check(ctx) {
    const sources = parseSources(ctx);
    if (sources.length === 0) return none;
    const findings: Finding[] = [];
    for (const s of sources) {
      const body = s.body.trim();
      // «Голый» адрес: запись — это только ссылка, без автора и названия.
      if (
        URL_PATTERN.test(body) &&
        body.replace(URL_PATTERN, '').replace(/URL:/i, '').trim().length < 5
      )
        findings.push(finding(ctx, false, msg.sourceBareUrl(), { paragraph: s.p }));
      else if (!/[.)]$/.test(body))
        findings.push(finding(ctx, false, msg.sourceNoDot(), { paragraph: s.p }));
    }
    return { checked: sources.length, findings, unit: 'paragraphs' };
  },
};

const electronic: Rule = {
  id: 'RF-05',
  category: 'structure',
  stage: 3,
  autoFixable: false,
  defaultParams: { requireAccessDateForUrl: true },
  check(ctx, params) {
    const online = parseSources(ctx).filter((s) => URL_PATTERN.test(s.body));
    if (online.length === 0) return none;
    const needDate = bool(params, 'requireAccessDateForUrl', true);
    const findings: Finding[] = [];
    for (const s of online) {
      const problems: string[] = [];
      if (!/URL:/i.test(s.body)) problems.push('«URL:»');
      if (needDate && !/дата обращения:?\s*\d{1,2}\.\d{1,2}\.\d{4}/i.test(s.body))
        problems.push('«(дата обращения: ДД.ММ.ГГГГ)»');
      if (problems.length > 0)
        findings.push(finding(ctx, false, msg.sourceOnline(problems), { paragraph: s.p }));
    }
    return { checked: online.length, findings, unit: 'paragraphs' };
  },
};

const citationsExist: Rule = {
  id: 'RF-06',
  category: 'structure',
  stage: 3,
  autoFixable: false,
  defaultParams: { citationFormats: ['[N]', '[N, с. M]', '[N–M]', '[N; M]'] },
  check(ctx) {
    const sources = parseSources(ctx);
    const numbers = new Set(
      sources.map((s) => s.number).filter((n): n is number => n !== undefined),
    );
    const paragraphs = citingParagraphs(ctx).filter((p) => citedNumbers(p.text).length > 0);
    if (paragraphs.length === 0) return none;
    const findings: Finding[] = [];
    for (const p of paragraphs) {
      const missing = citedNumbers(p.text)
        .flatMap((c) => c.numbers)
        .filter((n) => !numbers.has(n));
      if (missing.length > 0)
        findings.push(
          finding(ctx, false, msg.citationUnknown([...new Set(missing)]), { paragraph: p }),
        );
    }
    return {
      checked: paragraphs.length,
      findings,
      unit: 'paragraphs',
      metrics: { citations: paragraphs.reduce((sum, p) => sum + citedNumbers(p.text).length, 0) },
    };
  },
};

const allCited: Rule = {
  id: 'RF-07',
  category: 'structure',
  stage: 3,
  autoFixable: false,
  defaultParams: {},
  check(ctx) {
    const sources = parseSources(ctx).filter((s) => s.number !== undefined);
    if (sources.length === 0) return none;
    const cited = new Set(
      citingParagraphs(ctx).flatMap((p) => citedNumbers(p.text).flatMap((c) => c.numbers)),
    );
    const findings = sources
      .filter((s) => !cited.has(s.number ?? -1))
      .map((s) => finding(ctx, false, msg.sourceNotCited(s.number ?? 0), { paragraph: s.p }));
    return { checked: sources.length, findings, unit: 'paragraphs' };
  },
};

// Похожие записи: одинаковый набор слов (без регистра и знаков) хотя бы на 90 %.
function similar(a: string, b: string): boolean {
  const words = (text: string): Set<string> =>
    new Set(
      text
        .toLowerCase()
        .replace(/ё/g, 'е')
        .match(/[\p{L}\d]+/gu) ?? [],
    );
  const x = words(a);
  const y = words(b);
  if (x.size === 0 || y.size === 0) return false;
  const common = [...x].filter((w) => y.has(w)).length;
  return common / Math.max(x.size, y.size) >= 0.9;
}

const duplicates: Rule = {
  id: 'RF-08',
  category: 'structure',
  stage: 3,
  autoFixable: false,
  defaultParams: {},
  check(ctx) {
    const sources = parseSources(ctx);
    if (sources.length < 2) return none;
    const findings: Finding[] = [];
    sources.forEach((s, i) => {
      const twin = sources.slice(0, i).find((other) => similar(other.body, s.body));
      if (twin)
        findings.push(finding(ctx, false, msg.sourceDuplicate(twin.number), { paragraph: s.p }));
    });
    return { checked: sources.length, findings, unit: 'paragraphs' };
  },
};

export const referenceRules: Rule[] = [
  numbered,
  order,
  minimum,
  entryShape,
  electronic,
  citationsExist,
  allCited,
  duplicates,
];
