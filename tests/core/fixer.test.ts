// Автоисправление: круговые тесты (бриф, раздел 11). Исправленный файл снова читается
// нашим же читателем, текст не меняется (кроме задуманных замен), остальные части архива
// остаются байт в байт, исходные байты не трогаются.
import { existsSync, readFileSync } from 'node:fs';
import { unzipSync } from 'fflate';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { describe, expect, it } from 'vitest';
import { FIXTURES } from '../../scripts/lib/fixtures.ts';
import { checkDocx, type Report } from '../../src/core/engine/index.ts';
import { FIXABLE, fixDocx } from '../../src/core/fixer/index.ts';
import { ensureChild } from '../../src/core/fixer/ooxml.ts';
import { BUILTIN_PROFILES } from '../../src/core/profiles/builtin.ts';
import { readDocx } from '../../src/core/reader/index.ts';
import { NS } from '../../src/core/xml.ts';

const school = BUILTIN_PROFILES.find((profile) => profile.id === 'school-custom')!;
const result = (report: Report, id: string) => report.results.find((r) => r.ruleId === id);

// Текст абзацев с текстом; пробелы и вид тире нормализуем — их как раз и исправляем.
const texts = (bytes: Uint8Array): string[] =>
  readDocx(bytes)
    .paragraphs.filter((p) => !p.isEmpty)
    .map((p) =>
      p.text
        .replace(/[\s\u00a0]+/g, ' ')
        .replace(/[–-]/g, '-')
        .replace(/ ([,;:!?.)»\]])/g, '$1')
        .replace(/([(«[]) /g, '$1')
        .trim(),
    );

// TY-02 исправляется частично: лишний пробел убираем, а пробел «после» ставить не берёмся.
const PARTIAL = new Set(['TY-02']);

describe('исправление каждого правила на его «плохой» фикстуре', () => {
  for (const id of FIXABLE.filter((ruleId) => FIXTURES[ruleId])) {
    it(`${id}: после исправления замечаний ${PARTIAL.has(id) ? 'меньше' : 'нет'}, текст тот же`, () => {
      const bad = FIXTURES[id]!.bad();
      const copy = bad.slice();
      const before = result(checkDocx(bad, school), id)!;
      const fixed = fixDocx(bad, school, [id]);
      const after = result(checkDocx(fixed.bytes, school), id)!;
      if (PARTIAL.has(id)) expect(after.findings.length).toBeLessThan(before.findings.length);
      else expect(after.status, JSON.stringify(after.findings.map((f) => f.message))).toBe('pass');
      expect(fixed.applied[id]).toBeGreaterThan(0);
      expect(texts(fixed.bytes)).toEqual(texts(bad));
      expect(bad).toEqual(copy); // исходные байты не изменились
    });
  }
});

describe('целостность архива', () => {
  it('все части, кроме word/document.xml, остаются байт в байт', () => {
    const bad = FIXTURES['PR-06']!.bad();
    const fixed = fixDocx(bad, school, FIXABLE);
    const a = unzipSync(bad);
    const b = unzipSync(fixed.bytes);
    expect(Object.keys(b).sort()).toEqual(Object.keys(a).sort());
    for (const name of Object.keys(a))
      if (name !== 'word/document.xml') expect(b[name], name).toEqual(a[name]);
  });

  it('образцовая работа: исправлять нечего, файл читается так же', () => {
    const model = readFileSync(new URL('../../fixtures/good/model-note.docx', import.meta.url));
    const fixed = fixDocx(model, school, FIXABLE);
    expect(fixed.applied).toEqual({});
    expect(texts(fixed.bytes)).toEqual(texts(model));
  });
});

describe('порядок свойств по схеме OOXML', () => {
  it('w:spacing встаёт перед w:jc, w:pageBreakBefore — после w:keepNext', () => {
    const doc = new DOMParser().parseFromString(
      `<w:pPr xmlns:w="${NS.w}"><w:keepNext/><w:jc w:val="both"/></w:pPr>`,
      'text/xml',
    );
    const pPr = doc.documentElement!;
    ensureChild(pPr, 'spacing');
    ensureChild(pPr, 'pageBreakBefore');
    const order = Array.from(pPr.childNodes).map((n) => (n as { localName?: string }).localName);
    expect(order).toEqual(['keepNext', 'pageBreakBefore', 'spacing', 'jc']);
    expect(new XMLSerializer().serializeToString(doc)).toContain('<w:spacing/>');
  });
});

const sampleUrl = new URL('../../fixtures/real/sample-v2.docx', import.meta.url);
describe.skipIf(!existsSync(sampleUrl))('прошлая работа (личный файл, может отсутствовать)', () => {
  it('эксперимент из RULES-SCHOOL, раздел 5: после исправления PB-01 и PR-10 в тексте нет', () => {
    const bytes = readFileSync(sampleUrl);
    const fixed = fixDocx(bytes, school, [
      'PR-06',
      'PR-10',
      'PB-01',
      'PR-09',
      'PG-02',
      'PG-03',
      'PG-04',
      'PG-05',
    ]);
    const report = checkDocx(fixed.bytes, school);
    expect(result(report, 'PB-01')?.status).toBe('pass');
    expect(result(report, 'PR-09')?.status).toBe('pass');
    expect(result(report, 'PG-02')?.status).toBe('pass');
    // Титульный лист не трогаем: там остаются только «замечания» (warning).
    for (const id of ['PR-06', 'PR-10'])
      expect(
        result(report, id)?.groups.filter((g) => g.key !== 'title-page'),
        id,
      ).toEqual([]);
    expect(texts(fixed.bytes)).toEqual(texts(bytes));
  });
});
