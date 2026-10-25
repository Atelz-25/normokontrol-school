// Оценка на синтетическом наборе (fixtures/synthetic): перенос evaluate.py на TypeScript.
// Логика сравнения та же, что в Python-версии, чтобы цифры можно было сверять с
// baseline-stage1.txt. Разметку truth.csv посчитал генератор mutate.py, а не код сайта.
//
// Отличие от evaluate-lib.ts: там разметка «есть ли нарушение в файле», здесь —
// «какое правило и на каком абзаце», плюс ловушки (expected=pass), где замечаний быть не должно.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkDocx } from '../../src/core/engine/index.ts';
import type { Profile } from '../../src/core/profiles/types.ts';
import { readDocx } from '../../src/core/reader/index.ts';

export interface TruthRow {
  file: string;
  rule: string;
  paragraph: string; // пусто — правило уровня документа (поля)
  expected: 'finding' | 'pass';
  severity: string;
  note: string;
}

export interface FoundRow {
  file: string;
  rule: string;
  paragraph: number | '';
  severity?: string;
  message?: string;
}

export interface RuleStats {
  tp: number;
  fn: number;
  fp: number;
  sevWrong: number;
}

export interface SyntheticResult {
  files: number;
  expected: number;
  traps: number;
  stats: Record<string, RuleStats>;
  total: { tp: number; fn: number; fp: number };
  missed: TruthRow[];
  falsePositives: FoundRow[];
  wrongSeverity: { row: TruthRow; got: string }[];
  failedTraps: { row: TruthRow; count: number }[];
}

// Простой разбор CSV с кавычками: в колонке note встречаются запятые.
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const src = text.replace(/^\ufeff/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src.charAt(i);
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      if (row.some((c) => c !== '')) rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c !== '')) rows.push(row);
  const [header = [], ...body] = rows;
  return body.map((cells) => Object.fromEntries(header.map((h, i) => [h, cells[i] ?? ''])));
}

export function parseTruth(text: string): TruthRow[] {
  return parseCsv(text).map((r) => ({
    file: r.file ?? '',
    rule: r.rule ?? '',
    paragraph: r.paragraph ?? '',
    expected: r.expected === 'pass' ? 'pass' : 'finding',
    severity: r.severity ?? '',
    note: r.note ?? '',
  }));
}

// То же, что dump-findings.ts из набора: каждое замечание движка — одна строка findings.json.
export function collectFindings(dir: string, profile: Profile): FoundRow[] {
  const out: FoundRow[] = [];
  const files = readdirSync(dir)
    .filter((name) => name.endsWith('.docx'))
    .sort();
  for (const file of files) {
    // Имя файла не передаём, как и dump-findings.ts: имена в наборе технические («00-clean.docx»),
    // поэтому FN-01 (имя по образцу) здесь не проверяется.
    const report = checkDocx(readFileSync(join(dir, file)), profile);
    for (const r of report.results) {
      if (r.status !== 'fail') continue;
      for (const f of r.findings)
        out.push({
          file,
          rule: r.ruleId,
          paragraph: f.location.paragraphIndex ?? '',
          severity: f.severity,
          message: f.message,
        });
    }
  }
  return out;
}

