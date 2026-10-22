// Распаковка .docx (это zip-архив) с защитой от «zip-бомб».
//
// Почему fflate безопасен: при распаковке он создаёт буфер ровно того размера,
// который записан в оглавлении архива, и не растит его. Поэтому достаточно
// проверить записанные размеры ДО распаковки: подделанный маленький размер даст
// обрезанный (битый) XML, но не съест память.
import { unzipSync } from 'fflate';
import { DocxError } from './errors.ts';

export interface ArchiveLimits {
  maxFileBytes: number;
  maxEntries: number;
  maxEntryBytes: number;
  maxTotalBytes: number;
}

export const DEFAULT_LIMITS: ArchiveLimits = {
  maxFileBytes: 25 * 1024 * 1024,
  maxEntries: 2000,
  maxEntryBytes: 100 * 1024 * 1024,
  maxTotalBytes: 200 * 1024 * 1024,
};

// Нам нужны только XML-части; картинки не распаковываем вовсе.
const WANTED = [
  /^\[Content_Types\]\.xml$/,
  /^_rels\/\.rels$/,
  /^word\/[^/]+\.xml$/,
  /^word\/theme\/theme\d*\.xml$/,
  /^word\/_rels\/[^/]+\.rels$/,
  /^docProps\/core\.xml$/,
];
const ODT_MARKERS = ['mimetype', 'content.xml', 'META-INF/manifest.xml'];

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  return signature.every((byte, i) => bytes[i] === byte);
}

// Узнаём формат по первым байтам, а не по расширению: расширение можно переименовать.
function detectByMagic(bytes: Uint8Array): void {
  if (bytes.length === 0) throw new DocxError('empty');
  if (startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0])) throw new DocxError('doc-or-encrypted');
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46])) throw new DocxError('pdf'); // %PDF
  if (startsWith(bytes, [0x7b, 0x5c, 0x72, 0x74, 0x66])) throw new DocxError('rtf'); // {\rtf
  if (!startsWith(bytes, [0x50, 0x4b])) throw new DocxError('not-docx'); // PK
}

export function readArchive(bytes: Uint8Array, limits = DEFAULT_LIMITS): Map<string, string> {
  if (bytes.length > limits.maxFileBytes) throw new DocxError('too-large');
  detectByMagic(bytes);

  let entries = 0;
  let total = 0;
  // Объект, а не let: TypeScript не видит, что фильтр меняет переменную.
  const seen = { odt: false };
  let raw: Record<string, Uint8Array>;
  try {
    raw = unzipSync(bytes, {
      filter: (file) => {
        entries += 1;
        total += file.originalSize;
        if (ODT_MARKERS.includes(file.name)) seen.odt = true;
        if (
          entries > limits.maxEntries ||
          total > limits.maxTotalBytes ||
          file.originalSize > limits.maxEntryBytes
        ) {
          throw new DocxError('zip-limits');
        }
        return WANTED.some((pattern) => pattern.test(file.name));
      },
    });
  } catch (error) {
    if (error instanceof DocxError) throw error;
    throw new DocxError('broken', 'zip');
  }

  const decoder = new TextDecoder('utf-8');
  const parts = new Map<string, string>();
  for (const [name, data] of Object.entries(raw)) parts.set(name, decoder.decode(data));

  if (!parts.has('word/document.xml')) {
    throw new DocxError(seen.odt ? 'odt' : parts.size === 0 ? 'not-docx' : 'no-document');
  }
  return parts;
}

// Для автоисправления нужен весь архив (картинки тоже), чтобы собрать новый файл,
// не потеряв ни одной части. Лимиты те же, что при чтении.
export function readAllEntries(
  bytes: Uint8Array,
  limits = DEFAULT_LIMITS,
): Record<string, Uint8Array> {
  if (bytes.length > limits.maxFileBytes) throw new DocxError('too-large');
  detectByMagic(bytes);
  let entries = 0;
  let total = 0;
  try {
    return unzipSync(bytes, {
      filter: (file) => {
        entries += 1;
        total += file.originalSize;
        if (
          entries > limits.maxEntries ||
          total > limits.maxTotalBytes ||
          file.originalSize > limits.maxEntryBytes
        )
          throw new DocxError('zip-limits');
        return true;
      },
    });
  } catch (error) {
    if (error instanceof DocxError) throw error;
    throw new DocxError('broken', 'zip');
  }
}
