// Отчёт: оценка, блоки школы («снижали баллы», «пять пунктов»), паспорт документа,
// карточки замечаний и напоминание перед сдачей. Только DOM API и textContent.
import type { Report, ResultGroup, RuleResult } from '../core/engine/index.ts';
import { computeScore } from '../core/engine/score.ts';
import type { Profile, Severity } from '../core/profiles/types.ts';
import { plannedStage } from '../core/rules/planned.ts';
import type { Finding } from '../core/rules/types.ts';
import { CATEGORY_NAMES, RULE_TEXTS } from '../i18n/rules-ru.ts';
import { GROUP_NAMES, SEVERITY_NAMES, STATUS_NAMES, ru } from '../i18n/ru.ts';
import { disclosure, el } from './dom.ts';

const EXAMPLES = 5; // сколько мест показывать до кнопки «Показать все»
const SEVERITY_ORDER: Severity[] = ['error', 'warning', 'info'];

export interface ReportActions {
  dismissed: ReadonlySet<string>; // эвристики, где отмечено «здесь это есть»
  onToggleDismiss: (ruleId: string) => void;
  onShow: (paragraphIndex: number) => void;
  onPrint: () => void;
  onDownload: () => void;
  onCopy: () => void;
}

const titleOf = (ruleId: string): string => RULE_TEXTS[ruleId]?.title ?? ruleId;

