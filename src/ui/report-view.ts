// Отчёт: блоки школы («снижали баллы», «пять пунктов») и карточки замечаний.
import type { Report, RuleResult } from '../core/engine/index.ts';
import type { Profile, Severity } from '../core/profiles/types.ts';
import { plannedStage } from '../core/rules/planned.ts';
import type { Finding } from '../core/rules/types.ts';
import { RULE_TEXTS } from '../i18n/rules-ru.ts';
import { SEVERITY_NAMES, STATUS_NAMES, ru } from '../i18n/ru.ts';
import { disclosure, el } from './dom.ts';

const EXAMPLES = 5; // сколько мест показывать до кнопки «Показать все»
const SEVERITY_ORDER: Severity[] = ['error', 'warning', 'info'];

const titleOf = (ruleId: string): string => RULE_TEXTS[ruleId]?.title ?? ruleId;

function statusLine(result: RuleResult | undefined, ruleId: string): string {
  if (!result || result.status === 'not-implemented') return ru.stageLater(plannedStage(ruleId));
  if (result.status === 'fail') return result.summary ?? STATUS_NAMES.fail;
  return STATUS_NAMES[result.status];
}

const statusMark = (results: (RuleResult | undefined)[]): 'ok' | 'bad' | 'later' => {
  if (results.some((r) => r?.status === 'fail')) return 'bad';
  if (results.every((r) => r?.status === 'pass' || r?.status === 'not-applicable')) return 'ok';
  return 'later';
};

const MARKS = { ok: '✓', bad: '✗', later: '…' } as const;
const MARK_LABELS = {
  ok: 'выполнено',
  bad: 'есть замечания',
  later: 'пока не проверяется',
} as const;

function mark(kind: keyof typeof MARKS): HTMLElement {
  return el(
    'span',
    { class: `mark mark-${kind}`, 'aria-label': MARK_LABELS[kind], role: 'img' },
    MARKS[kind],
  );
}

function priorityBlock(profile: Profile, byId: Map<string, RuleResult>): HTMLElement | undefined {
  const ids = profile.meta?.teacherPriority;
  if (!ids || ids.length === 0) return undefined;
  const items = ids.map((id) => {
    const result = byId.get(id);
    return el(
      'li',
      {},
      mark(statusMark([result?.status === 'not-implemented' ? undefined : result])),
      ' ',
      el('a', { href: `#rule-${id}` }, `${titleOf(id)} (${id})`),
      ': ',
      statusLine(result, id),
    );
  });
  return el(
    'section',
    { class: 'block', 'aria-labelledby': 'priority-title' },
    el('h2', { id: 'priority-title' }, ru.priorityTitle),
    el('p', { class: 'muted' }, ru.priorityIntro),
    el('ol', { class: 'checklist' }, ...items),
  );
}

function boardBlock(profile: Profile, byId: Map<string, RuleResult>): HTMLElement | undefined {
  const confirmed = profile.meta?.boardPoints;
  const points = confirmed ?? profile.meta?.boardPointsHypothesis;
  if (!points || points.length === 0) return undefined;
  const items = points.map((point) => {
    const ids = point.split('+');
    const results = ids.map((id) => {
      const r = byId.get(id);
      return r?.status === 'not-implemented' ? undefined : r;
    });
    return el('li', {}, mark(statusMark(results)), ' ', ids.map(titleOf).join(' + '));
  });
  return el(
    'section',
    { class: 'block', 'aria-labelledby': 'board-title' },
    el('h2', { id: 'board-title' }, ru.boardTitle),
    confirmed ? undefined : el('p', { class: 'muted' }, ru.boardHypothesis),
    el('ul', { class: 'checklist' }, ...items),
  );
}

function placeText(f: Finding, showSection: boolean): string {
  const parts: string[] = [];
  const { paragraphIndex, sectionIndex, approxPage } = f.location;
  if (paragraphIndex !== undefined) parts.push(ru.paragraph(paragraphIndex));
  if (sectionIndex !== undefined && (showSection || paragraphIndex === undefined))
    parts.push(ru.section(sectionIndex));
  if (approxPage !== undefined) parts.push(ru.approxPage(approxPage));
  return parts.length > 0 ? parts.join(', ') : ru.wholeDocument;
}

