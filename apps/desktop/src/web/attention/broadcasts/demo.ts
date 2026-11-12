import type { BroadcastSource } from '../../../../../../packages/attention/src/broadcast-panel.ts';

// `?demo=1`: el mismo cliente sobre un transporte en memoria. Nada sale a la red y todo se
// pierde al recargar.
type Row = Record<string, unknown>;
const ago = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();
const rawBody = 'Hola {{nombre}}, tenemos *20 % de descuento* para ti hasta el {{fecha}}.';
const metaComponents = [{ type: 'HEADER', format: 'TEXT', text: 'Promoción de temporada' }, { type: 'BODY', text: rawBody }, { type: 'FOOTER', text: 'Responde BAJA para no recibir más mensajes.' }];

function seed() {
  const templates: Row[] = [
    { id: 1, name: 'promo_temporada', category: 'MARKETING', language: 'es_MX', status: 'APPROVED', waba_id: '1029384756', components: metaComponents },
    { id: 2, name: 'recordatorio_cita', category: 'UTILITY', language: 'es_MX', status: 'APPROVED', waba_id: '1029384756', components: [{ type: 'BODY', text: 'Tu cita es mañana a las 10:00. ¿Nos confirmas?' }] },
    { id: 3, name: 'oferta_con_boton', category: 'MARKETING', language: 'es_MX', status: 'APPROVED', waba_id: '1029384756', components: [{ type: 'BODY', text: 'Mira la oferta.' }, { type: 'BUTTONS', buttons: [{ type: 'URL', url: 'https://ejemplo.mx/{{codigo}}' }] }] },
    { id: 4, name: 'bienvenida_clientes', category: 'MARKETING', language: 'es_MX', status: 'DRAFT', components: { header: null, body: { text: 'Hola {{nombre}}, gracias por escribirnos.' }, footer: null } },
    { id: 5, name: 'encuesta_servicio', category: 'UTILITY', language: 'es_MX', status: 'PENDING', components: [{ type: 'BODY', text: '¿Cómo calificarías nuestro servicio?' }] },
    { id: 6, name: 'liquidacion_total', category: 'MARKETING', language: 'es_MX', status: 'REJECTED', rejection_reason: 'El contenido no cumple la política de comercio de Meta.', components: [{ type: 'BODY', text: '¡Última oportunidad!' }] },
  ];
  const campaigns: Row[] = [
    { id: 1, account_id: 1, template_id: 1, channel_id: 1, name: 'Promoción de temporada', status: 'running' },
    { id: 2, account_id: 1, template_id: 2, channel_id: 1, name: 'Recordatorio de citas', status: 'draft' },
    { id: 3, account_id: 1, template_id: 1, channel_id: 1, name: 'Reactivación de clientes', status: 'scheduled', scheduled_at: ago(-2) },
    { id: 4, account_id: 1, template_id: 1, channel_id: 2, name: 'Nueva sucursal', status: 'paused' },
    { id: 5, account_id: 1, template_id: 2, channel_id: 2, name: 'Aviso de horario', status: 'failed' },
    { id: 6, account_id: 1, template_id: 1, channel_id: 1, name: 'Novedades de julio', status: 'completed' },
  ];
  const stats: Record<number, Row> = {
    1: { by_process_status: { pending: 90, dispatched: 150 }, by_delivery_status: { delivered: 120, read: 64 }, responded: 18, total: 240 },
    2: { by_process_status: {}, by_delivery_status: {}, responded: 0, total: 0 },
    3: { by_process_status: { pending: 3 }, by_delivery_status: {}, responded: 0, total: 3 },
    4: { by_process_status: { pending: 40, dispatched: 60, failed: 2 }, by_delivery_status: { delivered: 55, read: 20 }, responded: 6, total: 102 },
    5: { by_process_status: { dead: 2, failed: 1 }, by_delivery_status: {}, responded: 0, total: 3 },
    6: { by_process_status: { dispatched: 412 }, by_delivery_status: { delivered: 398, read: 210, failed: 14 }, responded: 96, total: 412 },
  };
  const recipient = (id: number, name: string | null, phone: string, status: string, extra: Row = {}) => ({ id, contact_account_id: id, name, phone, status, ...extra });
  const recipients: Record<number, Row[]> = {
    2: [], 3: [recipient(31, 'Ana Rivera', '+525512340001', 'pending'), recipient(32, 'Luis Ortega', '+525512340002', 'pending'), recipient(33, null, '+525512340003', 'pending')],
    4: [recipient(41, 'Marta Ruiz', '+525512340004', 'dispatched'), recipient(42, 'Diego Vela', '+525512340005', 'failed', { status_detail: 'Status 400: (#131026) Receiver is incapable of receiving this message {"error":{"code":131026}}' }), recipient(43, 'Sofía Lara', '+525512340006', 'failed', { delivery_error_code: 131042 })],
    5: [recipient(51, 'Ana Rivera', '+525512340001', 'dead', { status_detail: 'Status 400: (#132000) Number of parameters does not match' }), recipient(52, 'Luis Ortega', '+525512340002', 'dead', { status_detail: 'Status 400: (#132000) Number of parameters does not match' }), recipient(53, 'Marta Ruiz', '+525512340004', 'failed', { status_detail: 'Fallo inesperado del proveedor' })],
    6: [recipient(61, 'Ana Rivera', '+525512340001', 'dispatched', { delivery_status: 'failed', delivery_error_code: 131026 })],
  };
  const contacts: Row[] = [
    { id: 101, name: 'Ana Rivera', email: 'ana@ejemplo.mx', phone: '+525512340001', tags: { version: 1, items: [{ label: 'Clientes' }] }, last_active_at: ago(2) },
    { id: 102, name: 'Luis Ortega', phone: '+525512340002', tags: { items: [{ label: 'Clientes' }, { label: 'Promo verano' }] }, last_active_at: ago(12) },
    { id: 103, name: 'Marta Ruiz', phone: '+525512340004', tags: ['Prospectos'], last_active_at: ago(40) },
    { id: 104, name: null, email: null, phone: '+525512340007', tags: [], last_active_at: null },
    { id: 105, name: 'Sin Teléfono', email: 'sin@ejemplo.mx', phone: null, tags: [], last_active_at: ago(1) },
    { id: 106, name: 'Número Corto', phone: '12', tags: [], last_active_at: ago(1) },
  ];
  const channels = [{ id: 1, name: 'WhatsApp · Ventas', provider: 'whatsapp_cloud', active: true }, { id: 2, name: 'WhatsApp · Soporte', provider: 'whatsapp_cloud', active: true }, { id: 3, name: 'prueba_interna', provider: 'whatsapp_cloud', active: true }];
  return { templates, campaigns, stats, recipients, contacts, channels, nextId: 100 };
}

