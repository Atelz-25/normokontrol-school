// Тексты правил: название, «почему так принято», «как исправить в Word» и сообщения.
// Лежат в i18n, чтобы все русские тексты были в одном месте (бриф, раздел 2.8).
// Модуль чистый (без DOM), поэтому его можно импортировать из ядра.
import type { NumberSpec } from '../core/rules/params.ts';

export interface RuleText {
  title: string;
  why: string;
  howToFixWord: string;
}

// 1.25 → «1,25»: в русском тексте десятичная запятая.
export const fmt = (value: number, digits = 2): string =>
  String(Math.round(value * 10 ** digits) / 10 ** digits).replace('.', ',');

export function describeSpec(spec: NumberSpec, unit: string): string {
  const u = unit === '' ? '' : ` ${unit}`;
  switch (spec.mode) {
    case 'equals':
      return spec.tolerance > 0
        ? `${fmt(spec.value)}${u} (±${fmt(spec.tolerance)})`
        : `${fmt(spec.value)}${u}`;
    case 'oneOf':
      return `${spec.values.map((v) => fmt(v)).join(' или ')}${u}`;
    case 'atLeast':
      return `не меньше ${fmt(spec.value)}${u}`;
    case 'atMost':
      return `не больше ${fmt(spec.value)}${u}`;
  }
}

// Склонение по числу: 1 абзац, 2 абзаца, 5 абзацев (а также 21 абзац, 11 абзацев).
export function plural(n: number, forms: [one: string, few: string, many: string]): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
  return forms[2];
}

// «в 10 из 37 абзацев», «в 1 из 21 абзаца»: после «из» нужен родительный падеж.
export const where = (count: number, of: number, genitive: [one: string, many: string]): string =>
  `${count} из ${of} ${plural(of, [genitive[0], genitive[1], genitive[1]])}`;

const EMPTY_FORMS: [string, string, string] = ['пустой абзац', 'пустых абзаца', 'пустых абзацев'];
const PARAGRAPH_FORMS: [string, string, string] = ['абзац', 'абзаца', 'абзацев'];

const MARGIN_HOW =
  'Макет → Поля → Настраиваемые поля. Впишите значение и нажмите «Применить: ко всему документу».';

