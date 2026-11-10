// Проверка и исправление файла в отдельном потоке (бриф, раздел 4): пока Worker разбирает
// большой документ, страница отвечает на клики и прокрутку.
import { checkModel, type CheckOptions, type Report } from '../core/engine/index.ts';
import { fixDocx } from '../core/fixer/index.ts';
import type { Profile } from '../core/profiles/types.ts';
import { DocxError } from '../core/reader/errors.ts';
import { DEFAULT_LIMITS, readDocx } from '../core/reader/index.ts';
import type { CheckStep, MapParagraph, WorkerMessage, WorkerRequest } from './protocol.ts';

// То же, что checkDocx (checkModel(readDocx(bytes))), но модель остаётся у нас: после проверки
// у абзацев уже проставлены роли, и из них собирается карта документа.
function checkWithMap(
  bytes: Uint8Array,
  profile: Profile,
  options: CheckOptions,
  onStep?: (step: CheckStep) => void,
): { report: Report; map: MapParagraph[] } {
  const doc = readDocx(bytes, DEFAULT_LIMITS, onStep);
  const report = checkModel(doc, profile, options);
  onStep?.('rules');
  const map = doc.paragraphs.map((p) => ({
    index: p.index,
    role: p.role,
    empty: p.isEmpty,
    length: p.text.length,
  }));
  return { report, map };
}

const post = (message: WorkerMessage, transfer: Transferable[] = []): void => {
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
        // Каждый законченный этап сразу уходит странице: там отмечается шаг в списке.
        ...checkWithMap(bytes, request.profile, { fileName: request.fileName }, (step) => {
          post({ kind: 'progress', id: request.id, step });
        }),
      });
    } catch (error) {
      post({ kind: 'check', id: request.id, ok: false, code: codeOf(error) });
    }
    return;
  }
  try {
    const fixed = fixDocx(bytes, request.profile, request.ruleIds);
    const { report, map } = checkWithMap(fixed.bytes, request.profile, {
      fileName: request.fileName,
    });
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
        map,
      },
      [buffer],
    );
  } catch (error) {
    post({ kind: 'fix', id: request.id, ok: false, code: codeOf(error) });
  }
});
