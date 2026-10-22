// Модульные тесты разбора ссылок [N] и записей списка литературы.
import { describe, expect, it } from 'vitest';
import { citedNumbers } from '../../src/core/rules/references.ts';

describe('ссылки [N] в тексте', () => {
  it.each<[string, number[]]>([
    ['как сказано в [3].', [3]],
    ['цитата [3, с. 14].', [3]],
    ['обзор [2–4].', [2, 3, 4]],
    ['источники [1; 5].', [1, 5]],
    ['смешанно [1, 3–4].', [1, 3, 4]],
  ])('%s → %j', (text, numbers) => {
    expect(citedNumbers(text).flatMap((c) => c.numbers)).toEqual(numbers);
  });

  it('квадратные скобки без чисел — не ссылка', () => {
    expect(citedNumbers('поле [Фамилия] и [x]')).toEqual([]);
  });
});
