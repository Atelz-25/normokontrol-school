// Образцовая пояснительная записка (fixtures/good/model-note.docx, данные вымышленные)
// оформлена по всем требованиям школы. На ней не должно быть ни одного замечания ни от
// одного реализованного правила: это главный тест на ложные срабатывания. Каждое новое
// правило обязано его проходить.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkDocx } from '../../src/core/engine/index.ts';
import { BUILTIN_PROFILES } from '../../src/core/profiles/builtin.ts';

const bytes = readFileSync(new URL('../../fixtures/good/model-note.docx', import.meta.url));
const school = BUILTIN_PROFILES.find((profile) => profile.id === 'school-custom')!;
const report = checkDocx(bytes, school);

describe('fixtures/good/model-note.docx — образцовая работа', () => {
  it('ни одного замечания по всем реализованным правилам профиля школы', () => {
    const problems = report.results
      .filter((r) => r.status === 'fail' || r.status === 'crashed')
      .map(
        (r) =>
          `${r.ruleId}: ${r.findings
            .slice(0, 3)
            .map((f) => `#${f.location.paragraphIndex ?? '-'} ${f.message}`)
            .join(' | ')}`,
      );
    expect(problems).toEqual([]);
  });

  it('проверка действительно что-то проверила (правила применимы, а не пропущены)', () => {
    const passed = report.results.filter((r) => r.status === 'pass').map((r) => r.ruleId);
    for (const id of [
      'PG-02',
      'FT-01',
      'PR-01',
      'PR-03',
      'PR-06',
      'PR-08',
      'PR-09',
      'PR-10',
      'PB-01',
      'TY-02',
    ])
      expect(passed, id).toContain(id);
  });
});
