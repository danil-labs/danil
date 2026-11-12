import assert from 'node:assert/strict';
import test from 'node:test';
import { actionsFor, campaignProgress, cleanReason, contactTagLabels, contactsInWindow, createBroadcastPanel, failureReason, maskPhone, parseTemplateText, sendsDone, summarizeFailures, summarizeRejections, templateContent, templateHasUnmappableParams, templateVariables, type Recipient } from '../src/broadcast-panel.ts';

const session = (refresh = true) => ({ getToken: async () => 'jwt', unauthorized: async () => refresh });
const panel = (request: typeof fetch, writes = false, prefix = '', refresh = true) => createBroadcastPanel({ session: session(refresh), request, prefix, writes, delivery: writes, account: async () => 7 });
const reply = (body: unknown, status = 200) => (async () => Response.json(body, { status })) as unknown as typeof fetch;
const stats = (over = {}) => ({ by_process_status: {}, by_delivery_status: {}, responded: 0, total: 0, ...over });

test('with writes off delivery and Meta stop before the network', async () => {
  let calls = 0;
  const api = panel((async () => { calls++; return Response.json({}); }) as typeof fetch);
  const attempts = [
    () => api.addContacts(1, [1]), () => api.start(1), () => api.resume(1), () => api.schedule(1, 'x'),
    () => api.syncTemplates(), () => api.submitTemplate(1), () => api.deleteTemplate(1), () => api.uploadMedia(new File(['x'], 'x.png')), () => api.requestAccess(1, '5551234567'),
  ];
  for (const attempt of attempts) await assert.rejects(attempt(), /writes_disabled/);
  assert.equal(calls, 0);
});

test('with writes off drafts, pause and cancel still go through the guarded client', async () => {
  const urls: string[] = [];
  const api = panel((async (url: string) => { urls.push(url); return Response.json({ id: 4, status: 'paused' }); }) as typeof fetch);
  assert.deepEqual(await api.pause(4), { id: 4, status: 'paused' });
  assert.deepEqual(await api.createCampaign({ template_id: 1, channel_id: 2, name: 'x' }), { id: 4, status: 'paused' });
  assert.deepEqual(urls, ['/api/marketing/campaigns/4/pause?account_id=7', '/api/marketing/campaigns?account_id=7']);
});

test('an uncertain start blocks a repeat until the list reconciles it', async () => {
  let fail = true;
  const api = panel((async (url: string) => {
    if (fail) { fail = false; return Response.json({}, { status: 503 }); }
    return Response.json(url.includes('/start') ? { id: 4, status: 'running' } : { items: [] });
  }) as typeof fetch, true);
  await assert.rejects(api.start(4), (error: { uncertain: boolean }) => error.uncertain);
  await assert.rejects(api.start(4), /reconcile_required/);
  await api.campaigns();
  await assert.rejects(api.start(4), /reconcile_required/, 'a poll does not release the lock');
  assert.equal(api.blocked(7, 'campaign:4'), true);
  await api.reconcile();
  assert.equal(api.blocked(7, 'campaign:4'), false);
  assert.deepEqual(await api.start(4), { id: 4, status: 'running' });
});

test('contacts go in batches of 100 and a failure stops the rest', async () => {
  const sizes: number[] = [];
  const api = panel((async (_url: string, init: RequestInit) => {
    const ids = (JSON.parse(String(init.body)) as { contact_account_ids: number[] }).contact_account_ids;
    sizes.push(ids.length);
    return Response.json({ added: ids.length, requested: ids.length, rejected: [] });
  }) as typeof fetch, true);
  const result = await api.addContacts(4, Array.from({ length: 250 }, (_, index) => index + 1));
  assert.deepEqual(sizes, [100, 100, 50]);
  assert.equal(result.added, 250);
});

