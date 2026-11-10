// Тексты проверки PDF. В PDF нет абзацев и стилей — только буквы с координатами на
// страницах, поэтому проверок меньше, чем для .docx, и часть из них — эвристики.
import { plural } from './rules-ru.ts';

export type PdfCheckId =
  'PDF-00' | 'PDF-01' | 'PDF-02' | 'PDF-03' | 'PDF-04' | 'PDF-05' | 'PDF-06' | 'PDF-07' | 'PDF-08';

export const PDF_TEXTS: Record<PdfCheckId, { title: string; how: string }> = {
  'PDF-00': {
    title: 'В файле есть текст',
    how: 'Сохраните PDF из Word (Файл → Сохранить как → PDF), а не сканом или фотографией страниц.',
  },
  'PDF-01': {
    title: 'Формат листа A4, книжная ориентация',
    how: 'Макет → Размер → A4; Макет → Ориентация → Книжная. Затем сохраните PDF заново.',
  },
  'PDF-02': {
    title: 'Объём работы',
    how: 'Допишите работу; пустые строки и крупный шрифт объём не добавляют.',
  },
  'PDF-03': {
    title: 'Шрифты встроены в PDF',
    how: 'Файл → Параметры → Сохранение → «Внедрить шрифты в файл», затем сохраните PDF заново.',
  },
  'PDF-04': {
    title: 'Шрифт текста',
    how: 'Выделите текст (Ctrl+A) и выберите нужный шрифт на вкладке «Главная».',
  },
  'PDF-05': {
    title: 'Размер шрифта основного текста',
    how: 'Выделите основной текст и задайте размер на вкладке «Главная»; лучше — в стиле «Обычный».',
  },
  'PDF-06': {
    title: 'Поля страницы',
    how: 'Макет → Поля → Настраиваемые поля: задайте поля по требованиям.',
  },
  'PDF-07': {
    title: 'Номера страниц',
    how: 'Вставка → Номер страницы → Внизу страницы; на титульном листе: Конструктор → «Особый колонтитул для первой страницы».',
  },
  'PDF-08': {
    title: 'Каждая часть начинается с новой страницы',
    how: 'Поставьте курсор перед заголовком части и нажмите Ctrl+Enter (разрыв страницы).',
  },
};

const mm = (n: number): string => `${Math.round(n)}\u00a0мм`;
const pagesWord = (n: number): string => plural(n, ['страница', 'страницы', 'страниц']);

export const pdfMessages = {
  scan: 'Текста почти нет: похоже, это скан или картинки. Такой PDF проверить нельзя.',
  hasText: (chars: number): string => `Текст есть: ${chars} знаков.`,
  formatOk: 'Все страницы A4, книжные.',
  formatBad: (pages: number[]): string =>
    `Не A4 или альбомная ориентация: ${plural(pages.length, ['страница', 'страницы', 'страницы'])} ${pages.join(', ')}.`,
  volume: (pages: number, min: number): string =>
    `${pages}\u00a0${pagesWord(pages)}, нужно не меньше ${min}.`,
  volumeOk: (pages: number): string => `${pages}\u00a0${pagesWord(pages)}.`,
  embeddedOk: 'Все шрифты встроены: у учителя текст будет выглядеть так же.',
  notEmbedded: (fonts: string[]): string =>
    `Не встроены: ${fonts.join(', ')}. На другом компьютере эти буквы заменятся похожим шрифтом.`,
  fontOk: (need: string): string => `В файле только ${need}.`,
  fontMissing: (need: string, found: string[]): string =>
    `Шрифта ${need} в файле нет. Найдены: ${found.join(', ')}.`,
  fontOthers: (need: string, others: string[]): string =>
    `${need} есть, но есть и другие шрифты: ${others.join(', ')}. Найдите, где они, в .docx.`,
  mainSize: (size: number): string => `Основной текст — ${size}\u00a0pt.`,
  mainSizeBad: (size: number, need: number): string =>
    `Основной текст — ${size}\u00a0pt, нужно ${need}\u00a0pt.`,
  margins: (sides: string[]): string => sides.join('; ') + '.',
  marginLine: (side: string, now: number, need: number): string =>
    `${side}: ${mm(now)}, нужно ${mm(need)}`,
  marginOkLine: (side: string, now: number): string => `${side}: ${mm(now)}`,
  marginNote:
    'Поле измерено по краю текста, поэтому оно может быть чуть больше настоящего (например, если строки короткие).',
  sides: { left: 'слева', right: 'справа', top: 'сверху', bottom: 'снизу' },
  numbersOk: (count: number, total: number): string =>
    `Номера есть на ${count} из ${total}\u00a0${pagesWord(total)}.`,
  numbersMissing: (count: number, total: number): string =>
    `Номера найдены только на ${count} из ${total}\u00a0${pagesWord(total)}.`,
  numbersPosition: 'Номера стоят не внизу по центру.',
  numberOnTitle: 'На титульном листе стоит номер страницы.',
  partsOk: (count: number): string =>
    `Найдено частей: ${count}, каждая начинается с новой страницы.`,
  partsBad: (parts: string[]): string =>
    `Не с новой страницы: ${parts.map((p) => `«${p}»`).join(', ')}.`,
  partsNone: 'Заголовки частей не найдены.',
} as const;
