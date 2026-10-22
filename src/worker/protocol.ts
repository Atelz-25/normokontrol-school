// Сообщения между страницей и Web Worker. Только простые данные: их копирует браузер.
import type { Report } from '../core/engine/index.ts';
import type { Profile } from '../core/profiles/types.ts';
import type { DocxErrorCode } from '../core/reader/errors.ts';

export type WorkerRequest =
  | { kind: 'check'; id: number; bytes: ArrayBuffer; profile: Profile; fileName: string }
  | {
      kind: 'fix';
      id: number;
      bytes: ArrayBuffer;
      profile: Profile;
      fileName: string;
      ruleIds: string[];
    };

export type CheckResponse =
  | { kind: 'check'; id: number; ok: true; report: Report }
  | { kind: 'check'; id: number; ok: false; code: DocxErrorCode };

export type FixResponse =
  | {
      kind: 'fix';
      id: number;
      ok: true;
      bytes: ArrayBuffer; // исправленный файл
      applied: Record<string, number>;
      notes: string[];
      report: Report; // проверка исправленного файла
    }
  | { kind: 'fix'; id: number; ok: false; code: DocxErrorCode };

export type WorkerResponse = CheckResponse | FixResponse;
