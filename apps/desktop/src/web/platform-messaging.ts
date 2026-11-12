import { z } from 'zod';
import { platformTransport } from './platform-session.ts';

const id = z.string().min(1);
const text = z.string().nullable();
const page = z.object({ has_more: z.boolean(), next_cursor: id.nullable() }).refine(p => p.has_more === (p.next_cursor !== null));
const channel = z.object({ id, object: z.literal('channel'), name: z.string(), provider: z.string(), ai_active: z.boolean(), archived: z.boolean(),
  identity: z.object({ display_phone: text, handle: text }), connection: z.object({ status: z.enum(['connected', 'disconnected', 'error']), detail: text, checked_at: text }) });
const components = z.object({ header: z.object({ format: z.enum(['text', 'image', 'video', 'document']), text: z.string().optional(), media_id: id.optional() }).nullable(), body: z.object({ text: z.string(), examples: z.array(z.string()).optional() }), footer: z.object({ text: z.string() }).nullable() });
const template = z.object({ id, object: z.literal('template'), name: z.string(), language: z.string(), category: z.string(), status: z.string(), channel_ids: z.array(id), components, variables: z.array(z.object({ name: z.string(), component: z.string(), example: text.optional() })) });
const campaign = z.object({ id, object: z.literal('campaign'), name: z.string(), template_id: id, channel_id: id,
  status: z.enum(['draft', 'scheduled', 'running', 'paused', 'completed', 'cancelled', 'failed']), stats: z.record(z.string(), z.number().int().nonnegative()) });
const contact = z.object({ id, object: z.literal('contact'), name: text, phone: text, email: text, tags: z.array(z.string()), blocked: z.boolean(), ai_blocked: z.boolean() });
export type MessagingChannel = z.infer<typeof channel>;
export type MessagingTemplate = z.infer<typeof template>;
export type MessagingCampaign = z.infer<typeof campaign>;
export type MessagingContact = z.infer<typeof contact>;
export type TemplateDraft = { name: string; language: string; category: 'utility' | 'marketing' | 'authentication'; channel_ids: string[]; components: z.infer<typeof components> };
export type CampaignDraft = { name: string; channel_id: string; template_id: string; variables?: Record<string, { value: string }> };
export type ContactDraft = { name: string; phone?: string; email?: string | null };
export type CampaignAction = 'start' | 'schedule' | 'pause' | 'resume' | 'cancel';

export function platformMessaging(options: { origin: string; timeoutMs: number }, request: typeof fetch = fetch) {
  const { call, mutation } = platformTransport(options, request);
  const resource = (domain: string, value: string) => `messaging/${domain}/${encodeURIComponent(id.parse(value))}`;
  async function list<T>(domain: string, schema: z.ZodType<T>, cursor?: string, signal?: AbortSignal) {
    const query = new URLSearchParams({ limit: '30' });
    if (cursor) query.set('cursor', cursor);
    return z.object({ data: z.array(schema), page }).parse(await (await call(`messaging/${domain}?${query}`, { signal })).json());
  }
  async function write(path: string, body: unknown, key: string, method = 'POST', signal?: AbortSignal) {
    const response = await mutation(path, { method, signal,
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': id.max(255).parse(key) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (response.status === 204) return null;
    const raw = await response.text();
    return raw ? JSON.parse(raw) as unknown : null;
  }
  return {
    channels: (cursor?: string, signal?: AbortSignal) => list('channels', channel, cursor, signal),
    templates: (cursor?: string, signal?: AbortSignal) => list('templates', template, cursor, signal),
    campaigns: (cursor?: string, signal?: AbortSignal) => list('campaigns', campaign, cursor, signal),
    contacts: (cursor?: string, signal?: AbortSignal) => list('contacts', contact, cursor, signal),
    async saveContact(body: ContactDraft, key: string, value?: string, signal?: AbortSignal) {
      return contact.parse(await write(value ? resource('contacts', value) : 'messaging/contacts', body, key, value ? 'PATCH' : 'POST', signal));
    },
    async saveTemplate(body: TemplateDraft, key: string, value?: string, signal?: AbortSignal) {
      return template.parse(await write(value ? resource('templates', value) : 'messaging/templates', body, key, value ? 'PATCH' : 'POST', signal));
    },
    async submitTemplate(value: string, key: string, signal?: AbortSignal) { return template.parse(await write(`${resource('templates', value)}/submit`, {}, key, 'POST', signal)); },
    async deleteTemplate(value: string, key: string, signal?: AbortSignal) { await write(resource('templates', value), undefined, key, 'DELETE', signal); },
    async syncTemplates(key: string, signal?: AbortSignal) { await write('messaging/templates/sync', {}, key, 'POST', signal); },
    async createCampaign(body: CampaignDraft, key: string, signal?: AbortSignal) { return campaign.parse(await write('messaging/campaigns', body, key, 'POST', signal)); },
    async campaignAction(value: string, action: CampaignAction, body: { send_at?: string }, key: string, signal?: AbortSignal) {
      return campaign.parse(await write(`${resource('campaigns', value)}/${action}`, body, key, 'POST', signal));
    },
    async audience(value: string, contacts: string[], key: string, signal?: AbortSignal) {
      return z.object({ added: z.number().int().nonnegative(), skipped: z.number().int().nonnegative(), audience_size: z.number().int().nonnegative() })
        .parse(await write(`${resource('campaigns', value)}/audience`, { contact_ids: contacts }, key, 'POST', signal));
    },
  };
}
