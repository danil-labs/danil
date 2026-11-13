import { z } from 'zod';
import { PlatformSessionError, platformTransport } from './platform-session.ts';

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

export type MessagingOperation<T = unknown> = {
  readonly method: 'POST' | 'PATCH' | 'DELETE'; readonly resource: string; readonly body: string | undefined;
  execute(key: string, signal?: AbortSignal): Promise<T>;
};
export type MessagingIntents = Map<string, { operation: MessagingOperation; key: string; uncertain: boolean }>;

export async function runMessagingOperation<T>(intents: MessagingIntents, operation: MessagingOperation<T>, signal?: AbortSignal): Promise<T> {
  const identity = JSON.stringify([operation.method, operation.resource, operation.body]);
  const previous = intents.get(identity);
  const pending = previous ?? { operation, key: crypto.randomUUID(), uncertain: false };
  // A denial on a later attempt cannot disprove the effect of an earlier attempt.
  if (previous) pending.uncertain = true;
  intents.set(identity, pending);
  try {
    const result = await operation.execute(pending.key, signal);
    intents.delete(identity);
    return result;
  } catch (cause) {
    const rejected = cause instanceof PlatformSessionError && cause.status >= 400 && cause.status < 500 && ![408, 429].includes(cause.status) && (cause.status !== 409 || cause.code !== 'idempotency_in_progress');
    if (rejected && !pending.uncertain) intents.delete(identity);
    else pending.uncertain = true;
    throw cause;
  }
}

export function platformMessaging(options: { origin: string; timeoutMs: number }, request: typeof fetch = fetch) {
  const { call, mutation } = platformTransport(options, request);
  const resource = (domain: string, value: string) => `messaging/${domain}/${encodeURIComponent(id.parse(value))}`;
  async function list<T>(domain: string, schema: z.ZodType<T>, cursor?: string, signal?: AbortSignal) {
    const query = new URLSearchParams({ limit: '30' });
    if (cursor) query.set('cursor', cursor);
    return z.object({ data: z.array(schema), page }).parse(await (await call(`messaging/${domain}?${query}`, { signal })).json());
  }
  async function write(path: string, body: string | undefined, key: string, method: string, signal?: AbortSignal) {
    const response = await mutation(path, { method, signal,
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': id.max(255).parse(key) },
      ...(body === undefined ? {} : { body }),
    });
    if (response.status === 204) return null;
    const raw = await response.text();
    return raw ? JSON.parse(raw) as unknown : null;
  }
  function operation<T>(resource: string, body: unknown, schema: z.ZodType<T>, method: MessagingOperation['method'] = 'POST'): MessagingOperation<T> {
    const serialized = JSON.stringify(body);
    return { method, resource, body: serialized, async execute(key, signal) { return schema.parse(await write(resource, serialized, key, method, signal)); } };
  }
  const audience = z.object({ added: z.number().int().nonnegative(), skipped: z.number().int().nonnegative(), audience_size: z.number().int().nonnegative() });
  const operations = {
    saveContact: (body: ContactDraft, value?: string) => operation(value ? resource('contacts', value) : 'messaging/contacts', body, contact, value ? 'PATCH' : 'POST'),
    saveTemplate: (body: TemplateDraft, value?: string) => operation(value ? resource('templates', value) : 'messaging/templates', body, template, value ? 'PATCH' : 'POST'),
    submitTemplate: (value: string) => operation(`${resource('templates', value)}/submit`, {}, template),
    deleteTemplate: (value: string) => operation(resource('templates', value), undefined, z.null(), 'DELETE'),
    syncTemplates: () => operation('messaging/templates/sync', {}, z.null()),
    createCampaign: (body: CampaignDraft) => operation('messaging/campaigns', body, campaign),
    campaignAction: (value: string, action: CampaignAction, body: { send_at?: string }) => operation(`${resource('campaigns', value)}/${action}`, body, campaign),
    audience: (value: string, contacts: string[]) => operation(`${resource('campaigns', value)}/audience`, { contact_ids: contacts }, audience),
  };
  return {
    operations,
    channels: (cursor?: string, signal?: AbortSignal) => list('channels', channel, cursor, signal),
    templates: (cursor?: string, signal?: AbortSignal) => list('templates', template, cursor, signal),
    campaigns: (cursor?: string, signal?: AbortSignal) => list('campaigns', campaign, cursor, signal),
    contacts: (cursor?: string, signal?: AbortSignal) => list('contacts', contact, cursor, signal),
    saveContact: (body: ContactDraft, key: string, value?: string, signal?: AbortSignal) => operations.saveContact(body, value).execute(key, signal),
    saveTemplate: (body: TemplateDraft, key: string, value?: string, signal?: AbortSignal) => operations.saveTemplate(body, value).execute(key, signal),
    submitTemplate: (value: string, key: string, signal?: AbortSignal) => operations.submitTemplate(value).execute(key, signal),
    async deleteTemplate(value: string, key: string, signal?: AbortSignal) { await operations.deleteTemplate(value).execute(key, signal); },
    async syncTemplates(key: string, signal?: AbortSignal) { await operations.syncTemplates().execute(key, signal); },
    createCampaign: (body: CampaignDraft, key: string, signal?: AbortSignal) => operations.createCampaign(body).execute(key, signal),
    campaignAction: (value: string, action: CampaignAction, body: { send_at?: string }, key: string, signal?: AbortSignal) => operations.campaignAction(value, action, body).execute(key, signal),
    audience: (value: string, contacts: string[], key: string, signal?: AbortSignal) => operations.audience(value, contacts).execute(key, signal),
  };
}
