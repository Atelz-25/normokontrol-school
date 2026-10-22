// Шрифт: гарнитура, размер, единство гарнитуры, цвет (FT-01…FT-04).
import { describeSpec, msg, summary } from '../../i18n/rules-ru.ts';
import { round } from '../units.ts';
import { finding, paragraphsFor, unique, visibleRuns } from './helpers.ts';
import { bool, matches, num, numberSpec, strings } from './params.ts';
import type { Finding, Rule } from './types.ts';

const BODY_ROLES = ['body', 'list-item', 'table-cell', 'toc-entry', 'source-item', 'caption'];

const fontFamily: Rule = {
  id: 'FT-01',
  category: 'font',
  stage: 1,
  autoFixable: true,
  defaultParams: { mode: 'oneOf', values: ['Times New Roman'], appliesTo: BODY_ROLES },
  check(ctx, params) {
    const allowed = strings(params, 'values', ['Times New Roman']);
    const paragraphs = paragraphsFor(ctx, params, BODY_ROLES);
    const findings: Finding[] = [];
    for (const p of paragraphs) {
      const wrong = unique(visibleRuns(p).map((r) => r.font)).filter(
        (font) => !allowed.includes(font),
      );
      if (wrong.length > 0)
        findings.push(
          finding(ctx, true, msg.fonts(wrong, allowed.join(' или ')), { paragraph: p }),
        );
    }
    return {
      checked: paragraphs.length,
      findings,
      unit: 'paragraphs',
      summary: summary.paragraphs(findings.length, paragraphs.length),
    };
  },
};

const fontSize: Rule = {
  id: 'FT-02',
  category: 'font',
  stage: 1,
  autoFixable: true,
  defaultParams: {
    mode: 'equals',
    valuePt: 14,
    tolerancePt: 0,
    appliesTo: BODY_ROLES,
    excludeRoles: ['heading', 'title-page'],
  },
  check(ctx, params) {
    const spec = numberSpec(params, 'Pt', { mode: 'equals', value: 14, tolerance: 0 });
    const expected = describeSpec(spec, 'pt');
    const paragraphs = paragraphsFor(ctx, params, BODY_ROLES);
    const findings: Finding[] = [];
    // Знаки по размерам — для паспорта документа и эталонного теста.
    const charsBySize: Record<string, number> = {};
    for (const p of paragraphs) {
      const runs = visibleRuns(p);
      for (const r of runs) {
        const key = String(round(r.sizePt, 1));
        charsBySize[key] = (charsBySize[key] ?? 0) + (r.end - r.start);
      }
      const wrong = unique(runs.map((r) => r.sizePt)).filter((size) => !matches(size, spec));
      if (wrong.length > 0)
        findings.push(
          finding(ctx, true, msg.sizes(wrong, expected), { paragraph: p }, { expected }),
        );
    }
    return {
      checked: paragraphs.length,
      findings,
      unit: 'paragraphs',
      summary: summary.paragraphs(findings.length, paragraphs.length),
      metrics: { charsBySize },
    };
  },
};

const singleFamily: Rule = {
  id: 'FT-03',
  category: 'font',
  stage: 1,
  autoFixable: false,
  defaultParams: { allowedFonts: ['Times New Roman'], codeFonts: ['Courier New', 'Consolas'] },
  check(ctx, params) {
    const allowed = [
      ...strings(params, 'allowedFonts', ['Times New Roman']),
      ...strings(params, 'codeFonts', []),
    ];
    const paragraphs = ctx.doc.paragraphs.filter((p) => !p.isEmpty);
    const findings: Finding[] = [];
    for (const p of paragraphs) {
      const wrong = unique(visibleRuns(p).map((r) => r.font)).filter(
        (font) => !allowed.includes(font),
      );
      if (wrong.length > 0)
        findings.push(finding(ctx, false, msg.foreignFont(wrong), { paragraph: p }));
    }
    return {
      checked: paragraphs.length,
      findings,
      unit: 'paragraphs',
      summary: summary.paragraphs(findings.length, paragraphs.length),
    };
  },
};

// «Чёрный» цвет записывают по-разному: auto, 000000.
const BLACK = new Set(['auto', '000000']);

const textColor: Rule = {
  id: 'FT-04',
  category: 'font',
  stage: 1,
  autoFixable: true,
  defaultParams: { allowAutoOrBlack: true, allowHyperlinkColor: true },
  check(ctx, params) {
    const allowLinks = bool(params, 'allowHyperlinkColor', true);
    const paragraphs = ctx.doc.paragraphs.filter((p) => !p.isEmpty);
    const findings: Finding[] = [];
    for (const p of paragraphs) {
      const colors = unique(
        visibleRuns(p)
          .filter((r) => !(allowLinks && r.inHyperlink))
          .map((r) => r.color.toUpperCase())
          .filter((color) => !BLACK.has(color.toLowerCase())),
      );
      if (colors.length > 0) findings.push(finding(ctx, true, msg.color(colors), { paragraph: p }));
    }
    return {
      checked: paragraphs.length,
      findings,
      unit: 'paragraphs',
      summary: summary.paragraphs(findings.length, paragraphs.length),
    };
  },
};

// Подчёркивание в основном тексте: так выделяли на печатной машинке; сейчас — только ссылки.
const underline: Rule = {
  id: 'FT-05',
  category: 'font',
  stage: 2,
  autoFixable: true,
  defaultParams: { forbidUnderlineInBody: true, appliesTo: ['body', 'list-item'] },
  check(ctx, params) {
    if (!bool(params, 'forbidUnderlineInBody', true))
      return { checked: 0, findings: [], unit: 'paragraphs' };
    const paragraphs = paragraphsFor(ctx, params, ['body', 'list-item']);
    const findings: Finding[] = paragraphs
      .filter((p) => visibleRuns(p).some((r) => r.underline && !r.inHyperlink))
      .map((p) => finding(ctx, true, msg.underline(), { paragraph: p }));
    return {
      checked: paragraphs.length,
      findings,
      unit: 'paragraphs',
      summary: summary.paragraphs(findings.length, paragraphs.length),
    };
  },
};

// FT-06. Злоупотребление выделением: подряд больше maxEmphasisChars знаков полужирным,
// курсивом или ПРОПИСНЫМИ. Заголовки и титульный лист не считаем — там выделение уместно.
const emphasis: Rule = {
  id: 'FT-06',
  category: 'font',
  stage: 3,
  autoFixable: false,
  defaultParams: { maxEmphasisChars: 150, appliesTo: ['body', 'list-item', 'source-item'] },
  check(ctx, params) {
    const max = num(params, 'maxEmphasisChars', 150);
    const paragraphs = paragraphsFor(ctx, params, ['body', 'list-item', 'source-item']);
    const findings: Finding[] = [];
    for (const p of paragraphs) {
      let streak = 0;
      let longest = 0;
      for (const r of p.runs) {
        const piece = p.text.slice(r.start, r.end);
        const letters = piece.replace(/[^\p{L}]/gu, '');
        const shouting = letters.length > 0 && letters === letters.toUpperCase();
        streak = r.bold || r.italic || r.caps || shouting ? streak + piece.length : 0;
        longest = Math.max(longest, streak);
      }
      if (longest > max)
        findings.push(finding(ctx, false, msg.emphasis(longest), { paragraph: p }));
    }
    return {
      checked: paragraphs.length,
      findings,
      unit: 'paragraphs',
      summary: summary.paragraphs(findings.length, paragraphs.length),
    };
  },
};

export const fontRules: Rule[] = [
  fontFamily,
  fontSize,
  singleFamily,
  textColor,
  underline,
  emphasis,
];
