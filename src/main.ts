import { ru } from './i18n/ru.ts';

// Этап 0: только заглушка, чтобы проверить сборку и деплой.
// Текст вставляем через textContent, никогда через innerHTML.
function render(root: HTMLElement): void {
  const title = document.createElement('h1');
  title.textContent = ru.appTitle;

  const subtitle = document.createElement('p');
  subtitle.textContent = ru.appSubtitle;

  const notice = document.createElement('p');
  notice.className = 'muted';
  notice.textContent = ru.stageNotice;

  const privacy = document.createElement('p');
  privacy.textContent = ru.privacyNote;

  root.replaceChildren(title, subtitle, notice, privacy);
}

const root = document.getElementById('app');
if (root) render(root);
