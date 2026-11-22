import type { InboxSession } from './inbox.ts';

export class ReplyError extends Error {
  readonly code: string;
  readonly status?: number;
  constructor(code: string, status?: number) { super(code); this.code = code; this.status = status; }
}

/** Aceptación en cola; nunca una confirmación de entrega ni un mensaje local. */
export function createMessaging(
  session: InboxSession, request: typeof fetch = fetch, prefix = '/terminus/alpha-api'
) {
  return {
    async reply(conversation: number, text: string, clientMessageId: string, signal?: AbortSignal): Promise<{ requiresTemplate: boolean; duplicate: boolean }> {
      if (!Number.isSafeInteger(conversation) || conversation <= 0 || !text.trim() || text.trim().length > 4096 || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(clientMessageId)) throw new ReplyError('invalid_body');
      const token = await session.getToken();
      signal?.throwIfAborted();
      let response: Response;
      try {
        response = await request(`${prefix}/api/messaging/reply`, {
          method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ conversation_id: conversation, text: text.trim(), client_message_id: clientMessageId }), cache: 'no-store',
          signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(30_000)]) : AbortSignal.timeout(30_000),
        });
      } catch { throw new ReplyError('uncertain'); }
      if (!response.ok) {
        let code = '';
        try {
          const data = await response.json();
          code = typeof data?.detail === 'object' ? data.detail?.error : data?.error;
        } catch { /* El estado HTTP conserva el rechazo aunque no haya JSON. */ }
        throw new ReplyError(response.status >= 500 ? 'uncertain' : code || 'rejected', response.status);
      }
      let data;
      try { data = await response.json(); } catch { throw new ReplyError('uncertain'); }
      if (!data || !['pending', 'duplicate'].includes(data.status) || (data.outgoing_id !== undefined && (!Number.isSafeInteger(data.outgoing_id) || data.outgoing_id <= 0))) throw new ReplyError('uncertain');
      return { requiresTemplate: data.requires_template === true, duplicate: data.status === 'duplicate' };
    },
  };
}
