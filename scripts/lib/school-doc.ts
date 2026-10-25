// Маленькая, но полная школьная работа, оформленная по всем требованиям профиля
// «Наша школа» (как fixtures/good/model-note.docx). Каждая «плохая» фикстура этапа 2
// портит в ней ровно одну вещь через параметры. Тексты вымышленные.
import {
  HEADING_STYLES,
  buildDocx,
  escapeXml,
  p,
  pageNumber,
  sectPr,
  table,
} from './docx-builder.ts';

export interface SchoolDocOptions {
  titleLines?: string[];
  tocField?: boolean; // содержание собрано полем TOC
  tocEntries?: string[];
  withToc?: boolean;
  parts?: Partial<Record<PartKey, string | null>>; // текст заголовка части; null — части нет
  order?: PartKey[];
  passportRows?: string[][];
  theoryParagraphs?: number; // по ~400 знаков
  footers?: { default?: string; first?: string };
  titlePage?: boolean;
  extraBody?: string[]; // дополнительные абзацы во введении
  headingStyle?: boolean; // заголовки оформлены стилями
  partHeadingPPr?: string; // доп. свойства абзаца заголовков частей
  partHeadingRPr?: string;
  middleSection?: string; // sectPr в абзаце после введения (второй раздел)
  finalSectPrExtra?: string; // дополнительно в последний раздел, например pgNumType
  // Этап 3: содержание частей.
  introParagraphs?: string[];
  theoryCitations?: boolean; // ссылки [1]…[5] в теории
  extraTheory?: string[];
  conclusion?: string[];
  literature?: string[]; // записи списка литературы
  appendix?: string[];
  creator?: string; // автор в свойствах файла (docProps/core.xml)
}

export const INTRO = [
  'Актуальность темы связана с тем, что многие школьники снимают видео для себя и для школьных мероприятий.',
  'Цель проекта — снять короткий фильм о школе и описать этапы работы над ним.',
  'Задачи проекта: изучить этапы съёмки, написать сценарий, снять и смонтировать фильм.',
  'Продукт проекта — короткий фильм о школе.',
];

// Источники по алфавиту; на каждый есть ссылка в теоретической части.
export const LITERATURE = [
  '1. Белов А. А. Монтаж для начинающих. — Москва : Искусство, 2019. — 96 с.',
  '2. Иванов И. И. Как снять кино. — Москва : Наука, 2020. — 120 с.',
  '3. Козлова М. В. Сценарий короткого фильма. — Москва : Просвещение, 2021. — 80 с.',
  '4. Орлов П. С. Свет и звук на съёмке. — Москва : Искусство, 2018. — 110 с.',
  '5. Школьное кино // Школьный портал. — URL: https://example.org/kino (дата обращения: 20.10.2026).',
];

export const CONCLUSION = [
  'Цель проекта достигнута: фильм снят и показан классу.',
  'Самым сложным оказалось уложиться в срок, потому что съёмки зависели от погоды.',
  'Сначала я планировал снимать на камеру, но заменил её телефоном, потому что камеры не нашлось.',
  'Эту трудность я решил так: перенёс уличные сцены в школьный двор.',
  'В следующий раз я бы заранее составил план съёмок на каждый день.',
];

type PartKey = 'intro' | 'main' | 'theory' | 'practice' | 'conclusion' | 'literature' | 'appendix';

export const TITLE_LINES = [
  'Государственное бюджетное общеобразовательное учреждение школа № 1',
  'Индивидуальный итоговый проект по теме:',
  '«Как снять короткий фильм»',
  'Пояснительная записка',
  'Автор проекта: Иванов Иван, обучающийся 10 класса',
  'Руководитель проекта: Петрова Мария Сергеевна',
  'Работа допущена к защите',
  'Москва',
  '2026',
];

