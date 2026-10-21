// Сторож данных №1: профиль «Наша школа» проходит схему, а все ссылки *From разворачиваются.
// Если кто-то поправит profiles/school-custom.json и сломает его, этот тест покажет где.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadProfile, validateProfile, type Profile } from '../../src/core/profiles/index.ts';

const raw: unknown = JSON.parse(
  readFileSync(new URL('../../profiles/school-custom.json', import.meta.url), 'utf8'),
);

function loadOrFail(input: unknown): Profile {
  const result = loadProfile(input);
  if (!result.ok) throw new Error(`Профиль не загрузился: ${JSON.stringify(result.errors)}`);
  return result.profile;
}

describe('profiles/school-custom.json', () => {
  it('проходит проверку схемы без ошибок', () => {
    expect(validateProfile(raw)).toEqual([]);
  });

  it('загружается, и после загрузки ни в одном правиле не осталось полей *From', () => {
    const profile = loadOrFail(raw);
    for (const [ruleId, rule] of Object.entries(profile.rules)) {
      const leftovers = Object.keys(rule.params).filter((key) => /.From$/.test(key));
      expect(leftovers, ruleId).toEqual([]);
    }
  });

  it('aliasesFrom разворачивается в алиасы нужной части', () => {
    const { rules } = loadOrFail(raw);
    expect(rules['ST-02']?.params.aliases).toEqual(['Содержание', 'Оглавление']);
    expect(rules['ST-05']?.params.aliases).toEqual(['Введение']);
    expect(rules['ST-06']?.params.aliases).toContain('Заключительная часть');
    expect(rules['ST-07']?.params.aliases).toContain('Литература');
  });

  it('partsFrom и orderFrom дают все 9 частей по порядку', () => {
    const { rules } = loadOrFail(raw);
    const ids = (value: unknown): string[] => (value as { id: string }[]).map((part) => part.id);
    const expected = [
      'passport',
      'toc',
      'intro',
      'main',
      'theory',
      'practice',
      'conclusion',
      'literature',
      'appendix',
    ];
    expect(ids(rules['PB-01']?.params.parts)).toEqual(expected);
    expect(ids(rules['ST-08']?.params.order)).toEqual(expected);
  });

  it('fieldsFrom и optionalFieldsFrom дают поля паспорта', () => {
    const { rules } = loadOrFail(raw);
    expect(rules['PS-01']?.params.fields).toHaveLength(11);
    expect(rules['PS-01']?.params.optionalFields).toEqual(['Смета проекта (при необходимости)']);
  });

  it('развёрнутые значения — копии: правка в правиле не портит structure', () => {
    const profile = loadOrFail(raw);
    (profile.rules['ST-02']?.params.aliases as string[]).push('Мусор');
    const toc = profile.structure?.partsInOrder?.find((part) => part.id === 'toc');
    expect(toc?.aliases).toEqual(['Содержание', 'Оглавление']);
  });
});

describe('загрузчик профиля', () => {
  // Профиль в старом формате из BRIEF.md (раздел 7): без meta, structure, confidence.
  const oldProfile = {
    schemaVersion: 1,
    id: 'school-default',
    title: 'Типовой школьный проект',
    rules: {
      'PG-02': {
        enabled: true,
        severity: 'error',
        params: { mode: 'equals', valueMm: 30, toleranceMm: 1 },
      },
    },
  };

  it('принимает старый профиль без новых полей', () => {
    expect(loadProfile(oldProfile).ok).toBe(true);
  });

  it('отвергает опечатку в поле правила', () => {
    const typo = structuredClone(oldProfile) as Record<string, unknown>;
    (typo.rules as Record<string, Record<string, unknown>>)['PG-02']!.severty = 'error';
    expect(validateProfile(typo)).toContainEqual({
      code: 'unknown-field',
      path: 'rules.PG-02.severty',
    });
  });

  it('отвергает неизвестную версию схемы и неверную серьёзность', () => {
    const bad = {
      ...oldProfile,
      schemaVersion: 2,
      rules: { 'PG-02': { enabled: true, severity: 'fatal', params: {} } },
    };
    const codes = validateProfile(bad).map((error) => error.code);
    expect(codes).toContain('unsupported-version');
    expect(codes).toContain('bad-value');
  });

  it('сообщает о битой ссылке *From', () => {
    const broken = structuredClone(raw) as Profile;
    broken.rules['ST-02']!.params = { aliasesFrom: 'structure.partsInOrder.nope' };
    const result = loadProfile(broken);
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.errors).toContainEqual({
        code: 'broken-ref',
        path: 'rules.ST-02.params.aliasesFrom',
      });
  });

  it('сообщает о конфликте: параметр задан и напрямую, и через *From', () => {
    const conflict = structuredClone(raw) as Profile;
    conflict.rules['ST-02']!.params = {
      aliases: ['Содержание'],
      aliasesFrom: 'structure.partsInOrder.toc',
    };
    const result = loadProfile(conflict);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.map((error) => error.code)).toContain('ref-conflict');
  });

  it('сообщает о partId, которого нет в structure', () => {
    const wrongPart = structuredClone(raw) as Profile;
    wrongPart.rules['TH-01']!.params.partId = 'teoriya';
    const result = loadProfile(wrongPart);
    expect(result.ok).toBe(false);
  });

  it('сообщает о правиле из meta.teacherPriority, которого нет в rules', () => {
    const bad = structuredClone(raw) as Profile;
    bad.meta!.teacherPriority = ['PR-99'];
    expect(validateProfile(bad)).toContainEqual({
      code: 'unknown-rule',
      path: 'meta.teacherPriority[0]',
    });
  });
});