const state = seed();
const json = (body: unknown, status = 200) => Response.json(body, { status });
const notFound = () => json({ detail: 'not_found' }, 404);
const statusOut = (row: Row) => json({ id: row.id, status: row.status });

/** Cada lectura de `/stats` drena la cola, para que el panel en vivo se vea avanzar. */
function advance(campaign: Row) {
  if (campaign.status !== 'running') return;
  const stats = state.stats[campaign.id as number]!;
  const process = stats.by_process_status as Record<string, number>, delivery = stats.by_delivery_status as Record<string, number>;
  const step = Math.min(process.pending ?? 0, 12);
  process.pending = (process.pending ?? 0) - step;
  process.dispatched = (process.dispatched ?? 0) + step;
  delivery.delivered = (delivery.delivered ?? 0) + step - 1;
  delivery.read = (delivery.read ?? 0) + Math.floor(step / 2);
  stats.responded = (stats.responded as number) + 1;
  if (process.pending === 0) campaign.status = 'completed';
}

function transition(campaign: Row, action: string, body: Row) {
  const legal: Record<string, [string[], string]> = { start: [['draft', 'scheduled'], 'running'], pause: [['running'], 'paused'], resume: [['paused'], 'running'], cancel: [['draft', 'scheduled', 'running', 'paused'], 'cancelled'], schedule: [['draft'], 'scheduled'] };
  const rule = legal[action];
  if (!rule) return notFound();
  if (!rule[0].includes(campaign.status as string)) return json({ detail: 'La difusión no admite esa acción en su estado actual.' }, 409);
  campaign.status = rule[1];
  if (action === 'schedule') campaign.scheduled_at = body.scheduled_at;
  return statusOut(campaign);
}

function addContacts(campaignId: number, ids: number[]) {
  const stats = state.stats[campaignId]!, process = stats.by_process_status as Record<string, number>;
  const rejected: Row[] = [], added: Row[] = [];
  for (const id of ids) {
    const contact = state.contacts.find(row => row.id === id);
    if (!contact) { rejected.push({ contact_account_id: id, reason: 'unknown' }); continue; }
    if (String(contact.phone ?? '').replace(/\D/g, '').length < 7) { rejected.push({ contact_account_id: id, reason: 'invalid_format' }); continue; }
    added.push({ id: ++state.nextId, contact_account_id: id, name: contact.name, phone: contact.phone, status: 'pending' });
  }
  (state.recipients[campaignId] ??= []).push(...added);
  process.pending = (process.pending ?? 0) + added.length;
  stats.total = (stats.total as number) + added.length;
  return json({ added: added.length, requested: ids.length, rejected });
}

function saveTemplate(row: Row, body: Row) {
  const { channel_id: _channel, submit: _submit, header, body: text, footer, ...fields } = body;
  Object.assign(row, fields);
  if (text !== undefined) row.components = { header: header ?? null, body: text, footer: footer ?? null };
}

