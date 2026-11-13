import assert from 'node:assert/strict';
import test from 'node:test';
import { boot } from '../helpers/jsdom-app.mjs';

async function until(read) {
  const end = Date.now() + 3000;
  while (!read()) { if (Date.now() > end) throw new Error('Page condition timed out'); await new Promise(resolve => setTimeout(resolve, 10)); }
}
const button = (w, label) => [...w.document.querySelectorAll('button')].find(b => b.textContent.trim() === label);

test('messaging navigation shows edge data, closes unavailable media, and clears workspace data', async () => {
  let workspace = '11';
  let down = false;
  const seen = [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.origin === 'http://localhost' && url.pathname.includes('/assets/')) return new Response('');
    assert.equal(url.origin, 'https://api.danil.ai');
    assert.equal(init.credentials, 'include');
    assert.equal(new Headers(init.headers).has('authorization'), false);
    seen.push(url.pathname);
    if (url.pathname.endsWith('/me')) return Response.json({ id: 'user_A', name: 'Operator', workspace, organizations: [] });
    if (url.pathname.endsWith('/workspaces')) return Response.json({ items: ['11','12'].map(id => ({ id, org: 'org_A', name: id === '11' ? 'Alpha' : 'Beta', role: 'owner' })), next_cursor: null });
    if (url.pathname.endsWith('/csrf')) return Response.json({ csrf_token: 'bound' });
    if (url.pathname.endsWith('/select')) { workspace = JSON.parse(init.body).workspace; return Response.json({ workspace, ctx: 'ctx', authz_ver: 1 }); }
    if (url.pathname.endsWith('/contacts') && down) return new Response(null, { status: 503 });
    return Response.json({ data: url.pathname.endsWith('/contacts') ? [{ id: 'ct_opaque', object: 'contact', name: workspace === '11' ? 'Ana' : 'Bea', phone: null, email: null, tags: [], blocked: false, ai_blocked: false }] : [], page: { has_more: false, next_cursor: null } });
  };
  globalThis.fetch.__jsdomApp = true;
  const app = await boot('listo', 'messaging-domains', {}, undefined, {}, { web: true });
  await until(() => button(app.w, 'Contactos'));
  button(app.w, 'Contactos').click();
  await until(() => app.w.document.body.textContent.includes('Ana'));
  button(app.w, 'Beta').click();
  await until(() => app.w.document.body.textContent.includes('Bea'));
  assert.equal(app.w.document.body.textContent.includes('Ana'), false);
  down = true;
  button(app.w, 'Actualizar').click();
  await until(() => app.w.document.querySelector('[data-platform-messaging] [role="alert"]'));
  assert.equal(app.w.document.body.textContent.includes('Bea'), false);
  button(app.w, 'Medios').click();
  await until(() => app.w.document.querySelector('[data-messaging-unavailable]'));
  assert.equal(seen.some(path => path.includes('/media')), false);
  assert.deepEqual(app.failures, []);
});

let fixtureVersion = 0;
async function mutationPage() {
  const channel = { id: 'ch_A', object: 'channel', name: 'WhatsApp', provider: 'whatsapp', ai_active: false, archived: false, identity: { display_phone: null, handle: null }, connection: { status: 'connected', detail: null, checked_at: null } };
  const approved = { id: 'tpl_approved', object: 'template', name: 'aprobada', language: 'es_MX', category: 'utility', status: 'approved', channel_ids: [channel.id], components: { header: null, body: { text: 'Hola' }, footer: null }, variables: [] };
  const templates = [approved], campaigns = [], attempts = [], receipts = new Map();
  let lose = true, denied = false;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.origin === 'http://localhost' && url.pathname.includes('/assets/')) return new Response('');
    assert.equal(init.credentials, 'include');
    const path = url.pathname;
    if (path.endsWith('/me')) return Response.json({ id: 'user_A', name: 'Operator', workspace: '11', organizations: [] });
    if (path.endsWith('/workspaces')) return Response.json({ items: [{ id: '11', org: 'org_A', name: 'Alpha', role: 'owner' }], next_cursor: null });
    if (path.endsWith('/csrf')) return Response.json({ csrf_token: 'bound' });
    if (init.method && init.method !== 'GET') {
      const key = new Headers(init.headers).get('idempotency-key');
      const identity = JSON.stringify([init.method, path, init.body]);
      attempts.push({ key, method: init.method, path, body: init.body });
      // Authorization runs before deduplication, as it does at the real edge.
      if (denied) return Response.json({ code: 'insufficient_scope' }, { status: 403, headers: { 'content-type': 'application/problem+json' } });
      if (receipts.has(key)) {
        const receipt = receipts.get(key);
        return receipt.identity === identity ? Response.json(receipt.row) : Response.json({ code: 'idempotency_conflict' }, { status: 409, headers: { 'content-type': 'application/problem+json' } });
      }
      const body = JSON.parse(init.body);
      const row = path.endsWith('/campaigns')
        ? { ...body, id: `cmp_${campaigns.length}`, object: 'campaign', status: 'draft', stats: { audience: 0 } }
        : { ...approved, ...body, id: 'tpl_draft', status: 'draft' };
      if (path.endsWith('/campaigns')) campaigns.push(row);
      else if (init.method === 'POST') templates.push(row);
      else Object.assign(templates.find(t => t.id === row.id), row);
      receipts.set(key, { identity, row });
      if (lose) { lose = false; throw new TypeError('response lost after commit'); }
      return Response.json(row);
    }
    return Response.json({ data: path.endsWith('/channels') ? [channel] : path.endsWith('/templates') ? templates : path.endsWith('/campaigns') ? campaigns : [], page: { has_more: false, next_cursor: null } });
  };
  globalThis.fetch.__jsdomApp = true;
  const app = await boot('listo', `messaging-mutation-${++fixtureVersion}`, {}, undefined, {}, { web: true });
  await until(() => button(app.w, 'Campañas'));
  const input = (element, value) => { element.value = value; element.dispatchEvent(new app.w.Event(element.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); };
  return { app, attempts, campaigns, templates, input, deny: value => { denied = value; }, panel: () => app.w.document.querySelector('[data-platform-messaging]') };
}

