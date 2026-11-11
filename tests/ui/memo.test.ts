// Памятка требований собирается из чисел профиля, а не из зашитых в код значений.
import { describe, expect, it } from 'vitest';
import { BUILTIN_PROFILES } from '../../src/core/profiles/builtin.ts';
import { memoLines } from '../../src/ui/memo.ts';

const school = BUILTIN_PROFILES.find((p) => p.id === 'school-custom')!;

describe('памятка требований', () => {
  it('поля, шрифт и красная строка — из требований школы', () => {
    const lines = Object.fromEntries(memoLines(school));
    expect(lines['Поля']).toBe('слева 30 мм, справа 10 мм, сверху 20 мм, снизу 20 мм');
    expect(lines['Шрифт']).toBe('Times New Roman, 12 pt');
    expect(lines['Красная строка']).toContain('1,5 см');
    expect(lines['Части по порядку']).toContain('Введение');
  });

  it('выключенное правило в памятку не попадает', () => {
    const off = {
      ...school,
      rules: { ...school.rules, 'PR-03': { ...school.rules['PR-03']!, enabled: false } },
    };
    expect(memoLines(off).map(([what]) => what)).not.toContain('Красная строка');
  });
});
