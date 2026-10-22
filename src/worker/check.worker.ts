// Проверка файла в отдельном потоке (бриф, раздел 4): пока Worker разбирает большой
// документ, страница отвечает на клики и прокрутку.
import { checkDocx } from '../core/engine/index.ts';
import { DocxError } from '../core/reader/errors.ts';
import type { CheckRequest, CheckResponse } from './protocol.ts';

const post = (message: CheckResponse): void => {
  self.postMessage(message);
};

self.addEventListener('message', (event: MessageEvent<CheckRequest>) => {
  const { id, bytes, profile, fileName } = event.data;
  try {
    post({ id, ok: true, report: checkDocx(new Uint8Array(bytes), profile, { fileName }) });
  } catch (error) {
    // Ни одно исключение не уходит необработанным: страница всегда получает ответ.
    post({ id, ok: false, code: error instanceof DocxError ? error.code : 'broken' });
  }
});
