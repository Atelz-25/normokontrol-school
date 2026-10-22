// Профиль в ссылке: #profile=… (бриф, раздел 7). Часть адреса после «#» браузер
// не отправляет на сервер, поэтому профиль остаётся у пользователя.
//
// JSON профиля сжимаем (deflate из fflate, он уже есть для .docx) и записываем в base64url —
// вариант base64 без символов «+», «/» и «=», которые в адресе пришлось бы экранировать.
import { deflateSync, inflateSync, strFromU8, strToU8 } from 'fflate';
import type { Profile } from './types.ts';

const PREFIX = 'profile=';

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array {
  const base64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

export function profileToHash(profile: Profile): string {
  return `#${PREFIX}${toBase64Url(deflateSync(strToU8(JSON.stringify(profile)), { level: 9 }))}`;
}

// Возвращает разобранный JSON (его ещё надо проверить loadProfile) или undefined, если ссылка битая.
export function profileFromHash(hash: string): unknown {
  const value = hash.replace(/^#/, '');
  if (!value.startsWith(PREFIX)) return undefined;
  try {
    return JSON.parse(strFromU8(inflateSync(fromBase64Url(value.slice(PREFIX.length))))) as unknown;
  } catch {
    return undefined;
  }
}
