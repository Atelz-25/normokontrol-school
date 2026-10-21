// Сборщик маленьких .docx «руками» (бриф, раздел 12): так мы точно знаем, что внутри
// «плохого» документа, и можем проверить каждое правило по отдельности.
// По умолчанию документ оформлен «хорошо» для профиля школы: TNR 12, интервал 1,5,
// по ширине, красная строка 1,25 см, поля 30/15/20/20 мм.
import { strToU8, zipSync } from 'fflate';

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

export const escapeXml = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export interface ParagraphOptions {
  pPr?: string; // дополнительные свойства абзаца (сырой XML внутри w:pPr)
  rPr?: string; // свойства прогона
  style?: string;
}

// Табуляция в тексте превращается в <w:tab/>.
function runs(text: string, rPr = ''): string {
  return text
    .split('\t')
    .map(
      (piece, i) =>
        (i > 0 ? `<w:r>${rPr ? `<w:rPr>${rPr}</w:rPr>` : ''}<w:tab/></w:r>` : '') +
        (piece === ''
          ? ''
          : `<w:r>${rPr ? `<w:rPr>${rPr}</w:rPr>` : ''}<w:t xml:space="preserve">${escapeXml(piece)}</w:t></w:r>`),
    )
    .join('');
}

export function p(text: string, options: ParagraphOptions = {}): string {
  const style = options.style ? `<w:pStyle w:val="${options.style}"/>` : '';
  const pPr = style || options.pPr ? `<w:pPr>${style}${options.pPr ?? ''}</w:pPr>` : '';
  return `<w:p>${pPr}${runs(text, options.rPr)}</w:p>`;
}

export const empty = (pPr = ''): string => (pPr ? `<w:p><w:pPr>${pPr}</w:pPr></w:p>` : '<w:p/>');
export const emptyRun = (count: number): string[] => Array.from({ length: count }, () => empty());

// Абзац с разрывом страницы в конце (как после Ctrl+Enter).
export const pageBreak = (): string => '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';

export function table(rows: string[][], cellPPr = ''): string {
  const cell = (text: string): string =>
    `<w:tc><w:tcPr><w:tcW w:w="4500" w:type="dxa"/></w:tcPr>${p(text, { pPr: cellPPr })}</w:tc>`;
  return `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/></w:tblPr>${rows
    .map((row) => `<w:tr>${row.map(cell).join('')}</w:tr>`)
    .join('')}</w:tbl>`;
}

export interface Margins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

// Поля в миллиметрах → twips (1 мм = 56,7 twips).
export const MM = (mm: number): number => Math.round(mm * 56.7);
export const SCHOOL_MARGINS: Margins = { top: MM(20), right: MM(15), bottom: MM(20), left: MM(30) };

export function sectPr(
  margins: Margins = SCHOOL_MARGINS,
  size = { w: 11906, h: 16838 },
  extra = '',
): string {
  return (
    `<w:sectPr>${extra}<w:pgSz w:w="${size.w}" w:h="${size.h}"/>` +
    `<w:pgMar w:top="${margins.top}" w:right="${margins.right}" w:bottom="${margins.bottom}" w:left="${margins.left}" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>`
  );
}

export interface DocOptions {
  body: string[];
  finalSectPr?: string;
  defaultRPr?: string;
  defaultPPr?: string;
  styles?: string; // дополнительные w:style
  numbering?: string; // содержимое numbering.xml без корневого элемента
  comments?: string[]; // тексты примечаний
  extraParts?: Record<string, string>;
  binaryParts?: Record<string, Uint8Array>;
}

export const SCHOOL_RPR =
  '<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/><w:sz w:val="24"/><w:szCs w:val="24"/>';
export const SCHOOL_PPR =
  '<w:spacing w:before="0" w:after="0" w:line="360" w:lineRule="auto"/><w:ind w:firstLine="709"/><w:jc w:val="both"/>';

export function buildDocx(options: DocOptions): Uint8Array {
  const rPr = options.defaultRPr ?? SCHOOL_RPR;
  const pPr = options.defaultPPr ?? SCHOOL_PPR;
  const files: Record<string, string> = {
    '[Content_Types].xml':
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
      (options.numbering
        ? '<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>'
        : '') +
      (options.comments
        ? '<Override PartName="/word/comments.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml"/>'
        : '') +
      '</Types>',
    '_rels/.rels':
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
      '</Relationships>',
    'word/document.xml':
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="${W_NS}"><w:body>` +
      options.body.join('') +
      (options.finalSectPr ?? sectPr()) +
      '</w:body></w:document>',
    'word/styles.xml':
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="${W_NS}">` +
      `<w:docDefaults><w:rPrDefault><w:rPr>${rPr}</w:rPr></w:rPrDefault><w:pPrDefault><w:pPr>${pPr}</w:pPr></w:pPrDefault></w:docDefaults>` +
      '<w:style w:type="paragraph" w:default="1" w:styleId="a"><w:name w:val="Normal"/></w:style>' +
      (options.styles ?? '') +
      '</w:styles>',
  };
  if (options.numbering)
    files['word/numbering.xml'] =
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering xmlns:w="${W_NS}">${options.numbering}</w:numbering>`;
  if (options.comments)
    files['word/comments.xml'] =
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:comments xmlns:w="${W_NS}">` +
      options.comments
        .map((text, i) => `<w:comment w:id="${i}" w:author="Тест">${p(text)}</w:comment>`)
        .join('') +
      '</w:comments>';
  Object.assign(files, options.extraParts ?? {});
  const entries: Record<string, Uint8Array | [Uint8Array, { level: 0 }]> = Object.fromEntries(
    Object.entries(files).map(([name, text]) => [name, strToU8(text)]),
  );
  // Двоичные части (картинки) кладём без сжатия, как Word кладёт PNG и JPEG.
  for (const [name, data] of Object.entries(options.binaryParts ?? {}))
    entries[name] = [data, { level: 0 }];
  return zipSync(entries);
}
