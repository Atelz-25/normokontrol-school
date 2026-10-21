// Реестр правил: все реализованные правила в одном списке.
// Правило из профиля, которого здесь нет, движок пометит «пока не проверяется».
import { documentRules } from './document.ts';
import { emptyRules } from './empty.ts';
import { fontRules } from './font.ts';
import { pageBreakRules } from './page-breaks.ts';
import { pageRules } from './page.ts';
import { paragraphRules } from './paragraph.ts';
import type { Rule } from './types.ts';
import { typographyRules } from './typography.ts';

export const RULES: Rule[] = [
  ...pageRules,
  ...fontRules,
  ...paragraphRules,
  ...emptyRules,
  ...pageBreakRules,
  ...typographyRules,
  ...documentRules,
].sort((a, b) => a.id.localeCompare(b.id));

export const RULES_BY_ID = new Map(RULES.map((rule) => [rule.id, rule]));
