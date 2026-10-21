// Чтение параметров правила из профиля и общие режимы сравнения (бриф, раздел 7):
// equals (с допуском), oneOf, atLeast, atMost. Код один на все правила.

export type Params = Record<string, unknown>;

export const num = (params: Params, key: string, fallback: number): number => {
  const value = params[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
};

export const str = (params: Params, key: string, fallback: string): string => {
  const value = params[key];
  return typeof value === 'string' ? value : fallback;
};

export const bool = (params: Params, key: string, fallback: boolean): boolean => {
  const value = params[key];
  return typeof value === 'boolean' ? value : fallback;
};

export const strings = (params: Params, key: string, fallback: string[]): string[] => {
  const value = params[key];
  return Array.isArray(value) && value.every((item) => typeof item === 'string') ? value : fallback;
};

export type NumberSpec =
  | { mode: 'equals'; value: number; tolerance: number }
  | { mode: 'oneOf'; values: number[]; tolerance: number }
  | { mode: 'atLeast'; value: number }
  | { mode: 'atMost'; value: number };

// Профиль хранит числа с единицей в имени: valueMm, toleranceCm, valuePt …
// unit — это суффикс ('Mm', 'Cm', 'Pt' или '' для безразмерных).
export function numberSpec(params: Params, unit: string, fallback: NumberSpec): NumberSpec {
  const mode = str(params, 'mode', fallback.mode);
  const fallbackValue = 'value' in fallback ? fallback.value : (fallback.values[0] ?? 0);
  const tolerance = num(
    params,
    `tolerance${unit}`,
    'tolerance' in fallback ? fallback.tolerance : 0,
  );
  const value = num(params, `value${unit}`, fallbackValue);
  const raw = params[`values${unit}`];
  const values = Array.isArray(raw)
    ? raw.filter((v): v is number => typeof v === 'number')
    : [value];
  switch (mode) {
    case 'oneOf':
      return { mode, values, tolerance };
    case 'atLeast':
    case 'atMost':
      return { mode, value };
    default:
      return { mode: 'equals', value, tolerance };
  }
}

// Маленький запас 1e-9 нужен из-за дробей: 0,1 + 0,2 в компьютере не ровно 0,3.
const EPS = 1e-9;

export function matches(actual: number, spec: NumberSpec): boolean {
  switch (spec.mode) {
    case 'equals':
      return Math.abs(actual - spec.value) <= spec.tolerance + EPS;
    case 'oneOf':
      return spec.values.some((value) => Math.abs(actual - value) <= spec.tolerance + EPS);
    case 'atLeast':
      return actual >= spec.value - EPS;
    case 'atMost':
      return actual <= spec.value + EPS;
  }
}
