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
import {
  loadCustomProfiles,
  loadSelectedId,
  saveCustomProfiles,
  saveSelectedId,
} from './ui/storage.ts';
import type { CheckRequest, CheckResponse } from './worker/protocol.ts';

const root = document.getElementById('app');
if (!root) throw new Error('нет элемента #app');

const worker = new Worker(new URL('./worker/check.worker.ts', import.meta.url), { type: 'module' });

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
// Отметки «здесь это есть» — только в памяти, на время работы со страницей (решение В7).
const dismissed = new Set<string>();
let requestId = 0;

// --- разметка -------------------------------------------------------------
const status = el('p', { class: 'status', role: 'status', 'aria-live': 'polite' });
const results = el('div', { class: 'results' });
const editorSlot = el('div', { class: 'editor-slot' });

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
}

const editButton = el(
  'button',
  { type: 'button', class: 'secondary', 'aria-expanded': 'false' },
  ru.editProfile,
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
const drop = el(
  'div',
  { class: 'drop no-print', id: 'drop' },
  el('p', { class: 'drop-title' }, ru.dropTitle),
  el('p', {}, ru.dropOr),
  chooseButton,
  input,
);

root.replaceChildren(
  el('header', {}, el('h1', {}, ru.appTitle), el('p', {}, ru.appSubtitle)),
  el(
    'div',
    { class: 'no-print' },
    el('p', { class: 'privacy' }, ru.privacyNote),
    disclosure(ru.privacyHowTitle, ru.privacyHow),
    el(
      'div',
      { class: 'field' },
      el('label', { for: 'profile' }, ru.profileLabel),
      select,
      profileHint,
      el('div', {}, editButton),
    ),
  ),
  editorSlot,
  drop,
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
  const view = renderReport(report, profile, {
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
  });
  results.replaceChildren(el('div', { class: 'results-grid' }, view, preview.element));
}

// --- проверка -------------------------------------------------------------
function runCheck(): void {
  if (!lastFile) return;
  requestId += 1;
  showMessage(ru.checking(lastFile.name));
  results.replaceChildren();
  // Копию буфера отдаём Worker'у «насовсем» (transfer): так не тратится время на копирование.
  const bytes = lastFile.bytes.slice(0);
  const request: CheckRequest = { id: requestId, bytes, profile, fileName: lastFile.name };
  worker.postMessage(request, [bytes]);
}

worker.addEventListener('message', (event: MessageEvent<CheckResponse>) => {
  const response = event.data;
  if (response.id !== requestId || !lastFile) return; // ответ на старый запрос
  if (!response.ok) {
    lastReport = undefined;
    showMessage(docxErrorText(response.code), true);
    return;
  }
  lastReport = response.report;
  showMessage(ru.checked(lastFile.name));
  renderResults();
  document.getElementById('report-title')?.focus();
});

worker.addEventListener('error', () => {
  showMessage(ru.workerFailed, true);
});

async function acceptFile(file: File): Promise<void> {
  const hint = extensionHint(file.name);
  if (hint) {
    showMessage(hint, true);
    results.replaceChildren();
    return;
  }
  lastFile = { name: file.name, bytes: await file.arrayBuffer() };
  dismissed.clear(); // новая версия работы — отметки начинаем заново
  runCheck();
}

function selectProfile(next: Profile): void {
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
