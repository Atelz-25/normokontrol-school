// Главный экран: выбор требований, редактор требований, загрузка файла, отчёт и предпросмотр.
// Тяжёлая работа идёт в Web Worker, здесь только интерфейс.
import type { Report } from './core/engine/index.ts';
import { BUILTIN_PROFILES, DEFAULT_PROFILE_ID } from './core/profiles/builtin.ts';
import { loadProfile } from './core/profiles/load.ts';
import { profileFromHash } from './core/profiles/share.ts';
import type { Profile } from './core/profiles/types.ts';
import { docxErrorText, extensionHint, ru } from './i18n/ru.ts';
import { disclosure, el } from './ui/dom.ts';
import { copyText, downloadFile, findingsAsText } from './ui/export.ts';
import { renderPreview } from './ui/preview.ts';
import { renderProfileEditor } from './ui/profile-editor.ts';
import { renderReport } from './ui/report-view.ts';
import { renderSheet } from './ui/sheet.ts';
import {
  loadCustomProfiles,
  loadSelectedId,
  saveCustomProfiles,
  saveSelectedId,
} from './ui/storage.ts';
import { renderFixPanel } from './ui/fix-panel.ts';
import { renderTeacher } from './ui/teacher.ts';
import { check, fix } from './ui/worker-client.ts';

const root = document.getElementById('app');
if (!root) throw new Error('нет элемента #app');

// --- состояние -------------------------------------------------------------
let customProfiles: Profile[] = loadCustomProfiles();
let linkProfile: Profile | undefined; // профиль из ссылки #profile=…
const allProfiles = (): Profile[] => [
  ...BUILTIN_PROFILES,
  ...customProfiles,
  ...(linkProfile ? [linkProfile] : []),
];
const findProfile = (id: string | undefined): Profile | undefined =>
  allProfiles().find((p) => p.id === id);

let profile: Profile =
  findProfile(loadSelectedId()) ??
  findProfile(DEFAULT_PROFILE_ID) ??
  (BUILTIN_PROFILES[0] as Profile);
// Последний файл держим в памяти, чтобы при смене профиля проверить его заново.
let lastFile: { name: string; bytes: ArrayBuffer } | undefined;
let lastReport: Report | undefined;
// Отчёт по прошлой версии файла — для сравнения «было / стало» (этап 3).
let previousReport: Report | undefined;
// Отметки «здесь это есть» — только в памяти, на время работы со страницей (решение В7).
const dismissed = new Set<string>();
let requestId = 0;

// --- разметка -------------------------------------------------------------
const status = el('p', { class: 'status', role: 'status', 'aria-live': 'polite' });
const results = el('div', { class: 'results' });
const editorSlot = el('div', { class: 'editor-slot' });
const teacherSlot = el('div', { class: 'teacher-slot no-print' });

const select = el('select', { id: 'profile', 'aria-describedby': 'profile-hint' });
const profileHint = el('p', { class: 'muted', id: 'profile-hint' });
function fillProfiles(): void {
  select.replaceChildren(
    ...allProfiles().map((p) => {
      const option = el('option', { value: p.id }, p.title);
      option.selected = p.id === profile.id;
      return option;
    }),
  );
  profileHint.textContent = profile.description ?? '';
  sheet.update(profile);
}

const editButton = el(
  'button',
  { type: 'button', class: 'secondary', 'aria-expanded': 'false' },
  ru.editProfile,
);
const teacherButton = el(
  'button',
  { type: 'button', class: 'secondary', 'aria-expanded': 'false' },
  ru.teacherOpen,
);

const input = el('input', {
  type: 'file',
  id: 'file',
  accept: '.docx',
  class: 'visually-hidden',
  'aria-label': ru.chooseFile,
  tabindex: '-1',
});
const chooseButton = el('button', { type: 'button', class: 'primary' }, ru.chooseFile);
// Лист А4 с полями из профиля — он же зона, куда перетаскивают файл.
const sheet = renderSheet(profile);
const drop = el(
  'div',
  { class: 'drop no-print', id: 'drop' },
  sheet.element,
  el(
    'div',
    { class: 'drop-text' },
    el('p', { class: 'drop-title' }, ru.dropTitle),
    el('p', { class: 'muted' }, ru.dropOr),
    chooseButton,
    input,
  ),
);

