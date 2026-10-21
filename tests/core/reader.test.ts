// Чтение .docx: понятные ошибки на повреждённых и чужих файлах, разбор текста и форматирования.
import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { buildDocx, p, table } from '../../scripts/lib/docx-builder.ts';
import {
  DEFAULT_LIMITS,
  DocxError,
  readDocx,
  type DocxErrorCode,
} from '../../src/core/reader/index.ts';

function errorCode(bytes: Uint8Array, limits = DEFAULT_LIMITS): DocxErrorCode | 'no-error' {
  try {
    readDocx(bytes, limits);
    return 'no-error';
  } catch (error) {
    if (error instanceof DocxError) return error.code;
    throw error; // любое другое исключение — это падение, тест должен его увидеть
  }
}

const bytes = (...values: number[]): Uint8Array => new Uint8Array(values);
const zip = (files: Record<string, string>): Uint8Array =>
  zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)])));

describe('повреждённые и чужие файлы', () => {
  it.each<[string, Uint8Array, DocxErrorCode]>([
    ['пустой файл', new Uint8Array(), 'empty'],
    [
      'старый .doc или .docx с паролем',
      bytes(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1),
      'doc-or-encrypted',
    ],
    ['PDF', strToU8('%PDF-1.7 ...'), 'pdf'],
    ['RTF', strToU8('{\\rtf1 ...'), 'rtf'],
    ['случайные байты', strToU8('просто текст'), 'not-docx'],
    ['обрезанный zip', bytes(0x50, 0x4b, 0x03, 0x04, 1, 2, 3), 'broken'],
    [
      'ODT',
      zip({ mimetype: 'application/vnd.oasis.opendocument.text', 'content.xml': '<x/>' }),
      'odt',
    ],
    ['zip без word/document.xml', zip({ '[Content_Types].xml': '<Types/>' }), 'no-document'],
    ['чужой zip', zip({ 'photo.txt': 'hello' }), 'not-docx'],
    ['битый XML', zip({ 'word/document.xml': '<w:document><w:body>' }), 'broken'],
  ])('%s → %s', (_name, input, code) => {
    expect(errorCode(input)).toBe(code);
  });

  it('лимиты zip: слишком большой распакованный размер', () => {
    const docx = buildDocx({ body: [p('Текст')] });
    expect(errorCode(docx, { ...DEFAULT_LIMITS, maxTotalBytes: 100 })).toBe('zip-limits');
    expect(errorCode(docx, { ...DEFAULT_LIMITS, maxEntries: 2 })).toBe('zip-limits');
    expect(errorCode(docx, { ...DEFAULT_LIMITS, maxFileBytes: 10 })).toBe('too-large');
  });

  it('нормальный документ читается', () => {
    expect(errorCode(buildDocx({ body: [p('Текст')] }))).toBe('no-error');
  });
});

describe('разбор текста', () => {
  const wrap = (inner: string): Uint8Array => buildDocx({ body: [inner] });

  it('текст из многих прогонов, табуляция, ссылка, вставка и удаление', () => {
    const doc = readDocx(
      wrap(
        '<w:p><w:r><w:t>Раз</w:t></w:r><w:r><w:tab/></w:r>' +
          '<w:hyperlink><w:r><w:t>ссылка</w:t></w:r></w:hyperlink>' +
          '<w:ins w:id="1"><w:r><w:t> плюс</w:t></w:r></w:ins>' +
          '<w:del w:id="2"><w:r><w:delText>удалено</w:delText></w:r></w:del></w:p>',
      ),
    );
    const para = doc.paragraphs[0]!;
    expect(para.text).toBe('Раз\tссылка плюс');
    expect(para.runs.find((r) => r.inHyperlink)?.start).toBe(4);
    expect(doc.revisions).toBe(2);
  });

  it('сложное поле: инструкция не попадает в текст, результат попадает', () => {
    const doc = readDocx(
      wrap(
        '<w:p><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText> PAGE </w:instrText></w:r>' +
          '<w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>5</w:t></w:r>' +
          '<w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>',
      ),
    );
    expect(doc.paragraphs[0]?.text).toBe('5');
    expect(doc.paragraphs[0]?.fields).toEqual([{ type: 'PAGE', instruction: 'PAGE' }]);
  });

  it('mc:AlternateContent не удваивает текст', () => {
    const mc = 'http://schemas.openxmlformats.org/markup-compatibility/2006';
    const doc = readDocx(
      wrap(
        `<w:p><mc:AlternateContent xmlns:mc="${mc}"><mc:Choice Requires="x"><w:r><w:t>один</w:t></w:r></mc:Choice>` +
          '<mc:Fallback><w:r><w:t>один</w:t></w:r></mc:Fallback></mc:AlternateContent></w:p>',
      ),
    );
    expect(doc.paragraphs[0]?.text).toBe('один');
  });

  it('разрыв страницы в начале и в конце абзаца, пустота из пробелов и табуляций', () => {
    const doc = readDocx(
      buildDocx({
        body: [
          '<w:p><w:r><w:t>Текст</w:t><w:br w:type="page"/></w:r></w:p>',
          '<w:p><w:r><w:br w:type="page"/><w:t>Заголовок</w:t></w:r></w:p>',
          p(' \u00a0\t '),
        ],
      }),
    );
    expect(doc.paragraphs[0]?.pageBreakAtEnd).toBe(true);
    expect(doc.paragraphs[1]?.pageBreakAtStart).toBe(true);
    expect(doc.paragraphs[2]?.isEmpty).toBe(true);
  });

  it('абзацы таблиц нумеруются сквозь документ', () => {
    const doc = readDocx(
      buildDocx({
        body: [
          p('до'),
          table([
            ['a', 'b'],
            ['c', 'd'],
          ]),
          p('после'),
        ],
      }),
    );
    expect(doc.paragraphs.map((x) => x.index)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(doc.paragraphs[5]?.table).toBeUndefined();
    expect(doc.tables[0]).toMatchObject({
      firstParagraph: 2,
      lastParagraph: 5,
      rows: 2,
      firstColumnTexts: ['a', 'c'],
    });
  });
});