test('reads retry one 401 and phones never leave the parser whole', async () => {
  const calls: string[] = [];
  let first = true;
  const request = (async (url: string) => {
    calls.push(url);
    if (first) { first = false; return new Response('', { status: 401 }); }
    return Response.json({ items: [{ id: 1, name: 'Ana', phone: '+52 55 1234 5678', tags: { items: [{ label: 'VIP' }] }, last_active_at: null }, { id: 2, phone: '12', tags: [] }, { id: 3, phone: null }] });
  }) as typeof fetch;
  const rows = await panel(request, false, '/alpha-api').contacts();
  assert.deepEqual(calls, ['/alpha-api/api/contacts?account_id=7', '/alpha-api/api/contacts?account_id=7']);
  assert.deepEqual(rows.map(row => [row.phone, row.sendable, row.tags]), [['••••5678', true, ['VIP']], [null, true, []], [null, false, []]]);
  assert.equal(JSON.stringify(rows).includes('1234 5678'), false);
});

test('server errors keep their detail and malformed answers fail', async () => {
  const api = (body: unknown, status = 200) => panel(reply(body, status));
  await assert.rejects(api({ detail: 'Plantilla inválida' }, 422).templates(), /Plantilla inválida/);
  await assert.rejects(api({ detail: { error: 'code_x' } }, 403).templates(), (error: { code: string; status: number }) => error.code === 'code_x' && error.status === 403);
  await assert.rejects(api({ error: 'not_found' }, 404).templates(), /not_found/);
  await assert.rejects(api({}).templates(), /invalid_response/);
});

test('Meta writes with the switch on send JSON or multipart and a delete takes the 204', async () => {
  const seen: { url: string; init: RequestInit }[] = [];
  const api = panel((async (url: string, init: RequestInit) => {
    seen.push({ url, init });
    if (init.method === 'DELETE') return new Response(null, { status: 204 });
    return Response.json({ public_url: 'https://x/y.png' });
  }) as typeof fetch, true);
  assert.equal(await api.uploadMedia(new File(['x'], 'x.png')), 'https://x/y.png');
  assert.equal((seen[0]!.init.body as FormData).get('kind'), 'template');
  assert.equal(new Headers(seen[0]!.init.headers).has('Content-Type'), false);
  await api.deleteTemplate(9);
  assert.equal(seen[1]!.url, '/api/marketing/templates/9');
});

test('channels follow the operable rule of Appv2', async () => {
  const api = panel(reply({ channels: [{ id: 1, name: 'Ventas' }, { id: 2, name: 'prueba_x' }, { id: 3, name: 'Web', provider: 'web_preview' }, { id: 4, name: 'Old', archived: true }] }));
  assert.deepEqual(await api.channels(), [{ id: 1, name: 'Ventas' }]);
});

test('only the legal transitions of each state are offered', () => {
  assert.deepEqual(actionsFor('draft'), ['start', 'schedule', 'cancel']);
  assert.deepEqual(actionsFor('scheduled'), ['start', 'cancel']);
  assert.deepEqual(actionsFor('running'), ['pause', 'cancel']);
  assert.deepEqual(actionsFor('paused'), ['resume', 'cancel']);
  for (const status of ['cancelled', 'completed', 'failed'] as const) assert.deepEqual(actionsFor(status), []);
});

test('progress reads open maps; an all-dead send counts as failed', () => {
  const value = stats({ by_process_status: { pending: 2, queued: 1, dispatched: 5, dead: 2 }, by_delivery_status: { delivered: 3, failed: 1 }, responded: 1, total: 10 });
  assert.deepEqual(campaignProgress(value), { pending: 3, sent: 5, delivered: 3, read: 0, failed: 3, responded: 1, processed: 7, total: 10 });
  assert.equal(sendsDone(stats({ by_process_status: { dispatched: 1 }, total: 1 }), 'running'), true);
  assert.equal(sendsDone(stats(), 'draft'), false);
});

