// План исправления: пункты — это действия ученика, а не номера правил. Одно действие может
// закрывать несколько правил: «Убрать пустые строки» — это и PR-06, и PR-10.
// Правило, которого нет ни в одном действии, становится отдельным пунктом с названием правила.

// Корректурный знак у пункта (рисуется в src/ui/marks.ts).
export type MarkName =
  'delete' | 'indent' | 'page' | 'margin' | 'insert' | 'close' | 'space' | 'replace';

// Мини-иллюстрация «у тебя в Word → у учителя на планшете» (src/ui/why.ts).
export type WhyName = 'empty' | 'page' | 'margin' | 'indent';

export interface ActionDef {
  id: string;
  title: string; // глагол: что сделать
  rules: string[];
  mark: MarkName;
  why?: WhyName;
}

const range = (prefix: string, from: number, to: number): string[] =>
  Array.from({ length: to - from + 1 }, (_, i) => `${prefix}-${String(from + i).padStart(2, '0')}`);

export const ACTIONS: ActionDef[] = [
  {
    id: 'empty',
    title: 'Убрать пустые строки между абзацами',
    rules: ['PR-06', 'PR-10', 'VL-02'],
    mark: 'delete',
    why: 'empty',
  },
  {
    id: 'pages',
    title: 'Начинать каждую часть с новой страницы',
    rules: ['PB-01'],
    mark: 'page',
    why: 'page',
  },
  {
    id: 'margins',
    title: 'Поставить поля страницы по требованиям',
    rules: range('PG', 1, 7),
    mark: 'margin',
    why: 'margin',
  },
  {
    id: 'indent',
    title: 'Сделать красную строку отступом абзаца',
    rules: ['PR-03', 'PR-05'],
    mark: 'indent',
    why: 'indent',
  },
  { id: 'right', title: 'Убрать отступ абзацев справа', rules: ['PR-09'], mark: 'close' },
  {
    id: 'spacing',
    title: 'Выровнять интервалы между строками и абзацами',
    rules: ['PR-01', 'PR-02', 'PR-08'],
    mark: 'close',
  },
  {
    id: 'align',
    title: 'Выровнять текст по ширине без ручных переносов',
    rules: ['PR-04', 'PR-07'],
    mark: 'close',
  },
  {
    id: 'font',
    title: 'Привести шрифт текста к одному виду',
    rules: range('FT', 1, 6),
    mark: 'replace',
  },
  { id: 'headings', title: 'Оформить заголовки', rules: range('HD', 1, 7), mark: 'replace' },
  { id: 'toc', title: 'Пересобрать содержание', rules: ['ST-03', 'ST-04'], mark: 'insert' },
  {
    id: 'parts',
    title: 'Добавить недостающие части работы',
    rules: ['ST-01', 'ST-02', 'ST-05', 'ST-06', 'ST-07', 'ST-08', 'ST-09', 'ST-10', 'PS-01'],
    mark: 'insert',
  },
  { id: 'numbers', title: 'Поставить номера страниц', rules: range('NM', 1, 4), mark: 'insert' },
  { id: 'theory', title: 'Дописать теоретическую часть', rules: range('TH', 1, 3), mark: 'insert' },
  {
    id: 'conclusion',
    title: 'Дописать в заключение ответы на вопросы',
    rules: range('CN', 1, 5),
    mark: 'insert',
  },
  {
    id: 'appendix',
    title: 'Заполнить приложение или убрать ссылку на него',
    rules: ['AP-01'],
    mark: 'insert',
  },
  { id: 'refs', title: 'Поправить список литературы', rules: range('RF', 1, 8), mark: 'replace' },
  {
    id: 'figures',
    title: 'Подписать и пронумеровать рисунки и таблицы',
    rules: [...range('FG', 1, 5), ...range('TB', 1, 4)],
    mark: 'insert',
  },
  {
    id: 'cleanup',
    title: 'Убрать следы черновика: маркер, правки, заготовки',
    rules: range('DC', 1, 5),
    mark: 'delete',
  },
  {
    id: 'typography',
    title: 'Поправить тире, кавычки и пробелы',
    rules: range('TY', 1, 11),
    mark: 'space',
  },
  { id: 'volume', title: 'Добрать объём работы', rules: ['VL-01'], mark: 'insert' },
  { id: 'file', title: 'Назвать файл по образцу', rules: ['FN-01'], mark: 'replace' },
];

// OUT-01 — напоминание перед сдачей, а не проверка: в план не попадает.
export const NOT_IN_PLAN = ['OUT-01'];

// Подписи к кадрам мини-иллюстраций «Почему».
export const WHY_FRAMES: Record<WhyName, [string, string]> = {
  empty: [
    'У тебя в Word: пустые строки выглядят как ровные промежутки.',
    'У учителя на планшете: промежутки съезжают, на странице появляются дыры.',
  ],
  page: [
    'У тебя в Word: новая часть начинается сразу после предыдущей.',
    'У учителя: заголовок части оказывается внизу страницы, текст — на следующей.',
  ],
  margin: [
    'У тебя в Word: поле узкое, текста помещается больше.',
    'У учителя в папке: левый край уходит под скрепку и не читается.',
  ],
  indent: [
    'У тебя в Word: абзацы начинаются пробелами и выглядят ровно.',
    'У учителя на другом экране: пробелы съезжают, края абзацев «пляшут».',
  ],
};
