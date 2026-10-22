// Оценка 0–100 (бриф, раздел 9; описание простыми словами — docs/SCORING.md).
//
//   вес правила: ошибка 3, замечание 2, совет 0 (советы в оценку не входят);
//   балл правила по абзацам или разделам = 1 − доля затронутых;
//   балл правила по документу (или по отдельным местам) = 1, если замечаний нет, иначе 0;
//   итог = 100 × Σ(вес × балл) / Σ(вес) по включённым и применимым правилам.
//
// Замечания на титульном листе и в содержании считаются отдельными строками со своей
// серьёзностью: так мягкое замечание на титуле не снижает оценку как ошибка в тексте.
import type { Severity } from '../profiles/types.ts';
import type { Category } from '../rules/types.ts';
import type { Report, ResultGroup, RuleResult } from './index.ts';

export const WEIGHTS: Record<Severity, number> = { error: 3, warning: 2, info: 0 };

export interface ScoreItem {
  ruleId: string;
  group: ResultGroup['key'];
  category: Category | 'other';
  severity: Severity;
  weight: number;
  earned: number; // от 0 до 1
}

export interface Score {
  total?: number; // нет, если оценивать нечего
  items: ScoreItem[];
  byCategory: Partial<Record<Category | 'other', { earned: number; possible: number }>>;
}

const PROPORTIONAL = new Set(['paragraphs', 'sections']);

function earnedFor(result: RuleResult, group: ResultGroup | undefined): number {
  if (!group || group.findings.length === 0) return 1;
  if (!PROPORTIONAL.has(result.unit ?? '') || result.checked === 0) return 0;
  const affected = new Set(
    group.findings.map((f) => f.location.paragraphIndex ?? f.location.sectionIndex),
  ).size;
  return Math.max(0, 1 - affected / result.checked);
}

// dismissed — эвристические правила, где пользователь отметил «здесь это есть».
export function computeScore(report: Report, dismissed: ReadonlySet<string> = new Set()): Score {
  const items: ScoreItem[] = [];
  for (const result of report.results) {
    if ((result.status !== 'pass' && result.status !== 'fail') || dismissed.has(result.ruleId))
      continue;
    const category = result.category ?? 'other';
    const main = result.groups.find((g) => g.key === 'main');
    // Основная строка правила есть всегда, даже если все замечания на титуле или в содержании.
    items.push({
      ruleId: result.ruleId,
      group: 'main',
      category,
      severity: result.severity,
      weight: WEIGHTS[result.severity],
      earned: earnedFor(result, main),
    });
    for (const group of result.groups.filter((g) => g.key !== 'main')) {
      items.push({
        ruleId: result.ruleId,
        group: group.key,
        category,
        severity: group.severity,
        weight: WEIGHTS[group.severity],
        earned: earnedFor(result, group),
      });
    }
  }

  const byCategory: Score['byCategory'] = {};
  let earned = 0;
  let possible = 0;
  for (const item of items) {
    if (item.weight === 0) continue;
    earned += item.weight * item.earned;
    possible += item.weight;
    const bucket = (byCategory[item.category] ??= { earned: 0, possible: 0 });
    bucket.earned += item.weight * item.earned;
    bucket.possible += item.weight;
  }
  return {
    total: possible > 0 ? Math.round((100 * earned) / possible) : undefined,
    items,
    byCategory,
  };
}
