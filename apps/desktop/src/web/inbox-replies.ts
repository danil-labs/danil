import { ReplyError } from '../../../../packages/attention/src/messaging.ts';
import { PlatformSessionError } from './platform-session.ts';

function pause(ms: number, signal: AbortSignal) {
  signal.throwIfAborted();
  return new Promise<void>((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
    signal.addEventListener('abort', abort, { once: true });
  });
}

/** One unresolved operation per conversation; rereading never replaces its identity. */
export function inboxReplies(api: { reply(id: string, text: string, key: string, signal: AbortSignal): Promise<unknown> }, clock = { now: Date.now, random: Math.random, pause }) {
  const operations = new Map<string, { text: string; key: string; attempt: number; retryAt: number; running: boolean }>();
  return async (id: string, text: string, clientId: string, signal: AbortSignal) => {
    const content = text.trim();
    let operation = operations.get(id);
    if (operation && (operation.text !== content || operation.running)) throw new ReplyError('uncertain');
    if (!operation) { operation = { text: content, key: clientId, attempt: 0, retryAt: 0, running: false }; operations.set(id, operation); }
    operation.running = true;
    try {
      // Three polling attempts per action; exhausting them keeps the operation for reconciliation.
      for (let round = 0; round < 3; round++) {
        signal.throwIfAborted();
        if (operation.retryAt > clock.now()) await clock.pause(operation.retryAt - clock.now(), signal);
        try {
          await api.reply(id, operation.text, operation.key, signal);
          operations.delete(id);
          return { requiresTemplate: false, duplicate: false };
        } catch (cause) {
          const ongoing = cause instanceof PlatformSessionError && cause.status === 409 && cause.code === 'idempotency_in_progress';
          if (cause instanceof PlatformSessionError && cause.status < 500 && ![408, 429].includes(cause.status) && !ongoing) {
            operations.delete(id);
            if (cause.code === 'outside_messaging_window') return { requiresTemplate: true, duplicate: false };
            throw new ReplyError(cause.code ?? 'rejected', cause.status);
          }
          const retryAfter = cause instanceof PlatformSessionError ? cause.retryAfter : null;
          const seconds = retryAfter === null ? 0 : Number(retryAfter);
          const serverDelay = Number.isFinite(seconds) ? Math.max(0, seconds * 1000) : Math.max(0, Date.parse(retryAfter ?? '') - clock.now()) || 0;
          const delay = Math.min(1000 * 2 ** Math.min(operation.attempt++, 5), 30_000) * (.5 + clock.random() * .5);
          operation.retryAt = clock.now() + Math.max(delay, serverDelay);
          if (!ongoing) throw new ReplyError('uncertain');
        }
      }
      throw new ReplyError('uncertain');
    } finally { operation.running = false; }
  };
}
