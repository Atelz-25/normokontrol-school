// Генерация docs/RULES.md из реестра правил (бриф, раздел 8): npm run docs:rules.
// Документ не пишется руками, поэтому не расходится с кодом.
import { readFileSync, writeFileSync } from 'node:fs';
import { plannedStage } from '../src/core/rules/planned.ts';
import { RULES } from '../src/core/rules/registry.ts';
import { CATEGORY_NAMES, RULE_TEXTS } from '../src/i18n/rules-ru.ts';

const root = new URL('../', import.meta.url);
const profile = JSON.parse(readFileSync(new URL('profiles/school-custom.json', root), 'utf8')) as {
  rules: Record<string, { severity: string; confidence?: string; note?: string }>;
};

const lines: string[] = [
  '# Каталог правил',
  '',
  '> Файл создан командой `npm run docs:rules` из реестра правил. Не правьте его руками.',
  '',
  'Значения по умолчанию — типовые школьные требования. Их нужно сверить с методичкой своей школы. Профиль «Наша школа» (`profiles/school-custom.json`) задаёт свои значения.',
  '',
  '## Реализованные правила',
  '',
  '| ID | Правило | Категория | Этап | Автоисправление | Профиль школы |',
  '|---|---|---|---|---|---|',
];

for (const rule of RULES) {
  const text = RULE_TEXTS[rule.id];
  const school = profile.rules[rule.id];
  const schoolCell = school
    ? `${school.severity}${school.confidence ? `, ${school.confidence}` : ''}`
    : '—';
  lines.push(
    `| ${rule.id} | ${text?.title ?? ''}${rule.heuristic ? ' (эвристика)' : ''} | ${CATEGORY_NAMES[rule.category] ?? rule.category} | ${rule.stage} | ${rule.autoFixable ? 'да (этап 4)' : 'нет'} | ${schoolCell} |`,
  );
}

lines.push('', '## Подробно', '');
for (const rule of RULES) {
  const text = RULE_TEXTS[rule.id];
  lines.push(
    `### ${rule.id}. ${text?.title ?? ''}`,
    '',
    `**Почему:** ${text?.why ?? ''}`,
    '',
    `**Как исправить в Word:** ${text?.howToFixWord ?? ''}`,
    '',
    `**Параметры по умолчанию:** \`${JSON.stringify(rule.defaultParams)}\``,
    '',
  );
  const note = profile.rules[rule.id]?.note;
  if (note) lines.push(`**В профиле школы:** ${note}`, '');
}

const implemented = new Set(RULES.map((rule) => rule.id));
const pending = Object.keys(profile.rules)
  .filter((id) => !implemented.has(id))
  .sort();
lines.push(
  '## Ещё не реализовано',
  '',
  'Правила из профиля школы, которые появятся на следующих этапах.',
  '',
  '| ID | Этап |',
  '|---|---|',
  ...pending.map((id) => `| ${id} | ${plannedStage(id)} |`),
  '',
);

writeFileSync(new URL('docs/RULES.md', root), lines.join('\n'));
console.log(`docs/RULES.md: ${RULES.length} правил, ещё не реализовано ${pending.length}.`);
