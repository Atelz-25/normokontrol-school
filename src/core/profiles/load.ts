// Единственная точка входа для профиля: сначала проверка схемы, потом разворот ссылок.
// Правила получают профиль только отсюда, поэтому в них никогда не бывает `*From`.
import type { LoadResult } from './types.ts';
import { isValidProfile, validateProfile } from './validate.ts';
import { resolveProfileRefs } from './resolve.ts';

export function loadProfile(input: unknown): LoadResult {
  if (!isValidProfile(input)) return { ok: false, errors: validateProfile(input) };

  const { profile, errors } = resolveProfileRefs(input);
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, profile };
}
