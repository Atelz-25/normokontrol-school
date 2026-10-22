// Эталон sample-v2.expected.json: сам себе не противоречит, а отчёт по реальному файлу
// с ним совпадает. Тест по .docx пропускается, если файла нет: в нём персональные данные,
// и в git (а значит и в CI) его нет. Тест никогда не печатает текст документа.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkDocx, type RuleResult } from '../../src/core/engine/index.ts';
import { BUILTIN_PROFILES } from '../../src/core/profiles/builtin.ts';
import { readDocx } from '../../src/core/reader/index.ts';

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
  // отчёт сравнивался бы с противоречивым эталоном.
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
    it('это zip-архив .docx разумного размера', () => {
      const bytes = readFileSync(docxUrl);
      expect(statSync(docxUrl).size).toBeLessThan(25 * 1024 * 1024);
      expect([...bytes.subarray(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);
    });

    // Отчёт строим один раз на все проверки ниже.
    const profile = BUILTIN_PROFILES.find((p) => p.id === 'school-custom')!;
    const report = existsSync(docxUrl) ? checkDocx(readFileSync(docxUrl), profile) : undefined;
    const result = (ruleId: string): RuleResult => {
      const found = report?.results.find((r) => r.ruleId === ruleId);
      if (!found) throw new Error(`${ruleId} нет в отчёте`);
      return found;
    };
    const paragraphs = (ruleId: string): number[] =>
      result(ruleId).findings.map((f) => f.location.paragraphIndex ?? 0);

    it('статусы реализованных правил совпадают с эталоном', () => {
      const implemented = report!.results.filter(
        (r) => !['not-implemented', 'disabled'].includes(r.status),
      );
      for (const r of implemented) {
        const entry = exp[r.ruleId];
        // 'not-tested' (FN-01): имя файла в тесте неизвестно, правило там неприменимо.
        if (!entry || entry.status === 'info' || entry.status === 'not-tested') continue;
        expect(r.status, r.ruleId).toBe(entry.status);
      }
    });

    it('поля и лист: числа из XML точно', () => {
      for (const id of ['PG-02', 'PG-03', 'PG-04', 'PG-05'])
        expect(result(id).metrics.actualMm, id).toBe(num(id, 'actualMm'));
      expect(result('PG-06').metrics.sections).toBe(num('PG-06', 'sections'));
    });

    it('PR-06: 59 одиночных пустых абзацев, по зонам 3 / 9 / 47', () => {
      const m = result('PR-06').metrics;
      expect(m.single).toBe(num('PR-06', 'single'));
      expect(m.byZone).toEqual(exp['PR-06']?.byZone);
    });

    it('PR-10: серии, их длины и серии перед заголовками частей', () => {
      const m = result('PR-10').metrics;
      for (const key of [
        'series',
        'emptyParagraphsInSeries',
        'longest',
        'emptyBeforePartHeadingsTotal',
      ])
        expect(m[key], key).toBe(num('PR-10', key));
      expect(m.seriesBeforePartHeadings).toEqual(exp['PR-10']?.seriesBeforePartHeadings);
      expect(m.byZone).toEqual(exp['PR-10']?.byZone);
    });

    it('группы отчёта: текст работы, содержание, титульный лист', () => {
      for (const id of ['PR-02', 'PR-05', 'PR-06', 'PR-09', 'PR-10']) {
        const groups = Object.fromEntries(result(id).groups.map((g) => [g.key, g.findings.length]));
        expect(groups, id).toEqual(exp[id]?.byGroup);
      }
      // На титульном листе серьёзность мягче (titlePageSeverity в профиле).
      for (const id of ['PR-05', 'PR-06', 'PR-10'])
        expect(result(id).groups.find((g) => g.key === 'title-page')?.severity, id).toBe('warning');
      // Разрыв перед частью — замечание к документу, а не «к содержанию».
      expect(result('PB-01').groups.map((g) => g.key)).toEqual(['main']);
    });

    it('PB-01: нужен разрыв перед 8 частями, разрывов нет', () => {
      const m = result('PB-01').metrics;
      for (const key of [
        'headingsNeedingBreak',
        'headingsWithBreak',
        'hardBreaks',
        'pageBreakBefore',
        'sectionBreaks',
      ])
        expect(m[key], key).toBe(num('PB-01', key));
      expect(m.ids).toEqual(exp['PB-01']?.ids);
    });

    it('PR-03: те же 10 абзацев из 37', () => {
      const e = exp['PR-03']!;
      expect(result('PR-03').checked).toBe(num('PR-03', 'of'));
      expect(paragraphs('PR-03').sort((a, b) => a - b)).toEqual(
        [...(e.noIndent as number[]), ...(e['shortIndent(0.63cm)'] as number[])].sort(
          (a, b) => a - b,
        ),
      );
    });

    it('PR-09: 74 из 115', () => {
      expect(result('PR-09').affected).toBe(num('PR-09', 'withRightIndent'));
      expect(result('PR-09').checked).toBe(num('PR-09', 'of'));
    });

    it('PR-08: таблица паспорта без замечаний, 29 абзацев с текстом', () => {
      expect(result('PR-08').findings).toHaveLength(0);
      expect(result('PR-08').metrics.cellParagraphs).toBe(num('PR-08', 'cellParagraphs'));
    });

    it('нет ложных срабатываний PR-01, FT-02 и PR-08 на таблице паспорта', () => {
      // Номера абзацев таблицы берём из модели документа, а не пишем руками.
      const table = readDocx(readFileSync(docxUrl)).tables[0]!;
      const passportCells = new Set<number>();
      for (let i = table.firstParagraph; i <= table.lastParagraph; i++) passportCells.add(i);
      expect(passportCells.size).toBe(32);
      for (const id of ['PR-01', 'FT-02', 'PR-08'])
        expect(
          paragraphs(id).filter((i) => passportCells.has(i)),
          id,
        ).toEqual([]);
    });

    it('PR-02: те же абзацы, что в эталоне (строки содержания, заголовки, паспорт)', () => {
      const e = exp['PR-02']!;
      const expected = [
        ...(e['toc-entry paragraphs with 10pt after'] as number[]),
        ...(e['headings (warning)'] as number[]),
        ...(e['passport heading before=12pt'] as number[]),
      ].sort((a, b) => a - b);
      expect(paragraphs('PR-02').sort((a, b) => a - b)).toEqual(expected);
    });

    it('PR-05: только строка из 69 пробелов (#16); TY-03: 8 дефисов', () => {
      const e = exp['PR-05']?.paragraphOfSpaces as { paragraph: number; length: number };
      expect(paragraphs('PR-05')).toEqual([e.paragraph]);
      expect(result('PR-05').findings[0]?.message).toContain(String(e.length));
      expect(result('TY-03').metrics.count).toBe(num('TY-03', 'count'));
    });

    // --- Этап 2 ---
    it('структура: заголовки частей на тех же абзацах, паспорт 11 из 11', () => {
      for (const id of ['ST-02', 'ST-05', 'ST-06', 'ST-07'])
        expect(result(id).metrics.headingParagraph, id).toBe(num(id, 'headingParagraph'));
      expect(result('ST-08').metrics.partHeadings).toEqual(exp['ST-08']?.partHeadings);
      expect(result('PS-01').metrics.fieldsFound).toBe(num('PS-01', 'fieldsFound'));
      expect(result('PS-01').metrics.of).toBe(num('PS-01', 'of'));
    });

    it('TH-01: 1 777 знаков, не хватает 3 623 и 5 423', () => {
      const m = result('TH-01').metrics;
      for (const key of ['chars', 'pages', 'missingToMin', 'missingToRecommended'])
        expect(m[key], key).toBe(num('TH-01', key));
    });

    it('VL-02: 183 пустых из 313, 14 477 знаков ≈ 8,0 страницы', () => {
      const m = result('VL-02').metrics;
      for (const key of ['empty', 'of', 'share', 'textChars', 'pagesBy1800'])
        expect(m[key], key).toBe(num('VL-02', key));
    });
  },
);
