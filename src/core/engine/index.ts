// Движок: читает файл, размечает абзацы, запускает правила по профилю, собирает отчёт.
// Ошибка внутри одного правила не роняет проверку: правило получает статус 'crashed'.
import { classify, type Classification } from '../classify/index.ts';
import type { DocModel } from '../model/types.ts';
import type { Profile, Severity } from '../profiles/types.ts';
import { readDocx } from '../reader/index.ts';
import { RULES_BY_ID } from '../rules/registry.ts';
import type { Category, Finding, FindingGroup } from '../rules/types.ts';
import { summary as summaryText } from '../../i18n/rules-ru.ts';

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
  // Те же замечания, разложенные на группы: текст работы, содержание, титульный лист.
  groups: ResultGroup[];
  metrics: Record<string, unknown>;
}

export interface ResultGroup {
  key: 'main' | FindingGroup;
  severity: Severity;
  summary?: string;
  findings: Finding[];
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

const isSeverity = (value: unknown): value is Severity =>
  value === 'error' || value === 'warning' || value === 'info';

// Раскладываем замечания по группам. Если групп несколько, у основной своя короткая сводка,
// потому что общая сводка правила считает и титульный лист, и содержание.
function groupFindings(
  findings: Finding[],
  severity: Severity,
  summary: string | undefined,
): ResultGroup[] {
  const order: ResultGroup['key'][] = ['main', 'toc', 'title-page'];
  const byKey = new Map<ResultGroup['key'], Finding[]>();
  for (const f of findings) {
    const key = f.location.group ?? 'main';
    byKey.set(key, [...(byKey.get(key) ?? []), f]);
  }
  const single = byKey.size === 1 && byKey.has('main');
  return order
    .filter((key) => byKey.has(key))
    .map((key) => {
      const items = byKey.get(key) ?? [];
      return {
        key,
        // Серьёзность группы — самая высокая среди её замечаний.
        severity:
          (['error', 'warning', 'info'] as const).find((s) =>
            items.some((f) => f.severity === s),
          ) ?? severity,
        summary: single
          ? summary
          : key === 'main'
            ? summaryText.main(items.length)
            : summaryText.group(key, items.length),
        findings: items,
      };
    });
}

export interface CheckOptions {
  fileName?: string; // имя выбранного файла — для FN-01
}

export function checkModel(doc: DocModel, profile: Profile, options: CheckOptions = {}): Report {
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
      groups: [],
      metrics: {},
    };
    if (!rule) return { ...base, status: 'not-implemented' };
    if (!config.enabled) return { ...base, status: 'disabled' };
    try {
      const params = { ...rule.defaultParams, ...config.params };
      const outcome = rule.check(
        { doc, classification, severity: config.severity, ruleId, fileName: options.fileName },
        params,
      );
      // titlePageSeverity: на титульном листе своя (обычно мягче) серьёзность. Применяем её здесь,
      // один раз для всех правил, чтобы отчёт и оценка видели ту же серьёзность (RULES-SCHOOL, 10.1).
      if (isSeverity(params.titlePageSeverity)) {
        for (const f of outcome.findings)
          if (f.location.group === 'title-page') f.severity = params.titlePageSeverity;
      }
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
        groups: groupFindings(outcome.findings, config.severity, outcome.summary),
        metrics: outcome.metrics ?? {},
      };
    } catch {
      return { ...base, status: 'crashed' };
    }
  });

  return { profileId: profile.id, results, stats: documentStats(doc) };
}

export function checkDocx(bytes: Uint8Array, profile: Profile, options: CheckOptions = {}): Report {
  return checkModel(readDocx(bytes), profile, options);
}
