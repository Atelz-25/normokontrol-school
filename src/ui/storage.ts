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

// --- История попыток: оценки по версиям одной работы (только в этом браузере) ---------
// Храним имя работы, требования, дату и оценку. Текста работы здесь нет. Имя файла может
// содержать фамилию ученика, поэтому историю можно очистить одной кнопкой.
const KEY_HISTORY = 'normokontrol.history';
const PER_WORK = 10; // сколько попыток помнить для одной работы
const WORKS = 30; // сколько разных работ помнить

export interface Attempt {
  work: string;
  profileId: string;
  date: string;
  score: number;
}

// «Иванов, И. Пояснительная записка_исправлено.docx» и «… (2).docx» — одна и та же работа.
export function workKey(fileName: string): string {
  return fileName
    .replace(/\.(docx|pdf)$/i, '')
    .replace(/_исправлено$/i, '')
    .replace(/\s*\(\d+\)$/, '')
    .trim()
    .toLowerCase();
}

function loadAttempts(): Attempt[] {
  const raw = read(KEY_HISTORY);
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (a): a is Attempt =>
      typeof a === 'object' &&
      a !== null &&
      typeof (a as Attempt).work === 'string' &&
      typeof (a as Attempt).profileId === 'string' &&
      typeof (a as Attempt).date === 'string' &&
      typeof (a as Attempt).score === 'number',
  );
}

export function addAttempt(fileName: string, profileId: string, score: number): void {
  const work = workKey(fileName);
  const attempts = [...loadAttempts(), { work, profileId, date: new Date().toISOString(), score }];
  // Оставляем последние попытки каждой работы и последние работы.
  const works = [...new Set(attempts.map((a) => a.work).reverse())].slice(0, WORKS);
  const kept = works.flatMap((w) => attempts.filter((a) => a.work === w).slice(-PER_WORK));
  write(KEY_HISTORY, kept);
}

export function loadAttemptsFor(fileName: string, profileId: string): Attempt[] {
  const work = workKey(fileName);
  return loadAttempts().filter((a) => a.work === work && a.profileId === profileId);
}

export function clearAttempts(): void {
  try {
    window.localStorage.removeItem(KEY_HISTORY);
  } catch {
    // Нет хранилища — и истории нет.
  }
}
