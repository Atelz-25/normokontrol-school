// Результат проверки PDF: вердикт и список проверок. В PDF видно меньше, чем в .docx,
// поэтому здесь нет плана с местами в тексте, а внизу честно сказано, чего PDF не покажет.
import type { PdfReport } from '../core/pdf/analyze.ts';
import { PDF_TEXTS } from '../i18n/pdf-ru.ts';
import { SEVERITY_NAMES, ru } from '../i18n/ru.ts';
import { el } from './dom.ts';
import { checkMark, markIcon } from './marks.ts';
import { unfold } from './motion.ts';

export interface PdfViewActions {
  onOtherFile: () => void;
}

export function renderPdfResult(
  report: PdfReport,
  fileName: string,
  actions: PdfViewActions,
): HTMLElement {
  const applicable = report.checks.filter((c) => c.status !== 'not-applicable');
  const failed = applicable.filter((c) => c.status === 'fail');
  const verdict = failed.some((c) => c.severity === 'error')
    ? 'early'
    : failed.some((c) => c.severity === 'warning')
      ? 'almost'
      : 'ready';

  const other = el('button', { type: 'button', class: 'secondary push' }, ru.otherFile);
  other.addEventListener('click', actions.onOtherFile);

  const items = report.checks.map((check) => {
    const text = PDF_TEXTS[check.id];
    const bad = check.status === 'fail';
    let how: HTMLElement | undefined;
    let toggle: HTMLButtonElement | undefined;
    if (bad) {
      how = el('div', { class: 'panel', id: `${check.id}-how`, hidden: '' }, el('p', {}, text.how));
      const panel = how;
      toggle = el(
        'button',
        { type: 'button', class: 'link', 'aria-expanded': 'false', 'aria-controls': panel.id },
        ru.howShort,
      );
      toggle.addEventListener('click', () => {
        const open = panel.hidden !== false;
        panel.hidden = !open;
        toggle?.setAttribute('aria-expanded', String(open));
        if (open) unfold([panel]);
      });
    }
    return el(
      'li',
      {
        class: `plan-item pdf-check sev-${check.severity}${bad ? '' : ' passed'}`,
        id: `check-${check.id}`,
      },
      el('span', { class: 'mark-slot' }, bad ? markIcon('replace') : checkMark()),
      el(
        'div',
        { class: 'plan-body' },
        el('h3', {}, text.title),
        el(
          'p',
          { class: 'meta' },
          el('span', {}, bad ? SEVERITY_NAMES[check.severity] : ru.pdfPassed),
          check.heuristic ? el('span', { class: 'ids' }, ru.pdfHeuristic) : undefined,
          el('span', { class: 'ids' }, check.id),
        ),
        el('p', { class: 'place' }, check.message),
        check.note ? el('p', { class: 'soft' }, check.note) : undefined,
        toggle ? el('div', { class: 'controls' }, toggle) : undefined,
        how,
      ),
    );
  });

  return el(
    'div',
    { class: 'result pdf-result' },
    el(
      'div',
      { class: 'filebar no-print' },
      el('span', { class: 'file-name' }, fileName),
      el('span', { class: 'soft' }, ru.pdfPages(report.pages)),
      other,
    ),
    el(
      'section',
      { class: `verdict verdict-${verdict}`, 'aria-labelledby': 'report-title' },
      el(
        'div',
        { class: 'verdict-main' },
        el('h1', { id: 'report-title', tabindex: '-1' }, ru.verdict[verdict]),
        el('p', { class: 'verdict-line' }, ru.pdfLine(failed.length, applicable.length)),
      ),
    ),
    el(
      'section',
      { class: 'plan', 'aria-labelledby': 'pdf-title' },
      el('h2', { id: 'pdf-title' }, ru.pdfTitle),
      el('p', { class: 'soft intro' }, ru.pdfIntro),
      el('ol', { class: 'plan-items' }, ...items),
    ),
  );
}
