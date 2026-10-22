// Единственная точка входа для профиля: сначала проверка схемы, потом разворот ссылок.
// Правила получают профиль только отсюда, поэтому в них никогда не бывает `*From`.
import type { LoadResult } from './types.ts';
import { isValidProfile, validateProfile } from './validate.ts';
import { migrateProfile } from './migrate.ts';
import { resolveProfileRefs } from './resolve.ts';

export function loadProfile(raw: unknown): LoadResult {
  // Сначала переводим старую версию схемы в текущую, потом проверяем.
  const input = migrateProfile(raw);
  if (!isValidProfile(input)) return { ok: false, errors: validateProfile(input) };

  const { profile, errors } = resolveProfileRefs(input);
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, profile };
}
