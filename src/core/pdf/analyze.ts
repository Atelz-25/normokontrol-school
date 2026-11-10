// Проверка PDF по уже извлечённым данным: страницы, кусочки текста с координатами, шрифты.
// Извлекает их интерфейс (src/ui/pdf-reader.ts, библиотека pdf.js); здесь только расчёты,
// поэтому файл работает и в браузере, и в Node (тесты).
//
// Что можно узнать из PDF точно: число и размер страниц, шрифты и их размер, встроены ли
// шрифты. По краю текста — примерно: поля, номера страниц, начало частей (эвристики).
// Красную строку, пустые абзацы и стили по PDF не узнать: это видно только в .docx.
import type { Profile, Severity } from '../profiles/types.ts';
import { pdfMessages as T, type PdfCheckId } from '../../i18n/pdf-ru.ts';

export const PT_PER_MM = 72 / 25.4; // в PDF размеры в пунктах: 1 pt = 1/72 дюйма

export interface PdfTextItem {
  text: string;
  x: number; // левый край, pt от левого края страницы
  top: number; // верх строки, pt от верхнего края страницы
  width: number;
  size: number; // размер шрифта, pt
}

export interface PdfPage {
  width: number;
  height: number;
  items: PdfTextItem[];
}

export interface PdfFont {
  id: string;
  name: string; // имя шрифта, например «ABCDEF+TimesNewRomanPSMT»
  embedded: boolean;
}

export interface PdfDocument {
  pages: PdfPage[];
  fonts: PdfFont[];
}

export interface PdfCheck {
  id: PdfCheckId;
  status: 'pass' | 'fail' | 'not-applicable';
  severity: Severity;
  heuristic: boolean;
  message: string;
  note?: string;
}

export interface PdfReport {
  pages: number;
  checks: PdfCheck[];
}

// --- помощники ------------------------------------------------------------------------

const visible = (item: PdfTextItem): boolean => item.text.trim() !== '';
const isNumber = (item: PdfTextItem): boolean =>
  /^\s*[-–—]?\s*\d{1,3}\s*[-–—]?\s*$/.test(item.text);

// «ABCDEF+TimesNewRomanPSMT» → «timesnewroman»: без приписки подмножества, начертания и пробелов.
export function fontFamily(name: string): string {
  return name
    .replace(/^[A-Z]{6}\+/, '')
    .replace(/[-,](bold|italic|oblique|regular|roman).*$/i, '')
    .replace(/(PSMT|PS|MT)$/i, '')
    .replace(/[\s_-]/g, '')
    .toLowerCase();
}

// Шрифты-значки (формулы, маркеры списков) — не «другая гарнитура».
const SYMBOL_FONTS = ['symbol', 'wingdings', 'cambriamath', 'mtextra', 'zapfdingbats'];

const median = (values: number[]): number | undefined => {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
};

// Самое частое значение с весом по числу букв.
function mostCommon<K>(items: PdfTextItem[], key: (item: PdfTextItem) => K): K | undefined {
  const weight = new Map<K, number>();
  for (const item of items) weight.set(key(item), (weight.get(key(item)) ?? 0) + item.text.length);
  let best: K | undefined;
  let max = -1;
  for (const [k, w] of weight) if (w > max) [best, max] = [k, w];
  return best;
}

// Номер страницы: короткое число внизу или вверху страницы.
function pageNumber(page: PdfPage): PdfTextItem | undefined {
  return page.items.find(
    (item) => isNumber(item) && (item.top > page.height * 0.88 || item.top < page.height * 0.1),
  );
}

// Параметр правила из требований; у выключенного правила параметров как будто нет.
function param(profile: Profile, rule: string, name: string): unknown {
  const config = profile.rules[rule];
  return config?.enabled ? config.params[name] : undefined;
}
const num = (value: unknown): number | undefined => (typeof value === 'number' ? value : undefined);
const severityOf = (profile: Profile, rule: string, fallback: Severity): Severity =>
  profile.rules[rule]?.severity ?? fallback;

// --- проверка ----------------------------------------------------------------------