function route(path: string, method: string, body: Row, query: URLSearchParams, gated: boolean): Response {
  const campaignMatch = /^\/api\/marketing\/campaigns\/(\d+)(?:\/(\w+))?$/.exec(path);
  const templateMatch = /^\/api\/marketing\/templates\/(\d+)(?:\/(\w+))?$/.exec(path);
  if (method === 'GET') {
    if (path === '/auth/profile') return json({ user: { accounts: [{ id: 1, name: 'Cuenta de ejemplo' }] } });
    if (path === '/auth/account/features') return json({ features: gated ? ['inbox'] : ['inbox', 'campaigns'] });
    if (path === '/auth/account/my-permissions') return json({ role: 'admin', permissions: ['campaigns.manage', 'channels.manage'], scoped: [] });
    if (path === '/api/marketing/campaigns') return json({ items: state.campaigns });
    if (path === '/api/marketing/templates') return json({ items: query.get('status') ? state.templates.filter(row => row.status === query.get('status')) : state.templates });
    if (path === '/api/contacts') return json({ items: state.contacts });
    if (path === '/api/contacts/metadata-keys') return json({ keys: ['ciudad', 'plan'] });
    if (path === '/api/channels') return json({ channels: state.channels });
    if (campaignMatch?.[2] === 'stats') { const row = state.campaigns.find(item => item.id === Number(campaignMatch[1])); if (!row) return notFound(); advance(row); return json({ campaign_id: row.id, ...state.stats[row.id as number] }); }
    if (campaignMatch?.[2] === 'messages') return json({ campaign_id: Number(campaignMatch[1]), limit: 200, offset: 0, items: state.recipients[Number(campaignMatch[1])] ?? [] });
    if (templateMatch?.[2] === 'channels') return json({ channels: Number(templateMatch[1]) === 2 ? state.channels.slice(0, 1) : state.channels.slice(0, 2) });
    if (templateMatch && !templateMatch[2]) { const row = state.templates.find(item => item.id === Number(templateMatch[1])); return row ? json(row) : notFound(); }
    return notFound();
  }
  if (path === '/auth/account/request-access') return json({ ok: true });
  if (path === '/api/marketing/campaigns') {
    const row = { id: ++state.nextId, account_id: 1, status: 'draft', ...body };
    state.campaigns.unshift(row);
    state.stats[row.id] = { by_process_status: {}, by_delivery_status: {}, responded: 0, total: 0 };
    return statusOut(row);
  }
  if (campaignMatch?.[2]) {
    const row = state.campaigns.find(item => item.id === Number(campaignMatch[1]));
    if (!row) return notFound();
    return campaignMatch[2] === 'contacts' ? addContacts(row.id as number, body.contact_account_ids as number[]) : transition(row, campaignMatch[2], body);
  }
  if (path === '/api/marketing/templates/sync') return json({ wabas: 1, imported: 0, updated: 1, marked_deleted: 0, unchanged: state.templates.length - 1 });
  if (path === '/api/marketing/templates') {
    const row: Row = { id: ++state.nextId, status: body.submit ? 'PENDING' : 'DRAFT' };
    saveTemplate(row, body);
    state.templates.unshift(row);
    return json(row, 201);
  }
  if (templateMatch) {
    const row = state.templates.find(item => item.id === Number(templateMatch[1]));
    if (!row) return notFound();
    if (method === 'DELETE') { state.templates.splice(state.templates.indexOf(row), 1); return new Response(null, { status: 204 }); }
    if (templateMatch[2] === 'submit') row.status = 'PENDING'; else saveTemplate(row, body);
    return json(row);
  }
  return notFound();
}

function demoTransport(): typeof fetch {
  const query = new URLSearchParams(location.search);
  const gated = query.get('gate') === 'broadcasts';
  let failNextWrite = query.get('uncertain') === 'broadcasts';
  return (async (input, init) => {
    if (failNextWrite && init?.method && init.method !== 'GET') { failNextWrite = false; return json({ detail: 'demo_unavailable' }, 503); }
    const url = new URL(String(input), location.href);
    const path = url.pathname.replace(/^.*\/alpha-api/, '');
    const body: Row = typeof init?.body === 'string' ? JSON.parse(init.body) as Row : {};
    const file = init?.body instanceof FormData ? init.body.get('file') : null;
    if (file instanceof File) return json({ id: 1, public_url: URL.createObjectURL(file) });
    return route(path, init?.method ?? 'GET', body, url.searchParams, gated);
  }) as typeof fetch;
}

export const demoBroadcastSource = (): BroadcastSource => ({
  session: { getToken: async () => 'demo', unauthorized: async () => false },
  request: demoTransport(), prefix: '/alpha-api', writes: true, delivery: true, demo: true, account: async () => 1,
});