export const RULE_TEXTS: Record<string, RuleText> = {
  'PG-01': {
    title: 'Формат листа A4, книжная ориентация',
    why: 'Работу печатают и читают на листах A4. Другой размер или альбомная ориентация меняют вёрстку всех страниц.',
    howToFixWord: 'Макет → Размер → A4. Макет → Ориентация → Книжная.',
  },
  'PG-02': {
    title: 'Левое поле',
    why: 'Левое поле оставляют под переплёт или скобы, поэтому оно шире остальных. Поля задают в настройках страницы, а не отступами.',
    howToFixWord: MARGIN_HOW,
  },
  'PG-03': {
    title: 'Правое поле',
    why: 'Одинаковые поля на всех страницах делают текст ровным и аккуратным.',
    howToFixWord: MARGIN_HOW,
  },
  'PG-04': {
    title: 'Верхнее поле',
    why: 'Одинаковые поля на всех страницах делают текст ровным и аккуратным.',
    howToFixWord: MARGIN_HOW,
  },
  'PG-05': {
    title: 'Нижнее поле',
    why: 'Внизу страницы стоит номер; поле должно оставлять для него место.',
    howToFixWord: MARGIN_HOW,
  },
  'PG-06': {
    title: 'Одинаковые поля во всех разделах',
    why: 'Если документ разбит на разделы, у каждого могут быть свои поля. Разные поля заметны при листании.',
    howToFixWord:
      'Выделите весь текст (Ctrl+A) → Макет → Поля → Настраиваемые поля → «Применить: ко всему документу».',
  },
  'FT-01': {
    title: 'Шрифт основного текста',
    why: 'Требование к гарнитуре одно для всей работы; другой шрифт сразу бросается в глаза.',
    howToFixWord:
      'Выделите текст → Главная → поле «Шрифт» → нужная гарнитура. Для всего документа: Ctrl+A.',
  },
  'FT-02': {
    title: 'Размер шрифта основного текста',
    why: 'Размер шрифта влияет на объём и читаемость; его задаёт методичка.',
    howToFixWord: 'Выделите текст → Главная → поле «Размер шрифта» → нужное значение.',
  },
  'FT-03': {
    title: 'Единая гарнитура во всём документе',
    why: 'Случайные шрифты обычно приходят вместе со скопированным текстом и выдают «копипасту».',
    howToFixWord:
      'Выделите фрагмент → Главная → Очистить всё форматирование (кнопка с ластиком), затем задайте нужный шрифт.',
  },
  'FT-04': {
    title: 'Цвет текста',
    why: 'Текст работы печатают чёрным. Цветной текст часто остаётся от копирования с сайтов.',
    howToFixWord: 'Выделите текст → Главная → Цвет шрифта → «Авто».',
  },
  'PR-01': {
    title: 'Межстрочный интервал',
    why: 'Интервал задаёт методичка; от него зависят объём и удобство чтения.',
    howToFixWord:
      'Главная → Абзац (стрелка в углу группы) → Интервал → Междустрочный → «1,5 строки».',
  },
  'PR-02': {
    title: 'Интервалы перед абзацем и после него',
    why: 'Лишние интервалы между абзацами выглядят как пропуски и раздувают объём.',
    howToFixWord: 'Главная → Абзац → Интервал → «Перед: 0 пт», «После: 0 пт».',
  },
  'PR-03': {
    title: 'Красная строка (абзацный отступ)',
    why: 'Красная строка показывает начало абзаца. Учитель требует её в основном тексте, одинаковую везде.',
    howToFixWord:
      'Главная → Абзац → Отступ → Первая строка: «Отступ», на 1,25 см. Не используйте пробелы и клавишу Tab.',
  },
  'PR-04': {
    title: 'Выравнивание основного текста',
    why: '«От края до края» — это выравнивание по ширине: правый край текста ровный.',
    howToFixWord: 'Выделите текст → Главная → «Выровнять по ширине» (Ctrl+J).',
  },
  'PR-05': {
    title: 'Отступ пробелами или табуляцией',
    why: 'Пробелы и Tab сдвигают текст по-разному на разных устройствах; отступы задают в настройках абзаца.',
    howToFixWord:
      'Включите знаки форматирования (Главная → ¶), удалите пробелы и табуляции в начале, задайте отступ в окне «Абзац».',
  },
  'PR-06': {
    title: 'Пустой абзац между абзацами',
    why: 'Учитель не принимает «пропуски» между абзацами: они раздувают объём и по-разному выглядят на телефоне, планшете и компьютере.',
    howToFixWord:
      'Включите знаки форматирования (Главная → ¶) и удалите пустые строки: абзацы идут подряд, без пропусков.',
  },
  'PR-08': {
    title: 'Интервал в таблице паспорта проекта',
    why: 'Учитель назвала это отдельным пунктом: в таблице паспорта интервал одинарный («единичка»), без отступов до и после.',
    howToFixWord:
      'Выделите таблицу → Главная → Абзац → Междустрочный «Одинарный», интервалы «Перед» и «После» 0 пт.',
  },
  'PR-09': {
    title: 'Правый отступ абзаца',
    why: 'Поля задают в разметке страницы. Если у абзацев разный правый отступ, правый край текста неровный и «от края до края» не выходит.',
    howToFixWord: 'Выделите весь текст (Ctrl+A) → Главная → Абзац → Отступ → «Справа: 0 см».',
  },
  'PR-10': {
    title: 'Серии пустых абзацев («дырки»)',
    why: 'Так «двигают» текст на следующую страницу. На другом устройстве страницы ломаются иначе, и в работе появляются пустые места.',
    howToFixWord:
      'Включите знаки форматирования (Главная → ¶), удалите лишние пустые абзацы, а перед новой частью поставьте разрыв страницы (Ctrl+Enter).',
  },
  'PB-01': {
    title: 'Каждая часть начинается с новой страницы',
    why: 'Пустые строки сдвигают текст по-разному в Word, на телефоне и в другой программе, и заголовок оказывается внизу или посреди страницы. Разрыв страницы всегда переносит на новую страницу.',
    howToFixWord:
      'Поставьте курсор перед заголовком → Вставка → Разрыв страницы (Ctrl+Enter). Надёжнее: Абзац → Положение на странице → «С новой страницы».',
  },
  'TY-01': {
    title: 'Двойные пробелы',
    why: 'Лишние пробелы при выравнивании по ширине дают заметные «дыры» в строке.',
    howToFixWord:
      'Главная → Заменить (Ctrl+H): найти два пробела, заменить на один, «Заменить все» (повторите, пока замен не станет 0).',
  },
  'TY-02': {
    title: 'Пробелы вокруг знаков препинания',
    why: 'По правилам русской типографики перед запятой, точкой, двоеточием и подобными знаками пробела нет, а после него есть.',
    howToFixWord: 'Удалите пробел перед знаком препинания и поставьте после него.',
  },
  'TY-03': {
    title: 'Дефис вместо тире',
    why: 'Между словами ставят тире «–» с пробелами, а не короткий дефис «-».',
    howToFixWord:
      'Главная → Заменить (Ctrl+H): найти « - », заменить на « – » (тире: Ctrl+минус на цифровой клавиатуре).',
  },
  'DC-01': {
    title: 'Не удалены правки и примечания',
    why: 'Исправления в режиме рецензирования и примечания видны учителю и мешают читать работу.',
    howToFixWord:
      'Рецензирование → Принять → «Применить все исправления»; Рецензирование → Удалить → «Удалить все примечания в документе».',
  },
};

