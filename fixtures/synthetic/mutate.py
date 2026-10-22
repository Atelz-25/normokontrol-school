"""Синтетический набор для проверки алгоритма «Нормоконтроля».

Берёт образцовый файл (0 ошибок), вносит в копии ошибки с известным местом
и «ловушки» (правильное оформление, похожее на ошибку). Разметка считается
здесь, независимо от кода сайта.

Usage: python3 mutate.py base.docx out_dir [n_files] [seed]
Выход: out_dir/docs/*.docx, out_dir/truth.csv, out_dir/manifest.json
"""
import copy, csv, io, json, os, random, re, sys, zipfile
from lxml import etree

W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
def q(t): return f'{{{W}}}{t}'

BASE, OUT = sys.argv[1], sys.argv[2]
N = int(sys.argv[3]) if len(sys.argv) > 3 else 30
SEED = int(sys.argv[4]) if len(sys.argv) > 4 else 2026

with zipfile.ZipFile(BASE) as z:
    BASE_FILES = {n: z.read(n) for n in z.namelist()}


class Doc:
    def __init__(self):
        self.doc = etree.fromstring(BASE_FILES['word/document.xml'])
        self.sty = etree.fromstring(BASE_FILES['word/styles.xml'])
        self.body = self.doc.find(q('body'))
        self.truth = []      # (rule, element|None, kind, note, severity)
        self.applied = []
        self.roles = self._roles()

    # ---------- роли абзацев по исходной структуре
    def paras(self):
        return list(self.body.iter(q('p')))

    @staticmethod
    def text(p):
        return ''.join(t.text or '' for t in p.iter(q('t')))

    @staticmethod
    def style(p):
        s = p.find(f'{q("pPr")}/{q("pStyle")}')
        return s.get(q('val')) if s is not None else ''

    def _roles(self):
        roles = {}
        zone = 'title'
        for p in self.paras():
            t, st = self.text(p), self.style(p)
            in_tbl = any(a.tag == q('tbl') for a in p.iterancestors())
            if t.startswith('ПАСПОРТ ИНДИВИДУАЛЬНОГО'):
                zone = 'main'
            if in_tbl:
                r = 'table-cell'
            elif zone == 'title':
                r = 'title'
            elif st in ('Heading1', 'Heading2', 'Heading3', 'TocTitle'):
                r = 'heading:' + st
                if 'ЛИТЕРАТУРА' in t: zone = 'lit'
                elif 'ПРИЛОЖЕНИЕ' in t: zone = 'main'
            elif st.startswith('TOC'):
                r = 'toc'
            elif p.find(f'{q("pPr")}/{q("numPr")}') is not None:
                r = 'list'
            elif zone == 'lit':
                r = 'source'
            else:
                r = 'body'
            roles[p] = r
        return roles

    def body_paras(self, need=None):
        out = []
        for p, r in self.roles.items():
            if r != 'body': continue
            t = self.text(p)
            if t.startswith('Приложение'): continue  # приложение не трогаем
            if need and not need(p, t): continue
            out.append(p)
        return out

    def headings(self, with_break=True):
        out = []
        for p, r in self.roles.items():
            if r in ('heading:Heading1', 'heading:Heading2'):
                has = p.find(f'{q("pPr")}/{q("pageBreakBefore")}') is not None
                if has == with_break: out.append(p)
        return out

    # ---------- низкоуровневые правки
    @staticmethod
    def ppr(p):
        x = p.find(q('pPr'))
        if x is None:
            x = etree.SubElement(p, q('pPr')); p.remove(x); p.insert(0, x)
        return x

    ORDER = ['pStyle', 'keepNext', 'keepLines', 'pageBreakBefore', 'numPr', 'spacing', 'ind', 'jc', 'rPr']
    def set_ppr_child(self, p, tag, attrs):
        ppr = self.ppr(p)
        el = ppr.find(q(tag))
        if el is None:
            el = etree.Element(q(tag))
            idx = self.ORDER.index(tag)
            pos = 0
            for i, ch in enumerate(ppr):
                name = etree.QName(ch).localname
                if name in self.ORDER and self.ORDER.index(name) < idx: pos = i + 1
            ppr.insert(pos, el)
        for k, v in attrs.items(): el.set(q(k), v)
        return el

    def set_runs(self, p, tag, attrs):
        for r in p.findall(q('r')):
            rpr = r.find(q('rPr'))
            if rpr is None:
                rpr = etree.Element(q('rPr')); r.insert(0, rpr)
            el = rpr.find(q(tag))
            if el is None:
                el = etree.SubElement(rpr, q(tag))
            for k, v in attrs.items(): el.set(q(k), v)

    @staticmethod
    def new_empty(text=None):
        p = etree.Element(q('p'))
        if text is not None:
            r = etree.SubElement(p, q('r')); t = etree.SubElement(r, q('t'))
            t.text = text; t.set('{http://www.w3.org/XML/1998/namespace}space', 'preserve')
        return p

    def mark(self, rule, el, note, severity='error'):
        self.truth.append((rule, el, note, severity))

    # ---------- сохранение
    def save(self, path):
        files = dict(BASE_FILES)
        files['word/document.xml'] = etree.tostring(self.doc, xml_declaration=True, encoding='UTF-8', standalone=True)
        files['word/styles.xml'] = etree.tostring(self.sty, xml_declaration=True, encoding='UTF-8', standalone=True)
        with zipfile.ZipFile(path, 'w', zipfile.ZIP_DEFLATED) as z:
            for n, d in files.items(): z.writestr(n, d)
        index = {p: i + 1 for i, p in enumerate(self.paras())}  # нумерация как на сайте: все абзацы, с 1
        rows = []
        for rule, el, note, sev in self.truth:
            rows.append((rule, index[el] if el is not None else '', note, sev))
        return rows


