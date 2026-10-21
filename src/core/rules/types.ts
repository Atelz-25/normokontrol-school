import type { Classification } from '../classify/index.ts';
import type { DocModel } from '../model/types.ts';
import type { Severity } from '../profiles/types.ts';

export type Category = 'page' | 'font' | 'paragraph' | 'structure' | 'typography' | 'document';

export interface Finding {
  ruleId: string;
  severity: Severity;
  message: string; // что не так, по-русски, одним предложением
  expected?: string;
  actual?: string;
  location: {
    paragraphIndex?: number;
    sectionIndex?: number;
    approxPage?: number; // только если в файле есть lastRenderedPageBreak
    excerpt?: string;
  };
  autoFixable: boolean;
}

// Что возвращает проверка правила. Движок сам решает, «пройдено» ли правило.
export interface RuleOutcome {
  checked: number; // сколько объектов проверено (0 — правило неприменимо)
  findings: Finding[];
  unit: 'paragraphs' | 'sections' | 'occurrences' | 'document';
  summary?: string; // групповое сообщение: «В 10 из 37 абзацев…»
  metrics?: Record<string, unknown>; // числа для эталонных тестов и паспорта документа
}

export interface CheckContext {
  doc: DocModel;
  classification: Classification;
  severity: Severity; // серьёзность из профиля
  ruleId: string;
}

export interface Rule {
  id: string;
  category: Category;
  stage: number;
  autoFixable: boolean;
  heuristic?: boolean;
  defaultParams: Record<string, unknown>;
  check(ctx: CheckContext, params: Record<string, unknown>): RuleOutcome;
}
