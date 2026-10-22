// Сравнение двух версий работы (бриф, раздел 10.4): исправлено / осталось / появилось.
//
// Номера абзацев между версиями сдвигаются (удалили пустую строку — всё ниже «уехало»),
// поэтому замечания сравниваем не по номеру, а по смыслу: правило, группа, текст
// сообщения и начало абзаца. Одинаковых замечаний может быть несколько (59 пустых
// абзацев), поэтому считаем, сколько раз каждое встречается.
import type { Finding } from '../rules/types.ts';
import type { Report } from './index.ts';
import { computeScore } from './score.ts';

export interface Comparison {
  fixed: Finding[];
  remaining: Finding[];
  added: Finding[];
  scoreBefore?: number;
  scoreAfter?: number;
}

// Числа в тексте сообщения не учитываем: «Около 58 % абзацев пустые» и «Около 30 % …»
// — это одно и то же замечание, которое стало меньше, а не исправленное плюс новое.
const keyOf = (f: Finding): string =>
  [
    f.ruleId,
    f.location.group ?? 'main',
    f.message.replace(/\d+(?:[.,]\d+)?/g, '#'),
    f.location.excerpt ?? '',
  ].join('|');

const failing = (report: Report, dismissed: ReadonlySet<string>): Finding[] =>
  report.results
    .filter((r) => r.status === 'fail' && !dismissed.has(r.ruleId))
    .flatMap((r) => r.findings);

export function compareReports(
  before: Report,
  after: Report,
  dismissed: ReadonlySet<string> = new Set(),
): Comparison {
  // «Корзина» старых замечаний: каждое новое замечание забирает из неё одно такое же.
  const pool = new Map<string, Finding[]>();
  for (const f of failing(before, dismissed))
    pool.set(keyOf(f), [...(pool.get(keyOf(f)) ?? []), f]);

  const remaining: Finding[] = [];
  const added: Finding[] = [];
  for (const f of failing(after, dismissed)) {
    const same = pool.get(keyOf(f));
    if (same && same.length > 0) {
      same.pop();
      remaining.push(f);
    } else added.push(f);
  }
  return {
    fixed: [...pool.values()].flat(),
    remaining,
    added,
    scoreBefore: computeScore(before, dismissed).total,
    scoreAfter: computeScore(after, dismissed).total,
  };
}
