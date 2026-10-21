// Модульные тесты загрузчика: каждая ветка проверки схемы — это отдельная ошибка,
// которую увидит автор профиля, поэтому проверяем их по одной.
import { describe, expect, it } from 'vitest';
import {
  loadProfile,
  lookupStructurePath,
  validateProfile,
  type ProfileError,
} from '../../src/core/profiles/index.ts';
import { profileErrorText } from '../../src/i18n/ru.ts';

const base = (): Record<string, unknown> => ({
  schemaVersion: 1,
  id: 'test',
  title: 'Тест',
  rules: { 'PR-06': { enabled: true, severity: 'error', params: {} } },
});

const codesAt = (input: unknown): string[] =>
  validateProfile(input).map((error) => `${error.code}@${error.path}`);

describe('validateProfile: верхний уровень', () => {
  it('не объект', () => {
    expect(codesAt(null)).toEqual(['not-object@']);
    expect(codesAt([])).toEqual(['not-object@']);
  });

  it('пустой объект: не хватает обязательных полей', () => {
    expect(codesAt({})).toEqual([
      'missing@schemaVersion',
      'missing@id',
      'missing@title',
      'missing@rules',
    ]);
  });

  it('неверные типы', () => {
    const input = { ...base(), id: '', title: 5, description: 1, rules: [] };
    expect(codesAt(input)).toEqual([
      'wrong-type@id',
      'wrong-type@title',
      'wrong-type@description',
      'wrong-type@rules',
    ]);
  });

  it('неизвестное поле на верхнем уровне', () => {
    expect(codesAt({ ...base(), colour: 'red' })).toEqual(['unknown-field@colour']);
  });
});

describe('validateProfile: правила', () => {
  it('неверный id, правило не объект', () => {
    expect(codesAt({ ...base(), rules: { pr6: 1 } })).toEqual([
      'bad-value@rules.pr6',
      'not-object@rules.pr6',
    ]);
  });

  it('неверные поля правила', () => {
    const rule = {
      enabled: 'yes',
      severity: 'error',
      params: [],
      confidence: 'maybe',
      source: 1,
      note: 2,
    };
    expect(codesAt({ ...base(), rules: { 'PR-06': rule } })).toEqual([
      'wrong-type@rules.PR-06.enabled',
      'wrong-type@rules.PR-06.params',
      'bad-value@rules.PR-06.confidence',
      'wrong-type@rules.PR-06.source',
      'wrong-type@rules.PR-06.note',
    ]);
  });
});

describe('validateProfile: structure', () => {
  it('structure не объект', () => {
    expect(codesAt({ ...base(), structure: [] })).toEqual(['wrong-type@structure']);
  });

  it('partsInOrder не массив', () => {
    expect(codesAt({ ...base(), structure: { partsInOrder: {} } })).toEqual([
      'wrong-type@structure.partsInOrder',
    ]);
  });

  it('ошибки в частях: не объект, лишнее поле, повтор id, типы', () => {
    const good = { id: 'intro', title: 'Введение', aliases: ['Введение'], optional: false };
    const parts = [
      'intro',
      { ...good, extra: 1 },
      { ...good },
      { id: '', title: 1, aliases: [], optional: 'no', sharesPageWithNext: 'yes' },
    ];
    expect(codesAt({ ...base(), structure: { partsInOrder: parts } })).toEqual([
      'not-object@structure.partsInOrder[0]',
      'unknown-field@structure.partsInOrder[1].extra',
      'duplicate-id@structure.partsInOrder[2].id',
      'wrong-type@structure.partsInOrder[3].id',
      'wrong-type@structure.partsInOrder[3].title',
      'wrong-type@structure.partsInOrder[3].aliases',
      'wrong-type@structure.partsInOrder[3].optional',
      'wrong-type@structure.partsInOrder[3].sharesPageWithNext',
    ]);
  });

  it('поля паспорта: типы и необязательное поле вне списка', () => {
    expect(codesAt({ ...base(), structure: { partNumberFormats: 'roman' } })).toEqual([
      'wrong-type@structure.partNumberFormats',
    ]);
    const structure = { passportFields: ['Тема'], passportOptionalFields: ['Смета'] };
    expect(codesAt({ ...base(), structure })).toEqual([
      'bad-value@structure.passportOptionalFields[0]',
    ]);
  });
});

describe('validateProfile: meta', () => {
  it('meta не объект', () => {
    expect(codesAt({ ...base(), meta: 'x' })).toEqual(['wrong-type@meta']);
  });

  it('списки правил в meta: тип и неизвестные правила, в том числе внутри «+»', () => {
    const meta = { teacherPriority: 'PR-06', boardPoints: ['PR-06+FT-01'], sources: {} };
    expect(codesAt({ ...base(), meta })).toEqual([
      'wrong-type@meta.teacherPriority',
      'unknown-rule@meta.boardPoints[0]',
    ]);
  });
});

describe('ссылки *From', () => {
  it('lookupStructurePath: через массив по id, через объект по ключу, тупик', () => {
    const structure = {
      partsInOrder: [{ id: 'toc', title: 'С', aliases: ['С'], optional: false }],
    };
    expect(lookupStructurePath(structure, ['partsInOrder', 'toc', 'title'])).toEqual({
      ok: true,
      value: 'С',
    });
    expect(lookupStructurePath(structure, ['partsInOrder', 'toc', 'title', 'x'])).toEqual({
      ok: false,
    });
    expect(lookupStructurePath(structure, ['nothing'])).toEqual({ ok: false });
  });

  it('ссылка не на structure или профиль без structure — битая', () => {
    const input = base();
    input.rules = {
      'ST-02': { enabled: true, severity: 'error', params: { aliasesFrom: 'meta.x' } },
    };
    const result = loadProfile(input);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]?.code).toBe('broken-ref');
  });

  it('разворачивает ссылку на массив строк как есть', () => {
    const input = {
      ...base(),
      structure: { passportFields: ['Тема', 'Цель'] },
      rules: {
        'PS-01': {
          enabled: true,
          severity: 'warning',
          params: { fieldsFrom: 'structure.passportFields' },
        },
      },
    };
    const result = loadProfile(input);
    expect(result.ok && result.profile.rules['PS-01']?.params).toEqual({
      fields: ['Тема', 'Цель'],
    });
  });
});

describe('profileErrorText', () => {
  it('для каждого кода есть понятный текст', () => {
    const errors: ProfileError[] = [
      { code: 'not-object', path: '' },
      { code: 'missing', path: 'id' },
      { code: 'wrong-type', path: 'id', expected: 'строка' },
      { code: 'wrong-type', path: 'id' },
      { code: 'unknown-field', path: 'x' },
      { code: 'bad-value', path: 'x', expected: 'a / b' },
      { code: 'bad-value', path: 'x' },
      { code: 'unsupported-version', path: 'schemaVersion' },
      { code: 'duplicate-id', path: 'x' },
      { code: 'unknown-rule', path: 'x' },
      { code: 'broken-ref', path: 'x' },
      { code: 'ref-conflict', path: 'x' },
    ];
    for (const error of errors) expect(profileErrorText(error).length).toBeGreaterThan(10);
    expect(profileErrorText(errors[0]!)).toMatch(/^профиль:/);
  });
});
