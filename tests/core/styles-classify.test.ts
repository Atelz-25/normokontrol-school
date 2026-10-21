// Разрешение стилей, единицы и классификатор зон и ролей.
import { describe, expect, it } from 'vitest';
import { buildDocx, empty, emptyRun, p, pageBreak, table } from '../../scripts/lib/docx-builder.ts';
import { classify, headingKey } from '../../src/core/classify/index.ts';
import { readDocx } from '../../src/core/reader/index.ts';
import { matches, numberSpec } from '../../src/core/rules/params.ts';
import {
  halfPointsToPt,
  lineAutoToMultiplier,
  twipsToCm,
  twipsToMm,
} from '../../src/core/units.ts';
import { describeSpec } from '../../src/i18n/rules-ru.ts';

describe('единицы', () => {
  it('twips, полупункты, доли интервала', () => {
    expect(twipsToCm(567)).toBe(1);
    expect(twipsToMm(1701)).toBeCloseTo(30, 0);
    expect(halfPointsToPt(28)).toBe(14);
    expect(lineAutoToMultiplier(360)).toBe(1.5);
  });
});

describe('эффективное форматирование', () => {
  const styles =
    '<w:style w:type="paragraph" w:styleId="base"><w:name w:val="Base"/><w:pPr><w:spacing w:line="276" w:lineRule="auto"/><w:jc w:val="center"/></w:pPr><w:rPr><w:sz w:val="32"/></w:rPr></w:style>' +
    '<w:style w:type="paragraph" w:styleId="child"><w:name w:val="heading 1"/><w:basedOn w:val="base"/><w:pPr><w:jc w:val="left"/></w:pPr></w:style>' +
    '<w:style w:type="character" w:styleId="em"><w:name w:val="Emphasis"/><w:rPr><w:i/></w:rPr></w:style>';

  it('цепочка basedOn: свойство наследуется, пока его не перекроют', () => {
    const doc = readDocx(buildDocx({ styles, body: [p('Заголовок', { style: 'child' })] }));
    const para = doc.paragraphs[0]!;
    expect(para.styleName).toBe('heading 1');
    expect(para.format.align).toBe('left'); // перекрыто в child
    expect(para.format.lineSpacing).toEqual({ rule: 'auto', multiplier: 1.15 }); // из base
    expect(para.runs[0]?.sizePt).toBe(16); // из base
  });

  it('прямое форматирование главнее стиля, стиль символа применяется к прогону', () => {
    const doc = readDocx(
      buildDocx({
        styles,
        body: [
          '<w:p><w:pPr><w:pStyle w:val="base"/><w:jc w:val="both"/></w:pPr><w:r><w:rPr><w:rStyle w:val="em"/></w:rPr><w:t>Текст</w:t></w:r></w:p>',
        ],
      }),
    );
    expect(doc.paragraphs[0]?.format.align).toBe('both');
    expect(doc.paragraphs[0]?.runs[0]?.italic).toBe(true);
  });

  it('шрифт из темы и docDefaults', () => {
    const theme =
      '<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:themeElements><a:fontScheme name="x">' +
      '<a:majorFont><a:latin typeface="Cambria"/></a:majorFont><a:minorFont><a:latin typeface="Calibri"/></a:minorFont>' +
      '</a:fontScheme></a:themeElements></a:theme>';
    const doc = readDocx(
      buildDocx({
        defaultRPr:
          '<w:rFonts w:asciiTheme="minorHAnsi" w:hAnsiTheme="minorHAnsi"/><w:sz w:val="22"/>',
        body: [p('Текст')],
        extraParts: { 'word/theme/theme1.xml': theme },
      }),
    );
    expect(doc.paragraphs[0]?.runs[0]).toMatchObject({ font: 'Calibri', sizePt: 11 });
  });

  it('выступ (hanging) и отступ в символах', () => {
    const doc = readDocx(
      buildDocx({
        body: [
          p('a', { pPr: '<w:ind w:left="720" w:hanging="360"/>' }),
          p('b', { pPr: '<w:ind w:firstLineChars="100"/>' }),
        ],
      }),
    );
    expect(doc.paragraphs[0]?.format.firstLineIndentCm).toBeCloseTo(-0.63, 2);
    // 1 символ при шрифте 12 pt = 12 pt ≈ 0,42 см
    expect(doc.paragraphs[1]?.format.firstLineIndentCm).toBeCloseTo(0.42, 2);
  });
});

