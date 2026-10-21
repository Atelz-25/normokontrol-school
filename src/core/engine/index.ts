// Движок: читает файл, размечает абзацы, запускает правила по профилю, собирает отчёт.
// Ошибка внутри одного правила не роняет проверку: правило получает статус 'crashed'.
import { classify, type Classification } from '../classify/index.ts';
import type { DocModel } from '../model/types.ts';
import type { Profile, Severity } from '../profiles/types.ts';
import { readDocx } from '../reader/index.ts';
import { RULES_BY_ID } from '../rules/registry.ts';
import type { Category, Finding } from '../rules/types.ts';

export type RuleStatus =
  'pass' | 'fail' | 'not-applicable' | 'not-implemented' | 'disabled' | 'crashed';

export interface RuleResult {
  ruleId: string;
  status: RuleStatus;
  severity: Severity;
  category?: Category;
  heuristic: boolean;
  checked: number;
  affected: number; // сколько проверенных объектов с замечаниями
  unit?: string;
  summary?: string;
  findings: Finding[];
  metrics: Record<string, unknown>;
}

export interface DocumentStats {
  paragraphs: number; // вне таблиц
  emptyParagraphs: number;
  tables: number;
  sections: number;
  approxPages?: number; // только по lastRenderedPageBreak, «примерно»
}

export interface Report {
  profileId: string;
  results: RuleResult[];
  stats: DocumentStats;
}

function documentStats(doc: DocModel): DocumentStats {
  const outside = doc.paragraphs.filter((p) => !p.table);
  const lastPage = doc.paragraphs.at(-1)?.approxPage;
  return {
    paragraphs: outside.length,
    emptyParagraphs: outside.filter((p) => p.isEmpty).length,
    tables: doc.tables.length,
    sections: doc.sections.length,
    approxPages: doc.hasLastRenderedPageBreaks ? lastPage : undefined,
  };
}

export function checkModel(doc: DocModel, profile: Profile): Report {
  const classification: Classification = classify(doc, {
    parts: profile.structure?.partsInOrder,
    passportFields: profile.structure?.passportFields,
  });

  const results: RuleResult[] = Object.entries(profile.rules).map(([ruleId, config]) => {
    const rule = RULES_BY_ID.get(ruleId);
    const base = {
      ruleId,
      severity: config.severity,
      category: rule?.category,
      heuristic: rule?.heuristic === true || config.params.heuristic === true,
      checked: 0,
      affected: 0,
      findings: [],
      metrics: {},
    };
    if (!rule) return { ...base, status: 'not-implemented' };
    if (!config.enabled) return { ...base, status: 'disabled' };
    try {
      const outcome = rule.check(
        { doc, classification, severity: config.severity, ruleId },
        { ...rule.defaultParams, ...config.params },
      );
      // «Затронуто» — сколько разных абзацев или разделов с замечаниями.
      const affected =
        outcome.unit === 'paragraphs'
          ? new Set(outcome.findings.map((f) => f.location.paragraphIndex)).size
          : outcome.findings.length;
      const status: RuleStatus =
        outcome.checked === 0 ? 'not-applicable' : outcome.findings.length > 0 ? 'fail' : 'pass';
      return {
        ...base,
        status,
        checked: outcome.checked,
        affected,
        unit: outcome.unit,
        summary: outcome.summary,
        findings: outcome.findings,
        metrics: outcome.metrics ?? {},
      };
    } catch {
      return { ...base, status: 'crashed' };
    }
  });

  return { profileId: profile.id, results, stats: documentStats(doc) };
}

export function checkDocx(bytes: Uint8Array, profile: Profile): Report {
  return checkModel(readDocx(bytes), profile);
}
