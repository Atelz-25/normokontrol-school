// Проверка профиля, написанная вручную, без библиотек: так каждую проверку видно и
// можно объяснить. Собираем все ошибки сразу, а не только первую, чтобы автор
// профиля исправил их за один раз.
import type { Profile, ProfileError } from './types.ts';

const TOP_LEVEL_FIELDS = new Set([
  'schemaVersion',
  'id',
  'title',
  'description',
  'meta',
  'structure',
  'rules',
]);
const RULE_FIELDS = new Set(['enabled', 'severity', 'params', 'confidence', 'source', 'note']);
const PART_FIELDS = new Set(['id', 'title', 'aliases', 'optional', 'sharesPageWithNext']);
const SEVERITIES = ['error', 'warning', 'info'];
const CONFIDENCES = ['explicit', 'inferred', 'unconfirmed', 'default'];
const RULE_ID = /^[A-Z]{2,3}-\d{2}$/;

export const SUPPORTED_SCHEMA_VERSION = 1;

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

export function validateProfile(input: unknown): ProfileError[] {
  const errors: ProfileError[] = [];
  const add = (code: ProfileError['code'], path: string, expected?: string): void => {
    errors.push(expected === undefined ? { code, path } : { code, path, expected });
  };

  if (!isPlainObject(input)) {
    add('not-object', '');
    return errors;
  }

  for (const key of Object.keys(input)) {
    if (!TOP_LEVEL_FIELDS.has(key)) add('unknown-field', key);
  }

  if (!('schemaVersion' in input)) add('missing', 'schemaVersion');
  else if (input.schemaVersion !== SUPPORTED_SCHEMA_VERSION)
    add('unsupported-version', 'schemaVersion');

  for (const key of ['id', 'title'] as const) {
    if (!(key in input)) add('missing', key);
    else if (typeof input[key] !== 'string' || input[key] === '') add('wrong-type', key, 'строка');
  }
  if ('description' in input && typeof input.description !== 'string')
    add('wrong-type', 'description', 'строка');

  if (!('rules' in input)) add('missing', 'rules');
  else if (!isPlainObject(input.rules)) add('wrong-type', 'rules', 'объект');
  else validateRules(input.rules, add);

  if ('structure' in input) validateStructure(input.structure, add);

  const ruleIds = isPlainObject(input.rules) ? new Set(Object.keys(input.rules)) : new Set();
  if ('meta' in input) validateMeta(input.meta, ruleIds, add);

  return errors;
}

type Add = (code: ProfileError['code'], path: string, expected?: string) => void;

function validateRules(rules: Record<string, unknown>, add: Add): void {
  for (const [ruleId, rule] of Object.entries(rules)) {
    const at = `rules.${ruleId}`;
    if (!RULE_ID.test(ruleId)) add('bad-value', at, 'id вида PR-06');
    if (!isPlainObject(rule)) {
      add('not-object', at);
      continue;
    }
    for (const key of Object.keys(rule)) {
      if (!RULE_FIELDS.has(key)) add('unknown-field', `${at}.${key}`);
    }
    if (typeof rule.enabled !== 'boolean') add('wrong-type', `${at}.enabled`, 'true или false');
    if (!SEVERITIES.includes(rule.severity as string))
      add('bad-value', `${at}.severity`, SEVERITIES.join(' / '));
    if (!isPlainObject(rule.params)) add('wrong-type', `${at}.params`, 'объект');
    if ('confidence' in rule && !CONFIDENCES.includes(rule.confidence as string))
      add('bad-value', `${at}.confidence`, CONFIDENCES.join(' / '));
    for (const key of ['source', 'note'] as const) {
      if (key in rule && typeof rule[key] !== 'string')
        add('wrong-type', `${at}.${key}`, 'строка');
    }
  }
}

function validateStructure(structure: unknown, add: Add): void {
  if (!isPlainObject(structure)) {
    add('wrong-type', 'structure', 'объект');
    return;
  }

  if ('partsInOrder' in structure) {
    const parts = structure.partsInOrder;
    if (!Array.isArray(parts)) {
      add('wrong-type', 'structure.partsInOrder', 'массив');
    } else {
      const seen = new Set<string>();
      parts.forEach((part: unknown, i) => {
        const at = `structure.partsInOrder[${i}]`;
        if (!isPlainObject(part)) {
          add('not-object', at);
          return;
        }
        for (const key of Object.keys(part)) {
          if (!PART_FIELDS.has(key)) add('unknown-field', `${at}.${key}`);
        }
        if (typeof part.id !== 'string' || part.id === '') add('wrong-type', `${at}.id`, 'строка');
        else if (seen.has(part.id)) add('duplicate-id', `${at}.id`);
        else seen.add(part.id);
        if (typeof part.title !== 'string') add('wrong-type', `${at}.title`, 'строка');
        if (!isStringArray(part.aliases) || part.aliases.length === 0)
          add('wrong-type', `${at}.aliases`, 'непустой массив строк');
        if (typeof part.optional !== 'boolean')
          add('wrong-type', `${at}.optional`, 'true или false');
        if ('sharesPageWithNext' in part && typeof part.sharesPageWithNext !== 'boolean')
          add('wrong-type', `${at}.sharesPageWithNext`, 'true или false');
      });
    }
  }

  for (const key of ['partNumberFormats', 'passportFields', 'passportOptionalFields'] as const) {
    if (key in structure && !isStringArray(structure[key]))
      add('wrong-type', `structure.${key}`, 'массив строк');
  }

  // «Темы проекта» (решение В4): список { title, keywords[] }, может быть пустым.
  if ('projectTopics' in structure) {
    const topics = structure.projectTopics;
    if (!Array.isArray(topics)) add('wrong-type', 'structure.projectTopics', 'массив');
    else
      topics.forEach((topic: unknown, i) => {
        if (!isPlainObject(topic) || typeof topic.title !== 'string' || !isStringArray(topic.keywords))
          add('wrong-type', `structure.projectTopics[${i}]`, '{ title, keywords: [строки] }');
      });
  }

  // Необязательное поле паспорта должно быть одним из полей паспорта.
  const { passportFields, passportOptionalFields } = structure;
  if (isStringArray(passportFields) && isStringArray(passportOptionalFields)) {
    passportOptionalFields.forEach((field, i) => {
      if (!passportFields.includes(field))
        add('bad-value', `structure.passportOptionalFields[${i}]`, 'одно из passportFields');
    });
  }
}

function validateMeta(meta: unknown, ruleIds: Set<unknown>, add: Add): void {
  if (!isPlainObject(meta)) {
    add('wrong-type', 'meta', 'объект');
    return;
  }
  // Остальные поля meta (sources, createdOn …) свободные: это справка для человека.
  for (const key of ['teacherPriority', 'boardPoints', 'boardPointsHypothesis'] as const) {
    if (!(key in meta)) continue;
    const list = meta[key];
    if (!isStringArray(list)) {
      add('wrong-type', `meta.${key}`, 'массив строк');
      continue;
    }
    list.forEach((item, i) => {
      for (const ruleId of item.split('+')) {
        if (!ruleIds.has(ruleId)) add('unknown-rule', `meta.${key}[${i}]`);
      }
    });
  }
}

// Удобная обёртка: после успешной проверки TypeScript знает, что это Profile.
export function isValidProfile(input: unknown): input is Profile {
  return validateProfile(input).length === 0;
}
