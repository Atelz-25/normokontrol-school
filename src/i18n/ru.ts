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
    'Здесь можно включить или выключить правило, поменять серьёзность и числа. Изменения сохраняются в этом браузере как ваши требования.',
  editorName: 'Название',
  editorEnabled: 'включено',
  editorSeverity: 'серьёзность',
  editorParams: 'параметры',
  editorJsonHint: 'список или объект в формате JSON',
  editorListHint: 'по одному значению в строке',
  editorPending: 'Пока не проверяются (значения сохраняются)',
  editorApply: 'Применить',
  editorReset: 'Сбросить по умолчанию',
  editorSave: 'Сохранить в файл',
  editorLoad: 'Загрузить из файла',
  editorShare: 'Скопировать ссылку на требования',
  editorShared:
    'Ссылка скопирована. Требования записаны в адресе после «#» и не отправляются на сервер.',
  editorApplied: (title: string): string => `Требования «${title}» применены.`,
  editorInvalid: 'В требованиях есть ошибки:',
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
  teacherTitle: 'Проверка нескольких работ',
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
  hashProfile: (title: string): string => `Требования из ссылки: «${title}».`,
  hashProfileBroken: 'Ссылка на требования повреждена, они не загружены.',

  // --- Структура v2: навигация, экраны, вердикт и план исправления ---
  nav: {
    check: 'Проверить работу',
    teacher: 'Для учителя',
    profile: 'Требования',
    how: 'Как это работает',
  },
  navLabel: 'Разделы сайта',
  startTitle: 'Проверьте работу до того, как её проверит учитель',
  startLead:
    'Перетащите файл .docx на лист. Программа найдёт поля, шрифты и пустые строки не по требованиям и покажет, как исправить их в Word. PDF тоже можно: по нему проверка короче.',
  dropHint: 'или перетащите его на лист',
  requirementsLine: 'Требования:',
  requirementsChange: 'изменить',
  requirementsDone: 'готово',
  privacyShort: 'Файл не покидает компьютер: проверка идёт прямо в браузере.',
  checkingTitle: (name: string): string => `Проверяю «${name}»`,
  stepsLabel: 'Ход проверки',
  steps: {
    archive: 'Читаю файл',
    styles: 'Разбираю стили',
    paragraphs: 'Собираю абзацы',
    rules: 'Проверяю по требованиям',
  },
  stepDone: 'готово',
  fileMeta: (paragraphs: number, pages?: number): string =>
    (pages
      ? `примерно ${pages}\u00a0${plural(pages, ['страница', 'страницы', 'страниц'])}, `
      : '') + `${paragraphs}\u00a0${plural(paragraphs, ['абзац', 'абзаца', 'абзацев'])}`,
  otherFile: 'Другой файл',
  compareWith: 'Сравнить с прошлой версией',
  verdict: {
    early: 'Пока рано сдавать',
    almost: 'Почти готово',
    ready: 'Можно сдавать',
  },
  verdictLine: (problems: number, self: number): string =>
    `${problems}\u00a0${plural(problems, ['проблема', 'проблемы', 'проблем'])}` +
    (self === 0
      ? ', исправлять придётся вручную.'
      : self === problems
        ? problems === 1
          ? ', программа исправит её сама.'
          : ', все программа исправит сама.'
        : `, ${self} из них программа исправит сама.`),
  verdictReady: 'Поля, шрифт, интервалы, пустые строки и части работы — по требованиям.',
  verdictAdvice: (n: number): string =>
    n === 0
      ? ''
      : ` ${n === 1 ? 'Остался' : 'Осталось'} ${n}\u00a0${plural(n, ['совет', 'совета', 'советов'])}.`,
  fixHint: 'Получится новый файл, ваш останется как был.',
  scoreSmall: 'оценка',
  planTitle: 'План исправления',
  planIntroPriority:
    'Сначала то, за что учитель уже снижал баллы, потом остальные ошибки и замечания.',
  planIntro: 'Сначала ошибки, потом замечания и советы.',
  placesCount: (n: number): string => `${n}\u00a0${plural(n, ['место', 'места', 'мест'])}`,
  selfAll: 'исправлю сам',
  selfSome: 'частично исправлю сам',
  placeOf: (i: number, n: number): string => `${i} из ${n}`,
  prevPlace: 'Предыдущее место',
  nextPlace: 'Следующее место',
  whyShort: 'Почему',
  howShort: 'Как в Word',
  allPlaces: 'Все места',
  done: 'Сделал',
  undo: 'Вернуть в план',
  copySearch: 'Скопировать для поиска',
  copiedSearch: 'Скопировано: вставьте в поиск Word (Ctrl+F).',
  placePage: (n: number): string => `стр. ${n}`,
  placeNear: { in: 'абзац', after: 'после', before: 'перед' },
  morePlan: (n: number): string => `Ещё ${n}\u00a0${plural(n, ['пункт', 'пункта', 'пунктов'])}`,
  placesColumns: ['Где', 'Рядом с текстом', 'Что не так'] as readonly string[],
  showPlace: 'Показать',
  moreRows: (n: number): string => `Показать ещё ${n}`,
  goodTitle: (n: number): string => `Что уже хорошо (${n})`,
  titlePageTitle: 'Титульный лист: на усмотрение учителя',
  titlePageIntro:
    'Требования к титульному листу у учителей разные, поэтому эти замечания не входят в план.',
  exportTitle: 'Сохранить отчёт: печать, PDF, JSON',
  tabsLabel: 'Что показать',
  tabPlan: 'План',
  tabText: 'Текст работы',
  barPrev: '‹ Назад',
  barNext: 'Дальше ›',
  barCounter: (i: number, n: number): string => `место ${i} из ${n}`,
  keysTitle: 'Клавиши',
  keysList: [
    'J — следующее место',
    'K — предыдущее место',
    '? — эта подсказка',
    'Esc — закрыть',
  ] as readonly string[],
  keysClose: 'Закрыть',
  whyPause: 'Пауза',
  whyPlay: 'Показать ещё раз',
  whyFrame: (i: number): string => (i === 0 ? 'у тебя в Word' : 'у учителя'),
  rulerLabel: 'Левое поле',
  rulerNeed: (mm: number): string => `нужно ${mm}\u00a0мм`,
  rulerNow: (mm: number): string => `сейчас ${mm}\u00a0мм`,
  compareShort: (fixed: number, remaining: number, added: number): string =>
    `Исправлено: ${fixed}, осталось: ${remaining}, новых: ${added}.`,
  compareScoreLabel: 'Оценка',
  howSections: [
    [
      'Файл не покидает компьютер',
      'Проверка идёт прямо в браузере, в отдельном потоке. Сайту запрещено отправлять что-либо в сеть: так настроена политика безопасности страницы.',
    ],
    [
      'Что проверяется',
      'Программа читает файл .docx так же, как Word: поля, стили, шрифты, отступы, пустые абзацы, части работы и список литературы. Каждое правило сверяется с выбранными требованиями.',
    ],
    [
      'Чего программа не знает',
      'Номера страниц она берёт только из отметок Word, поэтому пишет «примерно». Некоторые проверки сделаны по признакам (эвристики) и могут ошибаться: у таких пунктов есть кнопка «Здесь это есть».',
    ],
  ] as readonly (readonly [string, string])[],
  // Проверка PDF
  pdfTitle: 'Что проверено по PDF',
  pdfIntro:
    'В PDF нет абзацев и стилей, только буквы на страницах. Красную строку, пустые строки, интервалы и стили проверит только файл .docx.',
  pdfPages: (n: number): string => `${n}\u00a0${plural(n, ['страница', 'страницы', 'страниц'])}`,
  pdfLine: (failed: number, total: number): string =>
    failed === 0
      ? `Все ${total} проверок по PDF пройдены.`
      : `${failed} из ${total} проверок по PDF не пройдены.`,
  pdfPassed: 'в порядке',
  pdfHeuristic: 'эвристика: измерено по краю текста',
  pdfChecking: (name: string): string => `Читаю PDF «${name}»`,
  pdfPassword: 'PDF защищён паролем. Сохраните его из Word заново без пароля.',
  pdfBroken:
    'PDF повреждён и не читается. Сохраните его из Word заново (Файл → Сохранить как → PDF).',
  pdfLoadFailed: 'Не удалось загрузить модуль чтения PDF. Обновите страницу и попробуйте ещё раз.',
  templateButton: 'Скачать шаблон',
  templateHint: 'Файла ещё нет? Начните с шаблона: поля, шрифт и части работы уже настроены.',
  templateName: (title: string): string => `Шаблон пояснительной записки (${title}).docx`,
  templateDone: 'Шаблон скачан. Откройте его в Word и впишите свой текст.',
  planFilterLabel: 'Какие пункты показать',
  planFilter: { all: 'Все', errors: 'Только ошибки', self: 'Исправлю сам' },
  planSingle: 'По одному',
  planLeft: (n: number): string =>
    `${plural(n, ['Остался', 'Осталось', 'Осталось'])} ${n}\u00a0${plural(n, ['пункт', 'пункта', 'пунктов'])}. Нажмите «Сделал» — появится следующий.`,
  planAllDone: 'Всё отмечено как сделанное. Проверьте исправленный файл ещё раз.',
  profileTitle: 'Требования',
  profileCurrent: (title: string): string => `Сейчас выбраны: «${title}».`,
} as const;

// Тексты шаблона пояснительной записки (src/core/template/build.ts).
export const templateTexts = {
  titleLines: [
    'Полное название школы',
    'Индивидуальный итоговый проект',
    'по теме: «Тема проекта»',
    'Автор проекта: Фамилия Имя Отчество, класс',
    'Руководитель проекта: Фамилия Имя Отчество, должность',
    'Работа допущена к защите',
    `Город, ${new Date().getFullYear()}`, // правило титульного листа ищет год числом
  ],
  placeholder: (part: string): string =>
    `Напишите здесь текст части «${part}». Начните сразу с текста: красная строка, шрифт и интервал уже настроены.`,
  passportValue: 'Впишите ответ',
  tocHint:
    'Содержание соберётся само: щёлкните здесь правой кнопкой мыши и выберите «Обновить поле».',
  defaultParts: ['Содержание', 'Введение', 'Основная часть', 'Заключение', 'Список литературы'],
};

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
      return 'Это PDF, хотя имя файла заканчивается на .docx. Переименуйте его в .pdf или загрузите исходный файл .docx.';
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
