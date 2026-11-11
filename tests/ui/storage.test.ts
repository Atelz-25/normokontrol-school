// Имя работы для истории попыток: версии одного файла считаются одной работой.
import { describe, expect, it } from 'vitest';
import { workKey } from '../../src/ui/storage.ts';

describe('история попыток', () => {
  it('исправленная версия и копия «(2)» — та же работа', () => {
    const base = workKey('Иванов, И. Пояснительная записка.docx');
    expect(workKey('Иванов, И. Пояснительная записка_исправлено.docx')).toBe(base);
    expect(workKey('Иванов, И. Пояснительная записка (2).docx')).toBe(base);
    expect(workKey('Петров, П. Пояснительная записка.docx')).not.toBe(base);
  });
});
