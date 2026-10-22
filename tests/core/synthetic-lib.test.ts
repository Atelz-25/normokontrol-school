// Сравнение с разметкой синтетического набора: та же логика, что в evaluate.py.
import { describe, expect, it } from 'vitest';
import { compareSynthetic, formatSynthetic, parseTruth } from '../../scripts/lib/synthetic-lib.ts';

const csv = [
  'file,rule,paragraph,expected,severity,note',
  'a.docx,PR-06,5,finding,error,"пустой, между абзацами"',
  'a.docx,PG-02,,finding,error,левое поле',
  'b.docx,PR-03,7,finding,error,красная строка',
  'b.docx,PR-03,9,pass,,ловушка 1.27',
].join('\n');

describe('оценка на синтетическом наборе', () => {
  it('CSV с кавычками и запятыми внутри', () => {
    const truth = parseTruth(csv);
    expect(truth).toHaveLength(4);
    expect(truth[0]?.note).toBe('пустой, между абзацами');
    expect(truth[1]?.paragraph).toBe('');
  });

  it('верно, пропуск, ложно, ловушки и серьёзность', () => {
    const r = compareSynthetic(parseTruth(csv), [
      { file: 'a.docx', rule: 'PR-06', paragraph: 5, severity: 'warning' },
      { file: 'a.docx', rule: 'PG-02', paragraph: '' }, // документное правило: по файлу и правилу
      { file: 'b.docx', rule: 'PR-03', paragraph: 9 }, // ловушка не пройдена
    ]);
    expect(r.total).toEqual({ tp: 2, fn: 1, fp: 1 });
    expect(r.missed.map((m) => m.paragraph)).toEqual(['7']);
    expect(r.failedTraps).toHaveLength(1);
    expect(r.wrongSeverity[0]?.got).toBe('warning');
    expect(formatSynthetic(r)).toContain('Ловушки: пройдено 0 из 1');
  });
});
