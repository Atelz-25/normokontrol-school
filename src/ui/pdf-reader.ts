// Чтение PDF в браузере: страницы и кусочки текста с координатами — через библиотеку
// pdf.js (она же разбирает сжатие, кодировки и шрифты). Шрифты — по словарям файла
// (src/core/pdf/fonts.ts). Сама проверка — в src/core/pdf/analyze.ts.
//
// pdf.js большая (около 1,7 МБ), поэтому загружается только когда выбран PDF: обычная
// проверка .docx её не скачивает. Файлы библиотеки лежат на нашем сайте, без внешних запросов.
import type { PdfDocument, PdfPage } from '../core/pdf/analyze.ts';
import { pdfFonts } from '../core/pdf/fonts.ts';

// Проверка PDF загружается вместе с чтением: обычной странице она не нужна.
export { checkPdf } from '../core/pdf/analyze.ts';

export class PdfReadError extends Error {
  constructor(readonly code: 'password' | 'broken') {
    super(code);
  }
}

export async function readPdf(bytes: ArrayBuffer): Promise<PdfDocument> {
  const pdfjs = await import('pdfjs-dist');
  // Файл фонового потока pdf.js: Vite кладёт его рядом с сайтом и даёт адрес.
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;

  const data = new Uint8Array(bytes.slice(0)); // pdf.js забирает буфер себе
  const task = pdfjs.getDocument({
    data,
    disableFontFace: true, // шрифты рисовать не нужно, только читать текст
    useSystemFonts: false,
    useWasm: false, // картинки не разбираем, WebAssembly не нужен
    stopAtErrors: false,
  });
  let doc;
  try {
    doc = await task.promise;
  } catch (error) {
    void task.destroy();
    throw new PdfReadError(
      error instanceof Error && error.name === 'PasswordException' ? 'password' : 'broken',
    );
  }

  const pages: PdfPage[] = [];
  try {
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const items = content.items.flatMap((item) => {
        if (!('str' in item) || item.str === '') return [];
        // Координаты кусочка в системе страницы: начало — левый верхний угол, единица — pt.
        const m = pdfjs.Util.transform(viewport.transform, item.transform) as number[];
        const [, , c, d, x, baseline] = m;
        const size = Math.hypot(c ?? 0, d ?? 0);
        return [
          { text: item.str, x: x ?? 0, top: (baseline ?? 0) - size * 0.8, width: item.width, size },
        ];
      });
      pages.push({ width: viewport.width, height: viewport.height, items });
      page.cleanup();
    }
  } finally {
    void task.destroy();
  }
  return { pages, fonts: pdfFonts(new Uint8Array(bytes)) };
}
