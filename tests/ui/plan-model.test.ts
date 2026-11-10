// План исправления: правила складываются в действия, порядок — как у учителя, место
// описывается словами «после „…“». Только данные, без DOM.
import { describe, expect, it } from 'vitest';
import { buildDocx, empty, p } from '../../scripts/lib/docx-builder.ts';
import { FIXTURES } from '../../scripts/lib/fixtures.ts';
import { checkDocx } from '../../src/core/engine/index.ts';
import { BUILTIN_PROFILES } from '../../src/core/profiles/builtin.ts';
import { ACTIONS } from '../../src/i18n/plan-ru.ts';
import { buildPlan, placeWhere, searchText } from '../../src/ui/plan-model.ts';

const school = BUILTIN_PROFILES.find((profile) => profile.id === 'school-custom')!;

describe('план исправления', () => {
  it('пустые строки (PR-06 и VL-02) — один пункт «Убрать пустые строки»', () => {
    const report = checkDocx(FIXTURES['PR-06']!.bad(), school, { fileName: 'x.docx' });
    const plan = buildPlan(report, school, new Set());
    const empties = plan.actions.find((a) => a.id === 'empty');
    expect(empties?.results.map((r) => r.ruleId)).toEqual(
      expect.arrayContaining(['PR-06', 'VL-02']),
    );
    // Пункт про пустые строки первый: за него учитель уже снижал баллы.
    expect(plan.actions[0]?.id).toBe('empty');
    expect(plan.verdict).toBe('early');
    expect(plan.fixRuleIds).toContain('PR-06');
  });

  it('образцовая работа: «можно сдавать», проблем нет', () => {
    const report = checkDocx(FIXTURES['PR-06']!.good(), {
      ...school,
      rules: { 'PR-06': school.rules['PR-06']! },
    });
    const plan = buildPlan(report, school, new Set());
    expect(plan.verdict).toBe('ready');
    expect(plan.problems).toBe(0);
  });

  it('«здесь это есть» уводит пункт в конец и убирает его места', () => {
    const report = checkDocx(FIXTURES['HD-01']!.bad(), school, { fileName: 'x.docx' });
    const before = buildPlan(report, school, new Set());
    const after = buildPlan(report, school, new Set(['HD-01']));
    const headings = after.actions.find((a) => a.results.some((r) => r.ruleId === 'HD-01'));
    expect(headings?.dismissed).toBe(true);
    expect(after.actions.at(-1)?.id).toBe(headings?.id);
    expect(headings?.places).toEqual([]); // мест у отмеченного пункта больше нет
    expect(after.problems).toBeLessThanOrEqual(before.problems);
  });

  it('каждое правило входит не больше чем в одно действие', () => {
    const all = ACTIONS.flatMap((a) => a.rules);
    expect(new Set(all).size).toBe(all.length);
  });
});

describe('где место', () => {
  const report = checkDocx(
    buildDocx({
      body: [p('Цель моей работы — собрать требования в одном месте.'), empty(), p('Дальше.')],
    }),
    school,
  );

  it('пустой абзац описывается соседним непустым: «после „Цель моей работы…“»', () => {
    const where = placeWhere(
      {
        ruleId: 'PR-06',
        severity: 'error',
        message: '',
        autoFixable: true,
        location: { paragraphIndex: 2 },
      },
      report.preview,
    );
    expect(where.near?.relation).toBe('after');
    expect(searchText(where.near?.text ?? '')).toBe('Цель моей работы — собрать требования в');
    expect(where.page).toBeUndefined(); // номер страницы не выдумываем
  });
});
