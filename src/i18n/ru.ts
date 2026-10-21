// Все тексты интерфейса живут здесь (бриф, раздел 2.8), чтобы потом можно было добавить язык.
// Тексты правил — в соседнем файле rules-ru.ts.
import type { RuleStatus } from '../core/engine/index.ts';
import type { ProfileError, Severity } from '../core/profiles/types.ts';
import type { DocxErrorCode } from '../core/reader/errors.ts';

export const ru = {
  appTitle: 'Нормоконтроль',
  appSubtitle: 'Проверка оформления школьного проекта (.docx) прямо в браузере.',
  privacyNote: 'Файл не покидает ваш компьютер: проверка идёт прямо в браузере, без сервера.',
  privacyHowTitle: 'Как это проверить',
  privacyHow:
    'Откройте инструменты разработчика (F12) → вкладка Network (Сеть), очистите список и загрузите файл. Новых запросов не появится: странице запрещено что-либо отправлять.',
  profileLabel: 'Требования',
  dropTitle: 'Перетащите сюда файл .docx',
  dropOr: 'или',
  chooseFile: 'Выбрать файл',
  checking: (name: string): string => `Проверяю «${name}»…`,
  checked: (name: string): string => `Готово: «${name}».`,
  recheck: 'Проверить новую версию',
  reportTitle: 'Результат проверки',
  counters: (errors: number, warnings: number, infos: number): string =>
    `Правил с ошибками: ${errors} · с замечаниями: ${warnings} · с советами: ${infos}`,
  notChecked: (count: number): string =>
    `Ещё ${count} правил профиля пока не проверяются: они появятся на следующих этапах.`,
  docStats: (paragraphs: number, empty: number, pages?: number): string =>
    `Абзацев вне таблиц: ${paragraphs}, из них пустых: ${empty}.` +
    (pages
      ? ` Страниц примерно: ${pages} (по отметкам Word, в другой программе может отличаться).`
      : ''),
  priorityTitle: 'Из-за чего в прошлый раз снижали баллы',
  priorityIntro: 'Сначала исправьте эти пункты: за них учитель уже снижала оценку.',
  boardTitle: 'Базовые пять пунктов',
  boardHypothesis: 'Список восстановлен по словам учителя и ещё не сверен с доской.',
  findingsTitle: 'Все замечания',
  noFindings: 'Замечаний нет. Перед сдачей всё равно посмотрите документ глазами.',
  why: 'Почему это важно',
  how: 'Как исправить в Word',
  showAll: (count: number): string => `Показать все места (${count})`,
  showLess: 'Свернуть',
  heuristic: 'эвристика: проверка по признакам, может ошибаться',
  unconfirmed: 'значение не подтверждено школой: сверьте с инструкцией',
  typicalNote: 'Это типовое требование: сверьте его с методичкой вашей школы.',
  wholeDocument: 'весь документ',
  paragraph: (n: number): string => `абзац №${n}`,
  section: (n: number): string => `раздел ${n}`,
  approxPage: (n: number): string => `примерно стр. ${n}`,
  stageLater: (stage: number): string => `проверка появится на этапе ${stage}`,
  unknownFile:
    'Это не похоже на файл Word. Нужен документ .docx: в Word откройте работу и выберите Файл → Сохранить как → «Документ Word (*.docx)».',
  googleDocs:
    'Ссылку на Google Документ проверить нельзя. Откройте документ и выберите Файл → Скачать → Microsoft Word (.docx), затем загрузите скачанный файл.',
  workerFailed: 'Проверка неожиданно остановилась. Обновите страницу и попробуйте ещё раз.',
} as const;

export const SEVERITY_NAMES: Record<Severity, string> = {
  error: 'ошибка',
  warning: 'замечание',
  info: 'совет',
};

export const STATUS_NAMES: Record<RuleStatus, string> = {
  pass: 'в порядке',
  fail: 'есть замечания',
  'not-applicable': 'не к чему применить',
  'not-implemented': 'пока не проверяется',
  disabled: 'выключено',
  crashed: 'проверка не удалась',
};

// Понятное объяснение ошибки чтения: что случилось и что сделать.
export function docxErrorText(code: DocxErrorCode): string {
  switch (code) {
    case 'empty':
      return 'Файл пустой. Проверьте, что выбран нужный документ.';
    case 'too-large':
      return 'Файл больше 25 МБ. Обычно так бывает из-за крупных картинок: сожмите их в Word (Формат рисунка → Сжать рисунки) и сохраните снова.';
    case 'doc-or-encrypted':
      return 'Это старый формат .doc или документ с паролем. Откройте его в Word, снимите пароль (Файл → Сведения → Защита документа) и сохраните как «Документ Word (*.docx)».';
    case 'pdf':
      return 'Это PDF. Оформление в нём уже «запечено», проверить его нельзя. Загрузите исходный файл .docx.';
    case 'rtf':
      return 'Это файл RTF. Откройте его в Word и сохраните как «Документ Word (*.docx)».';
    case 'odt':
      return 'Это файл OpenDocument (.odt). В LibreOffice выберите Файл → Сохранить как → «Word 2007–365 (.docx)».';
    case 'not-docx':
      return ru.unknownFile;
    case 'zip-limits':
      return 'Файл устроен необычно (слишком много частей или они слишком большие). Пересохраните его в Word как .docx.';
    case 'no-document':
      return 'В файле нет основного текста Word. Пересохраните документ в Word как .docx.';
    case 'broken':
      return 'Файл повреждён и не читается. Откройте его в Word: если откроется, сохраните заново как .docx.';
  }
}

// Подсказка по расширению до чтения файла.
export function extensionHint(name: string): string | undefined {
  const ext = name.toLowerCase().split('.').pop() ?? '';
  if (ext === 'doc') return docxErrorText('doc-or-encrypted');
  if (ext === 'pdf') return docxErrorText('pdf');
  if (ext === 'odt') return docxErrorText('odt');
  if (ext === 'rtf') return docxErrorText('rtf');
  return undefined;
}

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
