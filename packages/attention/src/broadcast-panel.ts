import { canManageBroadcast, createBroadcasts, type BroadcastPermissions } from './broadcasts.ts';
import type { InboxSession } from './inbox.ts';

// El panel completo de Difusiones: contrato y reglas de Appv2 (`features/marketing`), sin texto.
// Crear y operar campañas pasa por `createBroadcasts`, que guarda la incertidumbre de cada escritura.
// El BFF responde siempre por la cuenta activa del JWT.

export const CAMPAIGN_STATUSES = ['draft', 'scheduled', 'running', 'paused', 'cancelled', 'completed', 'failed'] as const;
export type CampaignStatus = typeof CAMPAIGN_STATUSES[number];
export type Campaign = { id: number; template_id: number | null; channel_id: number | null; name: string; status: CampaignStatus };
export type StatusOut = { id: number; status: CampaignStatus };
export type CampaignStats = { by_process_status: Record<string, number>; by_delivery_status: Record<string, number>; responded: number; total: number };
/** `phone` llega ya enmascarado: el número completo no pasa de este módulo. */
export type Recipient = { id: number; contact_account_id: number; name: string | null; phone: string | null; status: string; status_detail: string | null; delivery_status: string | null; delivery_error_code: string | number | null; delivery_error_message: string | null };
export type Rejection = { contact_account_id: number | null; reason: string };
export type AddContactsResult = { added: number; requested: number; rejected: Rejection[] };
export type Template = { id: number; name: string; category: string | null; language: string | null; status: string; waba_id: string | null; components: unknown; rejection_reason: string | null };
export type TemplateChannel = { id: number; name: string | null; provider: string; active: boolean };
export type TemplateSyncResult = { wabas: number; imported: number; updated: number; marked_deleted: number; unchanged: number };
export type HeaderFormat = 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT';
export type TemplateHeader = { format: HeaderFormat; text: string | null; media_url: string | null };
export type TemplateContent = { header: TemplateHeader | null; body: { text: string }; footer: { text: string } | null };
export type TemplateInput = TemplateContent & { channel_id: number; name: string; category: 'MARKETING' | 'UTILITY'; language: string };
export type CampaignInput = { template_id: number; channel_id: number; name: string; variable_mapping?: Record<string, string> };
/** `phone` enmascarado; `sendable` dice si tiene teléfono aunque no alcance para enmascarar. */
export type Contact = { id: number; name: string | null; email: string | null; phone: string | null; sendable: boolean; tags: string[]; last_active_at: string | null };
export { canManageBroadcast, type BroadcastPermissions };

/** Lo que cada cliente inyecta. Es un punto de inyección, no una frontera: el preflight y los cuerpos cerrados viven en la entrada que hay detrás de `prefix`. */
export type BroadcastSource = {
  /** Estable mientras dure: los candados de escrituras inciertas se guardan por sesión. */
  session: InboxSession & { subscribe?: (clear: () => void) => () => void };
  request: typeof fetch;
  prefix: string;
  /** Pista de interfaz para plantillas y medios; no autoriza nada. */
  writes: boolean;
  /** Pista de interfaz para lo que llega a clientes; no autoriza nada. */
  delivery: boolean;
  demo: boolean;
  /** La cuenta del mismo token que usa `session`; null si no tiene ninguna. */
  account: () => Promise<number | null>;
};

export class BroadcastPanelError extends Error {
  readonly status: number;
  readonly code?: string;
  constructor(message: string, status: number, code?: string) { super(message); this.name = 'BroadcastPanelError'; this.status = status; this.code = code; }
}

