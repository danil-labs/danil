import { sessionFetch } from './request.ts';
export type AccountPermissions = { role: string; permissions: string[]; scoped: { permission: string; scope_type: string; scope_id: number }[] };
export type Account = { id: number; name: string };
/**
 * Una fila de la GET de conversaciones de Appv2 (`BackendConversation`). Los campos
 * opcionales los trae el BFF y el lector los rellena siempre; quedan opcionales para
 * que un ejemplo escrito a mano (demo, móvil) no tenga que repetirlos.
 */
export type Conversation = {
  id: number; account_id: number; contact_name: string; channel_name: string; last_message: string; ai_assistance: boolean; unread_count: number;
  /** Proveedor del canal (`whatsapp_cloud`, `web`…): da el ícono y las reglas de identidad. */
  active_provider?: string;
  last_message_at?: string | null;
  /** No nulo = la IA pidió un humano; es lo que filtra «Humano requerido». */
  assistance_requested_at?: string | null;
  /** `active` | `abandoned` | null; vocabulario abierto, como en Appv2. */
  assistance_state?: string | null;
  /** `assist_status.reason_code`: no nulo = la pausa la puso el detector de bucles, no una persona. */
  assist_reason?: string | null;
  contact_ai_blocked?: boolean;
  contact_blocked?: boolean;
  contact_phone?: string;
  contact_handle?: string;
  contact_email?: string;
  last_message_sender_type?: string;
  last_message_direction?: string;
};
/** Totales de la cuenta que manda la misma GET para los filtros que son colas de trabajo. */
export type ConversationCounts = { assistance: number | null; aiDisabled: number | null };
export type Message = { id: number; conversation_id: number; content: string | null; direction: 'inbound' | 'outbound'; sender_type: string; deleted_at?: string | null };
export type Page<T> = { rows: T[]; hasMore: boolean };
export type InboxSession = {
  getToken(): Promise<string>; unauthorized(): Promise<boolean>;
  /** La clave del workspace activo (`X-Danil-Workspace`) y entrar otra vez si el BFF responde que no coincide. */
  workspaceKey?: () => string | null; reenter?: () => Promise<boolean>;
};

const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid_response');
  return value as Record<string, unknown>;
};
const number = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) throw new Error('invalid_response');
  return value;
};
const text = (value: unknown): string => typeof value === 'string' ? value : '';
const nullableText = (value: unknown): string | null => typeof value === 'string' ? value : null;
const count = (value: unknown): number | null => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
const array = (value: unknown): unknown[] => {
  if (!Array.isArray(value)) throw new Error('invalid_response');
  return value;
};

