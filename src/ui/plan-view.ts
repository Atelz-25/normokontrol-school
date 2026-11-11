// План исправления на странице: пункты-действия с корректурным знаком, числом мест,
// переключателем «‹ 1 из 56 ›», «Почему», «Как в Word», «Все места» и «Сделал».
// Данные и порядок — в plan-model.ts; здесь только DOM. Текст работы — через textContent.
import type { PreviewParagraph } from '../core/engine/passport.ts';
import type { Finding } from '../core/rules/types.ts';
import { RULE_TEXTS } from '../i18n/rules-ru.ts';
import { SEVERITY_NAMES, ru } from '../i18n/ru.ts';
import { el } from './dom.ts';
import { checkMark, markIcon } from './marks.ts';
import { durations, reducedMotion, unfold } from './motion.ts';
import { placeWhere, searchText, type Plan, type PlanAction } from './plan-model.ts';
import { whyPicture } from './why.ts';

const VISIBLE = 5; // сколько пунктов видно сразу, остальные — по кнопке «Ещё N пунктов»
const ROWS = 20; // сколько строк в таблице «Все места» за один раз

export interface PlanCallbacks {
  done: Set<string>; // пункты «сделал» — только пока открыта страница (решение В7)
  dismissed: ReadonlySet<string>;
  priority: boolean; // есть ли у требований список «за что снижали баллы»
  onShow: (paragraphIndex: number, focusSheet: boolean) => void;
  onToggleDismiss: (ruleIds: string[]) => void;
  onHover: (actionId: string, active: boolean) => void;
  onCopy: (text: string) => void;
  onPlaceChange: (index: number, total: number) => void; // для нижней панели на телефоне
}

export interface PlanView {
  element: HTMLElement;
  step: (delta: 1 | -1, focusSheet: boolean) => void; // J / K и нижняя панель
  focusAction: (actionId: string) => void;
  actionOfParagraph: (paragraphIndex: number) => string | undefined;
}

// «стр. 4, после „Цель моей работы…“» — или номер абзаца, если Word не сохранил страницы.
export function whereText(finding: Finding, preview: PreviewParagraph[]): string {
  const where = placeWhere(finding, preview);
  const parts: string[] = [];
  if (where.page !== undefined) parts.push(ru.placePage(where.page));
  else if (where.paragraph !== undefined) parts.push(ru.paragraph(where.paragraph));
  if (where.near) {
    const quote = searchText(where.near.text);
    const cut = quote.length < where.near.text.trim().length ? '…' : '';
    parts.push(`${ru.placeNear[where.near.relation]} «${quote}${cut}»`);
  }
  return parts.length > 0 ? parts.join(', ') : ru.wholeDocument;
}

// Кнопка, которая открывает панель под строкой кнопок (как <details>, но в одну строку).
function toggle(
  label: string,
  panel: HTMLElement,
  onToggle?: (open: boolean) => void,
): HTMLButtonElement {
  panel.hidden = true;
  const button = el(
    'button',
    { type: 'button', class: 'link', 'aria-expanded': 'false', 'aria-controls': panel.id },
    label,
  );
  button.addEventListener('click', () => {
    const open = panel.hidden !== false;
    panel.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
    if (open) unfold([panel]);
    onToggle?.(open);
  });
  return button;
}

// Перестановка с анимацией (FLIP): запоминаем, где были пункты, переставляем, а потом
// каждый плавно доезжает со старого места на новое. Двигается только transform.
function flip(items: HTMLElement[], change: () => void): void {
  const before = new Map(items.map((item) => [item, item.getBoundingClientRect().top]));
  change();
  if (reducedMotion()) return;
  for (const item of items) {
    const dy = (before.get(item) ?? 0) - item.getBoundingClientRect().top;
    if (Math.abs(dy) < 1) continue;
    item.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], {
      duration: durations().reveal * 0.6,
      easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)',
    });
  }
}