# ================= МУТАЦИИ: ошибки =================
def neighbours_ok(d, p):
    """следующий абзац — тоже обычный текст (чтобы пустой абзац был одиночным «между абзацами»)."""
    nxt = p.getnext()
    return nxt is not None and nxt.tag == q('p') and d.roles.get(nxt) == 'body'

def m_single_empty(d, rng):
    cands = [p for p in d.body_paras() if neighbours_ok(d, p)]
    k = rng.randint(1, 3)
    for p in rng.sample(cands, min(k, len(cands))):
        if p.getnext() is not None and d.text(p.getnext()) == '' : continue
        e = d.new_empty(); p.addnext(e)
        d.mark('PR-06', e, 'одиночный пустой абзац между абзацами')
    return 'single_empty'

def m_spaces_only_empty(d, rng):
    p = rng.choice([p for p in d.body_paras() if neighbours_ok(d, p)])
    e = d.new_empty('    '); p.addnext(e)
    d.mark('PR-06', e, 'абзац из одних пробелов = пустой')
    return 'spaces_only_empty'

def m_fake_page_break(d, rng):
    hs = [h for h in d.headings(True) if d.roles.get(h.getprevious()) in ('body', 'list', 'source')]
    h = rng.choice(hs)
    pbb = h.find(f'{q("pPr")}/{q("pageBreakBefore")}'); pbb.getparent().remove(pbb)
    n = rng.randint(3, 12)
    first = None
    for _ in range(n):
        e = d.new_empty(); h.addprevious(e); first = first if first is not None else e
    d.mark('PB-01', h, f'нет разрыва, вместо него {n} пустых абзацев')
    d.mark('PR-10', first, f'серия из {n} пустых абзацев перед заголовком')
    return f'fake_page_break({d.text(h)[:12]},{n})'

def m_missing_break(d, rng):
    h = rng.choice(d.headings(True))
    pbb = h.find(f'{q("pPr")}/{q("pageBreakBefore")}'); pbb.getparent().remove(pbb)
    d.mark('PB-01', h, 'нет разрыва страницы перед частью')
    return f'missing_break({d.text(h)[:12]})'

