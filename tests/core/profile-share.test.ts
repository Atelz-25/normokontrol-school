// Ссылка на профиль и миграции схемы.
import { describe, expect, it } from 'vitest';
import { BUILTIN_PROFILES } from '../../src/core/profiles/builtin.ts';
import {
  loadProfile,
  migrateProfile,
  profileFromHash,
  profileToHash,
} from '../../src/core/profiles/index.ts';

describe('#profile=… в адресе', () => {
  it('профиль школы проходит туда и обратно без изменений', () => {
    const school = BUILTIN_PROFILES.find((p) => p.id === 'school-custom')!;
    const hash = profileToHash(school);
    expect(hash.startsWith('#profile=')).toBe(true);
    expect(hash.slice('#profile='.length)).not.toMatch(/[+/=]/); // только символы, безопасные для адреса
    const back = loadProfile(profileFromHash(hash));
    expect(back.ok && back.profile).toEqual(school);
  });

  it('битая или чужая ссылка — undefined, без исключения', () => {
    expect(profileFromHash('#profile=не-base64!!')).toBeUndefined();
    expect(profileFromHash('#other=1')).toBeUndefined();
    expect(profileFromHash('')).toBeUndefined();
  });
});

describe('миграции', () => {
  it('профиль прогоняется через шаги до текущей версии', () => {
    const migrations = {
      0: (p: Record<string, unknown>) => ({ ...p, schemaVersion: 1, title: 'Переведён' }),
    };
    expect(migrateProfile({ schemaVersion: 0, id: 'x' }, migrations)).toEqual({
      schemaVersion: 1,
      id: 'x',
      title: 'Переведён',
    });
  });

  it('без нужного шага профиль не меняется, а загрузчик сообщает о версии', () => {
    const old = { schemaVersion: 0, id: 'x', title: 'X', rules: {} };
    expect(migrateProfile(old)).toBe(old);
    const result = loadProfile(old);
    expect(!result.ok && result.errors.map((e) => e.code)).toContain('unsupported-version');
  });
});