function placesTable(
  action: PlanAction,
  preview: PreviewParagraph[],
  callbacks: PlanCallbacks,
  id: string,
): HTMLElement {
  const body = el('tbody');
  const more = el('button', { type: 'button', class: 'link' });
  let shown = 0;
  const addRows = (): void => {
    for (const f of action.places.slice(shown, shown + ROWS)) {
      const where = placeWhere(f, preview);
      const index = f.location.paragraphIndex;
      let show: HTMLButtonElement | undefined;
      if (index !== undefined) {
        show = el(
          'button',
          {
            type: 'button',
            class: 'link',
            'aria-label': `${ru.showPlace}: ${ru.paragraph(index)}`,
          },
          ru.showPlace,
        );
        show.addEventListener('click', () => {
          callbacks.onShow(index, true);
        });
      }
      body.append(
        el(
          'tr',
          {},
          el(
            'td',
            { class: 'num' },
            where.page !== undefined
              ? ru.placePage(where.page)
              : index !== undefined
                ? ru.paragraph(index)
                : ru.wholeDocument,
          ),
          el('td', { class: 'near' }, where.near ? searchText(where.near.text) : ''),
          el('td', {}, f.message),
          el('td', {}, show),
        ),
      );
    }
    shown = Math.min(action.places.length, shown + ROWS);
    const left = action.places.length - shown;
    more.hidden = left === 0;
    more.textContent = ru.moreRows(Math.min(ROWS, left));
  };
  more.addEventListener('click', addRows);
  addRows();
  return el(
    'div',
    { class: 'panel places-panel', id },
    el(
      'div',
      { class: 'table-wrap' },
      el(
        'table',
        { class: 'places-table' },
        el(
          'thead',
          {},
          el('tr', {}, ...ru.placesColumns.map((c) => el('th', { scope: 'col' }, c)), el('td')),
        ),
        body,
      ),
    ),
    more,
  );
}

