// Пары «хорошо/плохо» для каждого правила этапа 1. Отсюда их берут и тесты
// (в памяти), и скрипт `npm run fixtures` (пишет файлы в fixtures/<ID>/).
// Тексты вымышленные, без персональных данных.
import {
  MM,
  SCHOOL_MARGINS,
  buildDocx,
  empty,
  emptyRun,
  p,
  pageBreak,
  pageNumber,
  sectPr,
  table,
} from './docx-builder.ts';
import {
  CONCLUSION,
  INTRO,
  LITERATURE,
  PASSPORT_ROWS as SCHOOL_PASSPORT,
  TITLE_LINES,
  schoolDoc,
} from './school-doc.ts';

const T1 = 'Первый абзац основного текста, в нём описывается тема проекта.';
const T2 = 'Второй абзац продолжает мысль и приводит пример из практики.';
const T3 = 'Третий абзац подводит промежуточный итог рассуждения.';
const T4 = 'Четвёртый абзац завершает раздел и связывает его со следующим.';
const BODY = [p(T1), p(T2), p(T3), p(T4)];

const doc = (body: string[], extra: Partial<Parameters<typeof buildDocx>[0]> = {}): Uint8Array =>
  buildDocx({ body, ...extra });

// Документ из трёх частей: перед каждой либо пустые строки, либо «С новой страницы».
function threeParts(withBreaks: boolean): Uint8Array {
  const heading = (title: string): string =>
    p(title, {
      pPr: withBreaks ? '<w:pageBreakBefore/><w:jc w:val="center"/>' : '<w:jc w:val="center"/>',
    });
  const gap = withBreaks ? [] : emptyRun(10);
  return doc([
    p('Титульный лист: название проекта'),
    ...gap,
    heading('Введение'),
    p(T1),
    ...gap,
    heading('Заключительная часть'),
    p(T2),
    ...gap,
    heading('Литература'),
    p('[1] Иванов И. И. Книга о кино. — М., 2020.'),
  ]);
}

const PASSPORT_ROWS = [
  ['Тема проекта', 'Как снять короткий фильм'],
  ['Учебный предмет', 'Литература'],
  ['Вид проекта', 'Творческий'],
  ['Цель проекта', 'Снять фильм'],
];

function passport(line: number): Uint8Array {
  return doc([
    p('Титульный лист'),
    p('Паспорт проекта', { pPr: '<w:jc w:val="center"/>' }),
    table(
      PASSPORT_ROWS,
      `<w:spacing w:before="0" w:after="0" w:line="${line}" w:lineRule="auto"/><w:ind w:firstLine="0"/><w:jc w:val="left"/>`,
    ),
    empty(),
    p('Содержание', { pPr: '<w:pageBreakBefore/>' }),
  ]);
}

export interface FixturePair {
  good: () => Uint8Array;
  bad: () => Uint8Array;
  // Для FN-01: имя файла «хорошее» и «плохое» (документ один и тот же).
  fileName?: { good: string; bad: string };
  // Настройка правила для теста, если в профиле школы оно выключено (HD-06).
  override?: { enabled: boolean; params: Record<string, unknown> };
}