test('campaign response loss then pre-dedupe 403 retains its UUID through remount and permission recovery', async () => {
  const f = await mutationPage(), w = f.app.w;
  button(w, 'Campañas').click();
  await until(() => f.panel()?.querySelectorAll('select option').length > 2);
  const form = f.panel().querySelector('form');
  f.input(form.querySelector('input'), 'Una campaña');
  f.input(form.querySelectorAll('select')[0], 'tpl_approved');
  f.input(form.querySelectorAll('select')[1], 'ch_A');
  form.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  await until(() => button(w, 'Reintentar operación'));
  f.deny(true); button(w, 'Reintentar operación').click();
  await until(() => f.attempts.length === 2 && f.panel().getAttribute('aria-busy') === 'false');
  assert.ok(button(w, 'Reintentar operación'), 'a later denial cannot settle an earlier unknown result');
  button(w, 'Canales').click(); button(w, 'Campañas').click();
  await until(() => button(w, 'Reintentar operación') && !button(w, 'Reintentar operación').disabled);
  f.deny(false); button(w, 'Reintentar operación').click();
  await until(() => !button(w, 'Reintentar operación'));
  assert.equal(f.campaigns.length, 1);
  assert.equal(new Set(f.attempts.map(a => a.key)).size, 1);
  assert.deepEqual(f.app.failures, []);
});

test('lost template POST is recovered on remount; saving the same body to PATCH uses another UUID', async () => {
  const f = await mutationPage(), w = f.app.w;
  button(w, 'Plantillas').click();
  await until(() => f.panel()?.querySelector('select option[value="ch_A"]'));
  const form = f.panel().querySelector('form');
  f.input(form.querySelector('input'), 'nuevo_borrador');
  f.input(form.querySelector('select'), 'ch_A');
  f.input(form.querySelector('textarea'), 'Hola');
  form.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  await until(() => button(w, 'Reintentar operación'));
  button(w, 'Canales').click(); button(w, 'Plantillas').click();
  await until(() => f.panel()?.querySelector('li form'));
  assert.ok(button(w, 'Reintentar operación'), 'pending POST must be recoverable without rebuilding the form');
  assert.equal(f.panel().querySelector('li form button[type="submit"]').disabled, true);
  button(w, 'Reintentar operación').click();
  await until(() => !button(w, 'Reintentar operación'));
  const editor = f.panel().querySelector('li form');
  editor.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  await until(() => f.attempts.length === 3 && f.panel().getAttribute('aria-busy') === 'false');
  assert.deepEqual(f.attempts.map(a => a.method), ['POST', 'POST', 'PATCH']);
  assert.equal(f.attempts[0].key, f.attempts[1].key);
  assert.notEqual(f.attempts[0].key, f.attempts[2].key);
  assert.equal(f.attempts[0].body, f.attempts[2].body);
  assert.equal(f.templates.length, 2);
  assert.equal(f.panel().querySelector('[role="alert"]'), null);
  assert.deepEqual(f.app.failures, []);
});