export function renderPlan(
  plan: Plan,
  preview: PreviewParagraph[],
  callbacks: PlanCallbacks,
): PlanView {
  const list = el('ol', { class: 'plan-items' });
  // Для каждого пункта — номер текущего места и функция перехода.
  const steppers = new Map<string, (delta: 1 | -1, focusSheet: boolean) => void>();
  let current = plan.actions[0]?.id;

  const items = plan.actions.map((action) => {
    const domId = `action-${action.id}`;
    const ruleIds = action.results.map((r) => r.ruleId);
    const located = action.places.filter((f) => f.location.paragraphIndex !== undefined);
    const isDone = callbacks.done.has(action.id);

    // --- строка «что это»: число мест, «исправлю сам», серьёзность, номера правил ---
    const meta = el(
      'p',
      { class: 'meta' },
      el('span', {}, located.length > 0 ? ru.placesCount(action.places.length) : ru.wholeDocument),
      action.fix === 'none'
        ? undefined
        : el('span', { class: 'self' }, action.fix === 'all' ? ru.selfAll : ru.selfSome),
      action.severity === 'error'
        ? undefined
        : el('span', { class: `sev sev-${action.severity}` }, SEVERITY_NAMES[action.severity]),
      el('span', { class: 'ids' }, ruleIds.join(', ')),
    );

    // --- текущее место и переключатель ---
    let position = 0;
    const where = el('span', { class: 'where' });
    const copy = el('button', { type: 'button', class: 'link' }, ru.copySearch);
    const placeLine = el('p', { class: 'place' }, where, ' ', copy);
    const counter = el('span', { class: 'counter' });
    const prev = el('button', { type: 'button', 'aria-label': ru.prevPlace }, '‹');
    const next = el('button', { type: 'button', 'aria-label': ru.nextPlace }, '›');
    const stepper = el('span', { class: 'stepper' }, prev, counter, next);
    const showPosition = (): void => {
      const f = located[position];
      if (!f) return;
      where.textContent = whereText(f, preview);
      counter.textContent = ru.placeOf(position + 1, located.length);
      const near = placeWhere(f, preview).near;
      copy.hidden = near === undefined;
    };
    const go = (delta: 1 | -1, focusSheet: boolean): void => {
      if (located.length === 0) return;
      position = (position + delta + located.length) % located.length;
      showPosition();
      const index = located[position]?.location.paragraphIndex;
      if (index !== undefined) callbacks.onShow(index, focusSheet);
      callbacks.onPlaceChange(position + 1, located.length);
    };
    prev.addEventListener('click', () => {
      current = action.id;
      go(-1, false);
    });
    next.addEventListener('click', () => {
      current = action.id;
      go(1, false);
    });
    copy.addEventListener('click', () => {
      const f = located[position];
      const near = f ? placeWhere(f, preview).near : undefined;
      if (near) callbacks.onCopy(searchText(near.text));
    });
    if (located.length > 0 && !action.dismissed)
      steppers.set(action.id, (delta, focusSheet) => {
        // Первое нажатие показывает первое место, а не второе.
        if (!shownOnce) {
          shownOnce = true;
          const index = located[position]?.location.paragraphIndex;
          if (index !== undefined) callbacks.onShow(index, focusSheet);
          callbacks.onPlaceChange(position + 1, located.length);
          return;
        }
        go(delta, focusSheet);
      });
    let shownOnce = false;
    prev.addEventListener('click', () => (shownOnce = true));
    next.addEventListener('click', () => (shownOnce = true));
    showPosition();

    // --- «Почему», «Как в Word», «Все места» ---
    const texts = action.results.map((r) => ({ id: r.ruleId, text: RULE_TEXTS[r.ruleId] }));
    const whyPanel = el('div', { class: 'panel', id: `${domId}-why` });
    const picture = action.why ? whyPicture(action.why) : undefined;
    if (picture) whyPanel.append(picture.element);
    for (const { text } of texts) if (text) whyPanel.append(el('p', {}, text.why));
    whyPanel.append(el('p', { class: 'soft' }, ru.typicalNote));

    const howPanel = el('div', { class: 'panel', id: `${domId}-how` });
    for (const { id, text } of texts) {
      if (!text) continue;
      if (texts.length > 1)
        howPanel.append(el('h4', {}, text.title, el('span', { class: 'ids' }, ` ${id}`)));
      howPanel.append(el('p', {}, text.howToFixWord));
    }

    const panels: HTMLElement[] = [whyPanel, howPanel];
    const buttons: HTMLElement[] = [
      toggle(ru.whyShort, whyPanel, (open) => {
        if (open) picture?.start();
        else picture?.stop();
      }),
      toggle(ru.howShort, howPanel),
    ];
    if (action.places.length > 1) {
      const table = placesTable(action, preview, callbacks, `${domId}-places`);
      panels.push(table);
      buttons.push(toggle(ru.allPlaces, table));
    }

    // Эвристика: «здесь это есть» убирает правило из плана и оценки.
    const heuristic = action.results.filter((r) => r.heuristic).map((r) => r.ruleId);
    let dismissButton: HTMLButtonElement | undefined;
    if (heuristic.length > 0) {
      dismissButton = el(
        'button',
        { type: 'button', class: 'secondary' },
        action.dismissed ? ru.undismiss : ru.dismiss,
      );
      dismissButton.addEventListener('click', () => {
        callbacks.onToggleDismiss(heuristic);
      });
    }

    const doneButton = el(
      'button',
      { type: 'button', class: 'secondary done-button', 'aria-pressed': String(isDone) },
      isDone ? ru.undo : ru.done,
    );

    const icon = el('span', { class: 'mark-slot' }, isDone ? checkMark() : markIcon(action.mark));
    const item = el(
      'li',
      {
        class: `plan-item sev-${action.severity}${isDone ? ' done' : ''}${action.dismissed ? ' dismissed' : ''}`,
        id: domId,
        tabindex: '-1',
        'data-rules': ruleIds.join(' '),
      },
      icon,
      el(
        'div',
        { class: 'plan-body' },
        el('h3', {}, action.title),
        meta,
        action.dismissed ? el('p', { class: 'soft' }, ru.dismissed) : undefined,
        action.results.some((r) => r.heuristic) && !action.dismissed
          ? el('p', { class: 'soft' }, ru.heuristic)
          : undefined,
        located.length > 0 && !action.dismissed ? placeLine : undefined,
        // Мест в тексте нет («нет введения», «мало источников»): пишем, что не так, сразу.
        located.length === 0 && !action.dismissed
          ? el(
              'ul',
              { class: 'details' },
              ...action.places.slice(0, 3).map((f) => el('li', {}, f.message)),
              action.places.length > 3 ? el('li', { class: 'soft' }, '…') : undefined,
            )
          : undefined,
        el(
          'div',
          { class: 'controls' },
          located.length > 0 && !action.dismissed ? stepper : undefined,
          ...buttons,
          dismissButton,
          doneButton,
        ),
        ...panels,
      ),
    );

    doneButton.addEventListener('click', () => {
      const nowDone = !callbacks.done.has(action.id);
      if (nowDone) callbacks.done.add(action.id);
      else callbacks.done.delete(action.id);
      item.classList.toggle('done', nowDone);
      doneButton.setAttribute('aria-pressed', String(nowDone));
      doneButton.textContent = nowDone ? ru.undo : ru.done;
      icon.replaceChildren(nowDone ? checkMark() : markIcon(action.mark));
      // Сделанный пункт уходит в конец списка, возвращённый — на своё место.
      flip([...list.children] as HTMLElement[], () => {
        arrange();
      });
      doneButton.focus();
    });
    item.addEventListener('focusin', () => {
      current = action.id;
    });
    item.addEventListener('mouseenter', () => {
      callbacks.onHover(action.id, true);
    });
    item.addEventListener('mouseleave', () => {
      callbacks.onHover(action.id, false);
    });
    item.addEventListener('focusin', () => {
      callbacks.onHover(action.id, true);
    });
    item.addEventListener('focusout', (event) => {
      if (!item.contains(event.relatedTarget as Node | null)) callbacks.onHover(action.id, false);
    });
    return { action, item };
  });

  // Порядок: несделанные по плану, потом сделанные. Первые VISIBLE видны сразу.
  const moreButton = el('button', {
    type: 'button',
    class: 'link more-plan',
    'aria-expanded': 'false',
  });
  let expanded = false;

  // Фильтр: все пункты, только ошибки или то, что программа исправит сама.
  type Filter = 'all' | 'errors' | 'self';
  let filter: Filter = 'all';
  const matches = (action: PlanAction): boolean =>
    filter === 'all' || (filter === 'errors' ? action.severity === 'error' : action.fix !== 'none');
  // «По одному»: виден только первый несделанный пункт и сколько осталось.
  let single = false;
  const left = el('p', { class: 'left-count', 'aria-live': 'polite' });

  function arrange(): void {
    const ordered = [
      ...items.filter((i) => !callbacks.done.has(i.action.id)),
      ...items.filter((i) => callbacks.done.has(i.action.id)),
    ];
    list.replaceChildren(...ordered.map((i) => i.item));
    const shown = ordered.filter((i) => matches(i.action));
    const todo = shown.filter((i) => !callbacks.done.has(i.action.id));
    for (const i of ordered) {
      const position = shown.indexOf(i);
      const visible = single ? i === todo[0] : position >= 0 && (expanded || position < VISIBLE);
      i.item.classList.toggle('folded', !visible);
    }
    const hidden = single || expanded ? 0 : Math.max(0, shown.length - VISIBLE);
    moreButton.hidden = hidden === 0;
    moreButton.textContent = ru.morePlan(hidden);
    left.hidden = !single;
    left.textContent = todo.length > 0 ? ru.planLeft(todo.length) : ru.planAllDone;
  }

  const filterButtons = (['all', 'errors', 'self'] as const).map((value) => {
    const button = el(
      'button',
      { type: 'button', 'aria-pressed': String(value === filter) },
      ru.planFilter[value],
    );
    button.addEventListener('click', () => {
      filter = value;
      filterButtons.forEach((b, n) => {
        b.setAttribute('aria-pressed', String(['all', 'errors', 'self'][n] === value));
      });
      arrange();
    });
    return button;
  });
  const singleButton = el(
    'button',
    { type: 'button', class: 'secondary', 'aria-pressed': 'false' },
    ru.planSingle,
  );
  singleButton.addEventListener('click', () => {
    single = !single;
    singleButton.setAttribute('aria-pressed', String(single));
    arrange();
    const first = [...list.children].find((c) => !c.classList.contains('folded'));
    if (single && first instanceof HTMLElement) {
      unfold([first]);
      first.focus();
    }
  });
  const tools = el(
    'div',
    { class: 'plan-tools no-print' },
    el(
      'div',
      { class: 'segmented', role: 'group', 'aria-label': ru.planFilterLabel },
      ...filterButtons,
    ),
    singleButton,
  );
  moreButton.addEventListener('click', () => {
    expanded = true;
    arrange();
    const first = list.children[VISIBLE] as HTMLElement | undefined;
    unfold([...list.children].slice(VISIBLE));
    first?.focus();
  });
  arrange();

  const element = el(
    'section',
    { class: 'plan', 'aria-labelledby': 'plan-title', id: 'plan' },
    el('h2', { id: 'plan-title' }, ru.planTitle),
    el('p', { class: 'soft intro' }, callbacks.priority ? ru.planIntroPriority : ru.planIntro),
    plan.actions.length > 1 ? tools : undefined,
    left,
    list,
    moreButton,
  );

  const reveal = (actionId: string): HTMLElement | undefined => {
    const target = items.find((i) => i.action.id === actionId)?.item;
    if (target?.classList.contains('folded')) {
      // Чтобы показать пункт, снимаем фильтр и режим «по одному».
      filter = 'all';
      single = false;
      singleButton.setAttribute('aria-pressed', 'false');
      filterButtons.forEach((b, n) => {
        b.setAttribute('aria-pressed', String(n === 0));
      });
      expanded = true;
      arrange();
    }
    return target;
  };

  return {
    element,
    step: (delta, focusSheet) => {
      // У пункта без мест в тексте («поля», «нет введения») листать нечего:
      // берём первый пункт плана, у которого места есть.
      const id = current && steppers.has(current) ? current : [...steppers.keys()][0];
      if (id === undefined) return;
      current = id;
      steppers.get(id)?.(delta, focusSheet);
    },
    focusAction: (actionId) => {
      const target = reveal(actionId);
      if (!target) return;
      current = actionId;
      target.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'center' });
      target.focus({ preventScroll: true });
    },
    actionOfParagraph: (paragraphIndex) =>
      plan.actions.find((a) => a.places.some((f) => f.location.paragraphIndex === paragraphIndex))
        ?.id,
  };
}