export const PASSPORT_ROWS = [
  ['Тема проекта', 'Как снять короткий фильм.'],
  ['Учебный предмет', 'Литература.'],
  ['Вид проекта', 'Творческий.'],
  ['Актуальность', 'Многие школьники снимают видео, но не знают этапов работы.'],
  ['Цель проекта', 'Снять короткий фильм.'],
  ['Задачи проекта', 'Изучить этапы, написать сценарий, снять фильм.'],
  ['Сроки реализации проекта', 'Сентябрь – апрель.'],
  ['Оборудование и ресурсы, необходимые для реализации проекта', 'Телефон, компьютер.'],
  ['Аннотация проекта', 'Короткий фильм о школе.'],
  ['Ожидаемые результаты', 'Готовый фильм.'],
  ['Смета проекта (при необходимости)', 'Не требуется.'],
];

const PARTS: Record<PartKey, { title: string; level: 1 | 2; newPage: boolean }> = {
  intro: { title: 'I.\tВВЕДЕНИЕ', level: 1, newPage: true },
  main: { title: 'II.\tОСНОВНАЯ ЧАСТЬ', level: 1, newPage: true },
  theory: { title: 'II.I.\tТЕОРЕТИЧЕСКАЯ ЧАСТЬ', level: 2, newPage: false },
  practice: { title: 'II.II.\tПРАКТИЧЕСКАЯ ЧАСТЬ', level: 2, newPage: true },
  conclusion: { title: 'III.\tЗАКЛЮЧИТЕЛЬНАЯ ЧАСТЬ', level: 1, newPage: true },
  literature: { title: 'IV.\tЛИТЕРАТУРА', level: 1, newPage: true },
  appendix: { title: 'V.\tПРИЛОЖЕНИЕ', level: 1, newPage: true },
};

const DEFAULT_ORDER: PartKey[] = [
  'intro',
  'main',
  'theory',
  'practice',
  'conclusion',
  'literature',
  'appendix',
];

const TOC_ENTRIES = [
  'ПАСПОРТ ПРОЕКТА\t2',
  'I.\tВВЕДЕНИЕ\t4',
  'II.\tОСНОВНАЯ ЧАСТЬ\t5',
  'II.I.\tТЕОРЕТИЧЕСКАЯ ЧАСТЬ\t5',
  'II.II.\tПРАКТИЧЕСКАЯ ЧАСТЬ\t9',
  'III.\tЗАКЛЮЧИТЕЛЬНАЯ ЧАСТЬ\t10',
  'IV.\tЛИТЕРАТУРА\t11',
  'V.\tПРИЛОЖЕНИЕ\t12',
];

const SENTENCE =
  'Работа над фильмом начинается с замысла, затем автор пишет сценарий, подбирает актёров и место съёмки, а после съёмки монтирует материал и озвучивает его.';
// Абзац около 400 знаков: три одинаковых предложения.
const LONG = `${SENTENCE} ${SENTENCE} ${SENTENCE}`;

const run = (text: string, rPr = ''): string =>
  `<w:r>${rPr ? `<w:rPr>${rPr}</w:rPr>` : ''}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>`;
const runsWithTabs = (text: string, rPr = ''): string =>
  text
    .split('\t')
    .map((piece, i) => (i > 0 ? `<w:r><w:tab/></w:r>` : '') + (piece ? run(piece, rPr) : ''))
    .join('');

const FRONT = '<w:pageBreakBefore/><w:keepNext/><w:ind w:firstLine="0"/><w:jc w:val="center"/>';
const front = (text: string, extra = ''): string =>
  `<w:p><w:pPr>${FRONT}</w:pPr>${extra}${run(text, '<w:b/>')}</w:p>`;

function tocEntries(entries: string[], field: boolean): string[] {
  const pPr = '<w:pPr><w:ind w:firstLine="0"/><w:jc w:val="left"/></w:pPr>';
  return entries.map((entry, i) => {
    const begin =
      field && i === 0
        ? '<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> TOC \\o "1-2" \\h </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>'
        : '';
    const end =
      field && i === entries.length - 1 ? '<w:r><w:fldChar w:fldCharType="end"/></w:r>' : '';
    return `<w:p>${pPr}${begin}${runsWithTabs(entry)}${end}</w:p>`;
  });
}

