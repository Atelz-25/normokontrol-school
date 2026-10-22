// Скачать файл, скопировать текст, текстовый список замечаний.
// Файл собирается прямо в браузере (Blob) — никакой сети.
import type { Report } from '../core/engine/index.ts';
import { RULE_TEXTS } from '../i18n/rules-ru.ts';
import { GROUP_NAMES, SEVERITY_NAMES, ru } from '../i18n/ru.ts';

export function downloadFile(name: string, text: string, type = 'application/json'): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  // Даём браузеру начать скачивание, потом освобождаем память.
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

// Список замечаний простым текстом — чтобы вставить в сообщение или документ.
export function findingsAsText(report: Report, dismissed: ReadonlySet<string>): string {
  const lines: string[] = [];
  for (const result of report.results) {
    if (result.status !== 'fail' || dismissed.has(result.ruleId)) continue;
    for (const group of result.groups) {
      const where = group.key === 'main' ? '' : ` — ${GROUP_NAMES[group.key]}`;
      lines.push(
        `${result.ruleId} ${RULE_TEXTS[result.ruleId]?.title ?? ''}${where} (${SEVERITY_NAMES[group.severity]})`,
      );
      if (group.summary) lines.push(`  ${group.summary}`);
      for (const f of group.findings) {
        const place =
          f.location.paragraphIndex !== undefined
            ? ru.paragraph(f.location.paragraphIndex)
            : ru.wholeDocument;
        lines.push(`  • ${place}: ${f.message}`);
      }
    }
  }
  return lines.join('\n');
}