// Набор сгенерирован 2026-10-23 из образцовой работы по тогдашнему профилю школы: красная
// строка 1,25 см, правое поле 10 или 15 мм, заголовки частей 14 pt, литература в любом порядке,
// объём не проверялся. Разметка truth.csv (в том числе ловушка «1,27 см в допуске») посчитана
// под эти значения. Поэтому набор проверяет алгоритм с профилем тех значений, а не с текущим:
// иначе каждое изменение требований школы выглядело бы как тысячи «ложных» замечаний.
export function syntheticProfile(school: Profile): Profile {
  const rules = { ...school.rules };
  const set = (id: string, params: Record<string, unknown>, enabled = true): void => {
    const config = rules[id];
    if (config) rules[id] = { ...config, enabled, params: { ...config.params, ...params } };
  };
  set('PR-03', { valueCm: 1.25 });
  set('PG-03', { mode: 'oneOf', valuesMm: [10, 15], valueMm: undefined });
  set('PG-07', {}, false);
  set('RF-02', { order: 'any' });
  set('VL-01', {}, false);
  const hd = rules['HD-04']?.params.levels as Record<string, Record<string, unknown>> | undefined;
  if (hd)
    set('HD-04', {
      levels: {
        ...hd,
        part: { ...hd.part, sizePt: 14 },
        subPart: { ...hd.subPart, sizePt: 14, firstLineIndentCm: 1.25 },
      },
    });
  return { ...school, id: 'synthetic-2026-10-23', rules };
}

// VL-02 (доля пустых абзацев) в truth.csv не размечен: генератор о нём не знает. Дописываем
// разметку сами по тому же условию, что в профиле: замечание ожидается, если пустых абзацев
// вне таблиц больше порога warnIfEmptyShareAbove. Пустые абзацы считает модуль чтения
// (Paragraph.isEmpty), а не само правило, поэтому сравнение не сводится к «правило согласно с собой».
export function emptyShareTruth(dir: string, profile: Profile): TruthRow[] {
  const threshold = profile.rules['VL-02']?.params.warnIfEmptyShareAbove;
  if (typeof threshold !== 'number') return [];
  const files = readdirSync(dir)
    .filter((name) => name.endsWith('.docx'))
    .sort();
  return files.flatMap((file): TruthRow[] => {
    const outside = readDocx(readFileSync(join(dir, file))).paragraphs.filter((p) => !p.table);
    const share = outside.filter((p) => p.isEmpty).length / Math.max(1, outside.length);
    if (share <= threshold) return [];
    const note = `пустых абзацев ${Math.round(share * 100)} % > ${Math.round(threshold * 100)} %`;
    return [{ file, rule: 'VL-02', paragraph: '', expected: 'finding', severity: 'info', note }];
  });
}

const keyOf = (r: { file: string; rule: string; paragraph: number | string }): string =>
  `${r.file}|${r.rule}|${String(r.paragraph)}`;

export function compareSynthetic(truth: TruthRow[], found: FoundRow[]): SyntheticResult {
  const expected = new Map<string, TruthRow>();
  for (const r of truth) if (r.expected === 'finding') expected.set(keyOf(r), r);
  const traps = truth.filter((r) => r.expected === 'pass');
  const files = new Set([
    ...truth.map((r) => r.file),
    ...found.map((f) => f.file),
    '00-clean.docx',
  ]);

  const got = new Map<string, FoundRow[]>();
  for (const f of found) got.set(keyOf(f), [...(got.get(keyOf(f)) ?? []), f]);

  const stats: Record<string, RuleStats> = {};
  const statOf = (rule: string): RuleStats =>
    (stats[rule] ??= { tp: 0, fn: 0, fp: 0, sevWrong: 0 });
  const missed: TruthRow[] = [];
  const wrongSeverity: SyntheticResult['wrongSeverity'] = [];

  for (const [k, r] of expected) {
    // Документные правила (поля): абзаца нет, совпадение только по файлу и правилу.
    const hits =
      r.paragraph === ''
        ? found.filter((f) => f.file === r.file && f.rule === r.rule)
        : (got.get(k) ?? []);
    const s = statOf(r.rule);
    if (hits.length > 0) {
      s.tp++;
      const sev = hits[0]?.severity;
      if (r.severity && sev && sev !== r.severity) {
        s.sevWrong++;
        wrongSeverity.push({ row: r, got: sev });
      }
    } else {
      s.fn++;
      missed.push(r);
    }
  }

  const docRules = new Set(
    [...expected.values()].filter((r) => r.paragraph === '').map((r) => `${r.file}|${r.rule}`),
  );
  const isExpected = (f: FoundRow): boolean =>
    expected.has(keyOf(f)) || docRules.has(`${f.file}|${f.rule}`);

  const falsePositives = found.filter((f) => !isExpected(f));
  for (const f of falsePositives) statOf(f.rule).fp++;

  const failedTraps: SyntheticResult['failedTraps'] = [];
  for (const t of traps) {
    const count = found.filter(
      (f) =>
        f.file === t.file &&
        f.rule === t.rule &&
        !isExpected(f) &&
        (t.paragraph === '' || String(f.paragraph) === t.paragraph),
    ).length;
    if (count > 0) failedTraps.push({ row: t, count });
  }

  const total = { tp: 0, fn: 0, fp: 0 };
  for (const s of Object.values(stats)) {
    total.tp += s.tp;
    total.fn += s.fn;
    total.fp += s.fp;
  }
  return {
    files: files.size,
    expected: expected.size,
    traps: traps.length,
    stats,
    total,
    missed,
    falsePositives,
    wrongSeverity,
    failedTraps,
  };
}