function partHeading(key: PartKey, text: string, options: SchoolDocOptions): string {
  const part = PARTS[key];
  const styled = options.headingStyle ?? true;
  const style = styled ? `<w:pStyle w:val="Heading${part.level}"/>` : '';
  // Без стиля оформляем «руками» так же, как стиль: так меняется только HD-01.
  const manual = styled
    ? ''
    : `<w:keepNext/><w:ind w:firstLine="${part.level === 2 ? 850 : 0}"/><w:jc w:val="left"/>`;
  const pPr = `${style}${part.newPage ? '<w:pageBreakBefore/>' : ''}${manual}${options.partHeadingPPr ?? ''}`;
  const rPr = `${styled ? '' : '<w:sz w:val="24"/>'}${options.partHeadingRPr ?? ''}`;
  return `<w:p><w:pPr>${pPr}</w:pPr>${runsWithTabs(text, rPr)}</w:p>`;
}

const subHeading = (text: string, styled = true): string =>
  styled
    ? p(text, { style: 'Heading3' })
    : p(text, { pPr: '<w:keepNext/><w:ind w:firstLine="0"/><w:jc w:val="both"/>' });

export function schoolDoc(options: SchoolDocOptions = {}): Uint8Array {
  const title = (options.titleLines ?? TITLE_LINES).map((line) =>
    p(line, { pPr: '<w:ind w:firstLine="0"/><w:jc w:val="center"/>' }),
  );
  const cell =
    '<w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/><w:ind w:firstLine="0"/><w:jc w:val="left"/>';
  const passport = [front('ПАСПОРТ ПРОЕКТА'), table(options.passportRows ?? PASSPORT_ROWS, cell)];
  const toc =
    options.withToc === false
      ? []
      : [
          front('СОДЕРЖАНИЕ'),
          ...tocEntries(options.tocEntries ?? TOC_ENTRIES, options.tocField ?? true),
        ];

  const styled = options.headingStyle ?? true;
  const bodyOf: Record<PartKey, string[]> = {
    intro: [
      ...(options.introParagraphs ?? INTRO).map((text) => p(text)),
      ...(options.extraBody ?? []),
      ...(options.middleSection ? [p('Конец введения.', { pPr: options.middleSection })] : []),
    ],
    main: [],
    theory: [
      subHeading('1. Этапы создания фильма', styled),
      ...Array.from({ length: options.theoryParagraphs ?? 15 }, (_, i) =>
        // В первых пяти абзацах — ссылки на источники [1]…[5].
        p(options.theoryCitations !== false && i < 5 ? `${LONG.slice(0, -1)} [${i + 1}].` : LONG),
      ),
      ...(options.extraTheory ?? []),
    ],
    practice: [
      subHeading('1. Съёмка фильма', styled),
      p('Съёмка заняла две недели, монтаж — ещё неделю.'),
    ],
    conclusion: (options.conclusion ?? CONCLUSION).map((text) => p(text)),
    literature: (options.literature ?? LITERATURE).map((text) =>
      p(text, { pPr: '<w:ind w:firstLine="0"/>' }),
    ),
    appendix: (options.appendix ?? ['Приложение 1. Кадры из фильма.']).map((text) => p(text)),
  };

  const parts = (options.order ?? DEFAULT_ORDER).flatMap((key) => {
    const text = options.parts?.[key] === undefined ? PARTS[key].title : options.parts[key];
    if (text === null) return [];
    return [partHeading(key, text, options), ...bodyOf[key]];
  });

  return buildDocx({
    body: [...title, ...passport, ...toc, ...parts],
    styles: HEADING_STYLES,
    finalSectPr: sectPr(undefined, undefined, options.finalSectPrExtra ?? ''),
    footers: options.footers ?? { default: pageNumber(), first: '<w:p/>' },
    titlePage: options.titlePage ?? true,
    extraParts: options.creator
      ? {
          'docProps/core.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:creator>${escapeXml(options.creator)}</dc:creator></cp:coreProperties>`,
        }
      : {},
  });
}
