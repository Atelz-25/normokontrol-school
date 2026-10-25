// Правила страницы: формат листа и поля (PG-01…PG-07). Проверяем каждый раздел.
import { describeSpec, msg, summary } from '../../i18n/rules-ru.ts';
import type { Section } from '../model/types.ts';
import { finding } from './helpers.ts';
import { bool, matches, num, numberSpec, type NumberSpec } from './params.ts';
import type { Rule } from './types.ts';

const pageSize: Rule = {
  id: 'PG-01',
  category: 'page',
  stage: 1,
  autoFixable: true,
  defaultParams: { widthMm: 210, heightMm: 297, toleranceMm: 1, allowLandscapeInAppendix: true },
  check(ctx, params) {
    const width = num(params, 'widthMm', 210);
    const height = num(params, 'heightMm', 297);
    const tolerance = num(params, 'toleranceMm', 1);
    const appendix = ctx.classification.partHeadings.get('appendix');
    const findings = [];
    for (const s of ctx.doc.sections) {
      // Альбомный лист сравниваем «повернув» его обратно.
      const [w, h] =
        s.orientation === 'landscape'
          ? [s.pageHeightMm, s.pageWidthMm]
          : [s.pageWidthMm, s.pageHeightMm];
      if (Math.abs(w - width) > tolerance || Math.abs(h - height) > tolerance) {
        findings.push(
          finding(ctx, true, msg.pageSize(w, h, `${width}×${height} мм`), {
            sectionIndex: s.index,
          }),
        );
      }
      const inAppendix = appendix !== undefined && s.lastParagraph >= appendix;
      if (
        s.orientation === 'landscape' &&
        !(inAppendix && bool(params, 'allowLandscapeInAppendix', true))
      ) {
        findings.push(finding(ctx, true, msg.landscape(), { sectionIndex: s.index }));
      }
    }
    return { checked: ctx.doc.sections.length, findings, unit: 'sections' };
  },
};

type Side = 'left' | 'right' | 'top' | 'bottom';

function marginRule(id: string, side: Side, fallback: NumberSpec): Rule {
  return {
    id,
    category: 'page',
    stage: 1,
    autoFixable: true,
    defaultParams:
      fallback.mode === 'equals'
        ? { mode: 'equals', valueMm: fallback.value, toleranceMm: fallback.tolerance }
        : {},
    check(ctx, params) {
      const spec = numberSpec(params, 'Mm', fallback);
      const expected = describeSpec(spec, 'мм');
      const findings = ctx.doc.sections
        .filter((s) => !matches(s.marginsMm[side], spec))
        .map((s) =>
          finding(
            ctx,
            true,
            msg.margin(side, s.marginsMm[side], expected),
            { sectionIndex: s.index },
            {
              expected,
              actual: `${s.marginsMm[side]} мм`,
            },
          ),
        );
      const metrics = { actualMm: ctx.doc.sections[0]?.marginsMm[side] };
      return { checked: ctx.doc.sections.length, findings, unit: 'sections', metrics };
    },
  };
}

const sameMargins = (a: Section, b: Section): boolean =>
  (['top', 'right', 'bottom', 'left'] as const).every(
    (side) => a.marginsMm[side] === b.marginsMm[side],
  );

const consistentMargins: Rule = {
  id: 'PG-06',
  category: 'page',
  stage: 1,
  autoFixable: true,
  defaultParams: {},
  check(ctx) {
    const [first, ...rest] = ctx.doc.sections;
    const findings = first
      ? rest
          .filter((s) => !sameMargins(first, s))
          .map((s) => finding(ctx, true, msg.marginsDiffer(s.index), { sectionIndex: s.index }))
      : [];
    return {
      checked: ctx.doc.sections.length,
      findings,
      unit: 'sections',
      summary:
        findings.length > 0
          ? summary.sections(findings.length, ctx.doc.sections.length)
          : undefined,
      metrics: { sections: ctx.doc.sections.length },
    };
  },
};

// PG-07. Методичка школы: левое и правое поля вместе 40 мм, верхнее и нижнее — тоже 40 мм.
// Даже если одно поле немного изменили, сумма показывает, что ширина текста осталась прежней.
const marginSums: Rule = {
  id: 'PG-07',
  category: 'page',
  stage: 3,
  autoFixable: false,
  defaultParams: { leftRightMm: 40, topBottomMm: 40, toleranceMm: 1 },
  check(ctx, params) {
    const tolerance = num(params, 'toleranceMm', 1);
    const pairs = [
      { sides: ['left', 'right'] as const, expected: num(params, 'leftRightMm', 40) },
      { sides: ['top', 'bottom'] as const, expected: num(params, 'topBottomMm', 40) },
    ];
    const findings = ctx.doc.sections.flatMap((s) =>
      pairs
        .map(({ sides: [a, b], expected }) => ({
          a,
          b,
          expected,
          sum: s.marginsMm[a] + s.marginsMm[b],
        }))
        .filter(({ sum, expected }) => Math.abs(sum - expected) > tolerance)
        .map(({ a, b, sum, expected }) =>
          finding(ctx, false, msg.marginSum(a, b, sum, expected), { sectionIndex: s.index }),
        ),
    );
    return { checked: ctx.doc.sections.length, findings, unit: 'sections' };
  },
};

export const pageRules: Rule[] = [
  pageSize,
  marginRule('PG-02', 'left', { mode: 'equals', value: 30, tolerance: 1 }),
  marginRule('PG-03', 'right', { mode: 'equals', value: 10, tolerance: 1 }),
  marginRule('PG-04', 'top', { mode: 'equals', value: 20, tolerance: 1 }),
  marginRule('PG-05', 'bottom', { mode: 'equals', value: 20, tolerance: 1 }),
  consistentMargins,
  marginSums,
];
