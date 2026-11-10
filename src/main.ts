// Сайт целиком: навигация, четыре экрана и переходы между состояниями проверки.
// Экраны выбираются по адресу после «#» (#/, #/teacher, #/profile, #/how), поэтому кнопка
// «Назад» в браузере работает. Тяжёлая работа идёт в Web Worker, здесь только интерфейс.
import type { Report } from './core/engine/index.ts';
import { BUILTIN_PROFILES, DEFAULT_PROFILE_ID } from './core/profiles/builtin.ts';
import { loadProfile } from './core/profiles/load.ts';
import { profileFromHash } from './core/profiles/share.ts';
import type { Profile } from './core/profiles/types.ts';
import { docxErrorText, extensionHint, ru } from './i18n/ru.ts';
import { el } from './ui/dom.ts';
import { copyText, downloadFile, findingsAsText } from './ui/export.ts';
import { durations, reducedMotion, revealInOrder, unfold } from './ui/motion.ts';
import type { PdfDocument } from './core/pdf/analyze.ts';
import { renderPdfResult } from './ui/pdf-view.ts';
import { renderProfileEditor } from './ui/profile-editor.ts';
import { renderResult } from './ui/result-view.ts';
import { renderSheet } from './ui/sheet.ts';
import {
  loadCustomProfiles,
  loadSelectedId,
  saveCustomProfiles,
  saveSelectedId,
} from './ui/storage.ts';
import { renderTeacher } from './ui/teacher.ts';
import { check, fix } from './ui/worker-client.ts';
import type { CheckStep, MapParagraph } from './worker/protocol.ts';

const root = document.getElementById('app');
if (!root) throw new Error('нет элемента #app');

// --- состояние -------------------------------------------------------------
let customProfiles: Profile[] = loadCustomProfiles();
let linkProfile: Profile | undefined; // требования из ссылки #profile=…
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
// Последний файл держим в памяти, чтобы при смене требований проверить его заново.
let lastFile: { name: string; bytes: ArrayBuffer } | undefined;
let lastReport: Report | undefined;
let lastMap: MapParagraph[] = []; // карта документа: роль, «пустой» и длина, без текста
let previousReport: Report | undefined; // прошлая версия — для «было / стало»
let compareNext = false; // следующий файл сравнить с текущим («Сравнить с прошлой версией»)
// Отметки «здесь это есть» и «сделал» — только в памяти, пока открыта страница (решение В7).
const dismissed = new Set<string>();
const done = new Set<string>();
let requestId = 0;
// Проверенный PDF: держим уже прочитанные страницы, чтобы при смене требований не читать заново.
let lastPdf: { name: string; doc: PdfDocument } | undefined;
// Модуль чтения и проверки PDF (загружается при первом PDF).
let pdfTools: typeof import('./ui/pdf-reader.ts') | undefined;

// --- навигация -------------------------------------------------------------
type Route = 'check' | 'teacher' | 'profile' | 'how';
const ROUTES: Record<Route, string> = {
  check: '#/',
  teacher: '#/teacher',
  profile: '#/profile',
  how: '#/how',
};
const routeOf = (hash: string): Route =>
  (Object.entries(ROUTES).find(([, h]) => h === hash)?.[0] as Route | undefined) ?? 'check';

const links = (Object.keys(ROUTES) as Route[]).map((route) =>
  el('a', { href: ROUTES[route], class: `nav-${route}` }, ru.nav[route]),
);
const topbar = el(
  'header',
  { class: 'topbar no-print' },
  el('a', { href: ROUTES.check, class: 'brand' }, ru.appTitle),
  el('nav', { 'aria-label': ru.navLabel }, ...links),
);

const status = el('p', { class: 'status quiet', role: 'status', 'aria-live': 'polite' });

// --- экран «Проверить работу» ---------------------------------------------
const input = el('input', {
  type: 'file',
  id: 'file',
  accept: '.docx,.pdf',
  class: 'visually-hidden',
  'aria-label': ru.chooseFile,
  tabindex: '-1',
});
const chooseButton = el('button', { type: 'button', class: 'primary' }, ru.chooseFile);
const sheet = renderSheet(profile);
const drop = el('div', { class: 'drop no-print', id: 'drop' }, sheet.element);

