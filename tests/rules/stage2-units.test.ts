// Модульные тесты помощников этапа 2: имя файла, римские номера, строки содержания.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildDocx, p } from '../../scripts/lib/docx-builder.ts';
import { readDocx } from '../../src/core/reader/index.ts';
import { numberValue } from '../../src/core/rules/headings.ts';
import { parseTocEntry, suggestFileName } from '../../src/core/rules/structure.ts';

const profile = JSON.parse(
  readFileSync(new URL('../../profiles/school-custom.json', import.meta.url), 'utf8'),
) as {
  rules: Record<string, { params: { pattern: string; example: string } }>;
};
const expected = JSON.parse(
  readFileSync(new URL('../../fixtures/real/sample-v2.expected.json', import.meta.url), 'utf8'),
) as { expected: Record<string, Record<string, unknown>> };

describe('FN-01: шаблон имени файла из профиля', () => {
  const { pattern, example } = profile.rules['FN-01']!.params;
  const accepts = (name: string): boolean => new RegExp(pattern, 'u').test(name);

  it('пример из профиля подходит, имя из чата — нет (как в эталоне)', () => {
    expect(accepts(example)).toBe(expected.expected['FN-01']?.patternAcceptsExample);
    expect(accepts('RV_Poyasnitelnaya_Zapiska_Ivanov_I_2.docx')).toBe(
      expected.expected['FN-01']?.patternAcceptsChatFileName,
    );
  });

  it('подсказка имени по строке «Автор проекта» с титульного листа', () => {
    expect(suggestFileName('Автор проекта: Иванов Иван, 10 класс')).toBe(
      'Иванов, И. Пояснительная записка.docx',
    );
    expect(suggestFileName('Без автора')).toBeUndefined();
  });
});

describe('HD-07: числа в номерах', () => {
  it.each([
    ['I', 1],
    ['IV', 4],
    ['IX', 9],
    ['XII', 12],
    ['7', 7],
  ])('%s → %i', (token, value) => {
    expect(numberValue(token)).toBe(value);
  });
});

describe('ST-04: строка содержания', () => {
  const entry = (text: string) =>
    parseTocEntry(readDocx(buildDocx({ body: [p(text)] })).paragraphs[0]!);

  it('номер, табуляция, название и номер страницы', () => {
    expect(entry('II.I.\tТЕОРЕТИЧЕСКАЯ ЧАСТЬ\t5')).toMatchObject({
      key: 'теоретическая часть',
      page: 5,
    });
  });

  it('точки до номера страницы', () => {
    expect(entry('Введение.........4')).toMatchObject({ key: 'введение', page: 4 });
  });

  it('строка без номера страницы', () => {
    expect(entry('Литература')).toMatchObject({ key: 'литература', page: undefined });
  });
});
