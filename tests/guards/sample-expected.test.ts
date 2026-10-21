// Сторож данных №2: эталон sample-v2.expected.json читается и сам себе не противоречит.
// Тест по самому .docx пропускается, если файла нет: в нём персональные данные,
// и в git (а значит и в CI) его нет. Тест никогда не печатает текст документа.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const root = new URL('../../', import.meta.url);
const expectedUrl = new URL('fixtures/real/sample-v2.expected.json', root);
const docxUrl = new URL('fixtures/real/sample-v2.docx', root);

type Entry = Record<string, unknown> & { status: string };
interface Expected {
  file: string;
  profile: string;
  expected: Record<string, Entry>;
}

const data = JSON.parse(readFileSync(expectedUrl, 'utf8')) as Expected;
const exp = data.expected;
const num = (ruleId: string, key: string): number => {
  const value = exp[ruleId]?.[key];
  if (typeof value !== 'number') throw new Error(`${ruleId}.${key} не число`);
  return value;
};
const sum = (value: unknown): number =>
  Object.values(value as Record<string, number>).reduce((a, b) => a + b, 0);

describe('fixtures/real/sample-v2.expected.json', () => {
  it('ссылается на существующий профиль и на файл в fixtures/real', () => {
    expect(existsSync(new URL(data.profile, root))).toBe(true);
    expect(data.file).toBe('fixtures/real/sample-v2.docx');
  });

  it('у каждой записи понятный статус, и правило есть в профиле школы', () => {
    const profile = JSON.parse(readFileSync(new URL(data.profile, root), 'utf8')) as {
      rules: Record<string, unknown>;
    };
    const statuses = ['pass', 'fail', 'info', 'not-tested', 'not-applicable'];
    for (const [ruleId, entry] of Object.entries(exp)) {
      expect(statuses, ruleId).toContain(entry.status);
      // "TB-01..04" — диапазон, проверяем каждое правило из него.
      const ids = ruleId === 'TB-01..04' ? ['TB-01', 'TB-02', 'TB-03', 'TB-04'] : [ruleId];
      for (const id of ids) expect(Object.keys(profile.rules), id).toContain(id);
    }
  });

  // Инварианты из RULES-SCHOOL.md: если кто-то поправит одно число, а другое забудет,
  // тест на этапе 1 сравнивал бы отчёт с противоречивым эталоном.
  it('каждый пустой абзац ровно в одной серии: PR-06 + PR-10 = VL-02', () => {
    expect(num('PR-06', 'single') + num('PR-10', 'emptyParagraphsInSeries')).toBe(
      num('VL-02', 'empty'),
    );
  });

  it('разбивки по зонам сходятся с итогами', () => {
    expect(sum(exp['PR-06']?.byZone)).toBe(num('PR-06', 'single'));
    expect(sum(exp['PR-10']?.byZone)).toBe(num('PR-10', 'series'));
    expect(sum(exp['PR-10']?.seriesBeforePartHeadings)).toBe(
      num('PR-10', 'emptyBeforePartHeadingsTotal'),
    );
  });

  it('PR-03: нарушения = без отступа + короткий отступ, всего = нарушения + норма', () => {
    const noIndent = (exp['PR-03']?.noIndent as number[]).length;
    const short = (exp['PR-03']?.['shortIndent(0.63cm)'] as number[]).length;
    expect(noIndent + short).toBe(num('PR-03', 'violations'));
    expect(num('PR-03', 'violations') + num('PR-03', 'okIndent(1.27cm)')).toBe(num('PR-03', 'of'));
  });

  it('PB-01: число частей, где нужен разрыв, совпадает со списком', () => {
    expect((exp['PB-01']?.ids as string[]).length).toBe(num('PB-01', 'headingsNeedingBreak'));
  });

  it('TH-01: «не хватает» = норма − факт', () => {
    expect(num('TH-01', 'chars') + num('TH-01', 'missingToMin')).toBe(5400);
    expect(num('TH-01', 'chars') + num('TH-01', 'missingToRecommended')).toBe(7200);
  });
});

describe.skipIf(!existsSync(docxUrl))(
  'fixtures/real/sample-v2.docx (личный файл, может отсутствовать)',
  () => {
    it('это zip-архив .docx разумного размера с word/document.xml', () => {
      const bytes = readFileSync(docxUrl);
      expect(statSync(docxUrl).size).toBeLessThan(25 * 1024 * 1024);
      // Каждый zip начинается с сигнатуры локального заголовка "PK\x03\x04".
      expect([...bytes.subarray(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);
      // Имена записей в zip хранятся несжатыми, поэтому их видно без распаковки.
      expect(bytes.includes('word/document.xml')).toBe(true);
    });
  },
);
