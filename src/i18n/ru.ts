// Все тексты интерфейса живут здесь (бриф, раздел 2.8), чтобы потом можно было добавить язык.
import type { ProfileError } from '../core/profiles/types.ts';

export const ru = {
  appTitle: 'Нормоконтроль',
  appSubtitle: 'Проверка оформления школьного проекта (.docx) прямо в браузере.',
  stageNotice: 'Это каркас (этап 0). Проверки появятся на этапе 1.',
  privacyNote: 'Файл не покидает ваш компьютер.',
} as const;

// Тексты ошибок профиля. Ядро возвращает код и путь, а слова выбирает интерфейс.
export function profileErrorText(error: ProfileError): string {
  const at = error.path === '' ? 'профиль' : `«${error.path}»`;
  switch (error.code) {
    case 'not-object':
      return `${at}: ожидается объект.`;
    case 'missing':
      return `${at}: обязательное поле отсутствует.`;
    case 'wrong-type':
      return `${at}: ожидается ${error.expected ?? 'другой тип'}.`;
    case 'unknown-field':
      return `${at}: неизвестное поле (опечатка?).`;
    case 'bad-value':
      return `${at}: недопустимое значение${error.expected ? `, ожидается ${error.expected}` : ''}.`;
    case 'unsupported-version':
      return `${at}: версия схемы не поддерживается.`;
    case 'duplicate-id':
      return `${at}: такой id уже есть.`;
    case 'unknown-rule':
      return `${at}: ссылка на правило, которого нет в профиле.`;
    case 'broken-ref':
      return `${at}: ссылка не найдена в разделе structure.`;
    case 'ref-conflict':
      return `${at}: параметр задан и напрямую, и через ссылку *From.`;
  }
}
