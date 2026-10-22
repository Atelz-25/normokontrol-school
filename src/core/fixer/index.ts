// Автоисправление (бриф, раздел 11; RULES-SCHOOL, раздел 5). Только безопасные правила:
// поля, шрифт, интервалы, отступы, пустые абзацы, разрывы перед частями, простая типографика.
// Структуру, текст, источники и рисунки не трогаем.
//
// Как это устроено:
//   1. проверяем файл как обычно и берём замечания выбранных правил;
//   2. разбираем word/document.xml в DOM и находим те же абзацы в том же порядке, что и читатель;
//   3. правим только нужные элементы, всё остальное в архиве остаётся байт в байт;
//   4. собираем новый .docx. Исходные байты не меняются.
import { DOMParser, XMLSerializer, type Element as XmlElement } from '@xmldom/xmldom';
import { strToU8, zipSync } from 'fflate';
import { checkModel } from '../engine/index.ts';
import type { DocModel } from '../model/types.ts';
import type { Profile } from '../profiles/types.ts';
import { DEFAULT_LIMITS, readAllEntries, type ArchiveLimits } from '../reader/archive.ts';
import { DocxError } from '../reader/errors.ts';
import { readDocx } from '../reader/index.ts';
import { emptySeries } from '../rules/empty.ts';
import { numberSpec, strings, type NumberSpec } from '../rules/params.ts';
import { NS, children, isElement } from '../xml.ts';
import { FIXABLE } from './fixable.ts';
import { ensureChild, ensureFirst, removeAttr, setAttr, wElements } from './ooxml.ts';

export { FIXABLE } from './fixable.ts';

export interface FixResult {
  bytes: Uint8Array;
  applied: Record<string, number>; // сколько мест исправлено по каждому правилу
  notes: string[]; // коды пояснений для интерфейса
}

// Те же абзацы и в том же порядке, что обходит читатель (src/core/reader/document.ts).
function collectParagraphs(container: XmlElement, out: XmlElement[]): void {
  for (const el of children(container)) {
    if (el.namespaceURI === NS.mc && el.localName === 'AlternateContent') {
      const choice = children(el, NS.mc, 'Choice')[0] ?? children(el, NS.mc, 'Fallback')[0];
      if (choice) collectParagraphs(choice, out);
      continue;
    }
    if (el.namespaceURI !== NS.w) continue;
    if (el.localName === 'p') out.push(el);
    else if (el.localName === 'tbl')
      for (const tr of children(el, NS.w, 'tr'))
        for (const tc of children(tr, NS.w, 'tc')) collectParagraphs(tc, out);
    else if (el.localName === 'sdt') collectParagraphs(wElements(el, 'sdtContent')[0] ?? el, out);
    else if (['customXml', 'ins', 'moveTo'].includes(el.localName ?? ''))
      collectParagraphs(el, out);
  }
}

// Число, к которому приводим: для «equals» — само значение, для «oneOf» — первое из списка.
const target = (spec: NumberSpec): number =>
  spec.mode === 'oneOf' ? (spec.values[0] ?? 0) : spec.value;

// Текстовые узлы абзаца (без надписей внутри рисунков) — для замен в типографике.
function textNodes(p: XmlElement): XmlElement[] {
  return Array.from(p.getElementsByTagNameNS(NS.w, 't')).filter((t) => {
    for (let node = t.parentNode; node && node !== p; node = node.parentNode)
      if (isElement(node) && node.localName === 'txbxContent') return false;
    return true;
  });
}

function replaceInText(p: XmlElement, pattern: RegExp, replacement: string): number {
  let count = 0;
  for (const t of textNodes(p)) {
    const before = t.textContent ?? '';
    const after = before.replace(pattern, replacement);
    if (after !== before) {
      count += 1;
      t.textContent = after;
      t.setAttribute('xml:space', 'preserve');
    }
  }
  return count;
}

