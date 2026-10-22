// Оценка 0–100: проверяем формулу на примерах, посчитанных вручную (docs/SCORING.md).
import { describe, expect, it } from 'vitest';
import { FIXTURES } from '../../scripts/lib/fixtures.ts';
import { buildDocx, emptyRun, p } from '../../scripts/lib/docx-builder.ts';
import { checkDocx } from '../../src/core/engine/index.ts';
import { computeScore } from '../../src/core/engine/score.ts';
import type { Profile, RuleConfig } from '../../src/core/profiles/types.ts';

const profile = (rules: Record<string, RuleConfig>): Profile => ({
  schemaVersion: 1,
  id: 'test',
  title: 'Тест',
  rules,
});
const on = (
  severity: RuleConfig['severity'],
  params: Record<string, unknown> = {},
): RuleConfig => ({
  enabled: true,
  severity,
  params,
});

describe('оценка', () => {
  it('ручной расчёт: PR-03 (ошибка, 2 из 3 абзацев) и TY-03 (замечание, без замечаний)', () => {
    // PR-03: вес 3, балл 1 − 2/3 = 1/3. TY-03: вес 2, балл 1. DC-01: совет, вес 0 — не считается.
    // Итог = 100 × (3 × 1/3 + 2 × 1) / (3 + 2) = 100 × 3 / 5 = 60.
    const report = checkDocx(
      FIXTURES['PR-03']!.bad(),
      profile({
        'PR-03': on('error', { appliesTo: ['body'] }),
        'TY-03': on('warning'),
        'DC-01': on('info'),
      }),
    );
    const score = computeScore(report);
    expect(score.total).toBe(60);
    expect(score.byCategory.paragraph).toEqual({ earned: 1, possible: 3 });
    expect(score.byCategory.typography).toEqual({ earned: 2, possible: 2 });
  });

  it('правило по документу: 1 или 0', () => {
    const report = checkDocx(
      FIXTURES['DC-01']!.bad(),
      profile({ 'DC-01': on('error'), 'PG-02': on('error') }),
    );
    // DC-01 провалено (0 из 3), PG-02 пройдено (3 из 3): 100 × 3 / 6 = 50.
    expect(computeScore(report).total).toBe(50);
  });

  it('неприменимые и не реализованные правила не входят в оценку', () => {
    const report = checkDocx(
      FIXTURES['PR-06']!.good(),
      profile({ 'PR-08': on('error'), 'XX-01': on('error'), 'PR-06': on('error') }),
    );
    expect(computeScore(report).items.map((i) => i.ruleId)).toEqual(['PR-06']);
    expect(computeScore(report).total).toBe(100);
  });

  it('отметка «здесь это есть» убирает эвристическое правило из оценки', () => {
    const report = checkDocx(
      FIXTURES['DC-01']!.bad(),
      profile({ 'DC-01': on('error'), 'PG-02': on('error') }),
    );
    expect(computeScore(report, new Set(['DC-01'])).total).toBe(100);
  });

  it('титульный лист — отдельная строка со своей серьёзностью', () => {
    // Три пустых абзаца подряд на титульном листе (до разрыва) и ничего в тексте.
    const bytes = buildDocx({
      body: [
        p('Титул'),
        ...emptyRun(3),
        '<w:p><w:r><w:br w:type="page"/></w:r></w:p>',
        p('Введение'),
        p('Текст работы.'),
      ],
    });
    const report = checkDocx(
      bytes,
      profile({ 'PR-10': on('error', { titlePageSeverity: 'warning' }) }),
    );
    const items = computeScore(report).items.map((i) => `${i.group}:${i.severity}:${i.earned}`);
    // Основная строка (ошибка) чистая, строка титульного листа (замечание) провалена.
    expect(items).toEqual(['main:error:1', 'title-page:warning:0']);
    expect(computeScore(report).total).toBe(60); // 100 × (3 × 1 + 2 × 0) / 5
  });
});
