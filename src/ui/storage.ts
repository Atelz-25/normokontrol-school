// localStorage — только для удобства этого браузера: свои профили и последний выбор.
// Хранилище может быть недоступно (приватный режим, запрет сайта), поэтому каждое
// обращение обёрнуто в try/catch, и приложение работает и без него.
import { loadProfile } from '../core/profiles/load.ts';
import type { Profile } from '../core/profiles/types.ts';

const KEY_PROFILES = 'normokontrol.customProfiles';
const KEY_SELECTED = 'normokontrol.selectedProfile';

function read(key: string): unknown {
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? undefined : (JSON.parse(raw) as unknown);
  } catch {
    return undefined;
  }
}

function write(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Нет хранилища — просто не запоминаем.
  }
}

// Свои профили проверяем так же строго, как загруженные из файла.
export function loadCustomProfiles(): Profile[] {
  const raw = read(KEY_PROFILES);
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    const result = loadProfile(item);
    return result.ok ? [result.profile] : [];
  });
}

export function saveCustomProfiles(profiles: Profile[]): void {
  write(KEY_PROFILES, profiles);
}

export function loadSelectedId(): string | undefined {
  const raw = read(KEY_SELECTED);
  return typeof raw === 'string' ? raw : undefined;
}

export function saveSelectedId(id: string): void {
  write(KEY_SELECTED, id);
}