// Требования одной строкой: «Требования: Наша школа изменить». Выбор раскрывается по кнопке.
const select = el('select', { id: 'profile' });
const requirementName = el('b', {});
const changeButton = el(
  'button',
  { type: 'button', class: 'link', 'aria-expanded': 'false', 'aria-controls': 'profile-field' },
  ru.requirementsChange,
);
const profileField = el(
  'div',
  { class: 'field', id: 'profile-field', hidden: '' },
  el('label', { for: 'profile' }, ru.profileLabel),
  select,
);
changeButton.addEventListener('click', () => {
  const open = profileField.hidden !== false;
  profileField.hidden = !open;
  changeButton.setAttribute('aria-expanded', String(open));
  changeButton.textContent = open ? ru.requirementsDone : ru.requirementsChange;
  if (open) {
    unfold([profileField]);
    select.focus();
  }
});

function fillProfiles(): void {
  select.replaceChildren(
    ...allProfiles().map((p) => {
      const option = el('option', { value: p.id }, p.title);
      option.selected = p.id === profile.id;
      return option;
    }),
  );
  requirementName.textContent = profile.title;
  sheet.update(profile);
}

const startText = el(
  'div',
  { class: 'start-text' },
  el('h1', { id: 'start-title', tabindex: '-1' }, ru.startTitle),
  el('p', { class: 'lead' }, ru.startLead),
  el('div', { class: 'actions' }, chooseButton, el('span', { class: 'soft' }, ru.dropHint), input),
  el('p', { class: 'requirements' }, `${ru.requirementsLine} `, requirementName, ' ', changeButton),
  profileField,
  el(
    'p',
    { class: 'privacy soft' },
    ru.privacyShort,
    ' ',
    el('a', { href: ROUTES.how }, ru.privacyHowTitle),
  ),
);

// Ход проверки: шаг отмечается, когда Worker на самом деле его закончил.
const STEPS: CheckStep[] = ['archive', 'styles', 'paragraphs', 'rules'];
const checkingTitle = el('h1', { id: 'checking-title', tabindex: '-1' });
const stepItems = STEPS.map((step) => el('li', { class: 'wait' }, ru.steps[step]));
const checkingText = el(
  'div',
  { class: 'start-text checking', hidden: '' },
  checkingTitle,
  el('ol', { class: 'steps', 'aria-label': ru.stepsLabel }, ...stepItems),
);
function markStep(step: CheckStep | undefined): void {
  const reached = step ? STEPS.indexOf(step) : -1;
  stepItems.forEach((item, i) => {
    item.className = i <= reached ? 'done' : i === reached + 1 ? 'now' : 'wait';
    item.querySelector('.visually-hidden')?.remove();
    if (i <= reached) item.append(el('span', { class: 'visually-hidden' }, ` — ${ru.stepDone}`));
  });
}

const start = el('div', { class: 'start' }, drop, startText, checkingText);
const results = el('div', { class: 'results' });
const checkScreen = el('section', { class: 'screen', id: 'screen-check' }, start, results);

// --- остальные экраны -------------------------------------------------------
const teacherScreen = el('section', { class: 'screen', id: 'screen-teacher', hidden: '' });
const profileScreen = el('section', { class: 'screen', id: 'screen-profile', hidden: '' });
const howScreen = el(
  'section',
  { class: 'screen', id: 'screen-how', hidden: '' },
  el(
    'div',
    { class: 'how' },
    el('h1', { id: 'how-title', tabindex: '-1' }, ru.nav.how),
    ...ru.howSections.flatMap(([title, text]) => [el('h2', {}, title), el('p', {}, text)]),
    el('h2', {}, ru.privacyHowTitle),
    el('p', {}, ru.privacyHow),
    el('h2', {}, ru.scoreHow),
    el('p', {}, ru.scoreFormula),
  ),
);
const screens: Record<Route, HTMLElement> = {
  check: checkScreen,
  teacher: teacherScreen,
  profile: profileScreen,
  how: howScreen,
};