export const FIXTURES: Record<string, FixturePair> = {
  'PG-01': {
    good: () => doc(BODY),
    bad: () => doc(BODY, { finalSectPr: sectPr(SCHOOL_MARGINS, { w: 12240, h: 15840 }) }), // Letter
  },
  'PG-02': {
    good: () => doc(BODY),
    bad: () => doc(BODY, { finalSectPr: sectPr({ ...SCHOOL_MARGINS, left: MM(15) }) }),
  },
  'PG-03': {
    good: () => doc(BODY),
    bad: () => doc(BODY, { finalSectPr: sectPr({ ...SCHOOL_MARGINS, right: MM(30) }) }),
  },
  'PG-04': {
    good: () => doc(BODY),
    bad: () => doc(BODY, { finalSectPr: sectPr({ ...SCHOOL_MARGINS, top: MM(10) }) }),
  },
  'PG-05': {
    good: () => doc(BODY),
    bad: () => doc(BODY, { finalSectPr: sectPr({ ...SCHOOL_MARGINS, bottom: MM(40) }) }),
  },
  'PG-06': {
    good: () => doc([p(T1, { pPr: sectPr() }), p(T2)]),
    bad: () => doc([p(T1, { pPr: sectPr({ ...SCHOOL_MARGINS, left: MM(20) }) }), p(T2)]),
  },
  'PG-07': {
    good: () => doc(BODY),
    // Левое 30 + правое 20 = 50 мм вместо 40.
    bad: () => doc(BODY, { finalSectPr: sectPr({ ...SCHOOL_MARGINS, right: MM(20) }) }),
  },
  'FT-01': {
    good: () => doc(BODY),
    bad: () => doc([p(T1), p(T2, { rPr: '<w:rFonts w:ascii="Arial" w:hAnsi="Arial"/>' })]),
  },
  'FT-02': {
    good: () => doc(BODY),
    bad: () => doc([p(T1), p(T2, { rPr: '<w:sz w:val="28"/>' })]),
  },
  'FT-03': {
    good: () => doc(BODY),
    bad: () =>
      doc([p(T1), p(T2, { rPr: '<w:rFonts w:ascii="Comic Sans MS" w:hAnsi="Comic Sans MS"/>' })]),
  },
  'FT-04': {
    good: () => doc(BODY),
    bad: () => doc([p(T1), p(T2, { rPr: '<w:color w:val="FF0000"/>' })]),
  },
  'PR-01': {
    good: () => doc(BODY),
    bad: () => doc([p(T1), p(T2, { pPr: '<w:spacing w:line="240" w:lineRule="auto"/>' })]),
  },
  'PR-02': {
    good: () => doc(BODY),
    bad: () => doc([p(T1), p(T2, { pPr: '<w:spacing w:after="200"/>' })]),
  },
  'PR-03': {
    good: () => doc([p(T1), p(T2, { pPr: '<w:ind w:firstLine="851"/>' })]), // 1,5 см и 1,501 см
    bad: () =>
      doc([
        p(T1, { pPr: '<w:ind w:firstLine="850"/>' }),
        p(T2, { pPr: '<w:ind w:firstLine="360"/>' }),
        p(T3, { pPr: '<w:ind w:firstLine="0"/>' }),
      ]),
  },
  'PR-04': {
    good: () => doc(BODY),
    bad: () => doc([p(T1), p(T2, { pPr: '<w:jc w:val="left"/>' })]),
  },
  'PR-05': {
    good: () => doc(BODY),
    bad: () => doc([p(T1), p(`     ${T2}`), p(`\t${T3}`)]),
  },
  'PR-06': {
    good: () => doc(BODY),
    bad: () => doc([p(T1), empty(), p(T2), empty(), p(T3), empty(), p(T4)]),
  },
  'PR-08': {
    good: () => passport(240),
    bad: () => passport(360),
  },
  'PR-09': {
    good: () => doc(BODY),
    bad: () => doc([p(T1, { pPr: '<w:ind w:right="284"/>' }), p(T2)]),
  },
  'PR-10': {
    good: () => threeParts(true),
    bad: () => threeParts(false),
  },
  'PB-01': {
    good: () => threeParts(true),
    bad: () => threeParts(false),
  },
  'TY-01': {
    good: () => doc(BODY),
    bad: () => doc([p('Здесь  стоят два пробела подряд.')]),
  },
  'TY-02': {
    // То, что не ошибка: имена файлов с точкой, двоеточие внутри слова и « : » в списке литературы.
    good: () =>
      doc([
        p('Введение'),
        p('Файл формата .docx открывает и Word, и программа на Node.js.'),
        p('Абзац в файле — это элемент w:p, а прогон текста — w:r; встреча в 10:30.'),
        p('Литература'),
        p('1. Мильчин А. Э. Справочник издателя и автора. — Москва : Наука, 2014.'),
      ]),
    bad: () =>
      doc([
        p('Пробел перед запятой , и без пробела после,так нельзя.'),
        p('Пробел перед точкой в конце предложения .'),
      ]),
  },
  'TY-03': {
    good: () => doc([p('Кино – это искусство.')]),
    bad: () => doc([p('Кино - это искусство.')]),
  },
  'DC-01': {
    good: () => doc(BODY),
    bad: () =>
      doc(
        [
          '<w:p><w:ins w:id="1" w:author="Тест" w:date="2026-01-01T00:00:00Z"><w:r><w:t>Вставленный текст.</w:t></w:r></w:ins></w:p>',
          `<w:p><w:r><w:t>${T1}</w:t></w:r><w:r><w:commentReference w:id="0"/></w:r></w:p>`,
        ],
        { comments: ['Исправь здесь'] },
      ),
  },
};

