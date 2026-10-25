// Сообщения между страницей и Web Worker. Только простые данные: их копирует браузер.
import type { Report } from '../core/engine/index.ts';
import type { ParagraphRole } from '../core/model/types.ts';
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

// Карта документа: по абзацу роль, «пустой или нет» и длина. Текста здесь нет специально:
// карте он не нужен, а лишний раз гонять текст работы между потоками незачем.
export interface MapParagraph {
  index: number;
  role: ParagraphRole;
  empty: boolean;
  length: number;
}

export type CheckResponse =
  | { kind: 'check'; id: number; ok: true; report: Report; map: MapParagraph[] }
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
      map: MapParagraph[];
    }
  | { kind: 'fix'; id: number; ok: false; code: DocxErrorCode };

export type WorkerResponse = CheckResponse | FixResponse;
