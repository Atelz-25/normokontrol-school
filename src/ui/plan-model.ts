// План исправления без DOM: из отчёта — список действий в порядке, в котором их стоит делать.
// Здесь только данные и порядок, поэтому этот файл проверяется обычными тестами в Node.
import type { Report, ResultGroup, RuleResult } from '../core/engine/index.ts';
import type { PreviewParagraph } from '../core/engine/passport.ts';
import { FIXABLE } from '../core/fixer/fixable.ts';
import type { Profile, Severity } from '../core/profiles/types.ts';
import type { Finding } from '../core/rules/types.ts';
import { ACTIONS, NOT_IN_PLAN, type MarkName, type WhyName } from '../i18n/plan-ru.ts';
import { RULE_TEXTS } from '../i18n/rules-ru.ts';

const SEVERITY_ORDER: Severity[] = ['error', 'warning', 'info'];

export interface PlanAction {
  id: string;
  title: string;
  mark: MarkName;
  why?: WhyName;
  severity: Severity;
  results: RuleResult[]; // правила этого действия с замечаниями (вне титульного листа)
  places: Finding[]; // все места по порядку абзацев
  fix: 'all' | 'some' | 'none'; // сколько из этого программа исправит сама
  dismissed: boolean; // все правила действия отмечены «здесь это есть»
}

export interface TitlePageItem {
  result: RuleResult;
  group: ResultGroup;
}

export interface Plan {
  actions: PlanAction[];
  titlePage: TitlePageItem[]; // титульный лист — на усмотрение учителя, отдельно
  passed: RuleResult[]; // что уже хорошо
  problems: number; // ошибки и замечания (советы не считаем)
  selfFixable: number; // из них программа исправит сама хотя бы частично
  verdict: 'early' | 'almost' | 'ready';
  fixRuleIds: string[]; // что отдать исправителю по кнопке «Исправить и скачать»
}

const worst = (severities: Severity[]): Severity =>
  SEVERITY_ORDER.find((s) => severities.includes(s)) ?? 'info';

// Действие для правила: из списка ACTIONS или отдельный пункт с названием правила.
function actionFor(ruleId: string): { id: string; title: string; mark: MarkName; why?: WhyName } {
  const known = ACTIONS.find((a) => a.rules.includes(ruleId));
  if (known) return known;
  return { id: `rule-${ruleId}`, title: RULE_TEXTS[ruleId]?.title ?? ruleId, mark: 'replace' };
}

const byParagraph = (a: Finding, b: Finding): number =>
  (a.location.paragraphIndex ?? Infinity) - (b.location.paragraphIndex ?? Infinity);

export function buildPlan(report: Report, profile: Profile, dismissed: ReadonlySet<string>): Plan {
  const failed = report.results.filter(
    (r) => r.status === 'fail' && !NOT_IN_PLAN.includes(r.ruleId),
  );
  const priority = profile.meta?.teacherPriority ?? [];

  // Раскладываем правила по действиям; титульный лист — отдельно.
  const groups = new Map<string, { def: ReturnType<typeof actionFor>; results: RuleResult[] }>();
  const titlePage: TitlePageItem[] = [];
  for (const result of failed) {
    for (const group of result.groups)
      if (group.key === 'title-page') titlePage.push({ result, group });
    if (!result.groups.some((g) => g.key !== 'title-page')) continue;
    const def = actionFor(result.ruleId);
    const entry = groups.get(def.id) ?? { def, results: [] };
    entry.results.push(result);
    groups.set(def.id, entry);
  }

  const rank = (action: PlanAction): number => {
    const inPriority = action.results.map((r) => priority.indexOf(r.ruleId)).filter((i) => i >= 0);
    // Сначала то, за что учитель уже снижал баллы, потом ошибки, замечания и советы.
    const base = inPriority.length > 0 ? Math.min(...inPriority) : 100;
    return base + (inPriority.length > 0 ? 0 : SEVERITY_ORDER.indexOf(action.severity) * 100);
  };

  const actions: PlanAction[] = [...groups.values()].map(({ def, results }) => {
    const active = results.filter((r) => !dismissed.has(r.ruleId));
    const mainGroups = (r: RuleResult): ResultGroup[] =>
      r.groups.filter((g) => g.key !== 'title-page');
    const fixable = active.filter((r) => FIXABLE.includes(r.ruleId));
    return {
      id: def.id,
      title: def.title,
      mark: def.mark,
      why: def.why,
      severity: worst(
        (active.length > 0 ? active : results).flatMap((r) => mainGroups(r).map((g) => g.severity)),
      ),
      results,
      places: active.flatMap((r) => mainGroups(r).flatMap((g) => g.findings)).sort(byParagraph),
      fix: fixable.length === 0 ? 'none' : fixable.length === active.length ? 'all' : 'some',
      dismissed: active.length === 0,
    };
  });

  // Отмеченные «здесь это есть» уходят в конец, остальные — по важности.
  actions.sort(
    (a, b) =>
      Number(a.dismissed) - Number(b.dismissed) || rank(a) - rank(b) || a.id.localeCompare(b.id),
  );

  const counted = actions.filter((a) => !a.dismissed && a.severity !== 'info');
  const verdict = counted.some((a) => a.severity === 'error')
    ? 'early'
    : counted.length > 0
      ? 'almost'
      : 'ready';
  return {
    actions,
    titlePage,
    passed: report.results.filter((r) => r.status === 'pass' && !NOT_IN_PLAN.includes(r.ruleId)),
    problems: counted.length,
    selfFixable: counted.filter((a) => a.fix !== 'none').length,
    verdict,
    fixRuleIds: failed
      .filter((r) => FIXABLE.includes(r.ruleId) && !dismissed.has(r.ruleId))
      .map((r) => r.ruleId),
  };
}

// --- Где место: «стр. 4, после „Цель моей работы…“» ------------------------------------

export interface PlaceWhere {
  page?: number; // только если Word сохранил отметки страниц
  paragraph?: number;
  // Соседний непустой абзац: сам абзац, если в нём есть текст, иначе ближайший перед ним.
  near?: { relation: 'in' | 'after' | 'before'; text: string };
}

const SEARCH_LENGTH = 40; // сколько символов копировать для поиска в Word

export function placeWhere(finding: Finding, preview: PreviewParagraph[]): PlaceWhere {
  const index = finding.location.paragraphIndex;
  const where: PlaceWhere = { page: finding.location.approxPage, paragraph: index };
  if (index === undefined) return where;
  // Номера абзацев идут с 1 подряд, поэтому абзац №N лежит в preview[N − 1].
  const at = (n: number): PreviewParagraph | undefined => preview[n - 1];
  // Текст абзаца, если он не пустой.
  const textAt = (n: number): string | undefined => {
    const p = at(n);
    return p && !p.isEmpty && p.text.trim() !== '' ? p.text : undefined;
  };
  const own = textAt(index);
  if (own !== undefined) where.near = { relation: 'in', text: own };
  for (let n = index - 1; n >= 1 && !where.near; n--) {
    const text = textAt(n);
    if (text !== undefined) where.near = { relation: 'after', text };
  }
  for (let n = index + 1; n <= preview.length && !where.near; n++) {
    const text = textAt(n);
    if (text !== undefined) where.near = { relation: 'before', text };
  }
  return where;
}

// Первые 40 символов соседнего абзаца — их удобно вставить в поиск Word (Ctrl+F).
export const searchText = (text: string): string =>
  text.replace(/\s+/g, ' ').trim().slice(0, SEARCH_LENGTH).trim();