describe('сравнение чисел', () => {
  it('режимы equals, oneOf, atLeast, atMost', () => {
    const equals = numberSpec({ valueMm: 30, toleranceMm: 1 }, 'Mm', {
      mode: 'equals',
      value: 0,
      tolerance: 0,
    });
    expect(matches(29.2, equals)).toBe(true);
    expect(matches(28.9, equals)).toBe(false);
    const oneOf = numberSpec({ mode: 'oneOf', valuesMm: [10, 15], toleranceMm: 1 }, 'Mm', equals);
    expect(matches(15, oneOf) && !matches(12.5, oneOf)).toBe(true);
    expect(matches(5, numberSpec({ mode: 'atLeast', value: 5 }, '', equals))).toBe(true);
    expect(matches(6, numberSpec({ mode: 'atMost', value: 5 }, '', equals))).toBe(false);
    expect(describeSpec(oneOf, 'мм')).toBe('10 или 15 мм');
    expect(describeSpec(equals, 'мм')).toBe('30 мм (±1)');
  });
});

describe('классификатор', () => {
  it('ключ заголовка: без номера, табуляции, регистра; строка содержания — не заголовок', () => {
    expect(headingKey('II.I.\tТЕОРЕТИЧЕСКАЯ ЧАСТЬ')).toBe('теоретическая часть');
    expect(headingKey('I. Введение')).toBe('введение');
    expect(headingKey('Введение\t4')).toBeUndefined();
    expect(headingKey('Литература.')).toBe('литература');
  });

  it('без structure: титульный лист до первого разрыва, содержание, основной текст', () => {
    const doc = readDocx(
      buildDocx({
        body: [
          p('Школа'),
          p('Тема проекта'),
          pageBreak(),
          p('Содержание'),
          p('Введение\t3'),
          empty(),
          p('Введение'),
          p('Обычный абзац текста.'),
          p('Литература'),
          p('[1] Источник.'),
        ],
      }),
    );
    const result = classify(doc);
    const roles = doc.paragraphs.map((x) => `${x.index}:${x.role}:${x.zone}`);
    expect(result.titlePageEnd).toBe(3);
    expect(roles).toEqual([
      '1:title-page:title-page',
      '2:title-page:title-page',
      '3:title-page:title-page', // абзац с одним разрывом страницы
      '4:part-heading:front-matter',
      '5:toc-entry:front-matter',
      '6:empty:front-matter', // пустой абзац — в зоне предыдущего непустого
      '7:part-heading:body',
      '8:body:body',
      '9:part-heading:body',
      '10:source-item:body',
    ]);
  });

  it('паспорт: титульный лист до заголовка паспорта, таблица после него — таблица паспорта', () => {
    const parts = [
      { id: 'passport', title: 'Паспорт проекта', aliases: ['Паспорт проекта'], optional: false },
    ];
    const doc = readDocx(
      buildDocx({
        body: [p('Титул'), ...emptyRun(2), p('Паспорт проекта'), table([['Тема проекта', 'x']])],
      }),
    );
    const result = classify(doc, { parts });
    expect(result.titlePageEnd).toBe(3);
    expect(doc.tables[0]?.role).toBe('passport-table');
    expect(doc.paragraphs[4]?.role).toBe('table-cell');
  });

  it('таблица паспорта по меткам в первом столбце, даже без заголовка', () => {
    const fields = ['Тема проекта', 'Цель проекта', 'Задачи проекта', 'Актуальность'];
    const doc = readDocx(
      buildDocx({ body: [p('Текст'), table(fields.map((f) => [f, 'значение']))] }),
    );
    classify(doc, { passportFields: fields });
    expect(doc.tables[0]?.role).toBe('passport-table');
  });

  it('подзаголовок «1. Название», подводка к списку, пункт списка, подпись', () => {
    const numbering =
      '<w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/></w:lvl></w:abstractNum>' +
      '<w:abstractNum w:abstractNumId="1"><w:lvl w:ilvl="0"><w:numFmt w:val="none"/><w:lvlText w:val=""/></w:lvl></w:abstractNum>' +
      '<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num><w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num>';
    const list = '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>';
    const hidden = '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="2"/></w:numPr>';
    const doc = readDocx(
      buildDocx({
        numbering,
        body: [
          p('Введение'),
          p('1. Литературный обзор'),
          p('В работе решались такие задачи, перечисленные ниже по порядку:'),
          p('первая задача;', { pPr: list }),
          p('Абзац с невидимым номером остаётся обычным текстом.', { pPr: hidden }),
          p('Рисунок 1 – Схема'),
        ],
      }),
    );
    classify(doc);
    expect(doc.paragraphs.map((x) => x.role)).toEqual([
      'part-heading',
      'sub-heading',
      'body',
      'list-item',
      'body',
      'caption-figure',
    ]);
    expect(doc.paragraphs[2]?.isListLeadIn).toBe(true);
    expect(doc.paragraphs[1]?.roleConfidence).toBe('heuristic');
  });
});