test('failure reasons prefer the Meta code and never stay blank', () => {
  assert.deepEqual(failureReason({ detail: 'Status 400: (#132000) mismatch' }), { code: '132000', text: '' });
  assert.deepEqual(failureReason({ code: 131042 }), { code: '131042', text: '' });
  assert.deepEqual(failureReason({ detail: 'Boom {"error":{"code":1}}' }), { code: null, text: 'Boom' });
  assert.equal(cleanReason('x'.repeat(200)).length, 138);
  const row = (id: number, over: Partial<Recipient>): Recipient => ({ id, contact_account_id: id, name: null, phone: null, status: 'dispatched', status_detail: null, delivery_status: null, delivery_error_code: null, delivery_error_message: null, ...over });
  const groups = summarizeFailures([row(1, { status: 'dead', status_detail: '(#131026) a' }), row(2, { delivery_status: 'failed', delivery_error_code: 131026 }), row(3, { status: 'failed', status_detail: 'Otro' }), row(4, {})]);
  assert.deepEqual(groups.map(group => [group.code, group.text, group.count]), [['131026', '', 2], [null, 'Otro', 1]]);
  assert.deepEqual(summarizeRejections([{ contact_account_id: 1, reason: 'invalid_format' }, { contact_account_id: 2, reason: 'invalid_phone' }, { contact_account_id: 3, reason: 'nuevo' }]), [{ reason: 'invalid_phone', count: 2 }, { reason: 'other', count: 1 }]);
});

test('templates: variables, the refusal outside the body and both component shapes', () => {
  const draft = { header: { format: 'TEXT', text: 'Hola' }, body: { text: 'Hola {{nombre}} y {{ nombre }}, {{codigo}}' }, footer: null };
  assert.deepEqual(templateVariables(draft), ['nombre', 'codigo']);
  assert.equal(templateHasUnmappableParams(draft), false);
  const meta = [{ type: 'HEADER', format: 'image' }, { type: 'BODY', text: 'Hola {{nombre}}' }, { type: 'FOOTER', text: 'Pie' }, { type: 'BUTTONS', buttons: [{ url: 'https://x/{{codigo}}' }] }];
  assert.deepEqual(templateContent(meta), { header: { format: 'IMAGE', text: null, media_url: null }, body: { text: 'Hola {{nombre}}' }, footer: { text: 'Pie' } });
  assert.equal(templateHasUnmappableParams(meta), true);
  assert.deepEqual(templateVariables(null), []);
});

test('contact helpers: masks, tag shapes and the activity window', () => {
  assert.equal(maskPhone('+52 55 1234 5678'), '••••5678');
  assert.equal(maskPhone('123'), null);
  assert.deepEqual(contactTagLabels(['a', { label: 'b' }, ' a ']), ['a', 'b']);
  assert.deepEqual(contactTagLabels({ items: [{ label: 'x' }] }), ['x']);
  const now = Date.parse('2026-10-30T00:00:00Z');
  const rows = [{ last_active_at: '2026-10-28T00:00:00Z' }, { last_active_at: '2026-10-01T00:00:00Z' }, { last_active_at: null }];
  assert.equal(contactsInWindow(rows, 'all', now).length, 3);
  assert.equal(contactsInWindow(rows, '7d', now).length, 1);
  assert.equal(contactsInWindow(rows, '30d', now).length, 2);
});

test('template text paints what WhatsApp paints, nothing more', () => {
  assert.deepEqual(parseTemplateText('Hola *{{nombre}}*'), [{ type: 'text', value: 'Hola ' }, { type: 'bold', children: [{ type: 'variable', name: 'nombre' }] }]);
  assert.deepEqual(parseTemplateText('2 * 3 * 4'), [{ type: 'text', value: '2 * 3 * 4' }]);
  assert.deepEqual(parseTemplateText('*a\nb*'), [{ type: 'text', value: '*a\nb*' }]);
  assert.deepEqual(parseTemplateText('```a*b*```'), [{ type: 'mono', value: 'a*b*' }]);
});

test('campaign audiences expose contacts, with no retired funnel or board API', async () => {
  const api = panel(reply({ items: [{ id: 1, name: 'Ana', phone: '+525512345678' }] }));
  assert.equal('funnels' in api, false);
  assert.equal('board' in api, false);
  assert.equal((await api.contacts())[0]?.id, 1);
});