root.replaceChildren(
  topbar,
  status,
  el('main', { id: 'main' }, checkScreen, teacherScreen, profileScreen, howScreen),
);
fillProfiles();

// --- сообщения ------------------------------------------------------------
// Обычные сообщения («Готово») читает экранный диктор, а на экране их заменяет сам отчёт.
// Ошибки и итог исправления видны всем.
function showMessage(text: string, isError = false, visible = isError): void {
  status.textContent = text;
  status.classList.toggle('error', isError);
  status.classList.toggle('quiet', !visible);
}

// --- состояния экрана проверки -----------------------------------------------
type CheckState = 'start' | 'checking' | 'result';
function setCheckState(state: CheckState): void {
  start.hidden = state === 'result';
  startText.hidden = state !== 'start';
  checkingText.hidden = state !== 'checking';
  if (state !== 'result') results.replaceChildren();
}

// Лист из зоны загрузки «переезжает» в колонку «Текст работы» (View Transitions API).
// Браузер сам запоминает старый вид, мы меняем страницу, и он плавно переводит одно в другое.
// Где этого нет или движение выключено — просто смена прозрачности.
function withTransition(change: () => void): void {
  // В старых браузерах метода нет, хотя типы TypeScript считают, что он есть всегда.
  const doc = document as { startViewTransition?: (cb: () => void) => unknown };
  if (doc.startViewTransition && !reducedMotion()) {
    doc.startViewTransition(change);
    return;
  }
  change();
  results.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 150 });
}

// --- отчёт ----------------------------------------------------------------
function renderResults(reveal = false): void {
  if (!lastReport || !lastFile) return;
  const report = lastReport;
  const view = renderResult({
    report,
    previous: previousReport,
    map: lastMap,
    profile,
    fileName: lastFile.name,
    dismissed,
    done,
    onFix: (ruleIds) => {
      void runFix(ruleIds);
    },
    onOtherFile: () => {
      compareNext = false;
      input.click();
    },
    onCompareFile: () => {
      compareNext = true;
      input.click();
    },
    onRerender: () => {
      renderResults();
    },
    onPrint: () => {
      window.print();
    },
    onDownload: () => {
      // Текст абзацев (preview) в JSON не кладём: отчёт и так большой.
      downloadFile(ru.reportFileName, JSON.stringify({ ...report, preview: undefined }, null, 2));
    },
    onCopyList: () => {
      void copyText(findingsAsText(report, dismissed)).then((ok) => {
        showMessage(ok ? ru.copied : ru.copyFailed, !ok, true);
      });
    },
    notify: (text, isError = false) => {
      showMessage(text, isError, true);
    },
  });
  results.replaceChildren(view);
  if (reveal) revealInOrder([...view.children].slice(2, 6));
}

