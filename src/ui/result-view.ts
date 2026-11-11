// Экран результата: строка файла, вердикт с главной кнопкой, две колонки «План исправления»
// и «Текст работы», ниже свёрнутые блоки. На телефоне вместо колонок — переключатель
// «План / Текст работы» и нижняя панель «‹ Назад, место 3 из 73, Дальше ›».
import type { Report } from '../core/engine/index.ts';
import { compareReports } from '../core/engine/compare.ts';
import { computeScore } from '../core/engine/score.ts';
import type { Profile } from '../core/profiles/types.ts';
import { CATEGORY_NAMES, RULE_TEXTS } from '../i18n/rules-ru.ts';
import { GROUP_NAMES, ru } from '../i18n/ru.ts';
import type { MapParagraph } from '../worker/protocol.ts';
import { el } from './dom.ts';
import { appear, strike } from './marks.ts';
import { countTo } from './motion.ts';
import { buildPlan } from './plan-model.ts';
import { renderPlan } from './plan-view.ts';
import { renderPreview } from './preview.ts';

export interface ResultContext {
  report: Report;
  previous?: Report; // прошлая версия файла — для «было / стало»
  map: MapParagraph[];
  profile: Profile;
  fileName: string;
  dismissed: Set<string>;
  done: Set<string>;
  onFix: (ruleIds: string[]) => void;
  onOtherFile: () => void;
  onCompareFile: () => void;
  onRerender: () => void; // после «здесь это есть» план и оценка пересчитываются
  onPrint: () => void;
  onDownload: () => void;
  onCopyList: () => void;
  notify: (text: string, isError?: boolean) => void;
  history: number[]; // оценки прошлых проверок этой работы, последняя — текущая
  onClearHistory: () => void;
}

// Оценка «докручивается» от прошлого значения к новому; первый раз — от нуля.
let shownScore = 0;

function button(label: string, className: string, action: () => void): HTMLButtonElement {
  const b = el('button', { type: 'button', class: className }, label);
  b.addEventListener('click', action);
  return b;
}

function fold(summary: string, ...content: (Node | undefined)[]): HTMLDetailsElement {
  return el(
    'details',
    { class: 'fold' },
    el('summary', {}, summary),
    ...(content.filter(Boolean) as Node[]),
  );
}

// «Попытки: 61 → 73 → 92» — только если работу уже проверяли раньше.
function historyLine(ctx: ResultContext): HTMLElement | undefined {
  if (ctx.history.length < 2) return undefined;
  const clear = button(ru.historyClear, 'link', () => {
    ctx.onClearHistory();
    line.remove();
  });
  const line = el(
    'p',
    { class: 'history', title: ru.historyHint },
    `${ru.historyLabel}: `,
    el('span', { class: 'num' }, ctx.history.join(' → ')),
    ' ',
    clear,
  );
  return line;
}

// Клавиши J / K / ? действуют на экране результата; при перерисовке обработчик меняется.
let keyHandler: ((event: KeyboardEvent) => void) | undefined;

