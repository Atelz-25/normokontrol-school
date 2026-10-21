// Единицы Word (бриф, раздел 6.1.2). Всё в одном месте, чтобы не путаться.
//   twip (двадцатая доля пункта): 1 см = 567 twips, 1 мм = 56,7 twips;
//   half-point (полупункт): размер шрифта w:sz="24" — это 12 pt;
//   межстрочный интервал при lineRule="auto" хранится в 240-х долях: 360 = 1,5.

export const TWIPS_PER_CM = 567;
export const TWIPS_PER_PT = 20;
export const LINE_AUTO_UNIT = 240;
export const PT_PER_CM = 72 / 2.54;

export const twipsToCm = (twips: number): number => twips / TWIPS_PER_CM;
export const twipsToMm = (twips: number): number => (twips / TWIPS_PER_CM) * 10;
export const twipsToPt = (twips: number): number => twips / TWIPS_PER_PT;
export const halfPointsToPt = (halfPoints: number): number => halfPoints / 2;
export const lineAutoToMultiplier = (line: number): number => line / LINE_AUTO_UNIT;
export const ptToCm = (pt: number): number => pt / PT_PER_CM;

// Округление для показа человеку: 14,99 мм → 15,0 мм.
export const round = (value: number, digits = 1): number => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};
