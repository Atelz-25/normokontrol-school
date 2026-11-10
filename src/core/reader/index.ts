// Точка входа чтения: байты файла → модель документа (без ролей абзацев).
// Любая ошибка превращается в DocxError с понятным кодом.
import type { DocModel } from '../model/types.ts';
import { readStyleSheet, readTheme } from '../styles/resolve.ts';
import { NS, parseXml, XmlParseError, type XmlElement } from '../xml.ts';
import { DEFAULT_LIMITS, readArchive, type ArchiveLimits } from './archive.ts';
import { buildModel } from './document.ts';
import { DocxError } from './errors.ts';
import { readNumbering } from './numbering.ts';

export { DocxError, type DocxErrorCode } from './errors.ts';
export { DEFAULT_LIMITS, type ArchiveLimits } from './archive.ts';

function first(root: XmlElement | undefined, ns: string, name: string): string | undefined {
  const value = root?.getElementsByTagNameNS(ns, name).item(0)?.textContent?.trim();
  return value === '' ? undefined : (value ?? undefined);
}

// word/_rels/document.xml.rels: rId → путь к части внутри архива.
function readRelationships(root: XmlElement | undefined): Map<string, string> {
  const map = new Map<string, string>();
  if (!root) return map;
  for (const rel of Array.from(root.getElementsByTagNameNS(NS.rel, 'Relationship'))) {
    const id = rel.getAttribute('Id');
    const target = rel.getAttribute('Target');
    if (!id || !target || rel.getAttribute('TargetMode') === 'External') continue;
    // Цель указана относительно папки word/, иногда с ведущим «/».
    map.set(id, target.startsWith('/') ? target.slice(1) : `word/${target}`);
  }
  return map;
}

// Этапы чтения — для строки хода проверки в интерфейсе. Ядро только сообщает, что этап
// закончился; что с этим делать, решает вызывающий (Web Worker пересылает это странице).
export type ReadStep = 'archive' | 'styles' | 'paragraphs';

export function readDocx(
  bytes: Uint8Array,
  limits: ArchiveLimits = DEFAULT_LIMITS,
  onStep?: (step: ReadStep) => void,
): DocModel {
  const parts = readArchive(bytes, limits);
  onStep?.('archive');
  try {
    const optional = (name: string): XmlElement | undefined => {
      const text = parts.get(name);
      return text === undefined ? undefined : parseXml(text);
    };
    const theme = readTheme(parts.get('word/theme/theme1.xml'), parseXml);
    const sheet = readStyleSheet(optional('word/styles.xml'), theme);
    onStep?.('styles');
    const numbering = readNumbering(optional('word/numbering.xml'));
    const comments = optional('word/comments.xml');
    const core = optional('docProps/core.xml');
    const documentRoot = parseXml(parts.get('word/document.xml') ?? '');

    const rels = readRelationships(optional('word/_rels/document.xml.rels'));
    // Колонтитулы: только те, на которые ссылается документ.
    const headerFooterRoots = new Map<string, XmlElement>();
    for (const target of rels.values()) {
      // Имя части может быть любым (footer1.xml, footer-first.xml), важно слово header/footer.
      const root = /^word\/[^/]*(header|footer)[^/]*\.xml$/.test(target)
        ? optional(target)
        : undefined;
      if (root) headerFooterRoots.set(target, root);
    }

    const model = buildModel(documentRoot, sheet, numbering, {
      comments: comments ? comments.getElementsByTagNameNS(NS.w, 'comment').length : 0,
      title: first(core, NS.dc, 'title'),
      creator: first(core, NS.dc, 'creator'),
      created: first(core, NS.dcterms, 'created'),
      modified: first(core, NS.dcterms, 'modified'),
      rels,
      headerFooterRoots,
    });
    onStep?.('paragraphs');
    return model;
  } catch (error) {
    if (error instanceof DocxError) throw error;
    // Битый XML или неожиданная структура: понятная ошибка вместо падения.
    throw new DocxError('broken', error instanceof XmlParseError ? 'xml' : String(error));
  }
}