def m_margin_left(d, rng):
    v = rng.choice(['850', '1134'])  # 15 или 20 мм
    d.body.find(f'{q("sectPr")}/{q("pgMar")}').set(q('left'), v)
    d.mark('PG-02', None, f'левое поле {round(int(v)/56.7)} мм')
    return 'margin_left'

def m_margin_right(d, rng):
    d.body.find(f'{q("sectPr")}/{q("pgMar")}').set(q('right'), '1134')  # 20 мм
    d.mark('PG-03', None, 'правое поле 20 мм')
    return 'margin_right'

def m_indent(d, rng):
    ps = rng.sample(d.body_paras(), rng.randint(1, 3))
    for p in ps:
        v = rng.choice(['0', '360'])
        d.set_ppr_child(p, 'ind', {'firstLine': v})
        d.mark('PR-03', p, f'красная строка {0 if v == "0" else 0.63} см')
    return 'indent'

def m_spaces_indent(d, rng):
    p = rng.choice(d.body_paras())
    t = p.find(f'.//{q("t")}'); t.text = '     ' + t.text
    t.set('{http://www.w3.org/XML/1998/namespace}space', 'preserve')
    d.mark('PR-05', p, 'отступ пробелами в начале абзаца')
    return 'spaces_indent'

def m_right_indent(d, rng):
    for p in rng.sample(d.body_paras(), rng.randint(1, 4)):
        d.set_ppr_child(p, 'ind', {'right': '284'})
        d.mark('PR-09', p, 'правый отступ 0,5 см')
    return 'right_indent'

def m_spacing_after(d, rng):
    for p in rng.sample(d.body_paras(), rng.randint(1, 3)):
        d.set_ppr_child(p, 'spacing', {'after': '200'})
        d.mark('PR-02', p, 'интервал после 10 pt')
    return 'spacing_after'

def m_line_single(d, rng):
    pool = d.body_paras() + [p for p, r in d.roles.items() if r == 'list']
    for p in rng.sample(pool, rng.randint(1, 3)):
        d.set_ppr_child(p, 'spacing', {'line': '240', 'lineRule': 'auto'})
        d.mark('PR-01', p, 'одинарный интервал')
    return 'line_single'

def m_font_family(d, rng):
    p = rng.choice(d.body_paras())
    d.set_runs(p, 'rFonts', {'ascii': 'Arial', 'hAnsi': 'Arial', 'cs': 'Arial', 'eastAsia': 'Arial'})
    d.mark('FT-01', p, 'шрифт Arial')
    d.mark('FT-03', p, 'посторонний шрифт Arial (то же нарушение, второе правило)', 'warning')
    return 'font_family'

def m_font_size(d, rng):
    p = rng.choice(d.body_paras())
    d.set_runs(p, 'sz', {'val': '28'}); d.set_runs(p, 'szCs', {'val': '28'})
    d.mark('FT-02', p, 'размер 14 pt в основном тексте')
    return 'font_size'

def m_align(d, rng):
    p = rng.choice(d.body_paras(lambda p, t: len(t) > 200))
    d.set_ppr_child(p, 'jc', {'val': 'left'})
    d.mark('PR-04', p, 'выравнивание по левому краю')
    return 'align'

def m_hyphen_dash(d, rng):
    cands = d.body_paras(lambda p, t: ' — ' in t)
    p = rng.choice(cands)
    for t in p.iter(q('t')):
        if ' — ' in (t.text or ''):
            t.text = t.text.replace(' — ', ' - ', 1); break
    d.mark('TY-03', p, 'дефис вместо тире', 'warning')
    return 'hyphen_dash'

def m_space_before_comma(d, rng):
    cands = d.body_paras(lambda p, t: re.search(r'[а-яё], [а-яё]', t) is not None)
    p = rng.choice(cands)
    for t in p.iter(q('t')):
        s = t.text or ''
        m = re.search(r'([а-яё]), ([а-яё])', s)
        if m:
            t.text = s[:m.start()] + m.group(1) + ' , ' + m.group(2) + s[m.end():]; break
    d.mark('TY-02', p, 'пробел перед запятой', 'warning')
    return 'space_before_comma'

