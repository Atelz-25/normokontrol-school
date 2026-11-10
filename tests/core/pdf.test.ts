// Проверка PDF по готовым данным (страницы, кусочки текста, шрифты) и чтение шрифтов
// из файла. Сами PDF для этих тестов собирает scripts/lib/pdf-builder.ts.
import { describe, expect, it } from 'vitest';
import { A4, MM, bodyPage, buildPdf } from '../../scripts/lib/pdf-builder.ts';
import {
  checkPdf,
  fontFamily,
  type PdfDocument,
  type PdfPage,
  type PdfTextItem,
} from '../../src/core/pdf/analyze.ts';
import { pdfFonts } from '../../src/core/pdf/fonts.ts';
import { BUILTIN_PROFILES } from '../../src/core/profiles/builtin.ts';

const school = BUILTIN_PROFILES.find((p) => p.id === 'school-custom')!;

// Страница из строк основного текста 12 pt с полями 30 / 10 / 20 / 20 мм и номером внизу.
function page(
  number?: number,
  opts: { left?: number; size?: number; text?: string } = {},
): PdfPage {
  const left = (opts.left ?? 30) * MM;
  const width = A4.width - left - 10 * MM;
  const size = opts.size ?? 12;
  const items: PdfTextItem[] = [];
  const rows = Math.floor((A4.height - 40 * MM) / (size * 1.5)) - 1;
  for (let i = 0; i < rows; i++)
    items.push({
      text: opts.text ?? 'Обычная строка текста работы, достаточно длинная.',
      x: left,
      top: 20 * MM + i * size * 1.5,
      width,
      size,
    });
  if (number !== undefined)
    items.push({
      text: String(number),
      x: A4.width / 2 - 3,
      top: A4.height - 12 * MM,
      width: 6,
      size: 12,
    });
  return { width: A4.width, height: A4.height, items };
}

const doc = (pages: PdfPage[], embedded = true): PdfDocument => ({
  pages,
  fonts: [{ id: 'f', name: 'ABCDEF+TimesNewRomanPSMT', embedded }],
});
const pagesN = (n: number, make = (i: number) => page(i + 1)): PdfPage[] =>
  Array.from({ length: n }, (_, i) => (i === 0 ? page() : make(i)));
const status = (report: ReturnType<typeof checkPdf>, id: string): string | undefined =>
  report.checks.find((c) => c.id === id)?.status;

describe('проверка PDF', () => {
  it('аккуратная работа на 18 страниц проходит все проверки', () => {
    const report = checkPdf(doc(pagesN(18)), school);
    const failed = report.checks
      .filter((c) => c.status === 'fail')
      .map((c) => `${c.id}: ${c.message}`);
    expect(failed).toEqual([]);
    expect(report.pages).toBe(18);
  });

  it('скан без текста: остальные проверки не применяются', () => {
    const empty = { width: A4.width, height: A4.height, items: [] };
    const report = checkPdf({ pages: [empty, empty], fonts: [] }, school);
    expect(status(report, 'PDF-00')).toBe('fail');
    expect(status(report, 'PDF-05')).toBe('not-applicable');
  });

  it('мало страниц, не тот размер шрифта, узкое левое поле, нет номеров', () => {
    const bad = checkPdf(doc(pagesN(5, () => page(undefined, { left: 20, size: 14 }))), school);
    expect(status(bad, 'PDF-02')).toBe('fail'); // нужно не меньше 17
    expect(status(bad, 'PDF-05')).toBe('fail'); // 14 вместо 12
    expect(status(bad, 'PDF-06')).toBe('fail'); // 20 мм вместо 30
    expect(status(bad, 'PDF-07')).toBe('fail');
  });

  it('альбомная страница и невстроенный шрифт', () => {
    const pages = pagesN(18);
    pages[3] = { ...pages[3]!, width: A4.height, height: A4.width };
    const report = checkPdf(doc(pages, false), school);
    expect(report.checks.find((c) => c.id === 'PDF-01')?.message).toContain('4');
    expect(status(report, 'PDF-03')).toBe('fail');
  });

  it('часть начинается посреди страницы', () => {
    const pages = pagesN(18);
    const mid = pages[5]!;
    mid.items.splice(10, 0, { text: 'Введение', x: 30 * MM, top: 200, width: 60, size: 12 });
    const top = pages[6]!;
    top.items.unshift({
      text: 'Заключительная часть',
      x: 30 * MM,
      top: 20 * MM - 20,
      width: 100,
      size: 12,
    });
    const report = checkPdf(doc(pages), school);
    const check = report.checks.find((c) => c.id === 'PDF-08');
    expect(check?.status).toBe('fail');
    expect(check?.message).toContain('Введение');
    expect(check?.message).not.toContain('Заключительная');
  });

  it('имя гарнитуры без приписок: TimesNewRomanPS-BoldMT → timesnewroman', () => {
    expect(fontFamily('ABCDEF+TimesNewRomanPS-BoldMT')).toBe('timesnewroman');
    expect(fontFamily('Times New Roman')).toBe('timesnewroman');
    expect(fontFamily('Calibri,Bold')).toBe('calibri');
  });
});

describe('шрифты из файла PDF', () => {
  it('приставка «ABCDEF+» — встроенное подмножество, без неё и без FontFile — не встроен', () => {
    const bytes = buildPdf([bodyPage(1)], { font: 'AAAAAA+TimesNewRomanPSMT', font2: 'Arial' });
    const fonts = pdfFonts(bytes);
    expect(fonts).toContainEqual({
      id: 'AAAAAA+TimesNewRomanPSMT',
      name: 'AAAAAA+TimesNewRomanPSMT',
      embedded: true,
    });
    expect(fonts).toContainEqual({ id: 'Arial', name: 'Arial', embedded: false });
  });
});
