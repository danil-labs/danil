import assert from 'node:assert/strict';
import test from 'node:test';
import { boot } from '../helpers/jsdom-app.mjs';

const origin = new URL(process.env.DANIL_WEB_API_ORIGIN).origin;
async function until(read) {
  const deadline = Date.now() + 8000;
  while (!read()) {
    if (Date.now() > deadline) throw new Error('Window condition timed out');
    await new Promise(resolve => setTimeout(resolve, 15));
  }
}

test('identity and workspaces mount the real window without any compute or relay request', async () => {
  const calls = [];
  const fetcher = async (input, init) => {
    const url = new URL(String(input));
    if (url.origin === 'http://localhost' && url.pathname.includes('/assets/')) return new Response('');
    calls.push(url.pathname);
    assert.equal(url.origin, origin);
    assert.equal(init.credentials, 'include');
    assert.equal(new Headers(init.headers).has('authorization'), false);
    if (url.pathname === '/v1/identity/me') return Response.json({ id: 'user_A', name: 'Operator', workspace: '11', organizations: [] });
    if (url.pathname === '/v1/workspaces') return Response.json({ items: [{ id: '11', org: 'org_A', name: 'Alpha', role: 'owner' }, { id: '12', org: 'org_A', name: 'Beta', role: 'owner' }], next_cursor: null });
    throw new Error(`Unexpected request ${url.pathname}`);
  };
  fetcher.__jsdomApp = true;
  globalThis.fetch = fetcher;
  const sockets = [];
  const app = await boot('listo', 'edge-window-no-compute', {}, undefined, {}, { web: true, beforeImport(w) {
    w.WebSocket = class { constructor(url) { sockets.push(url); throw new Error('No relay is approved'); } };
    globalThis.WebSocket = w.WebSocket;
  } });
  await until(() => app.w.document.querySelector('[data-tira]'));
  await until(() => app.w.document.querySelector('[data-danil-foot]'));
  assert.ok(app.w.document.querySelector('[data-machines-unavailable]'));
  assert.ok(calls.every(path => path === '/v1/identity/me' || path === '/v1/workspaces'), calls.join(', '));
  assert.deepEqual(sockets, []);
  assert.deepEqual(app.failures, []);
});

for (const status of [401, 403, 503]) test(`identity HTTP ${status} stays distinct before mounting a machine`, async () => {
  const calls = [];
  const fetcher = async (input, init) => {
    const url = new URL(String(input));
    if (url.origin === 'http://localhost' && url.pathname.includes('/assets/')) return new Response('');
    calls.push(url.pathname);
    assert.equal(url.pathname, '/v1/identity/me');
    assert.equal(init.credentials, 'include');
    return new Response(null, { status });
  };
  fetcher.__jsdomApp = true; globalThis.fetch = fetcher;
  const app = await boot('listo', `window-denied-${status}`, {}, undefined, { 'danil.web.previous.11.tasks': 'private' }, { web: true });
  const selector = status === 401 ? 'a[href*="/v1/identity/login"]' : '[role="alert"]';
  await until(() => app.w.document.querySelector(selector));
  assert.equal(app.w.document.querySelector('[data-tira]'), null);
  assert.deepEqual(calls, ['/v1/identity/me']);
  assert.equal(app.w.localStorage.getItem('danil.web.previous.11.tasks'), status === 401 ? null : 'private');
  if (status !== 401) assert.equal(app.w.document.querySelector('a[href*="/login"]'), null);
  assert.deepEqual(app.failures, []);
});

test('an authenticated session with no workspaces shows the plan empty state without asking compute', async () => {
  const calls = [];
  const fetcher = async input => {
    const url = new URL(String(input));
    if (url.origin === 'http://localhost' && url.pathname.includes('/assets/')) return new Response('');
    calls.push(url.pathname);
    if (url.pathname === '/v1/identity/me') return Response.json({ id: 'user_A', name: 'Operator', workspace: '11', organizations: [] });
    if (url.pathname === '/v1/workspaces') return Response.json({ items: [], next_cursor: null });
    throw new Error(`Unexpected request ${url.pathname}`);
  };
  fetcher.__jsdomApp = true; globalThis.fetch = fetcher;
  const app = await boot('listo', 'empty-cloud-workspaces', {}, undefined, {}, { web: true });
  await until(() => app.w.document.querySelector('[data-web-gate]')?.textContent.includes('No tienes nada. Crea un plan.'));
  assert.ok(!calls.some(path => path.startsWith('/v1/compute')));
  assert.equal(app.w.document.querySelector('[data-tira]'), null);
});

for (const end of ['logout', '401']) test(`${end} revokes the mounted person's cached workspaces`, async () => {
  const calls = [];
  let expired = false;
  const fetcher = async (input, init) => {
    const url = new URL(String(input));
    if (url.origin === 'http://localhost' && url.pathname.includes('/assets/')) return new Response('');
    calls.push(url.pathname);
    if (url.pathname === '/v1/identity/me') return expired ? new Response(null, { status: 401 }) : Response.json({ id: 'user_A', name: 'Operator', workspace: '11', organizations: [] });
    if (url.pathname === '/v1/workspaces') return Response.json({ items: [{ id: '11', org: 'org_A', name: 'Alpha', role: 'owner' }], next_cursor: null });
    if (url.pathname === '/v1/identity/csrf') return Response.json({ csrf_token: 'bound' });
    if (url.pathname === '/v1/identity/logout') { assert.equal(init.headers['X-CSRF-Token'], 'bound'); return new Response(null, { status: 204 }); }
    throw new Error(`Unexpected request ${url.pathname}`);
  };
  fetcher.__jsdomApp = true;
  globalThis.fetch = fetcher;
  const app = await boot('listo', `cache-${end}`, {}, undefined, {
    'danil.web.user_A.11.tasks': 'private', 'danil.web.user_A.12.tasks': 'other workspace',
    'danil.web.user_B.11.tasks': 'another person',
  }, { web: true });
  const doc = app.w.document;
  await until(() => doc.querySelector('[data-tira]'));
  if (end === 'logout') {
    doc.querySelector('[data-profile-menu] button').click();
    await until(() => doc.querySelector('[data-sign-out]'));
    doc.querySelector('[data-sign-out]').click();
  } else {
    expired = true;
    doc.querySelector('button[aria-label="Configuración"]').click();
  }
  await until(() => doc.querySelector('a[href*="/v1/identity/login"]'));
  assert.equal(doc.querySelector('[data-tira]'), null);
  assert.equal(app.w.localStorage.getItem('danil.web.user_A.11.tasks'), null);
  assert.equal(app.w.localStorage.getItem('danil.web.user_A.12.tasks'), null);
  assert.equal(app.w.localStorage.getItem('danil.web.user_B.11.tasks'), 'another person');
  assert.ok(!calls.some(path => path.startsWith('/v1/compute')));
  assert.deepEqual(app.failures, []);
});
