// Проверка и исправление файла в отдельном потоке (бриф, раздел 4): пока Worker разбирает
// большой документ, страница отвечает на клики и прокрутку.
import { checkDocx } from '../core/engine/index.ts';
import { fixDocx } from '../core/fixer/index.ts';
import { DocxError } from '../core/reader/errors.ts';
import type { WorkerRequest, WorkerResponse } from './protocol.ts';

const post = (message: WorkerResponse, transfer: Transferable[] = []): void => {
  self.postMessage(message, { transfer });
};

const codeOf = (error: unknown) => (error instanceof DocxError ? error.code : 'broken');

self.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  const bytes = new Uint8Array(request.bytes);
  // Ни одно исключение не уходит необработанным: страница всегда получает ответ.
  if (request.kind === 'check') {
    try {
      post({
        kind: 'check',
        id: request.id,
        ok: true,
        report: checkDocx(bytes, request.profile, { fileName: request.fileName }),
      });
    } catch (error) {
      post({ kind: 'check', id: request.id, ok: false, code: codeOf(error) });
    }
    return;
  }
  try {
    const fixed = fixDocx(bytes, request.profile, request.ruleIds);
    const report = checkDocx(fixed.bytes, request.profile, { fileName: request.fileName });
    const buffer = fixed.bytes.buffer.slice(
      fixed.bytes.byteOffset,
      fixed.bytes.byteOffset + fixed.bytes.byteLength,
    ) as ArrayBuffer;
    post(
      {
        kind: 'fix',
        id: request.id,
        ok: true,
        bytes: buffer,
        applied: fixed.applied,
        notes: fixed.notes,
        report,
      },
      [buffer],
    );
  } catch (error) {
    post({ kind: 'fix', id: request.id, ok: false, code: codeOf(error) });
  }
});