const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid_response');
  return value as Record<string, unknown>;
};
const id = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) throw new Error('invalid_response');
  return value;
};
const whole = (value: unknown): number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0;
const text = (value: unknown): string | null => typeof value === 'string' ? value : null;
const required = (value: unknown): string => {
  if (typeof value !== 'string') throw new Error('invalid_response');
  return value;
};
const list = (value: unknown): unknown[] => {
  if (!Array.isArray(value)) throw new Error('invalid_response');
  return value;
};
const counts = (value: unknown): Record<string, number> => Object.fromEntries(Object.entries(object(value)).map(([key, n]) => [key, whole(n)]));

/** `••••1234`: basta para distinguir contactos parecidos sin mostrar el número. */
export function maskPhone(phone: string | null | undefined): string | null {
  const digits = (phone ?? '').replace(/\D/g, '');
  return digits.length < 4 ? null : `••••${digits.slice(-4)}`;
}

/** Tolera las dos formas de `contact_accounts.tags`: `{items:[{label}]}` y el arreglo antiguo. */
export function contactTagLabels(tags: unknown): string[] {
  const items = Array.isArray(tags) ? tags : tags && typeof tags === 'object' && Array.isArray((tags as { items?: unknown }).items) ? (tags as { items: unknown[] }).items : [];
  const labels = items.map(item => typeof item === 'string' ? item : item && typeof item === 'object' ? (item as { label?: unknown }).label : null);
  return [...new Set(labels.flatMap(label => typeof label === 'string' && label.trim() ? [label.trim()] : []))];
}

const template = (value: unknown): Template => {
  const row = object(value);
  return { id: id(row.id), name: required(row.name), category: text(row.category), language: text(row.language), status: required(row.status), waba_id: text(row.waba_id), components: row.components, rejection_reason: text(row.rejection_reason) };
};
const recipient = (value: unknown): Recipient => {
  const row = object(value);
  const code = row.delivery_error_code;
  return { id: id(row.id), contact_account_id: id(row.contact_account_id), name: text(row.name), phone: maskPhone(text(row.phone)), status: required(row.status), status_detail: text(row.status_detail), delivery_status: text(row.delivery_status), delivery_error_code: typeof code === 'string' || typeof code === 'number' ? code : null, delivery_error_message: text(row.delivery_error_message) };
};
const contact = (value: unknown): Contact => {
  const row = object(value);
  const phone = text(row.phone);
  return { id: id(row.id), name: text(row.name), email: text(row.email), phone: maskPhone(phone), sendable: !!phone?.trim(), tags: contactTagLabels(row.tags), last_active_at: text(row.last_active_at) };
};

async function failure(response: Response): Promise<BroadcastPanelError> {
  let body: unknown;
  try { body = await response.json(); } catch { body = undefined; }
  const data = body && typeof body === 'object' ? body as { detail?: unknown; error?: unknown } : {};
  const detail = data.detail && typeof data.detail === 'object' ? data.detail as { detail?: unknown; error?: unknown } : null;
  const code = text(detail?.error) ?? text(data.error) ?? undefined;
  return new BroadcastPanelError(text(data.detail) || text(detail?.detail) || code || `HTTP ${response.status}`, response.status, code);
}

