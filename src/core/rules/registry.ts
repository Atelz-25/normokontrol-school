// Реестр правил: все реализованные правила в одном списке.
// Правило из профиля, которого здесь нет, движок пометит «пока не проверяется».
import { documentRules } from './document.ts';
import { emptyRules } from './empty.ts';
import { fontRules } from './font.ts';
import { headingRules } from './headings.ts';
import { pageBreakRules } from './page-breaks.ts';
import { pageNumberRules } from './page-numbers.ts';
import { pageRules } from './page.ts';
import { paragraphRules } from './paragraph.ts';
import { structureRules } from './structure.ts';
import type { Rule } from './types.ts';
import { typographyRules } from './typography.ts';
import { volumeRules } from './volume.ts';

export const RULES: Rule[] = [
  ...pageRules,
  ...fontRules,
  ...paragraphRules,
  ...emptyRules,
  ...pageBreakRules,
  ...typographyRules,
  ...documentRules,
  ...headingRules,
  ...structureRules,
  ...pageNumberRules,
  ...volumeRules,
].sort((a, b) => a.id.localeCompare(b.id));

export const RULES_BY_ID = new Map(RULES.map((rule) => [rule.id, rule]));
