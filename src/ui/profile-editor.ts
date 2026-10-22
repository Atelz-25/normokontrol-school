// Редактор требований (бриф, раздел 10.3): правила по категориям, вкл/выкл, серьёзность,
// параметры с единицами. Результат проверяется тем же loadProfile, что и файлы профилей.
import { loadProfile } from '../core/profiles/load.ts';
import { profileToHash } from '../core/profiles/share.ts';
import type { Profile, RuleConfig, Severity } from '../core/profiles/types.ts';
import { RULES_BY_ID } from '../core/rules/registry.ts';
import { CATEGORY_NAMES, RULE_TEXTS } from '../i18n/rules-ru.ts';
import { SEVERITY_NAMES, profileErrorText, ru } from '../i18n/ru.ts';
import { el } from './dom.ts';
import { copyText, downloadFile } from './export.ts';

export interface EditorHandlers {
  onApply: (profile: Profile) => void;
  onClose: () => void;
  notify: (message: string, isError?: boolean) => void;
  defaults: (id: string) => Profile | undefined; // исходный встроенный профиль для «Сбросить»
}

// Единица измерения по окончанию имени параметра: valueMm → мм, toleranceCm → см.
function unitOf(key: string): string {
  if (/Mm$/.test(key)) return 'мм';
  if (/Cm$/.test(key)) return 'см';
  if (/Pt$/.test(key)) return 'pt';
  if (/Chars$/.test(key)) return 'знаков';
  return '';
}

const SEVERITIES: Severity[] = ['error', 'warning', 'info'];

// Поле для одного параметра. read() возвращает значение или ошибку разбора JSON.
interface ParamField {
  element: HTMLElement;
  read: () => { ok: true; value: unknown } | { ok: false };
}

function paramField(ruleId: string, key: string, value: unknown): ParamField {
  const id = `p-${ruleId}-${key}`;
  const unit = unitOf(key);
  const label = el('label', { for: id }, unit ? `${key}, ${unit}` : key);
  if (typeof value === 'number') {
    const input = el('input', { id, type: 'number', step: 'any', value: String(value) });
    return {
      element: el('div', { class: 'param' }, label, input),
      read: () => ({ ok: true, value: input.valueAsNumber }),
    };
  }
  if (typeof value === 'boolean') {
    const input = el('input', { id, type: 'checkbox' });
    input.checked = value;
    return {
      element: el('div', { class: 'param param-check' }, input, label),
      read: () => ({ ok: true, value: input.checked }),
    };
  }
  if (typeof value === 'string') {
    const input = el('input', { id, type: 'text', value });
    return {
      element: el('div', { class: 'param' }, label, input),
      read: () => ({ ok: true, value: input.value }),
    };
  }
  if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
    const area = el('textarea', {
      id,
      rows: String(Math.min(6, value.length + 1)),
      'aria-describedby': `${id}-hint`,
    });
    area.value = value.join('\n');
    return {
      element: el(
        'div',
        { class: 'param' },
        label,
        area,
        el('span', { class: 'muted', id: `${id}-hint` }, ru.editorListHint),
      ),
      read: () => ({
        ok: true,
        value: area.value
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean),
      }),
    };
  }
  // Сложные значения (списки частей, объекты уровней заголовков) — как JSON.
  const area = el('textarea', { id, rows: '6', class: 'json', 'aria-describedby': `${id}-hint` });
  area.value = JSON.stringify(value, null, 2);
  return {
    element: el(
      'div',
      { class: 'param' },
      label,
      area,
      el('span', { class: 'muted', id: `${id}-hint` }, ru.editorJsonHint),
    ),
    read: () => {
      try {
        return { ok: true, value: JSON.parse(area.value) as unknown };
      } catch {
        return { ok: false };
      }
    },
  };
}

interface RuleRow {
  ruleId: string;
  element: HTMLElement;
  read: (notify: EditorHandlers['notify']) => RuleConfig | undefined;
}