// Отдельно: тот же документ без разрывов, но с ручным разрывом (Ctrl+Enter) — тоже «хорошо» для PB-01.
export const PB01_HARD_BREAK = (): Uint8Array =>
  buildDocx({
    body: [
      p('Титул'),
      pageBreak(),
      p('Введение'),
      p(T1),
      pageBreak(),
      p('Литература'),
      p('[1] Источник.'),
    ],
  });

// --- Этап 2: правила на «школьной» работе (scripts/lib/school-doc.ts) ---
const without = (lines: string[], ...drop: string[]): string[] =>
  lines.filter((line) => !drop.some((d) => line.startsWith(d)));
const noBreak =
  '<w:p><w:r><w:t xml:space="preserve">Первая строка</w:t><w:br/><w:t>вторая строка абзаца.</w:t></w:r></w:p>';

export const STAGE2_FIXTURES: Record<string, FixturePair> = {
  'FT-05': {
    good: () => schoolDoc(),
    bad: () =>
      schoolDoc({
        extraBody: [
          p('Здесь подчёркнутое слово в обычном тексте.', { rPr: '<w:u w:val="single"/>' }),
        ],
      }),
  },
  'PR-07': { good: () => schoolDoc(), bad: () => schoolDoc({ extraBody: [noBreak] }) },
  'HD-01': { good: () => schoolDoc(), bad: () => schoolDoc({ headingStyle: false }) },
  'HD-02': {
    good: () => schoolDoc(),
    bad: () => schoolDoc({ parts: { conclusion: 'III.\tЗАКЛЮЧИТЕЛЬНАЯ ЧАСТЬ.' } }),
  },
  // Подзаголовок 3 уровня сразу после заголовка части 1 уровня.
  'HD-03': {
    good: () => schoolDoc(),
    bad: () =>
      schoolDoc({ extraBody: [p('1. Подзаголовок не на своём уровне', { style: 'Heading3' })] }),
  },
  'HD-04': { good: () => schoolDoc(), bad: () => schoolDoc({ partHeadingRPr: '<w:b/>' }) },
  'HD-05': {
    good: () => schoolDoc(),
    bad: () => schoolDoc({ partHeadingPPr: '<w:keepNext w:val="0"/>' }),
  },
  'HD-06': {
    good: () => schoolDoc(),
    bad: () => schoolDoc({ parts: { intro: 'I.\tВведение' } }),
    override: { enabled: true, params: { case: 'upper', align: 'left' } },
  },
  'HD-07': {
    good: () => schoolDoc(),
    bad: () => schoolDoc({ parts: { literature: 'V.\tЛИТЕРАТУРА', appendix: 'VI.\tПРИЛОЖЕНИЕ' } }),
  },
  'ST-01': {
    good: () => schoolDoc(),
    bad: () => schoolDoc({ titleLines: without(TITLE_LINES, 'Автор', 'Руководитель') }),
  },
  'ST-02': { good: () => schoolDoc(), bad: () => schoolDoc({ withToc: false }) },
  'ST-03': { good: () => schoolDoc(), bad: () => schoolDoc({ tocField: false }) },
  'ST-04': {
    good: () => schoolDoc(),
    bad: () =>
      schoolDoc({
        tocEntries: [
          'ПАСПОРТ ПРОЕКТА\t2',
          'I.\tВВЕДЕНИЕ\t4',
          'II.\tОСНОВНАЯ ЧАСТЬ\t5',
          'IV.\tЛИТЕРАТУРА\t11',
        ],
      }),
  },
  'ST-05': { good: () => schoolDoc(), bad: () => schoolDoc({ parts: { intro: null } }) },
  'ST-06': { good: () => schoolDoc(), bad: () => schoolDoc({ parts: { conclusion: null } }) },
  'ST-07': { good: () => schoolDoc(), bad: () => schoolDoc({ parts: { literature: null } }) },
  'ST-08': {
    good: () => schoolDoc(),
    bad: () =>
      schoolDoc({
        order: ['intro', 'main', 'theory', 'practice', 'literature', 'conclusion', 'appendix'],
      }),
  },
  'ST-10': {
    good: () => schoolDoc(),
    bad: () => schoolDoc({ titleLines: without(TITLE_LINES, 'Пояснительная') }),
  },
  'PS-01': {
    good: () => schoolDoc(),
    bad: () =>
      schoolDoc({ passportRows: SCHOOL_PASSPORT.filter(([label]) => label !== 'Цель проекта') }),
  },
  'FN-01': {
    good: () => schoolDoc(),
    bad: () => schoolDoc(),
    fileName: { good: 'Иванов, И. Пояснительная записка.docx', bad: 'project_final.docx' },
  },
  'NM-01': {
    good: () => schoolDoc(),
    bad: () => schoolDoc({ footers: { default: '<w:p/>', first: '<w:p/>' } }),
  },
  'NM-02': {
    good: () => schoolDoc(),
    bad: () => schoolDoc({ footers: { default: pageNumber('right'), first: '<w:p/>' } }),
  },
  'NM-03': { good: () => schoolDoc(), bad: () => schoolDoc({ titlePage: false }) },
  // Второй раздел начинает нумерацию заново.
  'NM-04': {
    good: () => schoolDoc(),
    bad: () =>
      schoolDoc({ middleSection: sectPr(), finalSectPrExtra: '<w:pgNumType w:start="1"/>' }),
  },
  'TH-01': { good: () => schoolDoc(), bad: () => schoolDoc({ theoryParagraphs: 2 }) },
  'VL-02': { good: () => schoolDoc(), bad: () => schoolDoc({ extraBody: emptyRun(40) }) },
};