/** Only same-origin, read-only BFF routes. The account of a workspace comes only from `resolveWorkspaceAccount`. */
export function createInbox(session: InboxSession, request: typeof fetch = fetch, prefix = "/terminus/alpha-api") {
  const send = sessionFetch(session, request);
  async function get(path: string) {
    const response = await send(`${prefix}${path}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return object(await response.json());
  }
  return {
    async permissions(account: number): Promise<AccountPermissions> {
      const data = await get(`/auth/account/my-permissions?account_id=${number(account)}`);
      if (typeof data.role !== 'string' || !Array.isArray(data.permissions) || !data.permissions.every(value => typeof value === 'string')) throw new Error('invalid_response');
      return { role: data.role, permissions: data.permissions, scoped: array(data.scoped).map(value => {
        const row = object(value);
        if (typeof row.permission !== 'string' || typeof row.scope_type !== 'string') throw new Error('invalid_response');
        return { permission: row.permission, scope_type: row.scope_type, scope_id: number(row.scope_id) };
      }) };
    },
    async accounts(): Promise<Account[]> {
      const data = object((await get('/auth/profile')).user);
      return array(data.accounts ?? []).map(value => {
        const row = object(value);
        return { id: number(row.id), name: text(row.name) };
      });
    },
    async conversations(account: number, offset = 0): Promise<Page<Conversation> & { counts: ConversationCounts }> {
      const id = number(account);
      const data = await get(`/api/inbox/conversations?account_id=${id}&limit=30&offset=${Math.max(0, Math.floor(offset))}`);
      if (typeof data.hasMore !== 'boolean') throw new Error('invalid_response');
      return { hasMore: data.hasMore, counts: { assistance: count(data.total_assistance), aiDisabled: count(data.total_ai_disabled) }, rows: array(data.conversations).map(value => {
        const row = object(value);
        if (row.account_id !== id || typeof row.ai_assistance !== 'boolean') throw new Error('invalid_scope');
        const assist = row.assist_status && typeof row.assist_status === 'object' ? (row.assist_status as Record<string, unknown>) : null;
        return {
          id: number(row.id), account_id: id, contact_name: text(row.contact_name), channel_name: text(row.channel_name), last_message: text(row.last_message), ai_assistance: row.ai_assistance, unread_count: typeof row.unread_count === 'number' ? row.unread_count : 0,
          active_provider: text(row.active_provider), last_message_at: nullableText(row.last_message_at),
          assistance_requested_at: nullableText(row.assistance_requested_at), assistance_state: nullableText(row.assistance_state),
          assist_reason: assist ? text(assist.reason_code) || 'unknown' : null,
          contact_ai_blocked: row.contact_ai_blocked === true, contact_blocked: row.contact_blocked === true,
          contact_phone: text(row.contact_phone), contact_handle: text(row.contact_handle), contact_email: text(row.contact_email),
          last_message_sender_type: text(row.last_message_sender_type), last_message_direction: text(row.last_message_direction),
        };
      }) };
    },
    async messages(account: number, conversation: number, before?: number): Promise<Page<Message>> {
      const id = number(conversation);
      const data = await get(`/api/inbox/conversations/${id}/messages?account_id=${number(account)}&limit=50${before ? `&before_id=${number(before)}` : ''}`);
      if (typeof data.hasMore !== 'boolean') throw new Error('invalid_response');
      return { hasMore: data.hasMore, rows: array(data.messages).map(value => {
        const row = object(value);
        if (row.conversation_id !== id || !['inbound', 'outbound'].includes(String(row.direction))) throw new Error('invalid_scope');
        return { id: number(row.id), conversation_id: id, content: row.content == null ? null : text(row.content), direction: row.direction as Message['direction'], sender_type: text(row.sender_type), deleted_at: row.deleted_at == null ? null : text(row.deleted_at) };
      }) };
    },
  };
}

// Reglas de la lista de Danil Agents (Appv2: `features/inbox/api.ts`, `identity.ts` y
// `components/ConversationList.tsx`), sin texto: las frases las pone cada cliente.

export type InboxFilter = 'all' | 'assistance' | 'ai_disabled' | 'ai_blocked';
export const INBOX_FILTERS: readonly InboxFilter[] = ['all', 'assistance', 'ai_disabled', 'ai_blocked'];
export type ConversationLabel = 'ai_paused_loop' | 'ai_off' | 'human_required';

export function normalizeProvider(provider: string | null | undefined): string {
  const p = (provider ?? '').toLowerCase();
  if (p.includes('whatsapp')) return 'whatsapp';
  if (p.includes('instagram')) return 'instagram';
  if (p.includes('messenger') || p.includes('facebook')) return 'messenger';
  if (p.includes('web')) return 'web';
  return p;
}

/** «+52 999 123 4567»: México primero y un respaldo genérico. */
export function formatPhoneNumber(phone: string): string {
  const cleaned = phone.replace(/\D/g, '');
  if (!cleaned) return phone;
  if (cleaned.length === 12 && cleaned.startsWith('52')) return `+52 ${cleaned.slice(2, 5)} ${cleaned.slice(5, 8)} ${cleaned.slice(8)}`;
  if (cleaned.length > 10) { const code = cleaned.slice(0, -10), num = cleaned.slice(-10); return `+${code} ${num.slice(0, 3)} ${num.slice(3, 6)} ${num.slice(6)}`; }
  if (cleaned.length === 10) return `${cleaned.slice(0, 3)} ${cleaned.slice(3, 6)} ${cleaned.slice(6)}`;
  return phone;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** El identificador del contacto en su canal. En web el handle es un id interno y no se muestra. */
export function contactIdentifier(row: Conversation): string | null {
  const provider = normalizeProvider(row.active_provider);
  if (provider === 'whatsapp') { const phone = row.contact_phone?.trim() || row.contact_handle?.trim(); return phone ? formatPhoneNumber(phone) : null; }
  if (provider === 'web') {
    const email = row.contact_email?.trim() || row.contact_handle?.trim();
    if (email && EMAIL.test(email)) return email;
    const phone = row.contact_phone?.trim();
    return phone ? formatPhoneNumber(phone) : null;
  }
  if (provider === 'instagram') { const handle = row.contact_handle?.trim().replace(/^@/, ''); return handle ? `@${handle}` : null; }
  return null;
}

/** Nombre, si no el identificador, si no `fallback` («Contacto»). */
export const contactDisplayName = (row: Conversation, fallback: string) => row.contact_name.trim() || contactIdentifier(row) || fallback;

/** La segunda línea de identidad, solo si dice algo que el nombre no dice. El PSID de Messenger va siempre aquí. */
export function contactSubIdentifier(row: Conversation): string | null {
  if (normalizeProvider(row.active_provider) === 'messenger') { const psid = row.contact_handle?.trim(); return psid ? `PSID ${psid}` : null; }
  const identifier = contactIdentifier(row);
  return identifier && identifier !== contactDisplayName(row, '') ? identifier : null;
}

/** Ya contestó una persona (respuesta del panel o eco desde el WhatsApp del dueño). */
export const humanHasReplied = (row: Conversation) => row.last_message_direction === 'outbound' && row.last_message_sender_type === 'human-agent';

/** Lleva la etiqueta «Humano requerido»: la IA pidió ayuda y nadie ha contestado. */
export const needsHuman = (row: Conversation) => row.assistance_state != null && !humanHasReplied(row);

/** Las etiquetas de estado bajo la vista previa, en el orden de Appv2. */
export function conversationLabels(row: Conversation): ConversationLabel[] {
  const labels: ConversationLabel[] = [];
  if (!row.ai_assistance) labels.push(row.assist_reason ? 'ai_paused_loop' : 'ai_off');
  if (needsHuman(row)) labels.push('human_required');
  return labels;
}

/**
 * Los cuatro filtros de Appv2. Allí `assistance` lo corta el servidor con
 * `assistance_requested_at` no nulo y no se vuelve a filtrar con `needsHuman`.
 */
export function matchesFilter(row: Conversation, filter: InboxFilter): boolean {
  if (filter === 'assistance') return row.assistance_requested_at != null;
  if (filter === 'ai_disabled') return !row.ai_assistance && !row.contact_ai_blocked;
  if (filter === 'ai_blocked') return row.contact_ai_blocked === true;
  return true;
}
