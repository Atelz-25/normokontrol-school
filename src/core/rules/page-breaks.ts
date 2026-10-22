// PB-01. Каждая часть начинается с новой страницы настоящим разрывом (RULES-SCHOOL, раздел 3).
//
// Настоящий разрыв — это одно из трёх:
//   1) у заголовка включено «С новой страницы» (pageBreakBefore, в том числе через стиль);
//   2) разрыв страницы <w:br w:type="page"/> в конце предыдущего абзаца или в начале заголовка;
//   3) предыдущий абзац заканчивает раздел «со следующей страницы».
// Пустые абзацы перед заголовком разрывом не считаются: на другом устройстве они «уедут».
import { msg, summary } from '../../i18n/rules-ru.ts';
import type { DocModel, Paragraph } from '../model/types.ts';
import type { PartDefinition } from '../profiles/types.ts';
import { finding } from './helpers.ts';
import { strings } from './params.ts';
import type { Finding, Rule } from './types.ts';

const NEW_PAGE_SECTIONS = new Set(['nextPage', 'oddPage', 'evenPage']);

function isPartList(value: unknown): value is PartDefinition[] {
  return (
    Array.isArray(value) &&
    value.every((item) => typeof item === 'object' && item !== null && 'id' in item)
  );
}

// Идём назад от заголовка через пустые абзацы к первому «содержательному».
function previousMeaningful(
  doc: DocModel,
  heading: Paragraph,
): { prev?: Paragraph; empties: number } {
  let empties = 0;
  for (let i = heading.index - 2; i >= 0; i--) {
    const p = doc.paragraphs[i];
    if (!p) break;
    if (p.isEmpty && !p.table) {
      empties += 1;
      continue;
    }
    return { prev: p, empties };
  }
  return { empties };
}

function hasBreak(doc: DocModel, heading: Paragraph, accept: Set<string>): boolean {
  if (accept.has('pageBreakBefore') && heading.format.pageBreakBefore) return true;
  if (accept.has('hardPageBreak') && heading.pageBreakAtStart) return true;
  const { prev } = previousMeaningful(doc, heading);
  if (!prev) return false;
  if (
    accept.has('hardPageBreak') &&
    (prev.pageBreakAtEnd || (prev.pageBreakAtStart && prev.text.trim() === ''))
  )
    return true;
  return (
    accept.has('sectionBreakNextPage') &&
    prev.endsSection !== undefined &&
    NEW_PAGE_SECTIONS.has(prev.endsSection.type)
  );
}

const partBreaks: Rule = {
  id: 'PB-01',
  category: 'structure',
  stage: 1,
  autoFixable: true,
  defaultParams: { accept: ['pageBreakBefore', 'hardPageBreak', 'sectionBreakNextPage'] },
  check(ctx, params) {
    const { doc, classification } = ctx;
    const parts = isPartList(params.parts) ? params.parts : classification.parts;
    const accept = new Set(
      strings(params, 'accept', ['pageBreakBefore', 'hardPageBreak', 'sectionBreakNextPage']),
    );
    const firstText = doc.paragraphs.find((p) => !p.isEmpty)?.index;

    const needing: { part: PartDefinition; heading: Paragraph }[] = [];
    parts.forEach((part, i) => {
      const index = classification.partHeadings.get(part.id);
      if (index === undefined || index === firstText) return; // документ начинается с этой части
      const previous = parts[i - 1];
      // «Основная часть» делит страницу с «Теоретической»: разрыв нужен только перед первой.
      if (previous?.sharesPageWithNext && classification.partHeadings.has(previous.id)) return;
      const heading = doc.paragraphs[index - 1];
      if (heading) needing.push({ part, heading });
    });

    const findings: Finding[] = [];
    const missing: string[] = [];
    for (const { part, heading } of needing) {
      if (hasBreak(doc, heading, accept)) continue;
      missing.push(part.id);
      const { prev, empties } = previousMeaningful(doc, heading);
      // «Примерно вверху страницы»: по отметкам раскладки Word заголовок начал новую страницу.
      const approxTop =
        doc.hasLastRenderedPageBreaks &&
        prev?.approxPage !== undefined &&
        (heading.approxPage ?? 0) > prev.approxPage;
      findings.push(
        finding(
          ctx,
          true,
          msg.noPageBreak(part.title, empties, approxTop),
          { paragraph: heading },
          { ungrouped: true },
        ),
      );
    }

    return {
      checked: needing.length,
      findings,
      unit: 'occurrences',
      summary: summary.breaks(missing.length, needing.length),
      metrics: {
        headingsNeedingBreak: needing.length,
        headingsWithBreak: needing.length - missing.length,
        ids: needing.map(({ part }) => part.id),
        missing,
        hardBreaks: doc.paragraphs.filter((p) => p.pageBreakAtStart || p.pageBreakAtEnd).length,
        pageBreakBefore: doc.paragraphs.filter((p) => p.format.pageBreakBefore).length,
        sectionBreaks: doc.sections.length - 1,
      },
    };
  },
};

export const pageBreakRules: Rule[] = [partBreaks];
