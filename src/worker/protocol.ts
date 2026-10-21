// Сообщения между страницей и Web Worker. Только простые данные: их копирует браузер.
import type { Report } from '../core/engine/index.ts';
import type { Profile } from '../core/profiles/types.ts';
import type { DocxErrorCode } from '../core/reader/errors.ts';

export interface CheckRequest {
  id: number;
  bytes: ArrayBuffer;
  profile: Profile;
}

export type CheckResponse =
  { id: number; ok: true; report: Report } | { id: number; ok: false; code: DocxErrorCode };
