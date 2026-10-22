// Обёртка над Web Worker: каждый запрос получает номер, ответ находит свой запрос по номеру.
// Так страница может отправить несколько проверок сразу (режим учителя) и не перепутать ответы.
import type { Profile } from '../core/profiles/types.ts';
import type {
  CheckResponse,
  FixResponse,
  WorkerRequest,
  WorkerResponse,
} from '../worker/protocol.ts';

const worker = new Worker(new URL('../worker/check.worker.ts', import.meta.url), {
  type: 'module',
});
const pending = new Map<number, (response: WorkerResponse) => void>();
let nextId = 0;

worker.addEventListener('message', (event: MessageEvent<WorkerResponse>) => {
  pending.get(event.data.id)?.(event.data);
  pending.delete(event.data.id);
});

// Если Worker упал целиком, все ожидающие запросы получают «файл не читается».
worker.addEventListener('error', () => {
  for (const [id, resolve] of pending) resolve({ kind: 'check', id, ok: false, code: 'broken' });
  pending.clear();
});

function send<T extends WorkerResponse>(request: WorkerRequest): Promise<T> {
  return new Promise((resolve) => {
    pending.set(request.id, resolve as (response: WorkerResponse) => void);
    // Буфер отдаём Worker'у «насовсем» (transfer): так не тратится время на копирование.
    worker.postMessage(request, [request.bytes]);
  });
}

export function check(
  bytes: ArrayBuffer,
  profile: Profile,
  fileName: string,
): Promise<CheckResponse> {
  nextId += 1;
  return send({ kind: 'check', id: nextId, bytes: bytes.slice(0), profile, fileName });
}

export function fix(
  bytes: ArrayBuffer,
  profile: Profile,
  fileName: string,
  ruleIds: string[],
): Promise<FixResponse> {
  nextId += 1;
  return send({ kind: 'fix', id: nextId, bytes: bytes.slice(0), profile, fileName, ruleIds });
}
