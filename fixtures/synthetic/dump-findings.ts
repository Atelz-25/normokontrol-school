import { readFileSync, readdirSync } from 'node:fs';
import { checkDocx } from '../src/core/engine/index.ts';
import { BUILTIN_PROFILES } from '../src/core/profiles/builtin.ts';
const profile = BUILTIN_PROFILES.find((p) => p.id === 'school-custom')!;
const dir = process.argv[2]!;
const out: unknown[] = [];
for (const f of readdirSync(dir).filter((x) => x.endsWith('.docx')).sort()) {
  const r = checkDocx(readFileSync(`${dir}/${f}`), profile);
  for (const x of r.results) {
    if (x.status !== 'fail') continue;
    for (const fd of x.findings)
      out.push({ file: f, rule: x.ruleId, paragraph: fd.location.paragraphIndex ?? '', severity: (fd as {severity?: string}).severity ?? x.severity, message: fd.message });
  }
}
console.log(JSON.stringify(out));
