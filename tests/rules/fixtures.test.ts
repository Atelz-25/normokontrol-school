// Каждое правило этапа 1 на паре документов: «хорошо» — без замечаний, «плохо» — с замечаниями.
// Профиль — «Наша школа», потому что фикстуры оформлены по его требованиям.
import { describe, expect, it } from 'vitest';
import { FIXTURES, PB01_HARD_BREAK } from '../../scripts/lib/fixtures.ts';
import { checkDocx, type RuleResult } from '../../src/core/engine/index.ts';
import { BUILTIN_PROFILES } from '../../src/core/profiles/builtin.ts';
import { RULES } from '../../src/core/rules/registry.ts';

const school = BUILTIN_PROFILES.find((profile) => profile.id === 'school-custom')!;

function resultFor(bytes: Uint8Array, ruleId: string): RuleResult {
  const result = checkDocx(bytes, school).results.find((r) => r.ruleId === ruleId);
  if (!result) throw new Error(`${ruleId} нет в профиле`);
  return result;
}

describe('фикстуры good/bad', () => {
  it('у каждого правила из реестра есть пара фикстур', () => {
    expect(Object.keys(FIXTURES).sort()).toEqual(RULES.map((rule) => rule.id).sort());
  });

  for (const [ruleId, pair] of Object.entries(FIXTURES)) {
    describe(ruleId, () => {
      it('good: без замечаний', () => {
        const result = resultFor(pair.good(), ruleId);
        expect(result.status, JSON.stringify(result.findings.map((f) => f.message))).toBe('pass');
      });

      it('bad: есть замечания', () => {
        const result = resultFor(pair.bad(), ruleId);
        expect(result.status).toBe('fail');
        expect(result.findings.length).toBeGreaterThan(0);
        for (const f of result.findings) expect(f.message.length).toBeGreaterThan(5);
      });
    });
  }
});

describe('детали правил', () => {
  it('PR-03: из трёх абзацев два с неверным отступом (0,63 см и без отступа)', () => {
    const result = resultFor(FIXTURES['PR-03']!.bad(), 'PR-03');
    expect(result.affected).toBe(2);
    expect(result.checked).toBe(3);
  });

  it('PR-06 и PR-10 не считают один пустой абзац дважды', () => {
    const bytes = FIXTURES['PR-10']!.bad();
    const single = resultFor(bytes, 'PR-06');
    const series = resultFor(bytes, 'PR-10');
    expect(single.findings).toHaveLength(0);
    expect(series.metrics.series).toBe(3);
    expect(series.metrics.emptyParagraphsInSeries).toBe(30);
  });

  it('PB-01: ручной разрыв страницы (Ctrl+Enter) тоже считается', () => {
    expect(resultFor(PB01_HARD_BREAK(), 'PB-01').status).toBe('pass');
  });

  it('PB-01: в сообщении сказано, сколько пустых абзацев стоит вместо разрыва', () => {
    const result = resultFor(FIXTURES['PB-01']!.bad(), 'PB-01');
    expect(result.findings[0]?.message).toContain('10 пустых абзацев');
  });

  it('PR-05: строка из пробелов и отступ пробелами', () => {
    expect(resultFor(FIXTURES['PR-05']!.bad(), 'PR-05').affected).toBe(2);
  });
});
