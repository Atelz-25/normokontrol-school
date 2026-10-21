// Генератор синтетических фикстур fixtures/<RULE-ID>/{good,bad}.docx (бриф, раздел 12).
// Запуск: npm run fixtures (Node 22+ сам понимает TypeScript без сборки).
// Файлы нужны, чтобы открыть их в Word и увидеть, что именно проверяет правило;
// тесты собирают те же документы в памяти.
import { mkdirSync, writeFileSync } from 'node:fs';
import { FIXTURES } from './lib/fixtures.ts';

const root = new URL('../fixtures/', import.meta.url);

for (const [ruleId, pair] of Object.entries(FIXTURES)) {
  const dir = new URL(`${ruleId}/`, root);
  mkdirSync(dir, { recursive: true });
  writeFileSync(new URL('good.docx', dir), pair.good());
  writeFileSync(new URL('bad.docx', dir), pair.bad());
}

console.log(`Готово: ${Object.keys(FIXTURES).length} пар good/bad в fixtures/.`);
