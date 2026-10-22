// Сторож по синтетическому набору (fixtures/synthetic, README там же): 40 файлов с известными
// ошибками и ловушками, разметку посчитал генератор, а не код сайта. Требования:
// полнота 100 %, все ловушки пройдены, в чистом файле ни одного замечания.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BUILTIN_PROFILES, DEFAULT_PROFILE_ID } from '../../src/core/profiles/builtin.ts';
import { collectFindings, compareSynthetic, parseTruth } from '../../scripts/lib/synthetic-lib.ts';

const root = new URL('../../fixtures/synthetic/', import.meta.url);
const profile = BUILTIN_PROFILES.find((p) => p.id === DEFAULT_PROFILE_ID)!;
const found = collectFindings(fileURLToPath(new URL('docs', root)), profile);
const truth = parseTruth(readFileSync(new URL('truth.csv', root), 'utf8'));
const result = compareSynthetic(truth, found);

describe('синтетический набор', () => {
  it('все 132 известные ошибки найдены (полнота 100 %)', () => {
    expect(result.expected).toBe(132);
    expect(result.missed.map((m) => `${m.file} ${m.rule} §${m.paragraph}`)).toEqual([]);
    expect(result.total.tp).toBe(result.expected);
  });

  it('все ловушки пройдены', () => {
    expect(result.traps).toBe(31);
    expect(
      result.failedTraps.map((t) => `${t.row.file} ${t.row.rule} §${t.row.paragraph}`),
    ).toEqual([]);
  });

  it('в 00-clean.docx ноль замечаний', () => {
    expect(found.filter((f) => f.file === '00-clean.docx')).toEqual([]);
  });

  it('абзац из одних пробелов — только PR-06, без PR-05', () => {
    expect(found.filter((f) => f.file === '02-spaces_only_empty.docx').map((f) => f.rule)).toEqual([
      'PR-06',
    ]);
  });
});
