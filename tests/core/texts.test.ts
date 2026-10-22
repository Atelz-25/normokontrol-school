// Тексты отчёта: склонение по числу и формулировки, которые легко сделать неверными.
import { describe, expect, it } from 'vitest';
import { msg, plural, summary } from '../../src/i18n/rules-ru.ts';

const FORMS: [string, string, string] = ['абзац', 'абзаца', 'абзацев'];

describe('склонение', () => {
  it.each([
    [1, 'абзац'],
    [2, 'абзаца'],
    [4, 'абзаца'],
    [5, 'абзацев'],
    [11, 'абзацев'],
    [12, 'абзацев'],
    [21, 'абзац'],
    [22, 'абзаца'],
    [111, 'абзацев'],
    [124, 'абзаца'],
  ])('%i %s', (n, form) => {
    expect(plural(n, FORMS)).toBe(form);
  });

  it('сводки: «из 1 абзаца», «из 37 абзацев», «1 место в 1 абзаце»', () => {
    expect(summary.paragraphs(1, 1)).toBe('Замечание в 1 из 1 абзаца.');
    expect(summary.paragraphs(10, 37)).toBe('Замечание в 10 из 37 абзацев.');
    expect(summary.occurrences(1, 1)).toBe('1 место в 1 абзаце.');
    expect(summary.series(2, 4, 2)).toContain('2 серии пустых абзацев, в них 4 абзаца');
  });
});

describe('PB-01: «из-за пустых строк» только если они есть', () => {
  it('нет пустых строк — нет и этой фразы', () => {
    expect(msg.noPageBreak('Содержание', 0, true)).not.toContain('пустых строк');
  });

  it('есть пустые строки — фраза на месте и с верным склонением', () => {
    const text = msg.noPageBreak('Введение', 2, true);
    expect(text).toContain('вместо него 2 пустых абзаца');
    expect(text).toContain('из-за пустых строк');
  });
});