function statusLine(result: RuleResult | undefined, ruleId: string): string {
  if (!result || result.status === 'not-implemented') return ru.stageLater(plannedStage(ruleId));
  // У правил по разделам (поля) группового текста нет: показываем само замечание.
  if (result.status === 'fail')
    return result.summary ?? result.findings[0]?.message ?? STATUS_NAMES.fail;
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
    const name = RULE_TEXTS[id] ? `${titleOf(id)} (${id})` : id;
    return el(
      'li',
      {},
      mark(statusMark([result?.status === 'not-implemented' ? undefined : result])),
      ' ',
      // Ссылка ведёт к карточке, а карточки есть только у правил с замечаниями.
      result?.status === 'fail' ? el('a', { href: `#rule-${id}` }, name) : name,
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

function scoreBlock(report: Report, dismissed: ReadonlySet<string>): HTMLElement {
  const score = computeScore(report, dismissed);
  const categories = Object.entries(score.byCategory).map(([category, value]) =>
    el(
      'li',
      {},
      ru.scoreCategory(CATEGORY_NAMES[category] ?? category, value.earned, value.possible),
    ),
  );
  return el(
    'section',
    { class: 'block score', 'aria-labelledby': 'score-title' },
    el('h2', { id: 'score-title' }, ru.scoreTitle),
    el(
      'p',
      { class: 'score-value' },
      score.total === undefined ? ru.scoreNone : ru.score(score.total),
    ),
    el(
      'details',
      {},
      el('summary', {}, ru.scoreHow),
      el('p', {}, ru.scoreFormula),
      el('ul', {}, ...categories),
    ),
  );
}

function passportBlock(report: Report): HTMLElement {
  return el(
    'details',
    { class: 'block passport' },
    el('summary', {}, ru.passportTitle),
    ...ru.passportLines(report.passport).map((line) => el('p', {}, line)),
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

function placeItem(
  f: Finding,
  showSection: boolean,
  actions: ReportActions,
  extra: boolean,
): HTMLElement {
  const index = f.location.paragraphIndex;
  let show: HTMLButtonElement | undefined;
  if (index !== undefined) {
    show = el(
      'button',
      {
        type: 'button',
        class: 'link show',
        'aria-label': `${ru.showInText}: ${ru.paragraph(index)}`,
      },
      ru.showInText,
    );
    show.addEventListener('click', () => {
      actions.onShow(index);
    });
  }
  return el(
    'li',
    { class: extra ? 'extra' : '' },
    el('span', { class: 'place' }, placeText(f, showSection)),
    f.location.excerpt ? el('q', { class: 'excerpt' }, f.location.excerpt) : undefined,
    el('span', {}, ` ${f.message} `),
    show,
  );
}

// Карточка — это одна группа замечаний одного правила (текст, содержание или титульный лист).
function ruleCard(
  result: RuleResult,
  group: ResultGroup,
  profile: Profile,
  showSection: boolean,
  actions: ReportActions,
): HTMLElement {
  const text = RULE_TEXTS[result.ruleId];
  const config = profile.rules[result.ruleId];
  const findings = group.findings;
  const id = group.key === 'main' ? `rule-${result.ruleId}` : `rule-${result.ruleId}-${group.key}`;
  const dismissed = actions.dismissed.has(result.ruleId);

  // Все места в списке сразу; лишние скрыты классом extra (при печати видны все).
  const list = el(
    'ul',
    { class: 'places', id: `${id}-places` },
    ...findings.map((f, i) => placeItem(f, showSection, actions, i >= EXAMPLES)),
  );
  let toggle: HTMLButtonElement | undefined;
  if (findings.length > EXAMPLES) {
    toggle = el(
      'button',
      {
        type: 'button',
        class: 'link no-print',
        'aria-expanded': 'false',
        'aria-controls': list.id,
      },
      ru.showAll(findings.length),
    );
    toggle.addEventListener('click', () => {
      const expanded = list.classList.toggle('expanded');
      toggle?.setAttribute('aria-expanded', String(expanded));
      if (toggle) toggle.textContent = expanded ? ru.showLess : ru.showAll(findings.length);
    });
  }

  let dismissButton: HTMLButtonElement | undefined;
  if (result.heuristic) {
    dismissButton = el(
      'button',
      { type: 'button', class: 'secondary no-print', 'aria-describedby': `${id}-dismiss-hint` },
      dismissed ? ru.undismiss : ru.dismiss,
    );
    dismissButton.addEventListener('click', () => {
      actions.onToggleDismiss(result.ruleId);
    });
  }

  return el(
    'article',
    { class: `card sev-${group.severity}${dismissed ? ' dismissed' : ''}`, id, tabindex: '-1' },
    el(
      'h3',
      {},
      el('span', { class: `badge badge-${group.severity}` }, SEVERITY_NAMES[group.severity]),
      ' ',
      `${text?.title ?? result.ruleId} `,
      el('span', { class: 'muted' }, `(${result.ruleId})`),
      group.key === 'main' ? undefined : ` — ${GROUP_NAMES[group.key]}`,
    ),
    dismissed ? el('p', { class: 'note' }, ru.dismissed) : undefined,
    group.summary ? el('p', {}, group.summary) : undefined,
    result.heuristic ? el('p', { class: 'note' }, ru.heuristic) : undefined,
    config?.confidence === 'unconfirmed' ? el('p', { class: 'note' }, ru.unconfirmed) : undefined,
    dismissed ? undefined : list,
    dismissed ? undefined : toggle,
    text ? disclosure(ru.why, `${text.why} ${ru.typicalNote}`) : undefined,
    text ? disclosure(ru.how, text.howToFixWord) : undefined,
    dismissButton,
    dismissButton
      ? el('p', { class: 'muted no-print', id: `${id}-dismiss-hint` }, ru.dismissHint)
      : undefined,
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

function toolbar(actions: ReportActions): HTMLElement {
  const button = (label: string, action: () => void): HTMLButtonElement => {
    const b = el('button', { type: 'button', class: 'secondary' }, label);
    b.addEventListener('click', action);
    return b;
  };
  return el(
    'div',
    { class: 'toolbar no-print' },
    button(ru.print, actions.onPrint),
    button(ru.downloadJson, actions.onDownload),
    button(ru.copyList, actions.onCopy),
  );
}

export function renderReport(
  report: Report,
  profile: Profile,
  actions: ReportActions,
): HTMLElement {
  const byId = new Map(report.results.map((r) => [r.ruleId, r]));
  const failed = sortResults(
    report.results.filter((r) => r.status === 'fail'),
    profile,
  );
  // Пары «правило — группа»: сначала текст работы, потом содержание, в конце титульный лист.
  const cards = (key: ResultGroup['key']): [RuleResult, ResultGroup][] =>
    failed.flatMap((r) =>
      r.groups.filter((g) => g.key === key).map((g): [RuleResult, ResultGroup] => [r, g]),
    );
  const ordered = [...cards('main'), ...cards('toc'), ...cards('title-page')];
  // Счётчики — по тексту работы и содержанию; титульный лист отдельной строкой.
  const counted = ordered.filter(
    ([r, g]) => g.key !== 'title-page' && !actions.dismissed.has(r.ruleId),
  );
  const count = (severity: Severity): number =>
    new Set(counted.filter(([, g]) => g.severity === severity).map(([r]) => r.ruleId)).size;
  const titleFindings = cards('title-page').reduce((sum, [, g]) => sum + g.findings.length, 0);
  const notImplemented = report.results.filter((r) => r.status === 'not-implemented').length;
  const showSection = report.stats.sections > 1;
  const reminder = byId.get('OUT-01');
  // OUT-01 — напоминание, а не проверка: текст из профиля или из справки правила.
  const message = reminder?.metrics.message;
  const reminderText =
    reminder?.status !== 'pass'
      ? ''
      : typeof message === 'string' && message !== ''
        ? message
        : (RULE_TEXTS['OUT-01']?.howToFixWord ?? '');

  return el(
    'section',
    { class: 'report', 'aria-labelledby': 'report-title' },
    el('h2', { id: 'report-title', tabindex: '-1' }, ru.reportTitle),
    toolbar(actions),
    scoreBlock(report, actions.dismissed),
    el('p', { class: 'counters' }, ru.counters(count('error'), count('warning'), count('info'))),
    titleFindings > 0 ? el('p', {}, ru.titlePageLine(titleFindings)) : undefined,
    notImplemented > 0 ? el('p', { class: 'muted' }, ru.notChecked(notImplemented)) : undefined,
    priorityBlock(profile, byId),
    boardBlock(profile, byId),
    passportBlock(report),
    el('h2', {}, ru.findingsTitle),
    ordered.length === 0
      ? el('p', {}, ru.noFindings)
      : el(
          'div',
          { class: 'cards' },
          ...ordered.map(([r, g]) => ruleCard(r, g, profile, showSection, actions)),
        ),
    reminderText
      ? el(
          'section',
          { class: 'block reminder', 'aria-labelledby': 'reminder-title' },
          el('h2', { id: 'reminder-title' }, ru.pdfReminderTitle),
          el('p', {}, reminderText),
        )
      : undefined,
  );
}
