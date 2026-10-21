// На каком этапе появится правило, которого ещё нет в реестре
// (RULES-SCHOOL, раздел 7; для остальных — этапы из каталога брифа).
const STAGE_2 = /^(ST-0[1-8]|ST-10|PS-01|FN-01|NM-0\d|HD-0\d|TH-01|OUT-01|VL-0[12]|FT-05|PR-07)$/;

export function plannedStage(ruleId: string): number {
  return STAGE_2.test(ruleId) ? 2 : 3;
}