// Порядок на странице: что это и куда класть файл → настройки → статус → отчёт.
root.replaceChildren(
  el(
    'header',
    { class: 'hero' },
    el(
      'div',
      { class: 'hero-copy' },
      el('h1', {}, ru.appTitle),
      el('p', { class: 'subtitle' }, ru.appSubtitle),
      el('p', { class: 'lead no-print' }, ru.heroLead),
      el(
        'div',
        { class: 'privacy no-print' },
        el('p', {}, ru.privacyNote),
        disclosure(ru.privacyHowTitle, ru.privacyHow),
      ),
    ),
    drop,
  ),
  el(
    'div',
    { class: 'settings no-print' },
    el(
      'div',
      { class: 'field' },
      el('label', { for: 'profile' }, ru.profileLabel),
      select,
      profileHint,
    ),
    el('div', { class: 'toolbar' }, editButton, teacherButton),
  ),
  editorSlot,
  teacherSlot,
  status,
  results,
);
fillProfiles();

// --- сообщения ------------------------------------------------------------
function showMessage(text: string, isError = false): void {
  status.textContent = text;
  status.classList.toggle('error', isError);
}

// --- отчёт ----------------------------------------------------------------
function renderResults(): void {
  if (!lastReport) return;
  const report = lastReport;
  const preview = renderPreview(report, dismissed);
  const view = renderReport(
    report,
    profile,
    {
      dismissed,
      onToggleDismiss: (ruleId) => {
        if (dismissed.has(ruleId)) dismissed.delete(ruleId);
        else dismissed.add(ruleId);
        renderResults();
        document.getElementById(`rule-${ruleId}`)?.focus();
      },
      onShow: (index) => {
        preview.show(index);
      },
      onPrint: () => {
        window.print();
      },
      onDownload: () => {
        // Текст абзацев (preview) в JSON не кладём: отчёт и так большой.
        downloadFile(ru.reportFileName, JSON.stringify({ ...report, preview: undefined }, null, 2));
      },
      onCopy: () => {
        void copyText(findingsAsText(report, dismissed)).then((ok) => {
          showMessage(ok ? ru.copied : ru.copyFailed, !ok);
        });
      },
    },
    previousReport,
  );
  const fixPanel = renderFixPanel(report, (ruleIds) => {
    void runFix(ruleIds);
  });
  results.replaceChildren(
    el('div', { class: 'results-grid' }, el('div', {}, view, fixPanel), preview.element),
  );
}

// --- проверка -------------------------------------------------------------
function runCheck(): void {
  if (!lastFile) return;
  const file = lastFile;
  requestId += 1;
  const id = requestId;
  showMessage(ru.checking(file.name));
  results.replaceChildren();
  // Пока идёт проверка, по листу бежит линия: видно, что программа работает.
  drop.classList.add('busy');
  void check(file.bytes, profile, file.name).then((response) => {
    if (id !== requestId) return; // ответ на старый запрос: пользователь уже выбрал другое
    drop.classList.remove('busy');
    if (!response.ok) {
      lastReport = undefined;
      showMessage(docxErrorText(response.code), true);
      return;
    }
    lastReport = response.report;
    showMessage(ru.checked(file.name));
    renderResults();
    document.getElementById('report-title')?.focus();
  });
}

// --- автоисправление ------------------------------------------------------
async function runFix(ruleIds: string[]): Promise<void> {
  if (!lastFile || !lastReport) return;
  const file = lastFile;
  const before = lastReport;
  const response = await fix(file.bytes, profile, file.name, ruleIds);
  if (!response.ok) {
    showMessage(ru.fixFailed, true);
    return;
  }
  const name = ru.fixedName(file.name);
  // Исходный файл не меняется: исправленный скачивается как новый файл.
  downloadFile(
    name,
    response.bytes,
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  );
  const fixedCount = Object.values(response.applied).reduce((a, b) => a + b, 0);
  const manual = response.report.results
    .filter((r) => ruleIds.includes(r.ruleId) && r.status === 'fail')
    .reduce((sum, r) => sum + r.findings.length, 0);
  showMessage(
    `${ru.fixDone(fixedCount, manual)}${response.notes.includes('numbered-empties') ? ` ${ru.fixNumbered}` : ''}`,
  );
  // Исправленный файл становится «новой версией»: отчёт покажет, что исправлено.
  previousReport = before;
  lastFile = { name, bytes: response.bytes };
  lastReport = response.report;
  dismissed.clear();
  renderResults();
}

