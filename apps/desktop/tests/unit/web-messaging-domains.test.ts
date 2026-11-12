import assert from 'node:assert/strict';
import test from 'node:test';
import { platformMessaging } from '../../src/web/platform-messaging.ts';
import { PlatformSessionError } from '../../src/web/platform-session.ts';

const options = { origin: 'https://api.danil.ai', timeoutMs: 100 };
const channel = { id: 'ch_opaque', object: 'channel', name: 'Ventas', provider: 'whatsapp', ai_active: true, archived: false, identity: { display_phone: null, handle: null }, connection: { status: 'connected', detail: null, checked_at: null } };
const template = { id: 'tpl_opaque', object: 'template', name: 'saludo', language: 'es_MX', category: 'utility', status: 'approved', channel_ids: [channel.id], components: { header: null, body: { text: 'Hola' }, footer: null }, variables: [] };
const campaign = { id: 'cmp_opaque', object: 'campaign', name: 'Avisos', template_id: template.id, channel_id: channel.id, status: 'draft', stats: { total: 0 } };
const contact = { id: 'ct_opaque', object: 'contact', name: 'Ana', phone: '+5215551234567', email: null, tags: [], blocked: false, ai_blocked: false };
const page = (data: unknown[], cursor: string | null = null) => ({ data, page: { has_more: cursor !== null, next_cursor: cursor } });

test('all four domains read the registered edge with opaque cursors and cookie only', async () => {
  const seen: string[] = [];
  const api = platformMessaging(options, async (input, init) => {
    const r = new Request(input, init); seen.push(r.url);
    assert.equal(r.credentials, 'include');
    assert.equal(r.headers.has('authorization'), false);
    assert.equal(r.headers.has('x-danil-workspace'), false);
    const name = new URL(r.url).pathname.split('/').at(-1)!;
    return Response.json(page([{ channels: channel, templates: template, campaigns: campaign, contacts: contact }[name]!], 'opaque+/='));
  });
  assert.equal((await api.channels()).data[0].id, channel.id);
  assert.equal((await api.templates()).data[0].id, template.id);
  assert.equal((await api.campaigns()).data[0].id, campaign.id);
  assert.equal((await api.contacts('opaque+/=')).data[0].id, contact.id);
  assert.equal(new URL(seen[3]).searchParams.get('cursor'), 'opaque+/=');
  assert.ok(seen.every(url => url.startsWith(options.origin + '/v1/messaging/')));
});

test('writes preserve method, CSRF and caller operation key without legacy gates', async () => {
  const writes: Request[] = [];
  const api = platformMessaging(options, async (input, init) => {
    const r = new Request(input, init);
    if (r.url.endsWith('/identity/csrf')) return Response.json({ csrf_token: 'bound' });
    writes.push(r);
    assert.equal(r.headers.get('x-csrf-token'), 'bound');
    assert.equal(r.headers.get('idempotency-key'), 'same-intent');
    if (r.method === 'DELETE' || r.url.endsWith('/sync')) return new Response(null, { status: r.method === 'DELETE' ? 204 : 202 });
    return Response.json(r.url.includes('/contacts') ? contact : r.url.includes('/templates') ? template : r.url.includes('/channels') ? channel : campaign);
  });
  await api.saveContact({ name: 'Ana', phone: contact.phone }, 'same-intent');
  await api.saveContact({ name: 'Bea' }, 'same-intent', contact.id);
  await api.saveTemplate({ name: 'saludo', language: 'es_MX', category: 'utility', channel_ids: [channel.id], components: template.components }, 'same-intent', template.id);
  await api.deleteTemplate(template.id, 'same-intent');
  await api.syncTemplates('same-intent');
  await api.campaignAction(campaign.id, 'pause', {}, 'same-intent');
  assert.deepEqual(writes.map(r => r.method), ['POST', 'PATCH', 'PATCH', 'DELETE', 'POST', 'POST']);
  assert.deepEqual(await writes[1].json(), { name: 'Bea' });
});

test('invalid pages and numeric IDs fail at the boundary; problems never fall back', async () => {
  for (const data of [page([{ ...contact, id: 4 }]), { data: [contact], page: { has_more: true, next_cursor: null } }]) {
    const api = platformMessaging(options, async () => Response.json(data));
    await assert.rejects(api.contacts());
  }
  const seen: string[] = [];
  const api = platformMessaging(options, async input => { seen.push(String(input)); return Response.json({ code: 'insufficient_scope' }, { status: 403, headers: { 'content-type': 'application/problem+json' } }); });
  await assert.rejects(api.channels(), (e: unknown) => e instanceof PlatformSessionError && e.status === 403 && e.code === 'insufficient_scope');
  assert.equal(seen.length, 1);
});

test('cancellation reaches the edge before an operation can start', async () => {
  const abort = new AbortController(); abort.abort();
  const api = platformMessaging(options, async () => { throw new Error('must not fetch'); });
  await assert.rejects(api.contacts(undefined, abort.signal), { name: 'AbortError' });
});
