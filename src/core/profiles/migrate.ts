// Миграции схемы профиля (бриф, раздел 7).
//
// Сейчас версия схемы одна (1), поэтому шагов нет. Когда появится версия 2, сюда
// добавится функция «из 1 в 2», и старые сохранённые профили и ссылки продолжат работать:
// загрузчик прогонит профиль через все шаги по очереди до текущей версии.
import { isPlainObject, SUPPORTED_SCHEMA_VERSION } from './validate.ts';

type Migration = (profile: Record<string, unknown>) => Record<string, unknown>;

// Ключ — версия, ИЗ которой переводим. Пример на будущее: 1: (p) => ({ ...p, schemaVersion: 2, … }).
export const MIGRATIONS: Partial<Record<number, Migration>> = {};

export function migrateProfile(input: unknown, migrations = MIGRATIONS): unknown {
  if (!isPlainObject(input)) return input;
  let current = input;
  for (let step = 0; step < 100; step++) {
    const version = current.schemaVersion;
    if (typeof version !== 'number' || version >= SUPPORTED_SCHEMA_VERSION) break;
    const migrate = migrations[version];
    if (!migrate) break; // шага нет — валидатор сообщит «версия не поддерживается»
    current = migrate(current);
  }
  return current;
}