/** `writes` y `delivery` apagados cortan aquí, antes de la red. Borradores, pausa y cancelación no dependen de ellos. */
export function createBroadcastPanel(source: Pick<BroadcastSource, 'session' | 'request' | 'prefix' | 'writes' | 'delivery' | 'account'>) {
  const { session, request, prefix, writes, delivery } = source;
  const core = createBroadcasts(session, request, prefix);
  const active = async () => {
    const account = await source.account();
    if (account === null) throw new BroadcastPanelError('missing_active_account', 403, 'missing_active_account');
    return account;
  };
  const guard = () => { if (!writes) throw new BroadcastPanelError('writes_disabled', 403, 'writes_disabled'); };
  const guardDelivery = () => { if (!delivery) throw new BroadcastPanelError('writes_disabled', 403, 'writes_disabled'); };
  async function call(path: string, init: RequestInit = {}) {
    const attempt = async () => request(`${prefix}${path}`, { ...init, headers: { ...init.headers, Authorization: `Bearer ${await session.getToken()}` }, cache: 'no-store' });
    let response = await attempt();
    if (response.status === 401 && (init.method ?? 'GET') === 'GET' && await session.unauthorized()) response = await attempt();
    if (!response.ok) throw await failure(response);
    return response;
  }
  const get = async (path: string) => object(await (await call(path)).json());
  // La entrada exige `account_id` en las rutas de marketing y lo coteja con el token.
  const scoped = async (path: string) => get(`${path}${path.includes('?') ? '&' : '?'}account_id=${await active()}`);
  async function write(method: 'POST' | 'PATCH' | 'DELETE', path: string, body?: unknown) {
    guard();
    const payload = body === undefined ? {} : body instanceof FormData ? { body } : { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } };
    return call(path, { method, ...payload });
  }
  const post = async (path: string, body?: unknown) => object(await (await write('POST', path, body)).json());
  const operate = async (campaignId: number, action: 'start' | 'pause' | 'resume' | 'cancel' | 'schedule', scheduledAt?: string) => core.transition(await active(), id(campaignId), action, scheduledAt);
  return {
    writes,
    delivery,
    async account(account: number): Promise<string | null> {
      const accounts = list(object((await get('/auth/profile')).user).accounts ?? []);
      return accounts.map(object).find(row => row.id === account)?.name as string | undefined ?? null;
    },
    async features(account: number): Promise<string[]> { return list((await get(`/auth/account/features?account_id=${id(account)}`)).features).filter((row): row is string => typeof row === 'string'); },
    permissions: (account: number): Promise<BroadcastPermissions> => core.permissions(account),
    async campaigns(): Promise<Campaign[]> { return core.list(await active()); },
    /** Si una escritura quedó sin confirmar en esa cuenta y recurso. Sobrevive al remontaje. */
    blocked: (account: number, resource: string) => core.blocked(account, resource),
    /** Solo la persona la pide, después de ver el aviso: un sondeo no puede liberar un candado. */
    async reconcile(campaignId?: number) {
      const account = await active();
      await core.list(account, undefined, true);
      if (campaignId !== undefined) await core.stats(account, campaignId, undefined, true);
    },
    async stats(campaignId: number): Promise<CampaignStats> {
      const data = await scoped(`/api/marketing/campaigns/${id(campaignId)}/stats`);
      return { by_process_status: counts(data.by_process_status), by_delivery_status: counts(data.by_delivery_status), responded: whole(data.responded), total: whole(data.total) };
    },
    async recipients(campaignId: number): Promise<Recipient[]> { return list((await get(`/api/marketing/campaigns/${id(campaignId)}/messages?limit=200&offset=0`)).items).map(recipient); },
    async templates(approvedOnly = false): Promise<Template[]> { return list((await scoped(`/api/marketing/templates${approvedOnly ? '?status=APPROVED' : ''}`)).items).map(template); },
    async template(templateId: number): Promise<Template> { return template(await get(`/api/marketing/templates/${id(templateId)}`)); },
    async templateChannels(templateId: number): Promise<TemplateChannel[]> {
      return list((await scoped(`/api/marketing/templates/${id(templateId)}/channels`)).channels).map(value => {
        const row = object(value);
        return { id: id(row.id), name: text(row.name), provider: required(row.provider), active: row.active === true };
      });
    },
    async contacts(): Promise<Contact[]> { return list((await scoped('/api/contacts')).items).map(contact); },
    async metadataKeys(): Promise<string[]> { return list((await get('/api/contacts/metadata-keys')).keys).filter((row): row is string => typeof row === 'string'); },
    async channels(): Promise<{ id: number; name: string | null }[]> {
      const rows = list((await get('/api/channels')).channels).map(object);
      return operableChannels(rows).map(row => ({ id: id(row.id), name: text(row.name) }));
    },
    async createCampaign(input: CampaignInput): Promise<StatusOut> { return core.create(await active(), input); },
    /** La entrada acepta hasta 100 ids por envío; un fallo detiene los lotes siguientes. */
    async addContacts(campaignId: number, ids: number[]): Promise<AddContactsResult> {
      guardDelivery();
      const account = await active();
      const total: AddContactsResult = { added: 0, requested: 0, rejected: [] };
      for (let at = 0; at < ids.length; at += 100) {
        const part = await core.addContacts(account, campaignId, ids.slice(at, at + 100));
        total.added += part.added; total.requested += part.requested; total.rejected.push(...part.rejected);
      }
      return total;
    },
    async start(campaignId: number) { guardDelivery(); return operate(campaignId, 'start'); },
    async resume(campaignId: number) { guardDelivery(); return operate(campaignId, 'resume'); },
    async schedule(campaignId: number, scheduledAt: string) { guardDelivery(); return operate(campaignId, 'schedule', scheduledAt); },
    pause: (campaignId: number) => operate(campaignId, 'pause'),
    cancel: (campaignId: number) => operate(campaignId, 'cancel'),
    async syncTemplates(): Promise<TemplateSyncResult> {
      const data = await post('/api/marketing/templates/sync', {});
      return { wabas: whole(data.wabas), imported: whole(data.imported), updated: whole(data.updated), marked_deleted: whole(data.marked_deleted), unchanged: whole(data.unchanged) };
    },
    async createTemplate(input: TemplateInput & { submit: boolean }): Promise<Template> { return template(await post('/api/marketing/templates', input)); },
    async updateTemplate(templateId: number, input: TemplateInput): Promise<Template> { return template(object(await (await write('PATCH', `/api/marketing/templates/${id(templateId)}`, input)).json())); },
    async submitTemplate(templateId: number): Promise<Template> { return template(await post(`/api/marketing/templates/${id(templateId)}/submit`)); },
    async deleteTemplate(templateId: number): Promise<void> { await write('DELETE', `/api/marketing/templates/${id(templateId)}`); },
    async uploadMedia(file: File): Promise<string> {
      const form = new FormData();
      form.append('file', file);
      form.append('kind', 'template');
      return required((await post('/api/media', form)).public_url);
    },
    async requestAccess(account: number, phone: string): Promise<void> { await post('/auth/account/request-access', { account_id: id(account), feature: 'campaigns', phone }); },
  };
}
export type BroadcastPanel = ReturnType<typeof createBroadcastPanel>;