// --- проверка -------------------------------------------------------------
function runCheck(): void {
  if (!lastFile) return;
  const file = lastFile;
  requestId += 1;
  const id = requestId;
  showMessage(ru.checking(file.name));
  checkingTitle.textContent = ru.checkingTitle(file.name);
  markStep(undefined);
  setCheckState('checking');
  // Пока идёт проверка, по листу бежит линия: видно, что программа работает.
  drop.classList.add('busy');
  drop.classList.remove('failed');
  sheet.startScan();
  const started = performance.now();
  void check(file.bytes, profile, file.name, (step) => {
    if (id === requestId) markStep(step);
  }).then(async (response) => {
    if (id !== requestId) return; // ответ на старый запрос: пользователь уже выбрал другое
    sheet.stopScan(response.ok);
    drop.classList.remove('busy');
    if (!response.ok) {
      lastReport = undefined;
      setCheckState('start');
      showMessage(docxErrorText(response.code), true);
      drop.classList.add('failed');
      return;
    }
    // Короткая пауза, чтобы последний шаг успел отметиться у быстрых файлов.
    const left = durations().ui - (performance.now() - started);
    if (left > 0) await new Promise((r) => setTimeout(r, left));
    lastReport = response.report;
    lastMap = response.map;
    showMessage(ru.checked(file.name));
    // Фокус ставим внутри перехода: при View Transitions новая страница строится чуть позже.
    withTransition(() => {
      setCheckState('result');
      renderResults(true);
      window.scrollTo({ top: 0 });
      document.getElementById('report-title')?.focus({ preventScroll: true });
    });
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
    false,
    true,
  );
  // Исправленный файл становится «новой версией»: вердикт покажет, что исправлено.
  previousReport = before;
  lastFile = { name, bytes: response.bytes };
  lastReport = response.report;
  lastMap = response.map;
  dismissed.clear();
  done.clear();
  renderResults(true);
  document.getElementById('report-title')?.focus();
}

// --- проверка PDF -----------------------------------------------------------
function showPdfResult(): void {
  if (!lastPdf || !pdfTools) return;
  const view = renderPdfResult(pdfTools.checkPdf(lastPdf.doc, profile), lastPdf.name, {
    onOtherFile: () => {
      compareNext = false;
      input.click();
    },
  });
  results.replaceChildren(view);
}

async function runPdfCheck(file: File): Promise<void> {
  requestId += 1;
  const id = requestId;
  lastReport = undefined;
  lastFile = undefined;
  showMessage(ru.checking(file.name));
  checkingTitle.textContent = ru.pdfChecking(file.name);
  markStep(undefined);
  setCheckState('checking');
  drop.classList.add('busy');
  drop.classList.remove('failed');
  sheet.startScan();
  let doc: PdfDocument | undefined;
  let error = '';
  try {
    // Модуль чтения PDF загружается только сейчас: для .docx он не нужен.
    pdfTools = await import('./ui/pdf-reader.ts');
    const { readPdf, PdfReadError } = pdfTools;
    try {
      doc = await readPdf(await file.arrayBuffer());
    } catch (e) {
      error = e instanceof PdfReadError && e.code === 'password' ? ru.pdfPassword : ru.pdfBroken;
    }
  } catch {
    error = ru.pdfLoadFailed;
  }
  if (id !== requestId) return;
  sheet.stopScan(doc !== undefined);
  drop.classList.remove('busy');
  if (!doc) {
    lastPdf = undefined;
    setCheckState('start');
    showMessage(error, true);
    drop.classList.add('failed');
    return;
  }
  lastPdf = { name: file.name, doc };
  showMessage(ru.checked(file.name));
  withTransition(() => {
    setCheckState('result');
    showPdfResult();
    window.scrollTo({ top: 0 });
    document.getElementById('report-title')?.focus({ preventScroll: true });
  });
}

async function acceptFile(file: File): Promise<void> {
  navigate('check');
  if (/\.pdf$/i.test(file.name)) {
    previousReport = undefined;
    await runPdfCheck(file);
    return;
  }
  lastPdf = undefined;
  const hint = extensionHint(file.name);
  if (hint) {
    showMessage(hint, true);
    drop.classList.add('failed');
    setCheckState('start');
    return;
  }
  // Новая версия той же работы — сравниваем с прошлой; другой файл — начинаем заново.
  // Без кнопки «Другой файл» следующий файл тоже считается новой версией, как раньше.
  previousReport = compareNext || lastReport ? lastReport : undefined;
  compareNext = false;
  lastFile = { name: file.name, bytes: await file.arrayBuffer() };
  dismissed.clear();
  done.clear();
  runCheck();
}

function selectProfile(next: Profile): void {
  // С другими требованиями сравнивать версии нечестно: сравнение начинаем заново.
  previousReport = undefined;
  profile = next;
  saveSelectedId(profile.id);
  fillProfiles();
  if (lastPdf && !lastFile) showPdfResult();
  else runCheck();
}

// --- экран «Требования»: редактор ------------------------------------------
function renderProfileScreen(): void {
  const editor = renderProfileEditor(profile, {
    onApply: (edited) => {
      customProfiles = [...customProfiles.filter((p) => p.id !== edited.id), edited];
      saveCustomProfiles(customProfiles);
      selectProfile(edited);
      showMessage(ru.editorApplied(edited.title), false, true);
      renderProfileScreen();
    },
    onClose: () => {
      location.hash = ROUTES.check;
    },
    notify: (text, isError) => {
      showMessage(text, isError, true);
    },
    defaults: (id) => BUILTIN_PROFILES.find((p) => p.id === id),
  });
  profileScreen.replaceChildren(
    el(
      'div',
      { class: 'profile-head' },
      el('h1', { id: 'profile-title', tabindex: '-1' }, ru.profileTitle),
      el('p', {}, ru.profileCurrent(profile.title)),
    ),
    editor,
  );
}

// --- экран «Для учителя» -----------------------------------------------------
function renderTeacherScreen(): void {
  if (teacherScreen.childElementCount > 0) return; // таблица сохраняется между переходами
  teacherScreen.append(
    renderTeacher(
      () => profile,
      (name, bytes, report, map) => {
        previousReport = undefined;
        lastFile = { name, bytes };
        lastReport = report;
        lastMap = map;
        dismissed.clear();
        done.clear();
        location.hash = ROUTES.check;
        setCheckState('result');
        showMessage(ru.checked(name));
        renderResults(true);
        document.getElementById('report-title')?.focus();
      },
    ),
  );
}

// --- переходы между экранами ---------------------------------------------------
function navigate(route: Route): void {
  if (location.hash !== ROUTES[route] && !(route === 'check' && location.hash === ''))
    location.hash = ROUTES[route];
}

const TITLES: Record<Route, string> = {
  check: 'start-title',
  teacher: 'teacher-title',
  profile: 'profile-title',
  how: 'how-title',
};
function showRoute(focus: boolean): void {
  const route = routeOf(location.hash);
  if (route === 'teacher') renderTeacherScreen();
  if (route === 'profile') renderProfileScreen();
  for (const [name, screen] of Object.entries(screens)) screen.hidden = name !== route;
  links.forEach((link, i) => {
    if ((Object.keys(ROUTES) as Route[])[i] === route) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  if (!focus) return;
  // После перехода фокус — на заголовок экрана: экранный диктор сразу говорит, где мы.
  const title =
    route === 'check' && start.hidden
      ? 'report-title'
      : route === 'check' && !start.hidden && checkingText.hidden
        ? TITLES.check
        : TITLES[route];
  document.getElementById(title)?.focus();
  revealInOrder([screens[route]]);
}
window.addEventListener('hashchange', () => {
  showRoute(true);
});

// --- требования из ссылки #profile=… -----------------------------------------
if (location.hash.startsWith('#profile=')) {
  const result = loadProfile(profileFromHash(location.hash));
  if (result.ok) {
    linkProfile = { ...result.profile, id: `${result.profile.id}-link` };
    selectProfile(linkProfile);
    showMessage(ru.hashProfile(linkProfile.title), false, true);
  } else {
    showMessage(ru.hashProfileBroken, true);
  }
  history.replaceState(null, '', ROUTES.check);
}
showRoute(false);

// --- события --------------------------------------------------------------
// Раскрыли «Как считается оценка», «Что уже хорошо» и т. п.: содержимое проявляется.
// Событие toggle не всплывает, поэтому ловим его на этапе погружения (capture).
root.addEventListener(
  'toggle',
  (event) => {
    const details = event.target;
    if (details instanceof HTMLDetailsElement && details.open)
      unfold([...details.children].filter((child) => child.tagName !== 'SUMMARY'));
  },
  true,
);

chooseButton.addEventListener('click', () => {
  compareNext = false;
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

// Файл можно бросить на лист, а после проверки — в любое место страницы.
const dropTarget = (): HTMLElement => (start.hidden ? document.body : drop);
document.addEventListener('dragover', (event) => {
  if (!event.dataTransfer?.types.includes('Files') && start.hidden) return;
  event.preventDefault();
  if (dropTarget() === drop) drop.classList.toggle('over', drop.contains(event.target as Node));
});
document.addEventListener('dragleave', (event) => {
  if (!drop.contains(event.relatedTarget as Node | null)) drop.classList.remove('over');
});
document.addEventListener('drop', (event) => {
  event.preventDefault();
  drop.classList.remove('over');
  if (dropTarget() === drop && !drop.contains(event.target as Node)) return;
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