// Таблица в том же виде, что печатал evaluate.py (так её легко сравнить с baseline-stage1.txt).
export function formatSynthetic(r: SyntheticResult): string {
  const rate = (a: number, b: number): string => (b > 0 ? (a / b).toFixed(2) : 'nan');
  const line = (rule: string, s: { tp: number; fn: number; fp: number }, extra = ''): string =>
    `${rule.padEnd(8)} ${String(s.tp).padStart(6)} ${String(s.fn).padStart(8)} ${String(s.fp).padStart(6)} ${rate(s.tp, s.tp + s.fp).padStart(9)} ${rate(s.tp, s.tp + s.fn).padStart(8)}  ${extra}`.trimEnd();

  const out = [
    `Файлов: ${r.files}; ожидаемых находок: ${r.expected}; ловушек: ${r.traps}`,
    '',
    `${'правило'.padEnd(8)} ${'верно'.padStart(6)} ${'пропуск'.padStart(8)} ${'ложно'.padStart(6)} ${'точность'.padStart(9)} ${'полнота'.padStart(8)}  серьёзность`,
  ];
  for (const [rule, s] of Object.entries(r.stats).sort(([a], [b]) => a.localeCompare(b)))
    out.push(line(rule, s, s.sevWrong ? `неверная: ${s.sevWrong}` : ''));
  out.push(line('ИТОГО', r.total));
  out.push('', `Ловушки: пройдено ${r.traps - r.failedTraps.length} из ${r.traps}`);
  for (const { row, count } of r.failedTraps)
    out.push(`  ✗ ${row.file} ${row.rule} §${row.paragraph}: ${row.note} — замечаний: ${count}`);
  if (r.wrongSeverity.length > 0) {
    out.push('', 'Неверная серьёзность:');
    for (const { row, got } of r.wrongSeverity)
      out.push(
        `  ${row.file} ${row.rule} §${row.paragraph}: ждали ${row.severity}, программа ${got}`,
      );
  }
  out.push('', 'Пропуски:');
  for (const m of r.missed) out.push(`  ${m.file} ${m.rule} §${m.paragraph}: ${m.note}`);
  out.push('', 'Ложные срабатывания (по правилам):');
  const byRule = new Map<string, FoundRow[]>();
  for (const f of r.falsePositives) byRule.set(f.rule, [...(byRule.get(f.rule) ?? []), f]);
  for (const [rule, fs] of [...byRule].sort(([a], [b]) => a.localeCompare(b))) {
    const [first] = fs;
    if (!first) continue;
    out.push(
      `  ${rule}: ${fs.length} в ${new Set(fs.map((f) => f.file)).size} файлах; напр. ${first.file} §${first.paragraph}: ${(first.message ?? '').slice(0, 90)}`,
    );
  }
  return out.join('\n');
}
