// Шаблон пояснительной записки по выбранным требованиям: пустой .docx, в котором уже
// стоят поля, шрифт, интервал, красная строка, стили заголовков частей (каждая — с новой
// страницы), содержание полем Word и номера страниц внизу. Ученик вписывает свой текст.
//
// Все числа берутся из требований (профиля), а не зашиты в код: другой профиль — другой шаблон.
import { strToU8, zipSync } from 'fflate';
import type { Profile } from '../profiles/types.ts';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const TWIPS_PER_MM = 1440 / 25.4;
const TWIPS_PER_CM = 1440 / 2.54;

export interface TemplateTexts {
  titleLines: string[]; // строки титульного листа (без надписи «Пояснительная записка»)
  placeholder: (part: string) => string; // текст-подсказка внутри части
  passportValue: string;
  tocHint: string;
  defaultParts: string[]; // части, если в требованиях порядок частей не задан
  appendixTitle?: string;
}

const xml = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const run = (text: string): string => `<w:r><w:t xml:space="preserve">${xml(text)}</w:t></w:r>`;
const para = (text: string, pPr = ''): string =>
  `<w:p>${pPr ? `<w:pPr>${pPr}</w:pPr>` : ''}${text ? run(text) : ''}</w:p>`;

function param<T>(profile: Profile, rule: string, name: string, fallback: T): T {
  const value = profile.rules[rule]?.params[name];
  return value === undefined ? fallback : (value as T);
}

const twips = (mm: number): number => Math.round(mm * TWIPS_PER_MM);

