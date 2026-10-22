"""Сравнивает находки программы с разметкой truth.csv.
Usage: evaluate.py truth.csv findings.json [--verbose]
findings.json: [{file, rule, paragraph, severity?, message?}]
Правила, которых нет в разметке, оцениваются только как ложные срабатывания
(в чистом файле и в ловушках любое замечание = ложное)."""
import csv, json, sys
from collections import defaultdict

truth = list(csv.DictReader(open(sys.argv[1], encoding='utf-8')))
found = json.load(open(sys.argv[2], encoding='utf-8'))
verbose = '--verbose' in sys.argv
IGNORE = {'TY-02'} if '--ignore-ty02-traps' in sys.argv else set()

def key(r): return (r['file'], r['rule'], str(r['paragraph']))
exp = {key(r): r for r in truth if r['expected'] == 'finding'}
traps = [r for r in truth if r['expected'] == 'pass']
files = sorted({r['file'] for r in truth} | {f['file'] for f in found} | {'00-clean.docx'})

got = defaultdict(list)
for f in found: got[key(f)].append(f)

stats = defaultdict(lambda: {'tp': 0, 'fn': 0, 'fp': 0, 'sev_wrong': 0})
fn_list, fp_list, sev_list, trap_fail = [], [], [], []
for k, r in exp.items():
    hits = got.get(k) or []
    # документные правила (поля) — абзаца нет, совпадение по правилу
    if r['paragraph'] == '':
        hits = [f for f in found if f['file'] == r['file'] and f['rule'] == r['rule']]
    if hits:
        stats[r['rule']]['tp'] += 1
        if r['severity'] and hits[0].get('severity') and hits[0]['severity'] != r['severity']:
            stats[r['rule']]['sev_wrong'] += 1; sev_list.append((r, hits[0]['severity']))
    else:
        stats[r['rule']]['fn'] += 1; fn_list.append(r)
doc_rules = {(r['file'], r['rule']) for r in exp.values() if r['paragraph'] == ''}
for f in found:
    if key(f) in exp or (f['file'], f['rule']) in doc_rules: continue
    stats[f['rule']]['fp'] += 1; fp_list.append(f)
for t in traps:
    bad = [f for f in found if f['file'] == t['file'] and f['rule'] == t['rule'] and key(f) not in exp
           and (t['file'], t['rule']) not in doc_rules
           and (t['paragraph'] == '' or str(f['paragraph']) == str(t['paragraph']))]
    if bad: trap_fail.append((t, len(bad)))

print(f'Файлов: {len(files)}; ожидаемых находок: {len(exp)}; ловушек: {len(traps)}\n')
print(f'{"правило":8} {"верно":>6} {"пропуск":>8} {"ложно":>6} {"точность":>9} {"полнота":>8}  серьёзность')
T = {'tp': 0, 'fn': 0, 'fp': 0}
for rule in sorted(stats):
    s = stats[rule]
    for k in T: T[k] += s[k]
    p = s['tp'] / (s['tp'] + s['fp']) if s['tp'] + s['fp'] else float('nan')
    rc = s['tp'] / (s['tp'] + s['fn']) if s['tp'] + s['fn'] else float('nan')
    print(f'{rule:8} {s["tp"]:6} {s["fn"]:8} {s["fp"]:6} {p:9.2f} {rc:8.2f}  {"неверная: " + str(s["sev_wrong"]) if s["sev_wrong"] else ""}')
p = T['tp'] / (T['tp'] + T['fp']); rc = T['tp'] / (T['tp'] + T['fn'])
print(f'{"ИТОГО":8} {T["tp"]:6} {T["fn"]:8} {T["fp"]:6} {p:9.2f} {rc:8.2f}')
print(f'\nЛовушки: пройдено {len(traps) - len(trap_fail)} из {len(traps)}')
for t, n in trap_fail: print(f'  ✗ {t["file"]} {t["rule"]} §{t["paragraph"]}: {t["note"]} — замечаний: {n}')
if sev_list:
    print('\nНеверная серьёзность:')
    for r, s in sev_list: print(f'  {r["file"]} {r["rule"]} §{r["paragraph"]}: ждали {r["severity"]}, программа {s}')
if verbose or len(fn_list) < 40:
    print('\nПропуски:')
    for r in fn_list: print(f'  {r["file"]} {r["rule"]} §{r["paragraph"]}: {r["note"]}')
print('\nЛожные срабатывания (по правилам):')
by = defaultdict(list)
for f in fp_list: by[f['rule']].append(f)
for rule, fs in sorted(by.items()):
    print(f'  {rule}: {len(fs)} в {len({f["file"] for f in fs})} файлах; напр. {fs[0]["file"]} §{fs[0]["paragraph"]}: {fs[0].get("message", "")[:90]}')
