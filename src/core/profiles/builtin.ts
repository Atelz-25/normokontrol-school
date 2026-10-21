// Встроенные профили (бриф, раздел 7) и профиль «Наша школа».
//
// Числа в типовых профилях — типовые школьные требования из каталога брифа;
// их надо сверять с методичкой. Новые школьные правила (PR-08, PR-09, PR-10, PB-01)
// во встроенных профилях только «советы» или выключены (RULES-SCHOOL, раздел 0.3).
import schoolCustom from '../../../profiles/school-custom.json' with { type: 'json' };
import { loadProfile } from './load.ts';
import type { Profile, RuleConfig, Severity } from './types.ts';

const rule = (severity: Severity, params: Record<string, unknown> = {}, enabled = true): RuleConfig => ({
  enabled,
  severity,
  params,
});

const BODY = ['body', 'list-item'];

// Каталог брифа, раздел 8, только правила, которые уже проверяются.
const typicalRules: Record<string, RuleConfig> = {
  'PG-01': rule('error', { widthMm: 210, heightMm: 297, toleranceMm: 1, allowLandscapeInAppendix: true }),
  'PG-02': rule('error', { mode: 'equals', valueMm: 30, toleranceMm: 1 }),
  'PG-03': rule('error', { mode: 'equals', valueMm: 10, toleranceMm: 1 }),
  'PG-04': rule('error', { mode: 'equals', valueMm: 20, toleranceMm: 1 }),
  'PG-05': rule('error', { mode: 'equals', valueMm: 20, toleranceMm: 1 }),
  'PG-06': rule('warning'),
  'FT-01': rule('error', { mode: 'oneOf', values: ['Times New Roman'] }),
  'FT-02': rule('error', { mode: 'equals', valuePt: 14, tolerancePt: 0 }),
  'FT-03': rule('warning', { allowedFonts: ['Times New Roman'], codeFonts: ['Courier New', 'Consolas'] }),
  'FT-04': rule('warning', { allowAutoOrBlack: true, allowHyperlinkColor: true }),
  'PR-01': rule('error', { mode: 'equals', value: 1.5, tolerance: 0.05, appliesTo: BODY }),
  'PR-02': rule('warning', { mode: 'equals', valuePt: 0, tolerancePt: 1, appliesTo: BODY }),
  'PR-03': rule('error', { mode: 'equals', valueCm: 1.25, toleranceCm: 0.1, appliesTo: ['body'] }),
  'PR-04': rule('error', { align: 'both', appliesTo: BODY }),
  'PR-05': rule('error', { forbidSpacesTabsAsIndent: true }),
  'PR-06': rule('warning', { runs: 'all' }),
  'PR-08': rule('info', {}, false),
  'PR-09': rule('info', { mode: 'equals', valueCm: 0, toleranceCm: 0.1 }),
  'PR-10': rule('info', { minRunLength: 2 }),
  'PB-01': rule('info', { accept: ['pageBreakBefore', 'hardPageBreak', 'sectionBreakNextPage'] }),
  'TY-01': rule('warning'),
  'TY-02': rule('warning'),
  'TY-03': rule('warning'),
  'DC-01': rule('error'),
};

const NEW_SCHOOL_RULES = new Set(['PR-08', 'PR-09', 'PR-10', 'PB-01']);

const typical: Profile = {
  schemaVersion: 1,
  id: 'school-default',
  title: 'Типовой школьный проект',
  description: 'Типовые требования. Проверьте их по методичке вашей школы.',
  rules: typicalRules,
};

const strict: Profile = {
  schemaVersion: 1,
  id: 'strict',
  title: 'Строгий (по мотивам ГОСТ 7.32-2017)',
  description: 'Те же значения, что в типовом профиле, но все замечания считаются ошибками. ГОСТ здесь только ориентир: уточните актуальность.',
  rules: Object.fromEntries(
    Object.entries(typicalRules).map(([id, config]) => [
      id,
      NEW_SCHOOL_RULES.has(id) ? config : { ...config, severity: 'error' as const },
    ]),
  ),
};

const errorsOnly: Profile = {
  schemaVersion: 1,
  id: 'errors-only',
  title: 'Только ошибки',
  description: 'Типовой профиль без замечаний и советов: только то, что считается ошибкой.',
  rules: Object.fromEntries(
    Object.entries(typicalRules).map(([id, config]) => [id, { ...config, enabled: config.enabled && config.severity === 'error' }]),
  ),
};

function mustLoad(input: unknown): Profile {
  const result = loadProfile(input);
  // Встроенные профили проверены тестом; если здесь ошибка, это ошибка программиста.
  if (!result.ok) throw new Error(`Встроенный профиль не прошёл проверку: ${JSON.stringify(result.errors)}`);
  return result.profile;
}

export const DEFAULT_PROFILE_ID = 'school-custom';

export const BUILTIN_PROFILES: Profile[] = [schoolCustom, typical, strict, errorsOnly].map(mustLoad);