/** Sin archivados, sin canales de vista previa y sin los `prueba_`, como `operableChannels` de Appv2. */
export function operableChannels<T extends Record<string, unknown>>(rows: T[]): T[] {
  return rows.filter(row => row.archived !== true && row.provider !== 'web_preview' && !String(row.name ?? '').toLowerCase().startsWith('prueba_'));
}

export const FAILED_PROCESS_STATUSES = ['failed', 'dead', 'error'] as const;
export const countFailedProcess = (byStatus: Record<string, number> | undefined) => FAILED_PROCESS_STATUSES.reduce((sum, key) => sum + (byStatus?.[key] ?? 0), 0);

export type CampaignAction = 'start' | 'schedule' | 'pause' | 'resume' | 'cancel';
/** Solo las transiciones legales de cada estado; el servidor es quien las valida. */
export function actionsFor(value: CampaignStatus): CampaignAction[] {
  if (value === 'draft') return ['start', 'schedule', 'cancel'];
  if (value === 'scheduled') return ['start', 'cancel'];
  if (value === 'running') return ['pause', 'cancel'];
  if (value === 'paused') return ['resume', 'cancel'];
  return [];
}
export const buildingAudience = (value: CampaignStatus) => value === 'draft' || value === 'scheduled' || value === 'paused';