// Прогоны абзаца: прямые и внутри ссылок, вставок, полей.
const runsOf = (p: XmlElement): XmlElement[] =>
  Array.from(p.getElementsByTagNameNS(NS.w, 'r')).filter((r) => r.parentNode !== null);

export function fixDocx(
  bytes: Uint8Array,
  profile: Profile,
  ruleIds: string[],
  limits: ArchiveLimits = DEFAULT_LIMITS,
): FixResult {
  const model: DocModel = readDocx(bytes, limits);
  const report = checkModel(model, profile);
  const selected = new Set(ruleIds.filter((id) => FIXABLE.includes(id)));
  const params = (id: string): Record<string, unknown> => profile.rules[id]?.params ?? {};
  // Правило выбрано и в отчёте есть замечания (для полей и листа — без номеров абзацев).
  const failed = (id: string): boolean =>
    selected.has(id) && report.results.some((r) => r.ruleId === id && r.status === 'fail');
  const findings = (id: string): number[] => {
    const result = report.results.find((r) => r.ruleId === id);
    if (!selected.has(id) || result?.status !== 'fail') return [];
    return [
      ...new Set(
        result.findings
          .map((f) => f.location.paragraphIndex)
          .filter((i): i is number => i !== undefined),
      ),
    ];
  };

  const entries = readAllEntries(bytes, limits);
  const xml = entries['word/document.xml'];
  if (!xml) throw new DocxError('no-document');
  const doc = new DOMParser().parseFromString(new TextDecoder().decode(xml), 'text/xml');
  const body = Array.from(doc.getElementsByTagNameNS(NS.w, 'body'))[0];
  if (!body) throw new DocxError('broken', 'body');
  const paragraphs: XmlElement[] = [];
  collectParagraphs(body, paragraphs);
  // Если абзацы в XML и в модели не совпали, лучше ничего не трогать.
  if (paragraphs.length !== model.paragraphs.length)
    throw new DocxError('broken', 'paragraph-mismatch');
  const at = (index: number): XmlElement | undefined => paragraphs[index - 1];

  const applied: Record<string, number> = {};
  const count = (id: string, n = 1): void => {
    applied[id] = (applied[id] ?? 0) + n;
  };
  const notes: string[] = [];

  // --- Страница: размер и поля во всех разделах ---
  const sections = Array.from(body.getElementsByTagNameNS(NS.w, 'sectPr')).filter(
    (s) => s.parentNode?.localName !== 'sectPrChange',
  );
  const marginRules: [string, string][] = [
    ['PG-02', 'left'],
    ['PG-03', 'right'],
    ['PG-04', 'top'],
    ['PG-05', 'bottom'],
  ];
  for (const [id, side] of marginRules) {
    if (!failed(id)) continue;
    const twips = String(
      Math.round(
        target(numberSpec(params(id), 'Mm', { mode: 'equals', value: 20, tolerance: 1 })) * 56.7,
      ),
    );
    for (const sectPr of sections) setAttr(ensureChild(sectPr, 'pgMar'), side, twips);
    count(id, sections.length);
  }
  if (failed('PG-01')) {
    for (const sectPr of sections) {
      const size = ensureChild(sectPr, 'pgSz');
      setAttr(size, 'w', '11906');
      setAttr(size, 'h', '16838');
      removeAttr(size, 'orient');
    }
    count('PG-01', sections.length);
  }

  // --- Шрифт ---
  for (const index of findings('FT-01')) {
    const font = strings(params('FT-01'), 'values', ['Times New Roman'])[0] ?? 'Times New Roman';
    for (const r of runsOf(at(index) ?? body)) {
      const fonts = ensureChild(ensureFirst(r, 'rPr'), 'rFonts');
      for (const name of ['asciiTheme', 'hAnsiTheme', 'cstheme']) removeAttr(fonts, name);
      for (const name of ['ascii', 'hAnsi', 'cs']) setAttr(fonts, name, font);
    }
    count('FT-01');
  }
  for (const index of findings('FT-02')) {
    const halfPoints = String(
      Math.round(
        target(numberSpec(params('FT-02'), 'Pt', { mode: 'equals', value: 14, tolerance: 0 })) * 2,
      ),
    );
    for (const r of runsOf(at(index) ?? body)) {
      const rPr = ensureFirst(r, 'rPr');
      setAttr(ensureChild(rPr, 'sz'), 'val', halfPoints);
      setAttr(ensureChild(rPr, 'szCs'), 'val', halfPoints);
    }
    count('FT-02');
  }
  for (const index of findings('FT-04')) {
    for (const r of runsOf(at(index) ?? body)) {
      if (r.parentNode?.localName === 'hyperlink') continue; // цвет ссылок оставляем
      const color = ensureChild(ensureFirst(r, 'rPr'), 'color');
      setAttr(color, 'val', 'auto');
      for (const name of ['themeColor', 'themeShade', 'themeTint']) removeAttr(color, name);
    }
    count('FT-04');
  }

  // --- Абзац ---
  const pPrOf = (index: number): XmlElement | undefined => {
    const p = at(index);
    return p ? ensureFirst(p, 'pPr') : undefined;
  };
  for (const index of findings('PR-01')) {
    const spacing = ensureChild(pPrOf(index) ?? body, 'spacing');
    setAttr(
      spacing,
      'line',
      String(
        Math.round(
          target(numberSpec(params('PR-01'), '', { mode: 'equals', value: 1.5, tolerance: 0 })) *
            240,
        ),
      ),
    );
    setAttr(spacing, 'lineRule', 'auto');
    count('PR-01');
  }
  for (const index of findings('PR-02')) {
    const twips = String(
      Math.round(
        target(numberSpec(params('PR-02'), 'Pt', { mode: 'equals', value: 0, tolerance: 0 })) * 20,
      ),
    );
    const spacing = ensureChild(pPrOf(index) ?? body, 'spacing');
    setAttr(spacing, 'before', twips);
    setAttr(spacing, 'after', twips);
    for (const name of ['beforeAutospacing', 'afterAutospacing', 'beforeLines', 'afterLines'])
      removeAttr(spacing, name);
    count('PR-02');
  }
  for (const index of findings('PR-03')) {
    const ind = ensureChild(pPrOf(index) ?? body, 'ind');
    setAttr(
      ind,
      'firstLine',
      String(
        Math.round(
          target(numberSpec(params('PR-03'), 'Cm', { mode: 'equals', value: 1.25, tolerance: 0 })) *
            567,
        ),
      ),
    );
    for (const name of ['hanging', 'firstLineChars', 'hangingChars']) removeAttr(ind, name);
    count('PR-03');
  }
  for (const index of findings('PR-04')) {
    const align =
      typeof params('PR-04').align === 'string' ? String(params('PR-04').align) : 'both';
    setAttr(ensureChild(pPrOf(index) ?? body, 'jc'), 'val', align);
    count('PR-04');
  }
  for (const index of findings('PR-09')) {
    const ind = ensureChild(pPrOf(index) ?? body, 'ind');
    setAttr(
      ind,
      'right',
      String(
        Math.round(
          target(numberSpec(params('PR-09'), 'Cm', { mode: 'equals', value: 0, tolerance: 0 })) *
            567,
        ),
      ),
    );
    for (const name of ['end', 'rightChars', 'endChars']) removeAttr(ind, name);
    count('PR-09');
  }
  // PR-05: убираем пробелы и табуляции в начале абзаца.
  for (const index of findings('PR-05')) {
    const p = at(index);
    if (!p) continue;
    for (const r of runsOf(p)) {
      let reachedText = false;
      for (const node of wElements(r)) {
        if (node.localName === 'tab') r.removeChild(node);
        else if (node.localName === 't') {
          const text = (node.textContent ?? '').replace(/^[ \u00a0\t]+/, '');
          node.textContent = text;
          if (text !== '') {
            reachedText = true;
            break;
          }
        }
      }
      if (reachedText) break;
    }
    count('PR-05');
  }

  // --- Типографика: замены внутри одного текстового узла ---
  const typography: [string, RegExp, string][] = [
    ['TY-01', /(?<=\S) {2,}(?=\S)/g, ' '],
    ['TY-03', /(?<=\S)([ \u00a0])-([ \u00a0])(?=\S)/g, '$1–$2'],
    ['TY-05', /([(«[]) +| +([)»\]])/g, '$1$2'],
    ['TY-09', /(?<![\p{L}\d.-])(\d+)-(\d+)(?![\d-])/gu, '$1–$2'],
  ];
  for (const [id, pattern, replacement] of typography) {
    for (const index of findings(id)) {
      const p = at(index);
      if (p && replaceInText(p, pattern, replacement) > 0) count(id);
    }
  }
  // TY-02: убираем только лишний пробел перед знаком; добавить пробел «после» надёжно нельзя.
  for (const index of findings('TY-02')) {
    const p = at(index);
    const source = model.paragraphs[index - 1]?.role === 'source-item';
    const beforeMark = source ? /(?<=\S) +(?=[,!?])/g : /(?<=\S) +(?=[,;:!?])/g;
    // Пробел перед точкой в конце фразы (но не в « .docx»: там за точкой идут буквы).
    const beforeDot = /(?<=[\p{L}\d]) +(?=\.(?![\p{L}\d.]))/gu;
    if (p && replaceInText(p, beforeMark, '') + replaceInText(p, beforeDot, '') > 0) count('TY-02');
  }
  // TY-06: пробелы по краям абзаца (отступ из двух пробелов или Tab сюда не попадает, его убирает PR-05).
  for (const index of findings('TY-06')) {
    const nodes = at(index) ? textNodes(at(index) as XmlElement) : [];
    const first = nodes[0];
    const last = nodes.at(-1);
    if (first) first.textContent = (first.textContent ?? '').replace(/^[ \t]+/, '');
    if (last) last.textContent = (last.textContent ?? '').replace(/[ \t]+$/, '');
    count('TY-06');
  }

  // --- Разрывы страниц перед частями ---
  for (const index of findings('PB-01')) {
    ensureChild(pPrOf(index) ?? body, 'pageBreakBefore');
    count('PB-01');
  }

  // --- Пустые абзацы: удаляем последними, когда все ссылки на элементы уже использованы ---
  // Не трогаем титульный лист (RULES-SCHOOL, раздел 5) и самый последний абзац документа.
  const toDelete = new Set<number>(findings('PR-06'));
  const seriesStarts = new Set(findings('PR-10'));
  for (const run of emptySeries(model))
    if (seriesStarts.has(run[0]?.index ?? -1)) for (const p of run) toDelete.add(p.index);
  let numberedDeleted = 0;
  for (const index of toDelete) {
    const paragraph = model.paragraphs[index - 1];
    if (!paragraph || paragraph.zone === 'title-page' || index === model.paragraphs.length)
      continue;
    const el = at(index);
    if (!el?.parentNode) continue;
    el.parentNode.removeChild(el);
    if (paragraph.list) numberedDeleted += 1;
    count(findings('PR-06').includes(index) ? 'PR-06' : 'PR-10');
  }
  if (numberedDeleted > 0) notes.push('numbered-empties');

  // --- Сборка нового файла ---
  const updated = {
    ...entries,
    'word/document.xml': strToU8(new XMLSerializer().serializeToString(doc)),
  };
  const out = zipSync(
    Object.fromEntries(
      Object.entries(updated).map(([name, data]) => [
        name,
        /\.(xml|rels)$/.test(name) ? data : ([data, { level: 0 }] as [Uint8Array, { level: 0 }]),
      ]),
    ),
  );
  return { bytes: out, applied, notes };
}
