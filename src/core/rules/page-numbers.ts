// Номера страниц (NM-01…NM-04). Номер — это поле PAGE в колонтитуле раздела.
//
// Колонтитулы бывают трёх видов: обычный (default), первой страницы (first) и чётных
// страниц (even). Раздел без своей ссылки на колонтитул наследует её у предыдущего.
import { msg } from '../../i18n/rules-ru.ts';
import type { DocModel, HeaderFooter, HeaderFooterKind, Section } from '../model/types.ts';
import { finding } from './helpers.ts';
import { bool, str } from './params.ts';
import type { CheckContext, Finding, Rule, RuleOutcome } from './types.ts';

interface Effective {
  section: Section;
  headers: Partial<Record<HeaderFooterKind, string>>;
  footers: Partial<Record<HeaderFooterKind, string>>;
}

// Ссылки на колонтитулы с учётом наследования от предыдущих разделов.
export function effectiveSections(doc: DocModel): Effective[] {
  let headers: Effective['headers'] = {};
  let footers: Effective['footers'] = {};
  return doc.sections.map((section) => {
    headers = { ...headers, ...section.headers };
    footers = { ...footers, ...section.footers };
    return { section, headers, footers };
  });
}

const hasPage = (part: HeaderFooter | undefined): boolean =>
  part?.paragraphs.some((p) => p.fields.some((f) => f.type === 'PAGE')) ?? false;

// Где стоит номер в обычном колонтитуле: «низ/верх» и выравнивание.
function pagePosition(
  doc: DocModel,
  eff: Effective,
): { place: 'top' | 'bottom'; align: string } | undefined {
  for (const [place, refs] of [
    ['bottom', eff.footers],
    ['top', eff.headers],
  ] as const) {
    const part = refs.default ? doc.headerFooters[refs.default] : undefined;
    const paragraph = part?.paragraphs.find((p) => p.fields.some((f) => f.type === 'PAGE'));
    if (paragraph) return { place, align: paragraph.align };
  }
  return undefined;
}

const perSection = (ctx: CheckContext, findings: Finding[]): RuleOutcome => ({
  checked: ctx.doc.sections.length,
  findings,
  unit: 'sections',
});

const pageField: Rule = {
  id: 'NM-01',
  category: 'page',
  stage: 2,
  autoFixable: false,
  defaultParams: { requirePageField: true },
  check(ctx) {
    const findings = effectiveSections(ctx.doc)
      .filter((eff) => !pagePosition(ctx.doc, eff))
      .map((eff) => finding(ctx, false, msg.noPageNumber(), { sectionIndex: eff.section.index }));
    return perSection(ctx, findings);
  },
};

const ALIGN_BY_POSITION: Record<string, { place: 'top' | 'bottom'; align: string }> = {
  'bottom-center': { place: 'bottom', align: 'center' },
  'bottom-left': { place: 'bottom', align: 'left' },
  'bottom-right': { place: 'bottom', align: 'right' },
  'top-center': { place: 'top', align: 'center' },
  'top-left': { place: 'top', align: 'left' },
  'top-right': { place: 'top', align: 'right' },
};

const pagePlace: Rule = {
  id: 'NM-02',
  category: 'page',
  stage: 2,
  autoFixable: false,
  defaultParams: { position: 'bottom-center' },
  check(ctx, params) {
    const wanted =
      ALIGN_BY_POSITION[str(params, 'position', 'bottom-center')] ??
      ALIGN_BY_POSITION['bottom-center'];
    const findings: Finding[] = [];
    let checked = 0;
    for (const eff of effectiveSections(ctx.doc)) {
      const actual = pagePosition(ctx.doc, eff);
      if (!actual || !wanted) continue; // нет номера — это NM-01
      checked += 1;
      if (actual.place !== wanted.place || actual.align !== wanted.align)
        findings.push(
          finding(ctx, false, msg.pagePosition(actual.place, actual.align), {
            sectionIndex: eff.section.index,
          }),
        );
    }
    return { checked, findings, unit: 'sections' };
  },
};

const titleWithoutNumber: Rule = {
  id: 'NM-03',
  category: 'page',
  stage: 2,
  autoFixable: false,
  defaultParams: { noNumberOnTitlePage: true },
  check(ctx, params) {
    const first = effectiveSections(ctx.doc)[0];
    const hasTitle = ctx.doc.paragraphs.some((p) => p.zone === 'title-page');
    if (
      !bool(params, 'noNumberOnTitlePage', true) ||
      !first ||
      !hasTitle ||
      !pagePosition(ctx.doc, first)
    )
      return { checked: 0, findings: [], unit: 'document' };
    // С «особым колонтитулом первой страницы» номер на титуле есть, только если он стоит
    // в колонтитуле first. Без этой галочки на первой странице печатается обычный.
    const onTitle = first.section.titlePage
      ? hasPage(first.footers.first ? ctx.doc.headerFooters[first.footers.first] : undefined) ||
        hasPage(first.headers.first ? ctx.doc.headerFooters[first.headers.first] : undefined)
      : true;
    return {
      checked: 1,
      findings: onTitle ? [finding(ctx, false, msg.numberOnTitle(), { sectionIndex: 1 })] : [],
      unit: 'document',
    };
  },
};

const continuous: Rule = {
  id: 'NM-04',
  category: 'page',
  stage: 2,
  autoFixable: false,
  defaultParams: { continuous: true },
  check(ctx) {
    // Начать нумерацию заново может только первый раздел.
    const findings = ctx.doc.sections
      .slice(1)
      .filter((s) => s.pageNumberStart !== undefined)
      .map((s) =>
        finding(ctx, false, msg.numberRestart(s.pageNumberStart ?? 0), { sectionIndex: s.index }),
      );
    return perSection(ctx, findings);
  },
};

export const pageNumberRules: Rule[] = [pageField, pagePlace, titleWithoutNumber, continuous];