export const CATEGORY_NAMES: Record<string, string> = {
  page: 'Страница',
  font: 'Шрифт',
  paragraph: 'Абзац',
  structure: 'Структура',
  typography: 'Типографика',
  document: 'Документ',
};

export const SIDE_NAMES = {
  top: 'верхнее',
  right: 'правое',
  bottom: 'нижнее',
  left: 'левое',
} as const;

// Сообщения правил. Ядро передаёт числа, слова выбираются здесь.
export const msg = {
  pageSize: (w: number, h: number, expected: string): string =>
    `Размер листа ${fmt(w, 0)}×${fmt(h, 0)} мм, нужен ${expected}.`,
  landscape: (): string => 'Раздел в альбомной ориентации, нужна книжная.',
  margin: (side: keyof typeof SIDE_NAMES, actual: number, expected: string): string =>
    `${capitalize(SIDE_NAMES[side])} поле ${fmt(actual, 1)} мм, нужно ${expected}.`,
  marginsDiffer: (section: number): string =>
    `Поля раздела ${section} отличаются от полей первого раздела.`,
  fonts: (fonts: string[], expected: string): string =>
    `Шрифт ${fonts.join(', ')}, нужен ${expected}.`,
  sizes: (sizes: number[], expected: string): string =>
    `Размер шрифта ${sizes.map((s) => `${fmt(s, 1)} pt`).join(', ')}, нужен ${expected}.`,
  foreignFont: (fonts: string[]): string => `Посторонний шрифт: ${fonts.join(', ')}.`,
  color: (colors: string[]): string => `Цветной текст: ${colors.map((c) => `#${c}`).join(', ')}.`,
  lineSpacing: (actual: string, expected: string): string =>
    `Межстрочный интервал ${actual}, нужен ${expected}.`,
  lineExact: (pt: number): string => `точно ${fmt(pt, 1)} pt`,
  spacing: (before: number, after: number, expected: string): string =>
    `Интервал перед ${fmt(before, 1)} pt, после ${fmt(after, 1)} pt; нужно ${expected}.`,
  firstLine: (actual: number, expected: string): string =>
    actual === 0
      ? `Нет красной строки, нужна ${expected}.`
      : `Красная строка ${fmt(actual)} см, нужна ${expected}.`,
  indentSpread: (values: string): string => `Сейчас в тексте встречаются отступы: ${values}.`,
  align: (actual: string): string =>
    `Выравнивание «${ALIGN_NAMES[actual] ?? actual}», нужно по ширине.`,
  spacesLine: (length: number): string => `Строка из ${length} пробелов вместо настройки отступов.`,
  leadingWhitespace: (): string => 'Отступ сделан пробелами или табуляцией.',
  emptyParagraph: (numbered: boolean): string =>
    numbered ? 'Пустой пункт списка между абзацами.' : 'Пустой абзац между абзацами.',
  emptySeries: (length: number, before?: string): string =>
    `Подряд ${length} ${plural(length, EMPTY_FORMS)}` +
    (before ? ` перед заголовком «${before}».` : '.'),
  passportTable: (problems: string[]): string => `В таблице паспорта: ${problems.join('; ')}.`,
  rightIndent: (actual: number, expected: string): string =>
    `Правый отступ ${fmt(actual)} см, нужен ${expected}.`,
  noPageBreak: (title: string, empties: number, approxTop: boolean): string =>
    `Перед частью «${title}» нет разрыва страницы` +
    (empties > 0 ? `, вместо него ${empties} ${plural(empties, EMPTY_FORMS)}` : '') +
    // «Из-за пустых строк» — только если они действительно есть (RULES-SCHOOL, раздел 10.3).
    (approxTop && empties > 0
      ? ' (сейчас заголовок, примерно, вверху страницы, но только из-за пустых строк)'
      : '') +
    '.',
  doubleSpaces: (count: number): string => `Двойные пробелы: ${count}.`,
  punctuation: (count: number): string => `Пробелы вокруг знаков препинания: ${count}.`,
  hyphenDash: (count: number): string => `Дефис вместо тире: ${count}.`,
  revisions: (count: number): string => `В документе остались непринятые исправления: ${count}.`,
  comments: (count: number): string => `В документе остались примечания: ${count}.`,
};

