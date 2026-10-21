// Автонумерация (бриф, раздел 6.1.8): абзац ссылается на numId и уровень ilvl,
// numId указывает на «абстрактный» список, где описан формат номера каждого уровня.
import { readPPr, type PPr } from '../styles/resolve.ts';
import { wAttr, wChild, wChildren, wNum, type XmlElement } from '../xml.ts';

export interface NumberingLevel {
  format: string; // decimal, bullet, none …
  text: string; // шаблон номера: "%1.", "•" или пусто
  pPr: PPr;
}

export type NumberingLookup = (numId: number, ilvl: number) => NumberingLevel | undefined;

function readLevel(lvl: XmlElement): NumberingLevel {
  return {
    format: wAttr(wChild(lvl, 'numFmt'), 'val') ?? 'decimal',
    // Атрибут может быть пустым: lvlText w:val="" — номер невидим.
    text: wAttr(wChild(lvl, 'lvlText'), 'val') ?? '',
    pPr: readPPr(wChild(lvl, 'pPr')),
  };
}

export function readNumbering(root: XmlElement | undefined): NumberingLookup {
  if (!root) return () => undefined;

  const abstract = new Map<number, Map<number, NumberingLevel>>();
  for (const el of wChildren(root, 'abstractNum')) {
    const levels = new Map<number, NumberingLevel>();
    for (const lvl of wChildren(el, 'lvl')) levels.set(wNum(lvl, 'ilvl') ?? 0, readLevel(lvl));
    abstract.set(wNum(el, 'abstractNumId') ?? -1, levels);
  }

  const nums = new Map<number, { abstractId: number; overrides: Map<number, NumberingLevel> }>();
  for (const el of wChildren(root, 'num')) {
    const overrides = new Map<number, NumberingLevel>();
    for (const override of wChildren(el, 'lvlOverride')) {
      const lvl = wChild(override, 'lvl');
      if (lvl) overrides.set(wNum(override, 'ilvl') ?? 0, readLevel(lvl));
    }
    nums.set(wNum(el, 'numId') ?? -1, {
      abstractId: wNum(wChild(el, 'abstractNumId'), 'val') ?? -1,
      overrides,
    });
  }

  return (numId, ilvl) => {
    const num = nums.get(numId);
    if (!num) return undefined;
    return num.overrides.get(ilvl) ?? abstract.get(num.abstractId)?.get(ilvl);
  };
}
