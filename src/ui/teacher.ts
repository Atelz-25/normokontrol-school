// Режим учителя (бриф, раздел 10.5): несколько работ сразу, сводная таблица с сортировкой,
// экспорт в CSV, по клику — полный отчёт по работе.
import { computeScore } from '../core/engine/score.ts';
import type { Report, RuleResult } from '../core/engine/index.ts';
import type { Profile } from '../core/profiles/types.ts';
import { RULE_TEXTS } from '../i18n/rules-ru.ts';
import { ru } from '../i18n/ru.ts';
import { el } from './dom.ts';
import { downloadFile } from './export.ts';
import type { MapParagraph } from '../worker/protocol.ts';
import { check } from './worker-client.ts';

interface Row {
  name: string;
  bytes: ArrayBuffer;
  report?: Report;
  map?: MapParagraph[];
  score?: number;
  errors: number;
  warnings: number;
  top: string[];
}

const WEIGHT = { error: 3, warning: 2, info: 1 } as const;

// Три главные проблемы: серьёзность × число мест.
function topProblems(report: Report): string[] {
  return report.results
    .filter((r): r is RuleResult => r.status === 'fail')
    .sort((a, b) => WEIGHT[b.severity] * b.findings.length - WEIGHT[a.severity] * a.findings.length)
    .slice(0, 3)
    .map((r) => RULE_TEXTS[r.ruleId]?.title ?? r.ruleId);
}

const countRules = (report: Report, severity: 'error' | 'warning'): number =>
  report.results.filter((r) => r.status === 'fail' && r.severity === severity).length;

// CSV для Excel: разделитель «;» и метка BOM, чтобы русские буквы открылись правильно.
export function rowsToCsv(
  rows: { name: string; score?: number; errors: number; warnings: number; top: string[] }[],
): string {
  const cell = (value: string | number | undefined): string =>
    `"${String(value ?? '').replace(/"/g, '""')}"`;
  const header = ru.teacherColumns.slice(0, 5).map(cell).join(';');
  const lines = rows.map((r) =>
    [r.name, r.score, r.errors, r.warnings, r.top.join(', ')].map(cell).join(';'),
  );
  return `\ufeff${[header, ...lines].join('\r\n')}\r\n`;
}

export function renderTeacher(
  getProfile: () => Profile,
  onOpen: (name: string, bytes: ArrayBuffer, report: Report, map: MapParagraph[]) => void,
): HTMLElement {
  let rows: Row[] = [];
  let sortColumn = 0;
  let ascending = true;

  const status = el('p', { role: 'status', 'aria-live': 'polite' });
  const tableSlot = el('div', { class: 'table-wrap' });
  const csvButton = el('button', { type: 'button', class: 'secondary' }, ru.teacherCsv);
  csvButton.hidden = true;
  csvButton.addEventListener('click', () => {
    downloadFile(ru.teacherCsvName, rowsToCsv(rows), 'text/csv;charset=utf-8');
  });

  const sortValue = (row: Row): string | number => {
    switch (sortColumn) {
      case 1:
        return row.score ?? -1;
      case 2:
        return row.errors;
      case 3:
        return row.warnings;
      default:
        return row.name.toLowerCase();
    }
  };

  const renderTable = (): void => {
    const sorted = [...rows].sort((a, b) => {
      const x = sortValue(a);
      const y = sortValue(b);
      const order = x < y ? -1 : x > y ? 1 : 0;
      return ascending ? order : -order;
    });
    const head = ru.teacherColumns.map((title, i) => {
      if (i > 3) return el('th', { scope: 'col' }, title);
      const button = el(
        'button',
        { type: 'button', class: 'link', 'aria-label': ru.teacherSortBy(title) },
        title,
      );
      button.addEventListener('click', () => {
        ascending = sortColumn === i ? !ascending : true;
        sortColumn = i;
        renderTable();
      });
      const aria = sortColumn === i ? (ascending ? 'ascending' : 'descending') : 'none';
      return el('th', { scope: 'col', 'aria-sort': aria }, button);
    });
    const body = sorted.map((row) => {
      let open: HTMLButtonElement | undefined;
      if (row.report) {
        const report = row.report;
        open = el('button', { type: 'button', class: 'link' }, ru.teacherOpenReport);
        open.addEventListener('click', () => {
          onOpen(row.name, row.bytes, report, row.map ?? []);
        });
      }
      return el(
        'tr',
        {},
        el('th', { scope: 'row' }, row.name),
        el('td', {}, row.report ? String(row.score ?? '—') : ru.teacherBroken),
        el('td', {}, String(row.errors)),
        el('td', {}, String(row.warnings)),
        el('td', {}, row.top.join('; ')),
        el('td', {}, open),
      );
    });
    tableSlot.replaceChildren(
      el(
        'table',
        { class: 'teacher-table' },
        el('thead', {}, el('tr', {}, ...head)),
        el('tbody', {}, ...body),
      ),
    );
  };

  const input = el('input', {
    type: 'file',
    multiple: '',
    accept: '.docx',
    class: 'visually-hidden',
    'aria-label': ru.teacherChoose,
    tabindex: '-1',
  });
  const choose = el('button', { type: 'button', class: 'primary' }, ru.teacherChoose);
  choose.addEventListener('click', () => {
    input.click();
  });
  input.addEventListener('change', () => {
    const files = [...(input.files ?? [])];
    input.value = '';
    if (files.length === 0) return;
    void (async () => {
      rows = [];
      csvButton.hidden = true;
      // По одной работе: Worker один, а таблица заполняется по мере проверки.
      for (const [i, file] of files.entries()) {
        status.textContent = ru.teacherProgress(i, files.length);
        const bytes = await file.arrayBuffer();
        const response = await check(bytes, getProfile(), file.name);
        rows.push(
          response.ok
            ? {
                name: file.name,
                bytes,
                report: response.report,
                map: response.map,
                score: computeScore(response.report).total,
                errors: countRules(response.report, 'error'),
                warnings: countRules(response.report, 'warning'),
                top: topProblems(response.report),
              }
            : { name: file.name, bytes, errors: 0, warnings: 0, top: [] },
        );
        renderTable();
      }
      status.textContent = ru.teacherDone(files.length);
      csvButton.hidden = false;
    })();
  });

  return el(
    'section',
    { class: 'block teacher', 'aria-labelledby': 'teacher-title' },
    el('h2', { id: 'teacher-title', tabindex: '-1' }, ru.teacherTitle),
    el('p', { class: 'muted' }, ru.teacherIntro),
    el('div', { class: 'toolbar' }, choose, csvButton, input),
    status,
    tableSlot,
  );
}
