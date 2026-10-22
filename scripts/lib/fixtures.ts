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
  sectPr,
  table,
} from './docx-builder.ts';

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
    good: () => doc([p(T1), p(T2, { pPr: '<w:ind w:firstLine="720"/>' })]), // 1,25 и 1,27 см
    bad: () =>
      doc([
        p(T1, { pPr: '<w:ind w:firstLine="720"/>' }),
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
    bad: () => doc([p(T1), p(`     ${T2}`), p(' '.repeat(40))]),
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