// --- Этап 3: содержание, источники, рисунки, таблицы, типографика ---
const center = '<w:ind w:firstLine="0"/><w:jc w:val="center"/>';
const left = '<w:ind w:firstLine="0"/><w:jc w:val="left"/>';

// Рисунок 10 см шириной: «в тексте» (inline) или с обтеканием (anchor).
function drawing(options: { anchored?: boolean; align?: string; widthMm?: number } = {}): string {
  const kind = options.anchored ? 'anchor' : 'inline';
  const cx = Math.round((options.widthMm ?? 100) * 36000);
  return (
    `<w:p><w:pPr><w:ind w:firstLine="0"/><w:jc w:val="${options.align ?? 'center'}"/></w:pPr><w:r><w:drawing>` +
    `<wp:${kind} xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><wp:extent cx="${cx}" cy="1800000"/></wp:${kind}>` +
    '</w:drawing></w:r></w:p>'
  );
}

const figure = (caption = 'Рисунок 1 – Кадр из фильма', mention = true, options = {}): string[] => [
  drawing(options),
  p(caption, { pPr: center }),
  ...(mention ? [p('Кадр из фильма показан на рисунке 1.')] : []),
];

const tableBlock = (
  caption = 'Таблица 1 – Этапы съёмки',
  mention = true,
  rows?: string[][],
  header = false,
): string[] => [
  ...(caption ? [p(caption, { pPr: left })] : []),
  table(
    rows ?? [
      ['Этап', 'Срок'],
      ['Сценарий', 'Сентябрь'],
      ['Съёмка', 'Октябрь'],
    ],
    left,
  ).replace('<w:tr>', header ? '<w:tr><w:trPr><w:tblHeader/></w:trPr>' : '<w:tr>'),
  ...(mention ? [p('Этапы работы перечислены в таблице 1.')] : []),
];

const manyRows = Array.from({ length: 25 }, (_, i) => [`Шаг ${i + 1}`, 'Готово']);
// Элемент списка по номеру (пустая строка, если его нет) — без «!» в коде.
const nth = (list: string[], i: number): string => list[i] ?? '';
const drop = (list: string[], prefix: string): string[] =>
  list.filter((line) => !line.startsWith(prefix));