def m_passport_spacing(d, rng):
    tbl = d.body.find(q('tbl'))
    row = rng.choice(tbl.findall(q('tr'))[1:])
    for p in row.iter(q('p')):
        d.set_ppr_child(p, 'spacing', {'line': '360', 'lineRule': 'auto'})
        d.mark('PR-08', p, 'в таблице паспорта интервал 1,5')
    return 'passport_spacing'

def m_title_empties(d, rng):
    title = [p for p, r in d.roles.items() if r == 'title']
    p = rng.choice(title[3:-3])
    n = rng.randint(2, 5); first = None
    for _ in range(n):
        e = d.new_empty(); p.addnext(e); first = e  # addnext вставляет сразу после p → последний = первый в серии
    d.mark('PR-10', first, f'{n} пустых на титульном листе (только замечание)', 'warning')
    return 'title_empties'

ERRORS = [m_single_empty, m_spaces_only_empty, m_fake_page_break, m_missing_break, m_margin_left,
          m_margin_right, m_indent, m_spaces_indent, m_right_indent, m_spacing_after, m_line_single,
          m_font_family, m_font_size, m_align, m_hyphen_dash, m_space_before_comma, m_passport_spacing,
          m_title_empties]


# ================= ЛОВУШКИ: правильно, но похоже на ошибку =================
def t_hard_break(d, rng):
    hs = [h for h in d.headings(True) if d.roles.get(h.getprevious()) in ('body', 'source')]
    h = rng.choice(hs)
    pbb = h.find(f'{q("pPr")}/{q("pageBreakBefore")}'); pbb.getparent().remove(pbb)
    prev = h.getprevious()
    r = etree.SubElement(prev, q('r')); br = etree.SubElement(r, q('br')); br.set(q('type'), 'page')
    d.mark('PB-01', h, 'TRAP: разрыв символом в конце предыдущего абзаца — это правильно', 'pass')
    return f'trap_hard_break({d.text(h)[:12]})'

def t_indent_127(d, rng):
    for p in rng.sample(d.body_paras(), 3):
        d.set_ppr_child(p, 'ind', {'firstLine': '720'})
        d.mark('PR-03', p, 'TRAP: 1,27 см входит в допуск ±0,1', 'pass')
    return 'trap_indent_127'

def t_margin_right_10(d, rng):
    d.body.find(f'{q("sectPr")}/{q("pgMar")}').set(q('right'), '567')
    d.mark('PG-03', None, 'TRAP: правое поле 10 мм разрешено (oneOf 10/15)', 'pass')
    return 'trap_margin_right_10'

def t_style_inheritance(d, rng):
    """Normal испорчен (1,0, влево, без отступа), но весь текст в стиле BodyText, который это исправляет."""
    st = {s.get(q('styleId')): s for s in d.sty.findall(q('style'))}
    n = st['Normal'].find(q('pPr'))
    n.find(q('spacing')).set(q('line'), '240')
    n.find(q('ind')).set(q('firstLine'), '0')
    n.find(q('jc')).set(q('val'), 'left')
    body = etree.fromstring(
        f'<w:style xmlns:w="{W}" w:type="paragraph" w:styleId="BodyText"><w:name w:val="Body Text"/>'
        '<w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:line="360" w:lineRule="auto"/>'
        '<w:ind w:firstLine="709"/><w:jc w:val="both"/></w:pPr></w:style>')
    d.sty.append(body)
    lp = st['ListParagraph'].find(q('pPr'))
    etree.SubElement(lp, q('spacing')).set(q('line'), '360')
    lp.find(q('spacing')).set(q('lineRule'), 'auto')
    for p in d.body_paras() + [p for p, r in d.roles.items() if r == 'body' and d.text(p).startswith('Приложение')]:
        ppr = d.ppr(p)
        s = etree.Element(q('pStyle')); s.set(q('val'), 'BodyText'); ppr.insert(0, s)
    # TOC и литература тоже унаследуют 1,0 — для них PR-01 не действует, это нормально.
    d.mark('PR-01', None, 'TRAP: наследование BodyText→Normal, интервал фактически 1,5', 'pass')
    d.mark('PR-03', None, 'TRAP: наследование, отступ фактически 1,25', 'pass')
    d.mark('PR-04', None, 'TRAP: наследование, фактически по ширине', 'pass')
    return 'trap_style_inheritance'