export function checkPdf(doc: PdfDocument, profile: Profile): PdfReport {
  const checks: PdfCheck[] = [];
  const add = (check: PdfCheck): void => {
    checks.push(check);
  };
  const allItems = doc.pages.flatMap((p) => p.items.filter(visible));
  const chars = allItems.reduce((sum, item) => sum + item.text.trim().length, 0);

  // PDF-00: скан без текста проверить нельзя — остальные проверки не имеют смысла.
  const scan = chars < 50 * Math.max(1, doc.pages.length);
  add({
    id: 'PDF-00',
    status: scan ? 'fail' : 'pass',
    severity: 'error',
    heuristic: false,
    message: scan ? T.scan : T.hasText(chars),
  });

  // PDF-01: A4 книжная (по размеру страницы — точно).
  const toleranceMm = num(param(profile, 'PG-01', 'toleranceMm')) ?? 1;
  const isA4 = (p: PdfPage): boolean =>
    Math.abs(p.width / PT_PER_MM - 210) <= toleranceMm + 0.5 &&
    Math.abs(p.height / PT_PER_MM - 297) <= toleranceMm + 0.5;
  const wrong = doc.pages.map((p, i) => (isA4(p) ? 0 : i + 1)).filter((n) => n > 0);
  add({
    id: 'PDF-01',
    status: wrong.length ? 'fail' : 'pass',
    severity: severityOf(profile, 'PG-01', 'error'),
    heuristic: false,
    message: wrong.length ? T.formatBad(wrong) : T.formatOk,
  });

  // PDF-02: объём — настоящие страницы, а не оценка по знакам, как в .docx.
  const minPages = num(param(profile, 'VL-01', 'minPages'));
  add(
    minPages === undefined
      ? {
          id: 'PDF-02',
          status: 'pass',
          severity: 'info',
          heuristic: false,
          message: T.volumeOk(doc.pages.length),
        }
      : {
          id: 'PDF-02',
          status: doc.pages.length < minPages ? 'fail' : 'pass',
          severity: severityOf(profile, 'VL-01', 'warning'),
          heuristic: false,
          message:
            doc.pages.length < minPages
              ? T.volume(doc.pages.length, minPages)
              : T.volumeOk(doc.pages.length),
        },
  );

  if (scan) {
    for (const id of ['PDF-03', 'PDF-04', 'PDF-05', 'PDF-06', 'PDF-07', 'PDF-08'] as const)
      add({ id, status: 'not-applicable', severity: 'info', heuristic: false, message: T.scan });
    return { pages: doc.pages.length, checks };
  }

  // PDF-03: встроены ли шрифты. Имена берём из словарей шрифтов файла (fonts.ts).
  const shortName = (f: PdfFont): string => f.name.replace(/^[A-Z]{6}\+/, '');
  const missing = [...new Set(doc.fonts.filter((f) => !f.embedded).map(shortName))];
  add({
    id: 'PDF-03',
    status: missing.length ? 'fail' : 'pass',
    severity: 'warning',
    heuristic: false,
    message: missing.length ? T.notEmbedded(missing) : T.embeddedOk,
  });

  // PDF-04: гарнитуры. pdf.js не говорит, каким шрифтом набрана каждая буква, поэтому
  // смотрим на список гарнитур в файле: нужная должна быть, лишние называем (эвристика).
  const allowed = param(profile, 'FT-01', 'values');
  const families = new Map<string, string>(); // нормализованное имя → как показать
  for (const f of doc.fonts) {
    const family = fontFamily(shortName(f));
    if (!SYMBOL_FONTS.includes(family) && !families.has(family))
      families.set(
        family,
        shortName(f)
          .replace(/[-,].*$/, '')
          .replace(/(PSMT|PS|MT)$/, ''),
      );
  }
  if (Array.isArray(allowed) && families.size > 0) {
    const wanted = allowed.filter((v): v is string => typeof v === 'string');
    const isAllowed = (family: string): boolean => wanted.some((v) => fontFamily(v) === family);
    const present = [...families.keys()].some(isAllowed);
    const others = [...families].filter(([family]) => !isAllowed(family)).map(([, shown]) => shown);
    add({
      id: 'PDF-04',
      status: present && others.length === 0 ? 'pass' : 'fail',
      severity: severityOf(profile, 'FT-01', 'error'),
      heuristic: true,
      message: !present
        ? T.fontMissing(wanted.join(' или '), [...families.values()])
        : others.length > 0
          ? T.fontOthers(wanted.join(' или '), others)
          : T.fontOk(wanted.join(' или ')),
    });
  }

  const mainSize = mostCommon(allItems, (item) => Math.round(item.size * 2) / 2);
  const needSize = num(param(profile, 'FT-02', 'valuePt'));
  if (mainSize !== undefined && needSize !== undefined) {
    const ok = Math.abs(mainSize - needSize) <= 0.5;
    add({
      id: 'PDF-05',
      status: ok ? 'pass' : 'fail',
      severity: severityOf(profile, 'FT-02', 'error'),
      heuristic: false,
      message: ok ? T.mainSize(mainSize) : T.mainSizeBad(mainSize, needSize),
    });
  }

  // PDF-06: поля по краю текста (эвристика). Титульный лист пропускаем: он свёрстан иначе.
  const body = doc.pages.slice(doc.pages.length > 1 ? 1 : 0);
  const textOf = (p: PdfPage): PdfTextItem[] =>
    p.items.filter((item) => visible(item) && item !== pageNumber(p));
  const measured = {
    left: median(body.map((p) => Math.min(...textOf(p).map((i) => i.x))).filter(Number.isFinite)),
    right: median(
      body
        .map((p) => p.width - Math.max(...textOf(p).map((i) => i.x + i.width)))
        .filter(Number.isFinite),
    ),
    top: median(body.map((p) => Math.min(...textOf(p).map((i) => i.top))).filter(Number.isFinite)),
    bottom: median(
      body
        .map((p) => p.height - Math.max(...textOf(p).map((i) => i.top + i.size)))
        .filter(Number.isFinite),
    ),
  };
  const RULES = { left: 'PG-02', right: 'PG-03', top: 'PG-04', bottom: 'PG-05' } as const;
  const lines: string[] = [];
  let marginsBad = false;
  for (const side of ['left', 'right', 'top', 'bottom'] as const) {
    const now = measured[side];
    const need = num(param(profile, RULES[side], 'valueMm'));
    if (now === undefined || need === undefined) continue;
    const nowMm = now / PT_PER_MM;
    const tolerance = (num(param(profile, RULES[side], 'toleranceMm')) ?? 1) + 2;
    // Текст может не доходить до края поля (короткие строки), но не может заходить на поле.
    const bad =
      side === 'left' || side === 'top'
        ? Math.abs(nowMm - need) > tolerance
        : nowMm < need - tolerance;
    marginsBad ||= bad;
    lines.push(
      bad ? T.marginLine(T.sides[side], nowMm, need) : T.marginOkLine(T.sides[side], nowMm),
    );
  }
  if (lines.length > 0)
    add({
      id: 'PDF-06',
      status: marginsBad ? 'fail' : 'pass',
      severity: severityOf(profile, 'PG-02', 'error'),
      heuristic: true,
      message: T.margins(lines),
      note: T.marginNote,
    });

  // PDF-07: номера страниц (эвристика: короткое число у верхнего или нижнего края).
  if (profile.rules['NM-01']?.enabled && doc.pages.length > 1) {
    const rest = doc.pages.slice(1);
    const numbers = rest.map(pageNumber);
    const found = numbers.filter(Boolean).length;
    const problems: string[] = [];
    if (found < rest.length * 0.7) problems.push(T.numbersMissing(found, rest.length));
    const position = param(profile, 'NM-02', 'position');
    if (position === 'bottom-center' && found > 0) {
      const centered = rest.filter((p, i) => {
        const n = numbers[i];
        return (
          n && n.top > p.height / 2 && Math.abs(n.x + n.width / 2 - p.width / 2) < p.width * 0.08
        );
      }).length;
      if (centered < found * 0.7) problems.push(T.numbersPosition);
    }
    const first = doc.pages[0];
    if (param(profile, 'NM-03', 'noNumberOnTitlePage') === true && first && pageNumber(first))
      problems.push(T.numberOnTitle);
    add({
      id: 'PDF-07',
      status: problems.length ? 'fail' : 'pass',
      severity: severityOf(profile, 'NM-01', 'error'),
      heuristic: true,
      message: problems.length ? problems.join(' ') : T.numbersOk(found, rest.length),
    });
  }

  // PDF-08: каждая часть с новой страницы (эвристика: заголовок — первая строка страницы).
  const parts = profile.structure?.partsInOrder;
  if (profile.rules['PB-01']?.enabled && parts && parts.length > 0) {
    const normalize = (s: string): string =>
      s
        .toLowerCase()
        .replace(/^[\dIVX.\s]+/i, '')
        .replace(/[.:\s]+$/, '')
        .replace(/\s+/g, ' ')
        .trim();
    const firstLine = (p: PdfPage): string => {
      const items = textOf(p);
      const top = Math.min(...items.map((i) => i.top));
      return normalize(
        items
          .filter((i) => Math.abs(i.top - top) < 2)
          .sort((a, b) => a.x - b.x)
          .map((i) => i.text)
          .join(' '),
      );
    };
    const starts = doc.pages.map(firstLine);
    const allText = doc.pages.map((p) =>
      textOf(p)
        .map((i) => normalize(i.text))
        .filter((t) => t !== ''),
    );
    const bad: string[] = [];
    let found = 0;
    parts.forEach((part, i) => {
      // Часть, которая делит страницу с предыдущей («Основная часть» и «Теоретическая»),
      // может начинаться не с новой страницы.
      if (i > 0 && parts[i - 1]?.sharesPageWithNext) return;
      const names = [part.title, ...part.aliases].map(normalize);
      const present = allText.some((texts) => texts.some((t) => names.includes(t)));
      if (!present) return;
      found += 1;
      if (!starts.some((s) => names.includes(s))) bad.push(part.title);
    });
    add({
      id: 'PDF-08',
      status: found === 0 ? 'not-applicable' : bad.length ? 'fail' : 'pass',
      severity: severityOf(profile, 'PB-01', 'error'),
      heuristic: true,
      message: found === 0 ? T.partsNone : bad.length ? T.partsBad(bad) : T.partsOk(found),
    });
  }

  return { pages: doc.pages.length, checks };
}
