// DC-01. Не удалены правки (режим рецензирования) и примечания.
import { msg } from '../../i18n/rules-ru.ts';
import { finding } from './helpers.ts';
import type { Finding, Rule } from './types.ts';

const revisions: Rule = {
  id: 'DC-01',
  category: 'document',
  stage: 1,
  autoFixable: false,
  defaultParams: {},
  check(ctx) {
    const { revisions: count, comments } = ctx.doc;
    const findings: Finding[] = [];
    if (count > 0) findings.push(finding(ctx, false, msg.revisions(count), {}));
    if (comments > 0) findings.push(finding(ctx, false, msg.comments(comments), {}));
    return { checked: 1, findings, unit: 'document', metrics: { revisions: count, comments } };
  },
};

export const documentRules: Rule[] = [revisions];
