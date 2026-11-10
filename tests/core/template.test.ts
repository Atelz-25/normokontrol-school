// Шаблон по требованиям: оформление в нём уже правильное — программа сама его проверяет.
import { describe, expect, it } from 'vitest';
import { checkDocx } from '../../src/core/engine/index.ts';
import { BUILTIN_PROFILES } from '../../src/core/profiles/builtin.ts';
import { buildTemplate } from '../../src/core/template/build.ts';
import { templateTexts } from '../../src/i18n/ru.ts';

describe('шаблон пояснительной записки', () => {
  for (const profile of BUILTIN_PROFILES) {
    it(`«${profile.title}»: оформление по требованиям, содержание — дело ученика`, () => {
      const report = checkDocx(buildTemplate(profile, templateTexts), profile, {
        fileName: 'Иванов, И. Пояснительная записка.docx',
      });
      const failed = report.results
        .filter((r) => r.status === 'fail' || r.status === 'crashed')
        .map((r) => r.ruleId);
      // В шаблоне ещё нет текста работы: объём, части введения и заключения, литература,
      // темы теории — это заполняет ученик. Всё оформление должно проходить.
      const content = /^(VL|TH|CN|RF|ST-0[4-9]|ST-1|AP|PS|FN|DC-04|HD-07)/;
      expect(failed.filter((id) => !content.test(id))).toEqual([]);
    });
  }
});