export function renderResult(ctx: ResultContext): HTMLElement {
  const { report, profile, dismissed } = ctx;
  const plan = buildPlan(report, profile, dismissed);
  const score = computeScore(report, dismissed);

  // --- строка файла (прилипает к верху) ---
  const filebar = el(
    'div',
    { class: 'filebar no-print' },
    el('span', { class: 'file-name' }, ctx.fileName),
    el('span', { class: 'soft' }, ru.fileMeta(report.stats.paragraphs, report.stats.approxPages)),
    button(ru.otherFile, 'secondary push', ctx.onOtherFile),
    button(ru.compareWith, 'secondary', ctx.onCompareFile),
  );

  // --- вердикт: одна фраза и главная кнопка ---
  const ready = plan.verdict === 'ready';
  const advice = plan.actions.filter((a) => !a.dismissed && a.severity === 'info').length;
  const scoreValue = el('strong', {}, score.total === undefined ? '—' : ru.score(score.total));
  if (score.total !== undefined) {
    countTo(scoreValue, shownScore, score.total, ru.score);
    shownScore = score.total;
  }
  const categories = Object.entries(score.byCategory).map(([category, value]) =>
    el(
      'li',
      {},
      ru.scoreCategory(CATEGORY_NAMES[category] ?? category, value.earned, value.possible),
    ),
  );
  const scoreBox = el(
    'div',
    { class: 'score' },
    el('span', { class: 'soft' }, ru.scoreSmall),
    scoreValue,
    el(
      'details',
      { class: 'score-how' },
      el('summary', {}, ru.scoreHow),
      el('p', {}, ru.scoreFormula),
      el('ul', {}, ...categories),
    ),
  );

  let compare: HTMLElement | undefined;
  if (ctx.previous) {
    const cmp = compareReports(ctx.previous, report, dismissed);
    const old = el('span', { class: 'old' }, String(cmp.scoreBefore ?? '—'));
    const now = el('span', { class: 'new' }, String(cmp.scoreAfter ?? '—'));
    compare = el(
      'p',
      { class: 'compare' },
      `${ru.compareScoreLabel}: `,
      old,
      ' → ',
      now,
      '. ',
      ru.compareShort(cmp.fixed.length, cmp.remaining.length, cmp.added.length),
    );
    // Старое число зачёркивается «карандашом», рядом проявляется новое. Без конфетти.
    requestAnimationFrame(() => {
      strike(old);
      appear(now);
    });
  }

  const verdict = el(
    'section',
    { class: `verdict verdict-${plan.verdict}`, 'aria-labelledby': 'report-title' },
    el(
      'div',
      { class: 'verdict-main' },
      el('h1', { id: 'report-title', tabindex: '-1' }, ru.verdict[plan.verdict]),
      el(
        'p',
        { class: 'verdict-line' },
        ready
          ? `${ru.verdictReady}${ru.verdictAdvice(advice)}`
          : ru.verdictLine(plan.problems, plan.selfFixable),
      ),
      compare,
      historyLine(ctx),
      plan.fixRuleIds.length > 0
        ? el(
            'div',
            { class: 'cta no-print' },
            button(ru.fixButton, 'primary', () => {
              ctx.notify(ru.fixWorking);
              ctx.onFix(plan.fixRuleIds);
            }),
            el('span', { class: 'soft' }, ru.fixHint),
          )
        : undefined,
    ),
    scoreBox,
  );

  // --- две колонки: план и лист ---
  const barCounter = el('span', { class: 'bar-counter', 'aria-live': 'polite' });
  const bar = el('div', { class: 'bottombar no-print', hidden: '' });
  const sheet = renderPreview(report, profile, ctx.map, dismissed, (index) => {
    const actionId = planView.actionOfParagraph(index);
    if (actionId) {
      showView('plan');
      planView.focusAction(actionId);
    }
  });
  const planView = renderPlan(plan, report.preview, {
    done: ctx.done,
    dismissed,
    priority: (profile.meta?.teacherPriority?.length ?? 0) > 0,
    onShow: (index, focusSheet) => {
      if (focusSheet) showView('text');
      sheet.show(index, focusSheet);
    },
    onToggleDismiss: (ruleIds) => {
      for (const id of ruleIds) {
        if (dismissed.has(id)) dismissed.delete(id);
        else dismissed.add(id);
      }
      ctx.onRerender();
    },
    onHover: (actionId, active) => {
      if (actionId === 'margins') sheet.alignRuler(active);
    },
    onCopy: (text) => {
      void navigator.clipboard
        .writeText(text)
        .then(() => {
          ctx.notify(ru.copiedSearch);
        })
        .catch(() => {
          ctx.notify(ru.copyFailed, true);
        });
    },
    onPlaceChange: (i, n) => {
      bar.hidden = false;
      barCounter.textContent = ru.barCounter(i, n);
    },
  });

  // Телефон: «План» или «Текст работы». На широком экране видны обе колонки, кнопки скрыты.
  const views = el('div', { class: 'views', 'data-view': 'plan' }, planView.element, sheet.element);
  const tabPlan = el('button', { type: 'button', 'aria-pressed': 'true' }, ru.tabPlan);
  const tabText = el('button', { type: 'button', 'aria-pressed': 'false' }, ru.tabText);
  function showView(view: 'plan' | 'text'): void {
    views.dataset.view = view;
    tabPlan.setAttribute('aria-pressed', String(view === 'plan'));
    tabText.setAttribute('aria-pressed', String(view === 'text'));
  }
  tabPlan.addEventListener('click', () => {
    showView('plan');
  });
  tabText.addEventListener('click', () => {
    showView('text');
  });
  const tabs = el(
    'div',
    { class: 'view-switch no-print', role: 'group', 'aria-label': ru.tabsLabel },
    tabPlan,
    tabText,
  );

  bar.append(
    button(ru.barPrev, 'secondary', () => {
      showView('text');
      planView.step(-1, false);
    }),
    barCounter,
    button(ru.barNext, 'secondary', () => {
      showView('text');
      planView.step(1, false);
    }),
  );

  // --- свёрнутые блоки ---
  const passedTitles = plan.passed.map((r) => RULE_TEXTS[r.ruleId]?.title ?? r.ruleId);
  const titlePage =
    plan.titlePage.length > 0
      ? fold(
          ru.titlePageTitle,
          el('p', { class: 'soft' }, ru.titlePageIntro),
          el(
            'ul',
            {},
            ...plan.titlePage.map(({ result, group }) =>
              el(
                'li',
                {},
                el('b', {}, RULE_TEXTS[result.ruleId]?.title ?? result.ruleId),
                `: ${group.summary ?? group.findings[0]?.message ?? GROUP_NAMES['title-page']}`,
              ),
            ),
          ),
        )
      : undefined;
  const reminder = report.results.find((r) => r.ruleId === 'OUT-01');
  const message = reminder?.metrics.message;
  const reminderText =
    reminder?.status !== 'pass'
      ? ''
      : typeof message === 'string' && message !== ''
        ? message
        : (RULE_TEXTS['OUT-01']?.howToFixWord ?? '');

  const folds = el(
    'div',
    { class: 'folds' },
    fold(
      ru.goodTitle(plan.passed.length),
      el('ul', { class: 'good-list' }, ...passedTitles.map((t) => el('li', {}, t))),
    ),
    titlePage,
    fold(ru.passportTitle, ...ru.passportLines(report.passport).map((line) => el('p', {}, line))),
    fold(
      ru.exportTitle,
      el(
        'div',
        { class: 'toolbar' },
        button(ru.print, 'secondary', ctx.onPrint),
        button(ru.downloadJson, 'secondary', ctx.onDownload),
        button(ru.copyList, 'secondary', ctx.onCopyList),
      ),
    ),
    reminderText
      ? el('p', { class: 'reminder' }, el('b', {}, `${ru.pdfReminderTitle}. `), reminderText)
      : undefined,
  );

  // --- подсказка по клавишам ---
  const dialog = el(
    'dialog',
    { class: 'keys', 'aria-labelledby': 'keys-title' },
    el('h2', { id: 'keys-title' }, ru.keysTitle),
    el('ul', {}, ...ru.keysList.map((k) => el('li', {}, k))),
  );
  dialog.append(
    button(ru.keysClose, 'secondary', () => {
      dialog.close();
    }),
  );

  if (keyHandler) document.removeEventListener('keydown', keyHandler);
  keyHandler = (event: KeyboardEvent): void => {
    if (!verdict.isConnected) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest('input, textarea, select, [contenteditable]')) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const key = event.key.toLowerCase();
    // J и K — как в почте и читалках: следующее и предыдущее место. Русская раскладка: О и Л.
    if (key === 'j' || key === 'о') {
      event.preventDefault();
      planView.step(1, true);
    } else if (key === 'k' || key === 'л') {
      event.preventDefault();
      planView.step(-1, true);
    } else if (event.key === '?') {
      event.preventDefault();
      if (!dialog.open) dialog.showModal();
    }
  };
  document.addEventListener('keydown', keyHandler);

  return el('div', { class: 'result' }, filebar, verdict, tabs, views, folds, bar, dialog);
}