export const summary = {
  paragraphs: (affected: number, checked: number): string =>
    `Замечание в ${where(affected, checked, ['абзаца', 'абзацев'])}.`,
  sections: (affected: number, checked: number): string =>
    `Замечание в ${where(affected, checked, ['раздела', 'разделов'])}.`,
  empties: (count: number, total: number): string =>
    `${count} ${plural(count, ['одиночный пустой абзац', 'одиночных пустых абзаца', 'одиночных пустых абзацев'])} (всего абзацев вне таблиц: ${total}).`,
  series: (series: number, empties: number, longest: number): string =>
    `${series} ${plural(series, ['серия', 'серии', 'серий'])} пустых абзацев, в них ${empties} ${plural(empties, PARAGRAPH_FORMS)}; самая длинная — ${longest}.`,
  breaks: (missing: number, needed: number): string =>
    `Разрыв страницы есть перед ${where(needed - missing, needed, ['части', 'частей'])}.`,
  passport: (affected: number, checked: number, withText: number): string =>
    `Замечание в ${where(affected, checked, ['абзаца', 'абзацев'])} таблицы (${withText} ${plural(withText, PARAGRAPH_FORMS)} с текстом).`,
  occurrences: (count: number, paragraphs: number): string =>
    `${count} ${plural(count, ['место', 'места', 'мест'])} в ${paragraphs} ${plural(paragraphs, ['абзаце', 'абзацах', 'абзацах'])}.`,
  // Отдельные группы в отчёте (RULES-SCHOOL, раздел 10): титульный лист и содержание.
  group: (group: 'title-page' | 'toc', count: number): string =>
    `${group === 'title-page' ? 'На титульном листе' : 'В содержании'}: ${count} ${plural(count, ['место', 'места', 'мест'])}.`,
  main: (count: number): string =>
    `В тексте работы: ${count} ${plural(count, ['место', 'места', 'мест'])}.`,
};

const ALIGN_NAMES: Record<string, string> = {
  left: 'по левому краю',
  center: 'по центру',
  right: 'по правому краю',
  both: 'по ширине',
};

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
