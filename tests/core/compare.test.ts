// Сравнение версий: исправлено / осталось / появилось, по смыслу, а не по номеру абзаца.
import { describe, expect, it } from 'vitest';
import { FIXTURES } from '../../scripts/lib/fixtures.ts';
import { buildDocx, empty, p } from '../../scripts/lib/docx-builder.ts';
import { compareReports } from '../../src/core/engine/compare.ts';
import { checkDocx } from '../../src/core/engine/index.ts';
import { BUILTIN_PROFILES } from '../../src/core/profiles/builtin.ts';

const school = BUILTIN_PROFILES.find((profile) => profile.id === 'school-custom')!;
const T = [
  'Первый абзац текста.',
  'Второй абзац текста.',
  'Третий абзац текста.',
  'Четвёртый абзац текста.',
];

describe('сравнение версий', () => {
  it('удалили два пустых абзаца из трёх: 2 исправлено, 1 осталось, оценка выросла', () => {
    const before = checkDocx(
      buildDocx({ body: [p(T[0]!), empty(), p(T[1]!), empty(), p(T[2]!), empty(), p(T[3]!)] }),
      school,
    );
    const after = checkDocx(
      buildDocx({ body: [p(T[0]!), p(T[1]!), p(T[2]!), empty(), p(T[3]!)] }),
      school,
    );
    const cmp = compareReports(before, after);
    expect(cmp.fixed.filter((f) => f.ruleId === 'PR-06')).toHaveLength(2);
    expect(cmp.remaining.filter((f) => f.ruleId === 'PR-06')).toHaveLength(1);
    expect(cmp.added).toEqual([]);
    expect(cmp.scoreAfter).toBeGreaterThan(cmp.scoreBefore ?? 100);
  });

  it('новая ошибка во второй версии попадает в «появилось»', () => {
    const cmp = compareReports(
      checkDocx(FIXTURES['TY-03']!.good(), school),
      checkDocx(FIXTURES['TY-03']!.bad(), school),
    );
    expect(cmp.added.map((f) => f.ruleId)).toContain('TY-03');
    expect(cmp.fixed.map((f) => f.ruleId)).not.toContain('TY-03');
  });
});