const bold = (text: string): string =>
  `<w:p><w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
const marked =
  '<w:p><w:r><w:rPr><w:highlight w:val="yellow"/></w:rPr><w:t>Этот текст выделен жёлтым маркером.</w:t></w:r></w:p>';
const LONG_WORDS = Array.from({ length: 260 }, (_, i) => (i % 10 === 9 ? 'слово.' : 'слово')).join(
  ' ',
);
const nbspLiterature = LITERATURE.map((line) =>
  line.replace(/ (?=с\.)/g, '\u00a0').replace(/(?<=[А-ЯЁ]\.) (?=[А-ЯЁ])/g, '\u00a0'),
);

export const STAGE3_FIXTURES: Record<string, FixturePair> = {
  'TH-02': { good: () => schoolDoc(), bad: () => schoolDoc({ theoryCitations: false }) },
  'TH-03': {
    good: () => schoolDoc({ extraTheory: [p('Первый фильм показали братья Люмьер в 1895 году.')] }),
    bad: () => schoolDoc(),
    override: {
      enabled: true,
      params: { partId: 'theory', topics: [{ title: 'История кино', keywords: ['люмьер'] }] },
    },
  },
  'CN-01': {
    good: () => schoolDoc(),
    bad: () => schoolDoc({ conclusion: drop(CONCLUSION, 'Цель') }),
  },
  // Без «сложностей»: ни «сложн», ни «трудн», ни «проблем».
  'CN-02': {
    good: () => schoolDoc(),
    bad: () =>
      schoolDoc({
        conclusion: [
          nth(CONCLUSION, 0),
          nth(CONCLUSION, 2),
          'Я справился и перенёс сцены во двор.',
          nth(CONCLUSION, 4),
        ],
      }),
  },
  'CN-03': {
    good: () => schoolDoc(),
    bad: () => schoolDoc({ conclusion: drop(CONCLUSION, 'Сначала') }),
  },
  'CN-04': {
    good: () => schoolDoc(),
    bad: () => schoolDoc({ conclusion: drop(CONCLUSION, 'Эту') }),
  },
  'CN-05': {
    good: () => schoolDoc(),
    bad: () => schoolDoc({ conclusion: drop(CONCLUSION, 'В следующий') }),
  },
  'AP-01': {
    good: () => schoolDoc({ extraBody: [p('Кадры из фильма приведены в приложении.')] }),
    bad: () =>
      schoolDoc({ extraBody: [p('Кадры из фильма приведены в приложении.')], appendix: [] }),
  },
  'ST-09': {
    good: () => schoolDoc(),
    bad: () => schoolDoc({ introParagraphs: INTRO.slice(0, 2) }),
  },
  'RF-01': {
    good: () => schoolDoc(),
    bad: () =>
      schoolDoc({
        literature: [
          ...LITERATURE.slice(0, 4),
          'Школьное кино // Школьный портал. — URL: https://example.org/kino (дата обращения: 20.10.2026).',
        ],
      }),
  },
  'RF-02': {
    good: () => schoolDoc(),
    bad: () =>
      schoolDoc({
        literature: [
          nth(LITERATURE, 1).replace('2.', '1.'),
          nth(LITERATURE, 0).replace('1.', '2.'),
          ...LITERATURE.slice(2),
        ],
      }),
    override: { enabled: true, params: { order: 'alphabetical' } },
  },
  'RF-03': {
    good: () => schoolDoc(),
    bad: () => schoolDoc({ literature: LITERATURE.slice(0, 3) }),
  },
  'RF-04': {
    good: () => schoolDoc(),
    bad: () =>
      schoolDoc({ literature: [nth(LITERATURE, 0).replace(/\.$/, ''), ...LITERATURE.slice(1)] }),
  },
  'RF-05': {
    good: () => schoolDoc(),
    bad: () =>
      schoolDoc({
        literature: [
          ...LITERATURE.slice(0, 4),
          '5. Школьное кино // Школьный портал. — URL: https://example.org/kino.',
        ],
      }),
  },
  'RF-06': {
    good: () => schoolDoc(),
    bad: () => schoolDoc({ extraTheory: [p('Об этом пишут и другие авторы [9].')] }),
  },
  'RF-07': {
    good: () => schoolDoc(),
    bad: () =>
      schoolDoc({
        literature: [
          ...LITERATURE,
          '6. Яковлев Я. Я. Видео на телефон. — Москва : Наука, 2022. — 64 с.',
        ],
      }),
  },
  'RF-08': {
    good: () => schoolDoc(),
    bad: () => schoolDoc({ literature: [...LITERATURE, nth(LITERATURE, 1).replace('2.', '6.')] }),
  },
  'FG-01': {
    good: () => schoolDoc({ extraTheory: figure() }),
    bad: () => schoolDoc({ extraTheory: [drawing(), p('Кадр из фильма показан на рисунке 1.')] }),
  },
  'FG-02': {
    good: () => schoolDoc({ extraTheory: figure() }),
    bad: () => schoolDoc({ extraTheory: figure('Рис. 1. Кадр из фильма') }),
  },
  'FG-03': {
    good: () => schoolDoc({ extraTheory: figure() }),
    bad: () => schoolDoc({ extraTheory: [...figure(), ...figure('Рисунок 3 – Ещё кадр', false)] }),
  },
  'FG-04': {
    good: () => schoolDoc({ extraTheory: figure() }),
    bad: () => schoolDoc({ extraTheory: figure(undefined, false) }),
  },
  'FG-05': {
    good: () => schoolDoc({ extraTheory: figure() }),
    bad: () =>
      schoolDoc({ extraTheory: figure(undefined, true, { anchored: true, widthMm: 200 }) }),
  },
  'TB-01': {
    good: () => schoolDoc({ extraTheory: tableBlock() }),
    bad: () => schoolDoc({ extraTheory: tableBlock('') }),
  },
  'TB-02': {
    good: () => schoolDoc({ extraTheory: tableBlock() }),
    bad: () => schoolDoc({ extraTheory: tableBlock('Таблица 2 – Этапы съёмки') }),
  },
  'TB-03': {
    good: () => schoolDoc({ extraTheory: tableBlock() }),
    bad: () => schoolDoc({ extraTheory: tableBlock(undefined, false) }),
  },
  'TB-04': {
    good: () => schoolDoc({ extraTheory: tableBlock(undefined, true, manyRows, true) }),
    bad: () => schoolDoc({ extraTheory: tableBlock(undefined, true, manyRows, false) }),
  },
  'FT-06': {
    good: () => schoolDoc(),
    bad: () =>
      schoolDoc({
        extraBody: [
          bold('Очень длинный фрагмент текста, выделенный полужирным целиком. '.repeat(4)),
        ],
      }),
  },
  'DC-02': { good: () => schoolDoc(), bad: () => schoolDoc({ extraBody: [marked] }) },
  'DC-03': { good: () => schoolDoc(), bad: () => schoolDoc({ extraBody: [p('Введите текст')] }) },
  'DC-04': {
    good: () => schoolDoc({ creator: 'Иванов И. И.' }),
    bad: () => schoolDoc({ creator: 'Петров П. П.' }),
    override: { enabled: true, params: { expectedAuthor: 'Иванов И. И.' } },
  },
  'DC-05': { good: () => schoolDoc(), bad: () => schoolDoc({ extraBody: [p(LONG_WORDS)] }) },
  'TY-04': {
    good: () => schoolDoc(),
    bad: () => schoolDoc({ extraBody: [p('Он сказал "привет" и ушёл.')] }),
  },
  'TY-05': {
    good: () => schoolDoc(),
    bad: () => schoolDoc({ extraBody: [p('Фильм ( короткий ) снят за месяц.')] }),
  },
  'TY-06': {
    good: () => schoolDoc(),
    bad: () =>
      schoolDoc({
        extraBody: [p('Абзац с пробелом в конце. '), p(' Абзац с одним пробелом в начале.')],
      }),
  },
  'TY-07': {
    good: () => schoolDoc(),
    bad: () => schoolDoc({ extraBody: [p('Это мoё мнение о фильме.')] }),
  },
  'TY-08': {
    good: () => schoolDoc({ literature: nbspLiterature }),
    bad: () => schoolDoc({ literature: nbspLiterature, extraBody: [p('Шрифт размером 12 пт.')] }),
    override: { enabled: true, params: {} },
  },
  'TY-09': {
    good: () => schoolDoc(),
    bad: () => schoolDoc({ extraBody: [p('Фильм длится 10-15 минут.')] }),
  },
  'TY-10': {
    good: () => schoolDoc({ extraBody: [p('Итак… фильм готов.')] }),
    bad: () => schoolDoc({ extraBody: [p('Итак... фильм готов.'), p('Потом… показ.')] }),
  },
  'VL-01': {
    good: () => schoolDoc(),
    bad: () => schoolDoc({ theoryParagraphs: 2 }),
    override: { enabled: true, params: { minPages: 3 } },
  },
  'TY-11': {
    good: () => schoolDoc(),
    bad: () => schoolDoc({ extraBody: [p('Мы снимали в в школе.')] }),
  },
};

// Все пары в одном списке: этапы 1, 2 и 3.
Object.assign(FIXTURES, STAGE2_FIXTURES, STAGE3_FIXTURES);
