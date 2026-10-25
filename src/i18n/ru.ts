// Все тексты интерфейса живут здесь (бриф, раздел 2.8), чтобы потом можно было добавить язык.
// Тексты правил — в соседнем файле rules-ru.ts.
import type { RuleStatus } from '../core/engine/index.ts';
import type { ProfileError, Severity } from '../core/profiles/types.ts';
import type { DocxErrorCode } from '../core/reader/errors.ts';
import { plural } from './rules-ru.ts';

export const ru = {
  appTitle: 'Нормоконтроль',
  appSubtitle: 'Проверка оформления школьного проекта (.docx) прямо в браузере.',
  heroLead:
    'Загрузите работу: программа найдёт поля, шрифты, интервалы и пустые строки не по требованиям, покажет место в тексте и подскажет, как исправить в Word.',
  sheetCaption: 'Поля листа по выбранным требованиям',
  docMapTitle: 'Карта',
  docMapHint:
    'Карта документа: штрих — абзац, пропуск — пустой абзац, засечка на полях — замечание. Щелчок по засечке открывает замечание, по строке — абзац в тексте работы.',
  sheetMm: (value: string): string => `${value}\u00a0мм`,
  sheetMargin: (side: string, value: string): string => `${side}: ${value}\u00a0мм`,
  sheetSides: { left: 'слева', right: 'справа', top: 'сверху', bottom: 'снизу' },
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
  // Счётчики под оценкой: число крупно, подпись мелко.
  tally: {
    error: (n: number): string =>
      plural(n, ['правило с ошибками', 'правила с ошибками', 'правил с ошибками']),
    warning: (n: number): string =>
      plural(n, ['правило с замечаниями', 'правила с замечаниями', 'правил с замечаниями']),
    info: (n: number): string =>
      plural(n, ['правило с советами', 'правила с советами', 'правил с советами']),
  },
  notChecked: (count: number): string =>
    `Ещё ${count} ${plural(count, ['правило профиля пока не проверяется', 'правила профиля пока не проверяются', 'правил профиля пока не проверяются'])}: они появятся на следующих этапах.`,
  titlePageLine: (count: number): string =>
    `Отдельно — титульный лист: ${count} ${plural(count, ['замечание', 'замечания', 'замечаний'])} (они в конце списка).`,
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

  // Оценка и паспорт документа (этап 2)
  scoreTitle: 'Оценка оформления',
  score: (total: number): string => `${total} из 100`,
  scoreNone: 'Оценивать нечего: ни одно правило не применимо.',
  scoreHow: 'Как считается оценка',
  scoreFormula:
    'Вес правила: ошибка — 3, замечание — 2, совет — 0 (советы в оценку не входят). Для правил по абзацам балл = 1 − доля абзацев с замечаниями; для остальных — 1, если замечаний нет, и 0, если есть. Оценка = 100 × сумма (вес × балл) ÷ сумма весов. Титульный лист и содержание считаются отдельными строками со своей серьёзностью. Подробно — docs/SCORING.md в репозитории.',
  scoreCategory: (name: string, earned: number, possible: number): string =>
    `${name}: ${Math.round(earned * 10) / 10} из ${possible}`,
  passportTitle: 'Паспорт документа',
  passportLines: (p: {
    words: number;
    chars: number;
    charsNoSpaces: number;
    pagesBy1800: number;
    approxPages?: number;
    paragraphs: number;
    emptyParagraphs: number;
    sections: number;
    headings: number;
    figures: number;
    tables: number;
    sources: number;
  }): string[] => [
    `Слов: ${p.words}; знаков с пробелами: ${p.chars}, без пробелов: ${p.charsNoSpaces}.`,
    `Объём по тексту: примерно ${String(p.pagesBy1800).replace('.', ',')} стр. (1 800 знаков на страницу).` +
      (p.approxPages ? ` По отметкам Word: примерно ${p.approxPages} стр.` : ''),
    `Абзацев вне таблиц: ${p.paragraphs}, из них пустых: ${p.emptyParagraphs}.`,
    `Разделов: ${p.sections}; заголовков: ${p.headings}; рисунков: ${p.figures}; таблиц: ${p.tables}; источников: ${p.sources}.`,
  ],
  pdfReminderTitle: 'Перед сдачей',

  // Эвристики
  dismiss: 'Здесь это есть',
  dismissHint: 'Отметка действует, пока открыта страница, и убирает правило из оценки.',
  dismissed: 'Вы отметили: «здесь это есть». Правило не входит в оценку.',
  undismiss: 'Вернуть замечание',

  // Предпросмотр
  previewTitle: 'Текст работы',
  previewHint: 'Упрощённый вид по абзацам, не копия Word. Пустые абзацы показаны знаком ¶.',
  previewEmpty: '¶',
  previewTable: 'ячейка таблицы',
  showInText: 'Показать в тексте',

  // Экспорт
  print: 'Печать / PDF',
  downloadJson: 'Скачать JSON',
  copyList: 'Скопировать список замечаний',
  copied: 'Список замечаний скопирован.',
  copyFailed: 'Не удалось скопировать: браузер не разрешил доступ к буферу обмена.',
  reportFileName: 'отчёт-нормоконтроль.json',

  // Редактор требований
  editProfile: 'Редактор требований',
  closeEditor: 'Закрыть редактор',
  editorTitle: 'Редактор требований',
  editorIntro:
    'Здесь можно включить или выключить правило, поменять серьёзность и числа. Изменения сохраняются в этом браузере как ваш профиль.',
  editorName: 'Название профиля',
  editorEnabled: 'включено',
  editorSeverity: 'серьёзность',
  editorParams: 'параметры',
  editorJsonHint: 'список или объект в формате JSON',
  editorListHint: 'по одному значению в строке',
  editorPending: 'Пока не проверяются (значения сохраняются в профиле)',
  editorApply: 'Применить',
  editorReset: 'Сбросить по умолчанию',
  editorSave: 'Сохранить в файл',
  editorLoad: 'Загрузить из файла',
  editorShare: 'Скопировать ссылку на профиль',
  editorShared:
    'Ссылка на профиль скопирована. Профиль записан в адресе после «#» и не отправляется на сервер.',
  editorApplied: (title: string): string => `Профиль «${title}» применён.`,
  editorInvalid: 'В профиле есть ошибки:',
  editorBadJson: (name: string): string => `Параметр «${name}»: это не JSON.`,
  customSuffix: '(мой)',
  editorTopics: 'Темы проекта',
  editorTopicsHint:
    'Темы, которые учитель просил раскрыть в теоретической части (правило TH-03). По одной на строке: «Название темы: слово1, слово2». Слова ищутся по началу: «сценар» найдёт «сценарий» и «сценарист».',

  // Сравнение версий (этап 3)
  compareTitle: 'Сравнение с прошлой версией',
  compareSummary: (fixed: number, remaining: number, added: number): string =>
    `Исправлено: ${fixed} · осталось: ${remaining} · появилось новых: ${added}.`,
  compareScore: (before: number, after: number): string =>
    `Оценка: было ${before}, стало ${after} (${after >= before ? '+' : ''}${after - before}).`,
  compareFixed: 'Что исправлено',
  compareAdded: 'Что появилось нового',

  // Автоисправление (этап 4)
  fixTitle: 'Исправить автоматически',
  fixIntro:
    'Программа может сама исправить безопасные вещи: поля, шрифт, интервалы, отступы, пустые абзацы, разрывы страниц, простую типографику. Исходный файл не меняется: получится новый файл «…_исправлено.docx». Отметьте, что исправить:',
  fixRuleLine: (title: string, id: string, count: number): string =>
    `${title} (${id}): ${count} ${plural(count, ['место', 'места', 'мест'])}`,
  fixButton: 'Исправить и скачать',
  fixNothing: 'Отметьте хотя бы одно правило.',
  fixWorking: 'Исправляю…',
  fixDone: (fixed: number, manual: number): string =>
    `Исправлено автоматически: ${fixed} ${plural(fixed, ['место', 'места', 'мест'])}; требует ручной правки: ${manual}. Проверьте документ глазами перед сдачей.`,
  fixNumbered: 'Удалены пустые пункты списка: проверьте нумерацию списков.',
  fixFailed: 'Исправить файл не удалось, исходный файл не изменён.',
  fixCheckNew: 'Проверить исправленный файл',
  fixedName: (name: string): string => `${name.replace(/\.docx$/i, '')}_исправлено.docx`,

  // Режим учителя (этап 4)
  teacherOpen: 'Режим учителя',
  teacherClose: 'Закрыть режим учителя',
  teacherTitle: 'Режим учителя: несколько работ',
  teacherIntro:
    'Выберите сразу несколько файлов .docx. Каждая работа проверяется по выбранным требованиям; файлы никуда не отправляются.',
  teacherChoose: 'Выбрать файлы',
  teacherProgress: (done: number, total: number): string => `Проверено ${done} из ${total}…`,
  teacherDone: (total: number): string => `Проверено работ: ${total}.`,
  teacherColumns: [
    'Файл',
    'Оценка',
    'Ошибок',
    'Замечаний',
    'Три главные проблемы',
    '',
  ] as readonly string[],
  teacherSortBy: (column: string): string => `Сортировать по столбцу «${column}»`,
  teacherOpenReport: 'Открыть отчёт',
  teacherBroken: 'не читается',
  teacherCsv: 'Скачать таблицу CSV',
  teacherCsvName: 'работы-нормоконтроль.csv',
  hashProfile: (title: string): string => `Профиль из ссылки: «${title}».`,
  hashProfileBroken: 'Ссылка на профиль повреждена, профиль не загружен.',
} as const;

export const SEVERITY_NAMES: Record<Severity, string> = {
  error: 'ошибка',
  warning: 'замечание',
  info: 'совет',
};

export const GROUP_NAMES = {
  toc: 'в содержании',
  'title-page': 'на титульном листе',
} as const;

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
