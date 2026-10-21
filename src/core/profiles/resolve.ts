// Разворот полей-ссылок `*From` до запуска правил (RULES-SCHOOL.md, раздел 0.5).
// Пример: "aliasesFrom": "structure.partsInOrder.toc" превращается в
// "aliases": ["Содержание", "Оглавление"]. Правила видят уже готовые значения
// и ничего не знают про structure. Подробно: docs/PROFILES.md.
import type { Profile, ProfileError, ProfileStructure, RuleConfig } from './types.ts';
import { isPlainObject } from './validate.ts';

const REF_SUFFIX = 'From';
const REF_ROOT = 'structure';

type Lookup = { ok: true; value: unknown } | { ok: false };

// Идём по пути через точку. Если на пути массив, следующий сегмент ищет элемент по id:
// "partsInOrder.toc" — это часть с id "toc", а не элемент с индексом "toc".
export function lookupStructurePath(structure: ProfileStructure, segments: string[]): Lookup {
  let current: unknown = structure;
  for (const segment of segments) {
    if (Array.isArray(current)) {
      current = current.find((item: unknown) => isPlainObject(item) && item.id === segment);
    } else if (isPlainObject(current)) {
      current = Object.hasOwn(current, segment) ? current[segment] : undefined;
    } else {
      return { ok: false };
    }
    if (current === undefined) return { ok: false };
  }
  return { ok: true, value: current };
}

function resolveRuleParams(
  ruleId: string,
  rule: RuleConfig,
  structure: ProfileStructure | undefined,
  errors: ProfileError[],
): RuleConfig {
  const params: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(rule.params)) {
    const isRef = key.length > REF_SUFFIX.length && key.endsWith(REF_SUFFIX);
    if (!isRef) {
      params[key] = value;
      continue;
    }

    const at = `rules.${ruleId}.params.${key}`;
    const target = key.slice(0, -REF_SUFFIX.length);
    if (Object.hasOwn(rule.params, target)) {
      errors.push({ code: 'ref-conflict', path: at });
      continue;
    }

    const segments = typeof value === 'string' ? value.split('.') : [];
    if (segments[0] !== REF_ROOT || segments.length < 2 || structure === undefined) {
      errors.push({ code: 'broken-ref', path: at });
      continue;
    }

    const found = lookupStructurePath(structure, segments.slice(1));
    if (!found.ok) {
      errors.push({ code: 'broken-ref', path: at });
      continue;
    }

    // Ссылка на объект части, а нужен его список: "aliasesFrom" на часть → её "aliases".
    let resolved = found.value;
    if (isPlainObject(resolved) && Object.hasOwn(resolved, target)) resolved = resolved[target];

    // Копия, чтобы правило случайно не испортило structure для других правил.
    params[target] = structuredClone(resolved);
  }

  return { ...rule, params };
}

// Проверяем, что partId в правилах (TH-*, CN-*) указывает на существующую часть.
function checkPartIds(profile: Profile, errors: ProfileError[]): void {
  const partIds = new Set((profile.structure?.partsInOrder ?? []).map((part) => part.id));
  for (const [ruleId, rule] of Object.entries(profile.rules)) {
    const partId = rule.params.partId;
    if (partId !== undefined && (typeof partId !== 'string' || !partIds.has(partId))) {
      errors.push({ code: 'broken-ref', path: `rules.${ruleId}.params.partId` });
    }
  }
}

export function resolveProfileRefs(profile: Profile): {
  profile: Profile;
  errors: ProfileError[];
} {
  const errors: ProfileError[] = [];
  const rules: Record<string, RuleConfig> = {};
  for (const [ruleId, rule] of Object.entries(profile.rules)) {
    rules[ruleId] = resolveRuleParams(ruleId, rule, profile.structure, errors);
  }
  checkPartIds(profile, errors);
  return { profile: { ...profile, rules }, errors };
}