export function campaignProgress(stats: CampaignStats) {
  const process = stats.by_process_status, delivery = stats.by_delivery_status;
  const pending = (process.pending ?? 0) + (process.queued ?? 0);
  return { pending, sent: process.dispatched ?? 0, delivered: delivery.delivered ?? 0, read: delivery.read ?? 0, failed: countFailedProcess(process) + (delivery.failed ?? 0), responded: stats.responded, processed: Math.max(0, stats.total - pending), total: stats.total };
}
/** La cola puede vaciarse antes de que cambie el estado: se avisa, pero no se inventa la transición. */
export const sendsDone = (stats: CampaignStats, value: CampaignStatus) => { const c = campaignProgress(stats); return (value === 'running' || value === 'paused') && c.total > 0 && c.pending === 0; };

const META_ERROR_CODES = new Set(['131009', '131042', '131026', '131047', '131051', '131000', '132000', '132001', '133010', '130472', '368']);
export function cleanReason(raw: string | null | undefined): string {
  if (!raw) return '';
  const before = raw.split(/\s*[{[]/, 1)[0]?.trim() || '';
  const line = (before || raw).replace(/\s+/g, ' ').trim();
  return line.length > 140 ? `${line.slice(0, 137)}…` : line;
}
/** El código de Meta si se reconoce; si no, el motivo crudo limpio. Un fallo nunca queda en blanco. */
export function failureReason(input: { code?: string | number | null; detail?: string | null; deliveryMessage?: string | null }): { code: string | null; text: string } {
  const explicit = input.code != null ? String(input.code).trim() : '';
  if (META_ERROR_CODES.has(explicit)) return { code: explicit, text: '' };
  const raw = (input.detail || input.deliveryMessage || '').trim();
  // Primero `#132000`: un dígito suelto agarraría antes el estado HTTP de «Status 400: (#132000)».
  const code = [raw.match(/#(\d{2,6})/)?.[1], raw.match(/\b(\d{2,6})\b/)?.[1]].find(found => found && META_ERROR_CODES.has(found));
  return code ? { code, text: '' } : { code: null, text: cleanReason(raw) };
}
export function summarizeFailures(rows: Recipient[] | undefined) {
  const groups = new Map<string, { code: string | null; text: string; count: number; raw?: string }>();
  for (const row of rows ?? []) {
    if (!(FAILED_PROCESS_STATUSES as readonly string[]).includes(row.status) && row.delivery_status !== 'failed') continue;
    const reason = failureReason({ code: row.delivery_error_code, detail: row.status_detail, deliveryMessage: row.delivery_error_message });
    const key = reason.code ?? reason.text;
    const raw = (row.status_detail || row.delivery_error_message || '').trim();
    const group = groups.get(key);
    if (group) group.count++;
    else groups.set(key, { ...reason, count: 1, raw: raw && raw !== reason.text ? raw : undefined });
  }
  return [...groups.values()].sort((a, b) => b.count - a.count);
}
export function summarizeRejections(rows: Rejection[]) {
  const groups = new Map<string, number>();
  for (const row of rows) { const key = ['no_phone', 'invalid_format', 'invalid_phone'].includes(row.reason) ? row.reason.replace('invalid_format', 'invalid_phone') : 'other'; groups.set(key, (groups.get(key) ?? 0) + 1); }
  return [...groups.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count);
}

const DAY = 24 * 60 * 60 * 1000;
export const ACTIVITY_WINDOWS = { all: null, '7d': 7, '30d': 30 } as const;
export type ActivityWindow = keyof typeof ACTIVITY_WINDOWS;
export function contactsInWindow<T extends { last_active_at: string | null }>(rows: T[], window: ActivityWindow, now = Date.now()): T[] {
  const days = ACTIVITY_WINDOWS[window];
  if (days === null) return rows;
  return rows.filter(row => { const at = Date.parse(row.last_active_at ?? ''); return Number.isFinite(at) && now - at <= days * DAY; });
}

export function extractTemplateVariables(body: string): string[] {
  return [...new Set([...body.matchAll(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g)].map(match => match[1]!))];
}
const HEADER_FORMATS: readonly string[] = ['TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT'];
const header = (value: unknown): TemplateHeader | null => {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  return HEADER_FORMATS.includes(String(row.format)) ? { format: row.format as HeaderFormat, text: text(row.text), media_url: text(row.media_url) } : null;
};
/** La forma de un borrador, o null. Tras enviarlo a Meta `components` pasa a ser un arreglo. */
export function draftContent(components: unknown): TemplateContent | null {
  if (!components || typeof components !== 'object' || Array.isArray(components)) return null;
  const row = components as Record<string, unknown>;
  const body = row.body && typeof row.body === 'object' ? text((row.body as { text?: unknown }).text) : null;
  if (body === null) return null;
  const footer = row.footer && typeof row.footer === 'object' ? text((row.footer as { text?: unknown }).text) : null;
  return { header: header(row.header), body: { text: body }, footer: footer === null ? null : { text: footer } };
}
/** Lo que pinta la vista previa, venga del borrador o del arreglo final de Meta. */
export function templateContent(components: unknown): TemplateContent {
  const draft = draftContent(components);
  if (draft) return draft;
  const rows = Array.isArray(components) ? components.filter((row): row is Record<string, unknown> => !!row && typeof row === 'object') : [];
  const byType = (type: string) => rows.find(row => String(row.type).toUpperCase() === type);
  const top = byType('HEADER');
  const footer = text(byType('FOOTER')?.text);
  return { header: top ? header({ format: String(top.format).toUpperCase(), text: top.text }) : null, body: { text: text(byType('BODY')?.text) ?? '' }, footer: footer === null ? null : { text: footer } };
}
export const templateVariables = (components: unknown) => extractTemplateVariables(templateContent(components).body.text);
/** Una variable fuera del cuerpo no se puede mapear y Meta rechazaría el envío: se rehúsa la plantilla. */
export function templateHasUnmappableParams(components: unknown): boolean {
  const body = new Set(templateVariables(components));
  return extractTemplateVariables(JSON.stringify(components ?? '')).some(name => !body.has(name));
}
export const normalizeTemplateName = (raw: string) => raw.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');

export type TextNode = { type: 'text' | 'mono'; value: string } | { type: 'variable'; name: string } | { type: 'bold' | 'italic' | 'strike'; children: TextNode[] };
const WRAPPERS: Record<string, 'bold' | 'italic' | 'strike'> = { '*': 'bold', _: 'italic', '~': 'strike' };
/** Lo que WhatsApp pinta en línea: el marcador pega a su contenido y cierra en la misma línea. */
export function parseTemplateText(source: string): TextNode[] {
  const nodes: TextNode[] = [];
  let buffer = '', i = 0;
  const flush = () => { if (buffer) nodes.push({ type: 'text', value: buffer }); buffer = ''; };
  while (i < source.length) {
    if (source.startsWith('```', i)) {
      const end = source.indexOf('```', i + 3);
      if (end > i + 3) { flush(); nodes.push({ type: 'mono', value: source.slice(i + 3, end) }); i = end + 3; continue; }
    }
    const variable = /^\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/.exec(source.slice(i, i + 140));
    if (variable) { flush(); nodes.push({ type: 'variable', name: variable[1]! }); i += variable[0].length; continue; }
    const wrapper = WRAPPERS[source[i]!];
    if (wrapper) {
      const end = source.indexOf(source[i]!, i + 1);
      const content = end > i + 1 ? source.slice(i + 1, end) : '';
      if (content && !content.includes('\n') && !/^\s|\s$/.test(content)) { flush(); nodes.push({ type: wrapper, children: parseTemplateText(content) }); i = end + 1; continue; }
    }
    buffer += source[i]; i++;
  }
  flush();
  return nodes;
}
