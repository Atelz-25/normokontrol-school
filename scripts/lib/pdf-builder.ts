// Маленький генератор PDF для тестов: страницы A4 и строки текста в заданных местах.
// Только латиница (кодировка WinAnsi) — для проверки полей, размера шрифта, страниц,
// номеров страниц и шрифтов этого достаточно. Шрифт в файл не вкладывается: имя с
// приставкой «ABCDEF+» означает «встроенное подмножество», без приставки — «не встроен».

export interface PdfLine {
  text: string;
  x: number; // pt от левого края
  top: number; // pt от верхнего края (верх строки)
  size: number; // pt
  font?: 1 | 2; // 1 — основной шрифт, 2 — второй
}

export interface PdfPageSpec {
  width?: number; // pt, по умолчанию A4
  height?: number;
  lines: PdfLine[];
}

export interface PdfOptions {
  font?: string; // BaseFont основного шрифта
  font2?: string; // BaseFont второго шрифта
}

export const A4 = { width: 595.28, height: 841.89 };
export const MM = 72 / 25.4;

const escape = (text: string): string => text.replace(/[\\()]/g, (c) => `\\${c}`);

export function buildPdf(pages: PdfPageSpec[], options: PdfOptions = {}): Uint8Array {
  const objects: string[] = []; // содержимое объекта N лежит в objects[N - 1]
  const add = (body: string): number => objects.push(body);
  add('<< /Type /Catalog /Pages 2 0 R >>');
  add(''); // список страниц заполним в конце
  const font = (name: string): number =>
    add(`<< /Type /Font /Subtype /Type1 /BaseFont /${name} /Encoding /WinAnsiEncoding >>`);
  const f1 = font(options.font ?? 'AAAAAA+TimesNewRomanPSMT');
  const f2 = font(options.font2 ?? 'AAAAAB+TimesNewRomanPS-BoldMT');

  const kids = pages.map((page) => {
    const width = page.width ?? A4.width;
    const height = page.height ?? A4.height;
    // В PDF ось Y идёт снизу вверх, а строка ставится по базовой линии (≈ 0,8 размера ниже верха).
    const content = page.lines
      .map(
        (l) =>
          `BT /F${l.font ?? 1} ${l.size} Tf ${l.x.toFixed(2)} ${(height - l.top - l.size * 0.8).toFixed(2)} Td (${escape(l.text)}) Tj ET`,
      )
      .join('\n');
    const stream = add(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    return add(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] ` +
        `/Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${stream} 0 R >>`,
    );
  });
  objects[1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`;

  // Таблица ссылок (xref): где в файле начинается каждый объект.
  let out = '%PDF-1.4\n';
  const offsets = objects.map((body, i) => {
    const offset = out.length;
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
    return offset;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  out += offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(out); // только ASCII: байт на символ
}

// Типичная страница работы: строки основного текста 12 pt с полями 30/10/20/20 мм и номер внизу.
export function bodyPage(
  pageNumber?: number,
  options: { left?: number; size?: number } = {},
): PdfPageSpec {
  const left = (options.left ?? 30) * MM;
  const right = A4.width - 10 * MM;
  const size = options.size ?? 12;
  const lines: PdfLine[] = [];
  for (let i = 0; i < 30; i++)
    lines.push({
      // Строку растягиваем по ширине: текст доходит до правого поля, как при выравнивании.
      text: 'Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod'.slice(0, 70),
      x: left,
      top: 20 * MM + i * size * 1.5,
      size,
    });
  // Последняя строка ровно у правого края: так поле справа измеряется по тексту.
  lines.push({ text: 'end', x: right - 3 * size * 0.5, top: 20 * MM, size });
  if (pageNumber !== undefined)
    lines.push({
      text: String(pageNumber),
      x: A4.width / 2 - 3,
      top: A4.height - 12 * MM,
      size: 12,
    });
  return { lines };
}
