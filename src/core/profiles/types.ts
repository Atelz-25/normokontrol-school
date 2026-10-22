// Схема профиля правил, версия 1. Описание полей простыми словами: docs/PROFILES.md.

export type Severity = 'error' | 'warning' | 'info';

// Насколько мы уверены в значении (см. meta.confidenceLevels в school-custom.json).
export type Confidence = 'explicit' | 'inferred' | 'unconfirmed' | 'default';

export interface RuleConfig {
  enabled: boolean;
  severity: Severity;
  params: Record<string, unknown>;
  // Необязательные поля из RULES-SCHOOL.md: старые профили без них остаются валидными.
  confidence?: Confidence;
  source?: string;
  note?: string;
}

export interface PartDefinition {
  id: string;
  title: string;
  aliases: string[];
  optional: boolean;
  // Часть делит страницу со следующей: разрыв нужен только перед первой из пары.
  sharesPageWithNext?: boolean;
}

export interface ProfileStructure {
  partsInOrder?: PartDefinition[];
  partNumberFormats?: string[];
  passportFields?: string[];
  passportOptionalFields?: string[];
  // «Темы проекта»: темы теории со словами-подсказками для TH-03 (решение В4).
  projectTopics?: { title: string; keywords: string[] }[];
  [key: string]: unknown;
}

export interface ProfileMeta {
  // Порядок блока «Из-за чего в прошлый раз снижали баллы».
  teacherPriority?: string[];
  // Чек-лист «Базовые пять пунктов»; элемент может объединять правила: "FT-01+FT-02".
  boardPoints?: string[];
  boardPointsHypothesis?: string[];
  [key: string]: unknown;
}

export interface Profile {
  schemaVersion: 1;
  id: string;
  title: string;
  description?: string;
  meta?: ProfileMeta;
  structure?: ProfileStructure;
  rules: Record<string, RuleConfig>;
}

export type ProfileErrorCode =
  | 'not-object'
  | 'missing'
  | 'wrong-type'
  | 'unknown-field'
  | 'bad-value'
  | 'unsupported-version'
  | 'duplicate-id'
  | 'unknown-rule'
  | 'broken-ref'
  | 'ref-conflict';

// Ядро не пишет готовых фраз: интерфейс превращает код в текст (src/i18n/ru.ts).
export interface ProfileError {
  code: ProfileErrorCode;
  path: string;
  expected?: string;
}

export type LoadResult = { ok: true; profile: Profile } | { ok: false; errors: ProfileError[] };