function placeItem(f: Finding, showSection: boolean): HTMLElement {
  return el(
    'li',
    {},
    el('span', { class: 'place' }, placeText(f, showSection)),
    f.location.excerpt ? el('q', { class: 'excerpt' }, f.location.excerpt) : undefined,
    el('span', {}, ` ${f.message}`),
  );
}

function ruleCard(result: RuleResult, profile: Profile, showSection: boolean): HTMLElement {
  const text = RULE_TEXTS[result.ruleId];
  const config = profile.rules[result.ruleId];
  const list = el('ul', { class: 'places' });
  const renderPlaces = (all: boolean): void => {
    const shown = all ? result.findings : result.findings.slice(0, EXAMPLES);
    list.replaceChildren(...shown.map((f) => placeItem(f, showSection)));
  };
  renderPlaces(false);

  let toggle: HTMLButtonElement | undefined;
  if (result.findings.length > EXAMPLES) {
    let expanded = false;
    toggle = el(
      'button',
      { type: 'button', class: 'link', 'aria-expanded': 'false' },
      ru.showAll(result.findings.length),
    );
    toggle.addEventListener('click', () => {
      expanded = !expanded;
      renderPlaces(expanded);
      toggle?.setAttribute('aria-expanded', String(expanded));
      if (toggle) toggle.textContent = expanded ? ru.showLess : ru.showAll(result.findings.length);
    });
  }

  return el(
    'article',
    { class: `card sev-${result.severity}`, id: `rule-${result.ruleId}`, tabindex: '-1' },
    el(
      'h3',
      {},
      el('span', { class: `badge badge-${result.severity}` }, SEVERITY_NAMES[result.severity]),
      ' ',
      `${text?.title ?? result.ruleId} `,
      el('span', { class: 'muted' }, `(${result.ruleId})`),
    ),
    result.summary ? el('p', {}, result.summary) : undefined,
    result.heuristic ? el('p', { class: 'note' }, ru.heuristic) : undefined,
    config?.confidence === 'unconfirmed' ? el('p', { class: 'note' }, ru.unconfirmed) : undefined,
    list,
    toggle,
    text ? disclosure(ru.why, `${text.why} ${ru.typicalNote}`) : undefined,
    text ? disclosure(ru.how, text.howToFixWord) : undefined,
  );
}

// Порядок карточек: сначала то, за что снижали баллы, потом по серьёзности.
function sortResults(results: RuleResult[], profile: Profile): RuleResult[] {
  const priority = profile.meta?.teacherPriority ?? [];
  const rank = (r: RuleResult): number => {
    const p = priority.indexOf(r.ruleId);
    return p >= 0 ? p : 100 + SEVERITY_ORDER.indexOf(r.severity) * 100;
  };
  return [...results].sort((a, b) => rank(a) - rank(b) || a.ruleId.localeCompare(b.ruleId));
}

export function renderReport(report: Report, profile: Profile): HTMLElement {
  const byId = new Map(report.results.map((r) => [r.ruleId, r]));
  const failed = report.results.filter((r) => r.status === 'fail');
  const count = (severity: Severity): number =>
    failed.filter((r) => r.severity === severity).length;
  const notImplemented = report.results.filter((r) => r.status === 'not-implemented').length;
  const showSection = report.stats.sections > 1;

  const heading = el('h2', { id: 'report-title', tabindex: '-1' }, ru.reportTitle);
  return el(
    'section',
    { class: 'report', 'aria-labelledby': 'report-title' },
    heading,
    el('p', { class: 'counters' }, ru.counters(count('error'), count('warning'), count('info'))),
    el(
      'p',
      { class: 'muted' },
      ru.docStats(report.stats.paragraphs, report.stats.emptyParagraphs, report.stats.approxPages),
    ),
    notImplemented > 0 ? el('p', { class: 'muted' }, ru.notChecked(notImplemented)) : undefined,
    priorityBlock(profile, byId),
    boardBlock(profile, byId),
    el('h2', {}, ru.findingsTitle),
    failed.length === 0
      ? el('p', {}, ru.noFindings)
      : el(
          'div',
          { class: 'cards' },
          ...sortResults(failed, profile).map((r) => ruleCard(r, profile, showSection)),
        ),
  );
}
