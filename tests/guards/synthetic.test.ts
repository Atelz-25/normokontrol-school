// Сторож по синтетическому набору (fixtures/synthetic, README там же): 40 файлов с известными
// ошибками и ловушками, разметку посчитал генератор, а не код сайта. Требования:
// полнота 100 %, все ловушки пройдены, ложных срабатываний нет, в чистом файле ни одного замечания.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BUILTIN_PROFILES, DEFAULT_PROFILE_ID } from '../../src/core/profiles/builtin.ts';
import {
  collectFindings,
  compareSynthetic,
  emptyShareTruth,
  parseTruth,
} from '../../scripts/lib/synthetic-lib.ts';

const root = new URL('../../fixtures/synthetic/', import.meta.url);
const docs = fileURLToPath(new URL('docs', root));
const profile = BUILTIN_PROFILES.find((p) => p.id === DEFAULT_PROFILE_ID)!;
const found = collectFindings(docs, profile);
const csvTruth = parseTruth(readFileSync(new URL('truth.csv', root), 'utf8'));
// VL-02 генератор не размечает: дописываем по доле пустых абзацев и порогу из профиля.
const vl02 = emptyShareTruth(docs, profile);
const result = compareSynthetic([...csvTruth, ...vl02], found);
const describeRow = (r: { file: string; rule: string; paragraph: number | string }): string =>
  `${r.file} ${r.rule} §${r.paragraph}`;

describe('синтетический набор', () => {
  it('все известные ошибки найдены (полнота 100 %): 132 из truth.csv и VL-02', () => {
    expect(csvTruth.filter((r) => r.expected === 'finding')).toHaveLength(132);
    expect(vl02.length).toBeGreaterThan(0);
    expect(result.missed.map(describeRow)).toEqual([]);
    expect(result.total.tp).toBe(result.expected);
  });

  it('все ловушки пройдены', () => {
    expect(result.traps).toBe(31);
    expect(result.failedTraps.map((t) => describeRow(t.row))).toEqual([]);
  });

  it('ложных срабатываний нет', () => {
    expect(result.falsePositives.map(describeRow)).toEqual([]);
  });

  it('в 00-clean.docx ноль замечаний', () => {
    expect(found.filter((f) => f.file === '00-clean.docx')).toEqual([]);
  });

  it('абзац из одних пробелов — только PR-06, без PR-05', () => {
    expect(found.filter((f) => f.file === '02-spaces_only_empty.docx').map((f) => f.rule)).toEqual([
      'PR-06',
    ]);
  });

  it('на абзаце с отступом пробелами ровно одно замечание — PR-05', () => {
    const indents = csvTruth.filter((r) => r.rule === 'PR-05' && r.expected === 'finding');
    expect(indents.length).toBeGreaterThan(0);
    for (const row of indents) {
      const here = found.filter(
        (f) => f.file === row.file && String(f.paragraph) === row.paragraph,
      );
      expect(
        here.map((f) => f.rule),
        describeRow(row),
      ).toEqual(['PR-05']);
    }
  });
});