function ruleRow(ruleId: string, config: RuleConfig): RuleRow {
  const enabled = el('input', { type: 'checkbox', id: `en-${ruleId}` });
  enabled.checked = config.enabled;
  const severity = el(
    'select',
    { id: `sev-${ruleId}`, 'aria-label': `${ruleId}: ${ru.editorSeverity}` },
    ...SEVERITIES.map((s) => {
      const option = el('option', { value: s }, SEVERITY_NAMES[s]);
      option.selected = s === config.severity;
      return option;
    }),
  );
  const fields = Object.entries(config.params).map(([key, value]) => ({
    key,
    field: paramField(ruleId, key, value),
  }));
  const title = RULE_TEXTS[ruleId]?.title ?? '';
  const element = el(
    'fieldset',
    { class: 'rule-row' },
    el('legend', {}, `${ruleId} ${title}`),
    el(
      'div',
      { class: 'rule-controls' },
      el(
        'span',
        { class: 'param-check' },
        enabled,
        el('label', { for: `en-${ruleId}` }, ru.editorEnabled),
      ),
      severity,
    ),
    config.note ? el('p', { class: 'note' }, config.note) : undefined,
    fields.length > 0
      ? el(
          'details',
          {},
          el('summary', {}, ru.editorParams),
          ...fields.map(({ field }) => field.element),
        )
      : undefined,
  );
  return {
    ruleId,
    element,
    read: (notify) => {
      const params: Record<string, unknown> = {};
      for (const { key, field } of fields) {
        const result = field.read();
        if (!result.ok) {
          notify(ru.editorBadJson(`${ruleId}.${key}`), true);
          return undefined;
        }
        params[key] = result.value;
      }
      return { ...config, enabled: enabled.checked, severity: severity.value as Severity, params };
    },
  };
}

