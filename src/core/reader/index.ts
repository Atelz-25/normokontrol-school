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

export function readDocx(bytes: Uint8Array, limits: ArchiveLimits = DEFAULT_LIMITS): DocModel {
  const parts = readArchive(bytes, limits);
  try {
    const optional = (name: string): XmlElement | undefined => {
      const text = parts.get(name);
      return text === undefined ? undefined : parseXml(text);
    };
    const theme = readTheme(parts.get('word/theme/theme1.xml'), parseXml);
    const sheet = readStyleSheet(optional('word/styles.xml'), theme);
    const numbering = readNumbering(optional('word/numbering.xml'));
    const comments = optional('word/comments.xml');
    const core = optional('docProps/core.xml');
    const documentRoot = parseXml(parts.get('word/document.xml') ?? '');

    return buildModel(documentRoot, sheet, numbering, {
      comments: comments ? comments.getElementsByTagNameNS(NS.w, 'comment').length : 0,
      title: first(core, NS.dc, 'title'),
      creator: first(core, NS.dc, 'creator'),
    });
  } catch (error) {
    if (error instanceof DocxError) throw error;
    // Битый XML или неожиданная структура: понятная ошибка вместо падения.
    throw new DocxError('broken', error instanceof XmlParseError ? 'xml' : String(error));
  }
}