export function buildTemplate(profile: Profile, texts: TemplateTexts): Uint8Array {
  // --- числа из требований ---
  const fonts = param<unknown[]>(profile, 'FT-01', 'values', ['Times New Roman']);
  const font = typeof fonts[0] === 'string' ? fonts[0] : 'Times New Roman';
  const sizePt = param<number>(profile, 'FT-02', 'valuePt', 14);
  const line = param<number>(profile, 'PR-01', 'value', 1.5);
  const indentCm = param<number>(profile, 'PR-03', 'valueCm', 1.25);
  const align = param<string>(profile, 'PR-04', 'align', 'both');
  const margin = (rule: string, fallback: number): number =>
    twips(param<number>(profile, rule, 'valueMm', fallback));
  const levels = param<Record<string, { sizePt?: number; bold?: boolean; align?: string }>>(
    profile,
    'HD-04',
    'levels',
    {},
  );
  const part = levels.part ?? {};
  const front = levels.front ?? {};
  const phrase = param<string>(profile, 'ST-10', 'requiredPhrase', '');
  const numberAlign = param(profile, 'NM-02', 'position', 'bottom-center').replace(
    /^(top|bottom)-/,
    '',
  );
  const parts = profile.structure?.partsInOrder ?? [
    ...texts.defaultParts.map((title, i) => ({
      id: i === 0 ? 'toc' : `part-${i}`,
      title,
      aliases: [],
      optional: false,
      sharesPageWithNext: false,
    })),
  ];
  const passportFields = profile.structure?.passportFields ?? [];

  // --- стили: «Обычный» несёт шрифт, интервал и красную строку, заголовки — свой вид ---
  const half = (pt: number): number => Math.round(pt * 2);
  const rPr = `<w:rFonts w:ascii="${xml(font)}" w:hAnsi="${xml(font)}" w:cs="${xml(font)}"/><w:sz w:val="${half(sizePt)}"/><w:szCs w:val="${half(sizePt)}"/>`;
  const pPr = `<w:spacing w:before="0" w:after="0" w:line="${Math.round(line * 240)}" w:lineRule="auto"/><w:ind w:firstLine="${Math.round(indentCm * TWIPS_PER_CM)}"/><w:jc w:val="${xml(align)}"/>`;
  const heading = (id: string, name: string, level: number, spec: typeof part): string =>
    `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/>` +
    `<w:pPr><w:keepNext/><w:ind w:firstLine="0"/><w:jc w:val="${spec.align ?? 'left'}"/><w:outlineLvl w:val="${level}"/></w:pPr>` +
    `<w:rPr>${spec.bold ? '<w:b/>' : ''}<w:sz w:val="${half(spec.sizePt ?? sizePt)}"/><w:szCs w:val="${half(spec.sizePt ?? sizePt)}"/></w:rPr></w:style>`;
  const styles =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="${W}">` +
    `<w:docDefaults><w:rPrDefault><w:rPr>${rPr}</w:rPr></w:rPrDefault><w:pPrDefault><w:pPr>${pPr}</w:pPr></w:pPrDefault></w:docDefaults>` +
    '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>' +
    heading('Heading1', 'heading 1', 0, part) +
    '<w:style w:type="paragraph" w:styleId="TOC1"><w:name w:val="toc 1"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:firstLine="0"/><w:jc w:val="left"/></w:pPr></w:style>' +
    '</w:styles>';

  // --- текст: титульный лист, затем части по порядку ---
  const center = '<w:ind w:firstLine="0"/><w:jc w:val="center"/>';
  const body: string[] = [];
  texts.titleLines.forEach((text, i) => {
    // Расстояния на титульном — интервалом «перед», а не пустыми строками.
    body.push(para(text, `${center}${i > 0 ? '<w:spacing w:before="240"/>' : ''}`));
    if (i === 2 && phrase) body.push(para(phrase, `${center}<w:spacing w:before="240"/>`));
  });

  parts.forEach((p, i) => {
    if (p.optional) return; // необязательные части (приложение) ученик добавит сам
    // Часть, которая делит страницу с предыдущей, начинается без разрыва страницы.
    const newPage = !(i > 0 && parts[i - 1]?.sharesPageWithNext);
    const isFront = p.id === 'passport' || p.id === 'toc';
    // Паспорт и содержание («front») могут оформляться иначе, чем остальные части.
    const style = isFront && front.align ? `<w:jc w:val="${front.align}"/>` : '';
    const bold = isFront ? Boolean(front.bold) : Boolean(part.bold);
    const boldRPr =
      bold === Boolean(part.bold) ? '' : `<w:rPr>${bold ? '<w:b/>' : '<w:b w:val="0"/>'}</w:rPr>`;
    body.push(
      `<w:p><w:pPr><w:pStyle w:val="Heading1"/>${newPage ? '<w:pageBreakBefore/>' : ''}${style}</w:pPr>` +
        `<w:r>${boldRPr}<w:t xml:space="preserve">${xml(p.title)}</w:t></w:r></w:p>`,
    );
    if (p.id === 'passport' && passportFields.length > 0) {
      const cell = (text: string): string =>
        `<w:tc><w:tcPr><w:tcW w:w="4500" w:type="dxa"/></w:tcPr>${para(text, '<w:ind w:firstLine="0"/><w:jc w:val="left"/><w:spacing w:line="240" w:lineRule="auto"/>')}</w:tc>`;
      body.push(
        '<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders>' +
          ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']
            .map((side) => `<w:${side} w:val="single" w:sz="4" w:space="0" w:color="auto"/>`)
            .join('') +
          '</w:tblBorders></w:tblPr>' +
          passportFields
            .map((field) => `<w:tr>${cell(field)}${cell(texts.passportValue)}</w:tr>`)
            .join('') +
          '</w:tbl>',
      );
    } else if (p.id === 'toc') {
      // Содержание — поле Word: после правки текста его обновляют, номера страниц встанут сами.
      body.push(
        `<w:p><w:pPr><w:ind w:firstLine="0"/></w:pPr><w:r><w:fldChar w:fldCharType="begin" w:dirty="true"/></w:r>` +
          `<w:r><w:instrText xml:space="preserve"> TOC \\o "1-3" \\h \\z \\u </w:instrText></w:r>` +
          `<w:r><w:fldChar w:fldCharType="separate"/></w:r>${run(texts.tocHint)}<w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>`,
      );
    } else if (!p.sharesPageWithNext) {
      body.push(para(texts.placeholder(p.title)));
    }
  });

  // --- раздел: размер A4, поля, номер страницы внизу, на титульном без номера ---
  const sect =
    `<w:sectPr><w:footerReference w:type="default" r:id="rIdFooter"/>` +
    `<w:pgSz w:w="11906" w:h="16838"/>` +
    `<w:pgMar w:top="${margin('PG-04', 20)}" w:right="${margin('PG-03', 10)}" w:bottom="${margin('PG-05', 20)}" w:left="${margin('PG-02', 30)}" w:header="708" w:footer="708" w:gutter="0"/>` +
    '<w:titlePg/></w:sectPr>';
  const footer =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr xmlns:w="${W}">` +
    `<w:p><w:pPr><w:ind w:firstLine="0"/><w:jc w:val="${numberAlign}"/></w:pPr>` +
    '<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r>' +
    '<w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>2</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p></w:ftr>';

  const files: Record<string, string> = {
    '[Content_Types].xml':
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
      '<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>' +
      '<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>' +
      '</Types>',
    '_rels/.rels':
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
      '</Relationships>',
    'word/_rels/document.xml.rels':
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
      '<Relationship Id="rIdSettings" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>' +
      '<Relationship Id="rIdFooter" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>' +
      '</Relationships>',
    'word/document.xml':
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="${W}" xmlns:r="${R}"><w:body>` +
      body.join('') +
      sect +
      '</w:body></w:document>',
    'word/styles.xml': styles,
    // Word обновит содержание при открытии файла (спросит разрешения).
    'word/settings.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:settings xmlns:w="${W}"><w:updateFields w:val="true"/></w:settings>`,
    'word/footer1.xml': footer,
  };
  return zipSync(
    Object.fromEntries(Object.entries(files).map(([name, text]) => [name, strToU8(text)])),
  );
}