export function renderProfileEditor(base: Profile, handlers: EditorHandlers): HTMLElement {
  const root = el('section', { class: 'editor', 'aria-labelledby': 'editor-title' });

  const render = (profile: Profile): void => {
    const nameId = 'editor-name';
    const name = el('input', { id: nameId, type: 'text', value: profile.title });
    const rows = Object.entries(profile.rules).map(([id, config]) => ruleRow(id, config));

    // Реализованные правила — по категориям, остальные — в конце одним блоком.
    const byCategory = new Map<string, RuleRow[]>();
    const pending: RuleRow[] = [];
    for (const row of rows) {
      const category = RULES_BY_ID.get(row.ruleId)?.category;
      if (!category) pending.push(row);
      else byCategory.set(category, [...(byCategory.get(category) ?? []), row]);
    }

    // «Темы проекта» (решение В4): по одной на строке, «Название: слово1, слово2».
    const topicsArea = el('textarea', {
      id: 'editor-topics',
      rows: '5',
      'aria-describedby': 'editor-topics-hint',
    });
    topicsArea.value = (profile.structure?.projectTopics ?? [])
      .map((t) => `${t.title}: ${t.keywords.join(', ')}`)
      .join('\n');
    const readTopics = (): { title: string; keywords: string[] }[] =>
      topicsArea.value
        .split('\n')
        .map((line) => {
          const [title = '', words = ''] = line.split(':');
          return {
            title: title.trim(),
            keywords: words
              .split(',')
              .map((w) => w.trim())
              .filter(Boolean),
          };
        })
        .filter((topic) => topic.title !== '');

    const collect = (): Profile | undefined => {
      const rules: Record<string, RuleConfig> = {};
      for (const row of rows) {
        const config = row.read(handlers.notify);
        if (!config) return undefined;
        rules[row.ruleId] = config;
      }
      const topics = readTopics();
      // TH-03 получает темы и напрямую: ссылка topicsFrom уже развёрнута при загрузке профиля.
      const th03 = rules['TH-03'];
      if (th03) rules['TH-03'] = { ...th03, params: { ...th03.params, topics } };
      const structure = profile.structure
        ? { ...profile.structure, projectTopics: topics }
        : undefined;
      return {
        ...profile,
        title: name.value.trim() || profile.title,
        rules,
        ...(structure ? { structure } : {}),
      };
    };

    const validated = (): Profile | undefined => {
      const draft = collect();
      if (!draft) return undefined;
      const result = loadProfile(draft);
      if (!result.ok) {
        handlers.notify(
          `${ru.editorInvalid} ${result.errors.map(profileErrorText).join(' ')}`,
          true,
        );
        return undefined;
      }
      return result.profile;
    };

    const fileInput = el('input', {
      type: 'file',
      accept: '.json,application/json',
      class: 'visually-hidden',
      'aria-label': ru.editorLoad,
      tabindex: '-1',
    });
    fileInput.addEventListener('change', () => {
      const file = fileInput.files?.[0];
      fileInput.value = '';
      if (!file) return;
      void file.text().then((text) => {
        let parsed: unknown;
        try {
          parsed = JSON.parse(text);
        } catch {
          handlers.notify(ru.editorBadJson(file.name), true);
          return;
        }
        const result = loadProfile(parsed);
        if (!result.ok)
          handlers.notify(
            `${ru.editorInvalid} ${result.errors.map(profileErrorText).join(' ')}`,
            true,
          );
        else render(result.profile);
      });
    });

    const button = (label: string, action: () => void, primary = false): HTMLButtonElement => {
      const b = el('button', { type: 'button', class: primary ? 'primary' : 'secondary' }, label);
      b.addEventListener('click', action);
      return b;
    };

    root.replaceChildren(
      el('h2', { id: 'editor-title', tabindex: '-1' }, ru.editorTitle),
      el('p', { class: 'muted' }, ru.editorIntro),
      el('div', { class: 'field' }, el('label', { for: nameId }, ru.editorName), name),
      el(
        'div',
        { class: 'field' },
        el('label', { for: 'editor-topics' }, ru.editorTopics),
        topicsArea,
        el('span', { class: 'muted', id: 'editor-topics-hint' }, ru.editorTopicsHint),
      ),
      el(
        'div',
        { class: 'toolbar' },
        button(
          ru.editorApply,
          () => {
            const profile = validated();
            if (profile) handlers.onApply(profile);
          },
          true,
        ),
        button(ru.editorReset, () => {
          const original = handlers.defaults(profile.id.replace(/-my$/, ''));
          if (original) render({ ...original, id: profile.id, title: profile.title });
        }),
        button(ru.editorSave, () => {
          const profile = validated();
          if (profile) downloadFile(`${profile.id}.json`, JSON.stringify(profile, null, 2));
        }),
        button(ru.editorLoad, () => {
          fileInput.click();
        }),
        button(ru.editorShare, () => {
          const profile = validated();
          if (!profile) return;
          const url = `${location.origin}${location.pathname}${profileToHash(profile)}`;
          void copyText(url).then((ok) => {
            handlers.notify(ok ? ru.editorShared : ru.copyFailed, !ok);
          });
        }),
        button(ru.closeEditor, handlers.onClose),
        fileInput,
      ),
      ...[...byCategory].map(([category, list]) =>
        el(
          'section',
          { class: 'rule-group' },
          el('h3', {}, CATEGORY_NAMES[category] ?? category),
          ...list.map((r) => r.element),
        ),
      ),
      ...(pending.length > 0
        ? [
            el(
              'details',
              { class: 'rule-group' },
              el('summary', {}, ru.editorPending),
              ...pending.map((r) => r.element),
            ),
          ]
        : []),
    );
  };

  // Встроенный профиль не меняем: редактируем его копию «(мой)».
  const editable = base.id.endsWith('-my')
    ? base
    : { ...structuredClone(base), id: `${base.id}-my`, title: `${base.title} ${ru.customSuffix}` };
  render(editable);
  return root;
}
