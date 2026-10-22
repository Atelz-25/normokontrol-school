// Оценка на синтетическом наборе: npm run evaluate:synthetic
//
// Проверяет все файлы fixtures/synthetic/docs профилем «Наша школа», сохраняет замечания
// в fixtures/synthetic/findings.json и печатает точность, полноту и проваленные ловушки.
// Это TypeScript-версия evaluate.py из набора, Python для неё не нужен.
import { readFileSync, writeFileSync } from 'node:fs';
import { BUILTIN_PROFILES, DEFAULT_PROFILE_ID } from '../src/core/profiles/builtin.ts';
import {
  collectFindings,
  compareSynthetic,
  emptyShareTruth,
  formatSynthetic,
  parseTruth,
} from './lib/synthetic-lib.ts';

const root = 'fixtures/synthetic';
const profile = BUILTIN_PROFILES.find((p) => p.id === DEFAULT_PROFILE_ID);
if (!profile) throw new Error(`Нет встроенного профиля ${DEFAULT_PROFILE_ID}`);
const found = collectFindings(`${root}/docs`, profile);
writeFileSync(`${root}/findings.json`, JSON.stringify(found, null, 1) + '\n');

// truth.csv плюс разметка VL-02 по доле пустых абзацев (её генератор не считает).
const truth = [
  ...parseTruth(readFileSync(`${root}/truth.csv`, 'utf8')),
  ...emptyShareTruth(`${root}/docs`, profile),
];
console.log(formatSynthetic(compareSynthetic(truth, found)));
