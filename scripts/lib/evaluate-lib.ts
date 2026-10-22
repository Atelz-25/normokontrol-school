// Оценка качества (бриф, раздел 14, этап 5): сравниваем ответы программы с разметкой человека.
//
//   TP — нарушение есть, и программа его нашла;
//   FP — нарушения нет, а программа сообщила (ложное срабатывание);
//   FN — нарушение есть, а программа промолчала (пропуск);
//   TN — нарушения нет, и программа промолчала.
//   precision (точность) = TP / (TP + FP) — сколько замечаний программы верны;
//   recall (полнота)    = TP / (TP + FN) — сколько настоящих нарушений программа нашла.

export interface Annotation {
  file: string;
  ruleId: string;
  violation: boolean;
}

export interface Prediction {
  file: string;
  ruleId: string;
  violation: boolean; // программа сообщила о нарушении
}

export interface Counts {
  tp: number;
  fp: number;
  fn: number;
  tn: number;
}

export interface Metrics extends Counts {
  precision?: number; // нет, если программа ни разу не сообщила
  recall?: number; // нет, если настоящих нарушений не было
}

const YES = new Set(['yes', 'да', '1', 'true', 'есть']);
const NO = new Set(['no', 'нет', '0', 'false']);

// CSV: «файл;правило;нарушение» (разделитель «;» или «,»), первая строка — заголовок.
export function parseAnnotations(csv: string): Annotation[] {
  const lines = csv
    .replace(/^\ufeff/, '')
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '');
  const separator = (lines[0] ?? '').includes(';') ? ';' : ',';
  return lines.slice(1).flatMap((line) => {
    const [file = '', ruleId = '', value = ''] = line
      .split(separator)
      .map((cell) => cell.trim().replace(/^"|"$/g, ''));
    const answer = value.toLowerCase();
    if (!file || !ruleId || (!YES.has(answer) && !NO.has(answer))) return [];
    return [{ file, ruleId, violation: YES.has(answer) }];
  });
}

const empty = (): Counts => ({ tp: 0, fp: 0, fn: 0, tn: 0 });

function withRates(c: Counts): Metrics {
  return {
    ...c,
    precision: c.tp + c.fp > 0 ? c.tp / (c.tp + c.fp) : undefined,
    recall: c.tp + c.fn > 0 ? c.tp / (c.tp + c.fn) : undefined,
  };
}

// Сравниваем только пары «файл + правило», которые есть и в разметке, и в ответах программы:
// неприменимые и не реализованные правила программа не оценивает.
export function evaluate(
  annotations: Annotation[],
  predictions: Prediction[],
  categoryOf: (ruleId: string) => string,
): { byRule: Record<string, Metrics>; byCategory: Record<string, Metrics>; total: Metrics } {
  const predicted = new Map(predictions.map((p) => [`${p.file}|${p.ruleId}`, p.violation]));
  const byRule: Record<string, Counts> = {};
  const byCategory: Record<string, Counts> = {};
  const total = empty();
  for (const a of annotations) {
    const answer = predicted.get(`${a.file}|${a.ruleId}`);
    if (answer === undefined) continue;
    const key: keyof Counts = a.violation ? (answer ? 'tp' : 'fn') : answer ? 'fp' : 'tn';
    for (const bucket of [
      (byRule[a.ruleId] ??= empty()),
      (byCategory[categoryOf(a.ruleId)] ??= empty()),
      total,
    ])
      bucket[key] += 1;
  }
  const map = (record: Record<string, Counts>): Record<string, Metrics> =>
    Object.fromEntries(Object.entries(record).map(([k, v]) => [k, withRates(v)]));
  return { byRule: map(byRule), byCategory: map(byCategory), total: withRates(total) };
}

const percent = (value?: number): string =>
  value === undefined ? '—' : `${Math.round(value * 100)} %`;

export function metricsTable(rows: Record<string, Metrics>, title: string): string {
  const lines = [
    `| ${title} | TP | FP | FN | TN | Точность | Полнота |`,
    '|---|---|---|---|---|---|---|',
  ];
  for (const [name, m] of Object.entries(rows).sort(([a], [b]) => a.localeCompare(b)))
    lines.push(
      `| ${name} | ${m.tp} | ${m.fp} | ${m.fn} | ${m.tn} | ${percent(m.precision)} | ${percent(m.recall)} |`,
    );
  return lines.join('\n');
}
