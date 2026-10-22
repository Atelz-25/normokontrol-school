// Оценка качества проверки: npm run evaluate -- <папка с .docx> <разметка.csv> [профиль.json]
//
// Разметка — CSV «файл;правило;нарушение» (да/нет), её делает человек, глядя на работу.
// Скрипт проверяет каждый файл, сравнивает с разметкой и печатает TP/FP/FN, точность и
// полноту по правилам и категориям (протокол — docs/EVALUATION.md). Тексты работ не печатаются.
import { existsSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { checkDocx } from '../src/core/engine/index.ts';
import { loadProfile } from '../src/core/profiles/load.ts';
import { RULES_BY_ID } from '../src/core/rules/registry.ts';
import { CATEGORY_NAMES } from '../src/i18n/rules-ru.ts';
import { evaluate, metricsTable, parseAnnotations, type Prediction } from './lib/evaluate-lib.ts';

const [folder, csvPath, profilePath = 'profiles/school-custom.json'] = process.argv.slice(2);
if (!folder || !csvPath) {
  console.error('Запуск: npm run evaluate -- <папка с .docx> <разметка.csv> [профиль.json]');
  process.exit(1);
}

const loaded = loadProfile(JSON.parse(readFileSync(profilePath, 'utf8')));
if (!loaded.ok) {
  console.error('Профиль не прошёл проверку:', JSON.stringify(loaded.errors));
  process.exit(1);
}

const annotations = parseAnnotations(readFileSync(csvPath, 'utf8'));
const files = [...new Set(annotations.map((a) => a.file))];
const predictions: Prediction[] = [];
const missing: string[] = [];

for (const file of files) {
  const path = join(folder, file);
  if (!existsSync(path)) {
    missing.push(file);
    continue;
  }
  const report = checkDocx(readFileSync(path), loaded.profile, { fileName: basename(file) });
  for (const r of report.results) {
    // Оцениваем только правила, которые действительно проверили документ.
    if (r.status === 'pass' || r.status === 'fail')
      predictions.push({ file, ruleId: r.ruleId, violation: r.status === 'fail' });
  }
}

const categoryOf = (ruleId: string): string => {
  const category = RULES_BY_ID.get(ruleId)?.category;
  return category ? (CATEGORY_NAMES[category] ?? category) : 'другое';
};
const result = evaluate(annotations, predictions, categoryOf);
const pct = (v?: number): string => (v === undefined ? '—' : `${Math.round(v * 100)} %`);

console.log(`Файлов в разметке: ${files.length}, проверено: ${files.length - missing.length}.`);
if (missing.length > 0) console.log(`Нет в папке: ${missing.join(', ')}.`);
console.log(
  `\nИтого: TP ${result.total.tp}, FP ${result.total.fp}, FN ${result.total.fn}, TN ${result.total.tn}; точность ${pct(result.total.precision)}, полнота ${pct(result.total.recall)}.\n`,
);
console.log(metricsTable(result.byCategory, 'Категория'));
console.log();
console.log(metricsTable(result.byRule, 'Правило'));
