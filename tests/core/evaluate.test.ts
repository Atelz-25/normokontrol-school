// Подсчёт TP/FP/FN, точности и полноты для протокола оценки качества.
import { describe, expect, it } from 'vitest';
import { evaluate, metricsTable, parseAnnotations } from '../../scripts/lib/evaluate-lib.ts';

describe('оценка качества', () => {
  it('разбор разметки: «;» или «,», да/нет, лишние строки пропускаются', () => {
    const csv =
      '\ufeffфайл;правило;нарушение\r\nа.docx;PR-06;да\r\nа.docx;PR-03;нет\r\nбез ответа;X;?\r\n';
    expect(parseAnnotations(csv)).toEqual([
      { file: 'а.docx', ruleId: 'PR-06', violation: true },
      { file: 'а.docx', ruleId: 'PR-03', violation: false },
    ]);
    expect(parseAnnotations('file,rule,violation\nб.docx,PB-01,yes\n')).toHaveLength(1);
  });

  it('TP, FP, FN, TN и точность с полнотой считаются по определению', () => {
    const annotations = [
      { file: 'a', ruleId: 'R1', violation: true }, // программа нашла → TP
      { file: 'b', ruleId: 'R1', violation: true }, // программа промолчала → FN
      { file: 'a', ruleId: 'R2', violation: false }, // программа сообщила → FP
      { file: 'b', ruleId: 'R2', violation: false }, // программа промолчала → TN
      { file: 'c', ruleId: 'R2', violation: true }, // правило не проверялось → не считается
    ];
    const predictions = [
      { file: 'a', ruleId: 'R1', violation: true },
      { file: 'b', ruleId: 'R1', violation: false },
      { file: 'a', ruleId: 'R2', violation: true },
      { file: 'b', ruleId: 'R2', violation: false },
    ];
    const result = evaluate(annotations, predictions, () => 'Абзац');
    expect(result.total).toEqual({ tp: 1, fp: 1, fn: 1, tn: 1, precision: 0.5, recall: 0.5 });
    expect(result.byRule.R1).toMatchObject({ tp: 1, fn: 1, precision: 1, recall: 0.5 });
    expect(result.byRule.R2).toMatchObject({ fp: 1, tn: 1, precision: 0, recall: undefined });
    expect(metricsTable(result.byRule, 'Правило')).toContain(
      '| R1 | 1 | 0 | 1 | 0 | 100 % | 50 % |',
    );
  });
});