def t_docdefaults(d, rng):
    pd = d.sty.find(f'{q("docDefaults")}/{q("pPrDefault")}/{q("pPr")}/{q("spacing")}')
    pd.set(q('after'), '200')
    d.mark('PR-02', None, 'TRAP: в docDefaults после 10 pt, но Normal задаёт 0', 'pass')
    return 'trap_docdefaults'

def t_compound_hyphen(d, rng):
    p = rng.choice(d.body_paras())
    t = list(p.iter(q('t')))[-1]
    t.text = t.text.rstrip('.') + ', а также научно-популярные и кое-какие интернет-источники.'
    d.mark('TY-03', p, 'TRAP: дефис в сложных словах — правильно', 'pass')
    return 'trap_compound_hyphen'

TRAPS = [t_hard_break, t_indent_127, t_margin_right_10, t_style_inheritance, t_docdefaults, t_compound_hyphen]
# Конфликты: какие мутации нельзя сочетать в одном файле
CONFLICT = {
    't_style_inheritance': {'m_indent', 'm_line_single', 'm_align', 't_indent_127'},
    'm_margin_right': {'t_margin_right_10'},
    't_hard_break': {'m_fake_page_break', 'm_missing_break'},
    'm_fake_page_break': {'m_missing_break'},
}

def conflicts(a, b):
    return b in CONFLICT.get(a, set()) or a in CONFLICT.get(b, set())


def main():
    rng = random.Random(SEED)
    os.makedirs(f'{OUT}/docs', exist_ok=True)
    truth, manifest = [], {}
    plans = [('00-clean', [])]
    # каждая ошибка и каждая ловушка хотя бы раз отдельно — чтобы понять, что именно ломается
    for f in ERRORS + TRAPS: plans.append((f'{len(plans):02d}-{f.__name__[2:]}', [f]))
    while len(plans) < N:
        k = rng.randint(3, 6)
        chosen = []
        for f in rng.sample(ERRORS, len(ERRORS)) + rng.sample(TRAPS, len(TRAPS)):
            if len(chosen) >= k: break
            if any(conflicts(f.__name__, c.__name__) for c in chosen): continue
            chosen.append(f)
        # минимум одна ловушка
        if not any(c in TRAPS for c in chosen):
            for t in rng.sample(TRAPS, len(TRAPS)):
                if not any(conflicts(t.__name__, c.__name__) for c in chosen): chosen.append(t); break
        plans.append((f'{len(plans):02d}-mix', chosen))
    for name, muts in plans:
        d = Doc()
        r = random.Random(f'{SEED}-{name}')
        # ловушка наследования меняет стили → делаем её первой; ошибки потом
        muts = sorted(muts, key=lambda f: 0 if f is t_style_inheritance else 1)
        applied = [f(d, r) for f in muts]
        rows = d.save(f'{OUT}/docs/{name}.docx')
        manifest[name] = applied
        for rule, para, note, sev in rows:
            truth.append({'file': f'{name}.docx', 'rule': rule, 'paragraph': para,
                          'expected': 'pass' if sev == 'pass' else 'finding',
                          'severity': '' if sev == 'pass' else sev, 'note': note})
    with open(f'{OUT}/truth.csv', 'w', newline='', encoding='utf-8') as f:
        w = csv.DictWriter(f, fieldnames=['file', 'rule', 'paragraph', 'expected', 'severity', 'note'])
        w.writeheader(); w.writerows(truth)
    json.dump(manifest, open(f'{OUT}/manifest.json', 'w'), ensure_ascii=False, indent=1)
    print(len(plans), 'files,', len(truth), 'truth rows')

main()
