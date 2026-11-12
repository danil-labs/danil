import type { Conversation, Message } from '../../../../packages/attention/src/inbox.ts';
import { z } from 'zod';
import { platformTransport } from './platform-session.ts';

const id = z.string().min(1);
const date = z.iso.datetime({ offset: true });
const direction = z.enum(['inbound', 'outbound']);
const kind = z.enum(['text', 'image', 'audio', 'video', 'document', 'sticker', 'location', 'contacts', 'template', 'reaction', 'system']);
const conversation = z.object({
  id, object: z.literal('conversation'), contact: z.object({ id, name: z.string().nullable(), phone: z.string().nullable() }),
  channel_id: id, status: z.enum(['open', 'closed']), ai_enabled: z.boolean(), unread_count: z.number().int().nonnegative(), created_at: date,
  last_message: z.object({ id, direction, kind, text: z.string().nullable().optional(), created_at: date }).nullable().optional(),
});
const message = z.object({
  id, object: z.literal('message'), conversation_id: id, direction,
  author: z.object({ type: z.enum(['contact', 'ai', 'person', 'campaign', 'system']), person_id: id.nullable().optional(), name: z.string().nullable().optional() }),
  kind, text: z.string().nullable().optional(), created_at: date,
});
const send = z.object({
  id, object: z.literal('message_send'), status: z.enum(['queued', 'dispatching', 'sent', 'delivered', 'read', 'failed']),
  contact_id: id, channel_id: id, conversation_id: id.nullable().optional(), created_at: date,
});
const page = z.object({ has_more: z.boolean(), next_cursor: id.nullable() })
  .refine(p => p.has_more ? p.next_cursor !== null : p.next_cursor === null);
const conversations = z.object({ data: z.array(conversation), page });
const messages = z.object({ data: z.array(message), page });
export type InboxConversation = z.infer<typeof conversation>;
export type InboxMessage = z.infer<typeof message>;

/** The whole inbox uses this cookie-only transport; a failure never switches writers. */
export function platformInbox(options: { origin: string; timeoutMs: number }, request: typeof fetch = fetch) {
  const { call, mutation } = platformTransport(options, request);
  const path = (conversation: string) => `messaging/conversations/${encodeURIComponent(id.parse(conversation))}/messages`;
  const query = (cursor?: string) => `?limit=30${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
  return {
    async conversations(cursor?: string, signal?: AbortSignal) {
      return conversations.parse(await (await call(`messaging/conversations${query(cursor)}`, { signal })).json());
    },
    async messages(conversation: string, cursor?: string, signal?: AbortSignal) {
      const result = messages.parse(await (await call(`${path(conversation)}${query(cursor)}`, { signal })).json());
      if (result.data.some(row => row.conversation_id !== conversation)) throw new Error('invalid_scope');
      return result;
    },
    async reply(conversation: string, text: string, clientMessageId: string, signal?: AbortSignal) {
      const response = await mutation(path(conversation), {
        signal, headers: { 'Content-Type': 'application/json', 'Idempotency-Key': z.string().min(1).max(255).parse(clientMessageId) },
        body: JSON.stringify({ text }),
      });
      if (response.status !== 202) throw new Error('invalid_response');
      return send.parse(await response.json());
    },
  };
}

export function inboxConversation(row: InboxConversation, workspace: string): Conversation<string> {
  return { id: row.id, account_id: workspace, contact_name: row.contact.name ?? '', contact_phone: row.contact.phone ?? '',
    channel_name: '', last_message: row.last_message?.text ?? '', last_message_at: row.last_message?.created_at ?? null,
    ai_assistance: row.ai_enabled, unread_count: row.unread_count };
}

export function inboxMessage(row: InboxMessage): Message<string> {
  return { id: row.id, conversation_id: row.conversation_id, content: row.text ?? null, direction: row.direction,
    sender_type: row.author.type === 'person' ? 'human-agent' : row.author.type === 'ai' ? 'ai-agent' : row.author.type };
}