async function acceptFile(file: File): Promise<void> {
  const hint = extensionHint(file.name);
  if (hint) {
    showMessage(hint, true);
    results.replaceChildren();
    return;
  }
  // Новая версия работы: прошлый отчёт оставляем для сравнения, отметки начинаем заново.
  previousReport = lastReport;
  lastFile = { name: file.name, bytes: await file.arrayBuffer() };
  dismissed.clear();
  runCheck();
}

function selectProfile(next: Profile): void {
  // С другими требованиями сравнивать версии нечестно: сравнение начинаем заново.
  previousReport = undefined;
  profile = next;
  saveSelectedId(profile.id);
  fillProfiles();
  runCheck();
}

// --- редактор требований --------------------------------------------------
function closeEditor(): void {
  editorSlot.replaceChildren();
  editButton.setAttribute('aria-expanded', 'false');
  editButton.focus();
}

editButton.addEventListener('click', () => {
  if (editorSlot.childElementCount > 0) {
    closeEditor();
    return;
  }
  const editor = renderProfileEditor(profile, {
    onApply: (edited) => {
      customProfiles = [...customProfiles.filter((p) => p.id !== edited.id), edited];
      saveCustomProfiles(customProfiles);
      selectProfile(edited);
      closeEditor();
      showMessage(ru.editorApplied(edited.title));
    },
    onClose: closeEditor,
    notify: showMessage,
    defaults: (id) => BUILTIN_PROFILES.find((p) => p.id === id),
  });
  editorSlot.replaceChildren(editor);
  editButton.setAttribute('aria-expanded', 'true');
  document.getElementById('editor-title')?.focus();
});

// --- режим учителя --------------------------------------------------------
teacherButton.addEventListener('click', () => {
  if (teacherSlot.childElementCount > 0) {
    teacherSlot.replaceChildren();
    teacherButton.setAttribute('aria-expanded', 'false');
    teacherButton.textContent = ru.teacherOpen;
    return;
  }
  teacherSlot.replaceChildren(
    renderTeacher(
      () => profile,
      (name, bytes, report) => {
        previousReport = undefined;
        lastFile = { name, bytes };
        lastReport = report;
        dismissed.clear();
        showMessage(ru.checked(name));
        renderResults();
        document.getElementById('report-title')?.focus();
      },
    ),
  );
  teacherButton.setAttribute('aria-expanded', 'true');
  teacherButton.textContent = ru.teacherClose;
  document.getElementById('teacher-title')?.focus();
});

// --- профиль из ссылки #profile=… -----------------------------------------
if (location.hash.startsWith('#profile=')) {
  const result = loadProfile(profileFromHash(location.hash));
  if (result.ok) {
    linkProfile = { ...result.profile, id: `${result.profile.id}-link` };
    selectProfile(linkProfile);
    showMessage(ru.hashProfile(linkProfile.title));
  } else {
    showMessage(ru.hashProfileBroken, true);
  }
}

// --- события --------------------------------------------------------------
chooseButton.addEventListener('click', () => {
  input.click();
});

input.addEventListener('change', () => {
  const file = input.files?.[0];
  if (file) void acceptFile(file);
  input.value = ''; // чтобы тот же файл можно было выбрать снова после правки
});

select.addEventListener('change', () => {
  const next = findProfile(select.value);
  if (next) selectProfile(next);
});

drop.addEventListener('dragover', (event) => {
  event.preventDefault();
  drop.classList.add('over');
});
drop.addEventListener('dragleave', () => {
  drop.classList.remove('over');
});
drop.addEventListener('drop', (event) => {
  event.preventDefault();
  drop.classList.remove('over');
  const file = event.dataTransfer?.files[0];
  if (file) {
    void acceptFile(file);
    return;
  }
  // Перетащили ссылку (например, на Google Документ), а не файл.
  const link = event.dataTransfer?.getData('text/uri-list') ?? '';
  showMessage(/docs\.google\.com/.test(link) ? ru.googleDocs : ru.unknownFile, true);
});

// --- офлайн-режим ---------------------------------------------------------
// Service worker сохраняет файлы сайта в кэш браузера, чтобы проверка работала и без
// интернета. В режиме разработки он не нужен: мешал бы горячей перезагрузке.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
    // Без офлайн-режима сайт работает как обычно.
  });
}
