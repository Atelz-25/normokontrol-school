// Главный экран: выбор требований, загрузка файла, отчёт.
// Тяжёлая работа идёт в Web Worker, здесь только интерфейс.
import { BUILTIN_PROFILES, DEFAULT_PROFILE_ID } from './core/profiles/builtin.ts';
import type { Profile } from './core/profiles/types.ts';
import { docxErrorText, extensionHint, ru } from './i18n/ru.ts';
import { disclosure, el } from './ui/dom.ts';
import { renderReport } from './ui/report-view.ts';
import type { CheckRequest, CheckResponse } from './worker/protocol.ts';

const root = document.getElementById('app');
if (!root) throw new Error('нет элемента #app');

const worker = new Worker(new URL('./worker/check.worker.ts', import.meta.url), { type: 'module' });

let profile: Profile =
  BUILTIN_PROFILES.find((p) => p.id === DEFAULT_PROFILE_ID) ?? (BUILTIN_PROFILES[0] as Profile);
// Последний файл держим в памяти, чтобы при смене профиля проверить его заново.
let lastFile: { name: string; bytes: ArrayBuffer } | undefined;
let requestId = 0;

// --- разметка -------------------------------------------------------------
const status = el('p', { class: 'status', role: 'status', 'aria-live': 'polite' });
const results = el('div', { class: 'results' });

const select = el(
  'select',
  { id: 'profile' },
  ...BUILTIN_PROFILES.map((p) => {
    const option = el('option', { value: p.id }, p.title);
    option.selected = p.id === profile.id;
    return option;
  }),
);
const profileHint = el('p', { class: 'muted', id: 'profile-hint' }, profile.description ?? '');
select.setAttribute('aria-describedby', 'profile-hint');

// Поле скрыто (его открывает кнопка), но у него должна быть подпись для экранного диктора.
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
  { class: 'drop', id: 'drop' },
  el('p', { class: 'drop-title' }, ru.dropTitle),
  el('p', {}, ru.dropOr),
  chooseButton,
  input,
);

root.replaceChildren(
  el('header', {}, el('h1', {}, ru.appTitle), el('p', {}, ru.appSubtitle)),
  el('p', { class: 'privacy' }, ru.privacyNote),
  disclosure(ru.privacyHowTitle, ru.privacyHow),
  el(
    'div',
    { class: 'field' },
    el('label', { for: 'profile' }, ru.profileLabel),
    select,
    profileHint,
  ),
  drop,
  status,
  results,
);

// --- проверка -------------------------------------------------------------
function showMessage(text: string, isError = false): void {
  status.textContent = text;
  status.classList.toggle('error', isError);
}

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
    showMessage(docxErrorText(response.code), true);
    return;
  }
  showMessage(ru.checked(lastFile.name));
  results.replaceChildren(renderReport(response.report, profile));
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
  runCheck();
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
  profile = BUILTIN_PROFILES.find((p) => p.id === select.value) ?? profile;
  profileHint.textContent = profile.description ?? '';
  runCheck();
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
