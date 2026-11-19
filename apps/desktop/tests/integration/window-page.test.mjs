import assert from 'node:assert/strict';
import test from 'node:test';
import { boot } from '../helpers/jsdom-app.mjs';
import { relay } from '../helpers/fake-relay.mjs';

const origin = new URL(process.env.DANIL_WEB_API_ORIGIN).origin;
async function until(read) {
  const deadline = Date.now() + 8000;
  while (!read()) {
    if (Date.now() > deadline) throw new Error('Window condition timed out');
    await new Promise(resolve => setTimeout(resolve, 15));
  }
}

async function open(t, ...args) {
  const app = await boot(...args);
  t.after(() => app.w.dispatchEvent(new app.w.Event('pagehide')));
  return app;
}

test('identity and workspaces mount the real window without any compute or relay request', async t => {
  const calls = [];
  const fetcher = async (input, init) => {
    const url = new URL(String(input));
    if (url.origin === 'http://localhost' && url.pathname.includes('/assets/')) return new Response('');
    calls.push(url.pathname);
    if (['/v1/capabilities', '/v1/identity/organizations', '/v1/machines'].includes(url.pathname)) return new Response(null, { status: 404 });
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
  const app = await open(t, 'listo', 'edge-window-no-compute', {}, undefined, {}, { web: true, beforeImport(w) {
    w.WebSocket = class { constructor(url) { sockets.push(url); throw new Error('No relay is approved'); } };
    globalThis.WebSocket = w.WebSocket;
  } });
  await until(() => app.w.document.querySelector('[data-tira]'));
  await until(() => app.w.document.querySelector('[data-danil-foot]'));
  assert.ok(app.w.document.querySelector('[data-machines-unavailable]'));
  assert.ok(calls.every(path => ['/v1/identity/me', '/v1/workspaces', '/v1/capabilities', '/v1/identity/organizations', '/v1/machines'].includes(path)), calls.join(', '));
  assert.deepEqual(sockets, []);
  assert.deepEqual(app.failures, []);
});

test('the window mounts against an edge that has no /v1/compute and announces machines, and talks only /v1/machines', async t => {
  const calls = [];
  const fake = relay();
  const MACHINE = { machine_id: 'm1', name: 'Danil', state: 'running', connection: 'connected' };
  const fetcher = async (input, init) => {
    const url = new URL(String(input));
    if (url.origin === 'http://localhost' && url.pathname.includes('/assets/')) return new Response('');
    calls.push(`${init?.method ?? 'GET'} ${url.pathname}`);
    if (url.pathname.startsWith('/v1/compute')) return new Response(null, { status: 404 });
    if (url.pathname === '/v1/capabilities') return Response.json({ contract: 'mvp-v1', items: ['machines', 'machines.start', 'machines.session', 'workspaces'].map(name => ({ name, version: 1, status: 'available' })) });
    if (url.pathname === '/v1/identity/me') return Response.json({ id: 'user_A', name: 'Operator', workspace: '11', organizations: [] });
    if (url.pathname === '/v1/workspaces') return Response.json({ items: [{ id: '11', org: 'org_A', name: 'Alpha', role: 'owner' }], next_cursor: null });
    if (url.pathname === '/v1/identity/csrf') return Response.json({ csrf_token: 'bound' });
    if (url.pathname === '/v1/machines') return Response.json({ items: [MACHINE], next_cursor: null });
    if (url.pathname === '/v1/machines/m1/tickets') return Response.json({ ticket: 'one-use', url: 'wss://connect.danil.ai/v1/machines/m1/session', expires_at: '2099-01-01T00:00:00Z' });
    if (url.pathname === '/v1/identity/organizations') return new Response(null, { status: 404 });
    throw new Error(`Unexpected request ${url.pathname}`);
  };
  fetcher.__jsdomApp = true;
  globalThis.fetch = fetcher;
  const app = await open(t, 'listo', 'edge-machines-mvp-v1', {}, undefined, {}, { web: true, beforeImport(w) {
    w.WebSocket = fake.Socket;
    globalThis.WebSocket = fake.Socket;
  } });
  await until(() => app.w.document.querySelector('[data-tira]'));
  await until(() => fake.calls.some(c => c.command === 'workspaces_startup' || c.command === 'list_workspaces'));
  assert.ok(calls.includes('GET /v1/machines'));
  assert.ok(calls.includes('POST /v1/machines/m1/tickets'));
  assert.ok(!calls.some(path => path.includes('/v1/compute')), calls.join(', '));
  assert.equal(app.w.document.querySelector('[data-machines-unavailable]'), null);
  assert.deepEqual(app.failures, []);
});


for (const status of [501, 503]) test(`/v1/workspaces ${status} keeps sign out and the organization selector next to the error`, async t => {
  const calls = [];
  const fetcher = async input => {
    const url = new URL(String(input));
    if (url.origin === 'http://localhost' && url.pathname.includes('/assets/')) return new Response('');
    calls.push(url.pathname);
    if (url.pathname === '/v1/capabilities') return Response.json({ contract: 'mvp-v1', items: ['workspaces', 'identity.organizations'].map(name => ({ name, version: 1, status: 'available' })) });
    if (url.pathname === '/v1/identity/me') return Response.json({ id: 'user_A', name: 'Operator', workspace: '11', organizations: [] });
    if (url.pathname === '/v1/identity/organizations') return Response.json({ items: [{ id: 'org_A', name: 'Danil', plan: 'enterprise', role: 'owner' }, { id: 'org_B', name: 'Otra', plan: 'team', role: 'member' }], next_cursor: null, active_organization_id: 'org_A' });
    if (url.pathname === '/v1/workspaces') return new Response(null, { status });
    throw new Error(`Unexpected request ${url.pathname}`);
  };
  fetcher.__jsdomApp = true; globalThis.fetch = fetcher;
  const app = await open(t, 'listo', `workspaces-${status}`, {}, undefined, {}, { web: true });
  const gate = () => app.w.document.querySelector('[data-web-gate]');
  if (status === 501) {
    await until(() => gate()?.querySelector('[role="alert"]') && gate()?.querySelector('[data-web-organization="org_B"]'));
    assert.ok(gate().querySelector('[data-web-organization="org_A"][aria-pressed="true"]'));
  } else {
    // 503 es transitorio en el primer montaje: se espera sin error fatal y se reintenta solo.
    await until(() => gate()?.querySelector('[data-web-preparing]'));
    assert.equal(gate().querySelector('[role="alert"]'), null);
    await until(() => calls.filter(path => path === '/v1/workspaces').length >= 2);
  }
  assert.ok(gate().querySelector('[data-web-sign-out]'), 'sign out stays visible');
  assert.equal(app.w.document.querySelector('[data-tira]'), null);
  assert.deepEqual(app.failures, []);
});

test('machines 404 shows the cloud as unavailable, retries by itself and never falls back to «This computer»', async t => {
  const calls = [];
  const fake = relay();
  const fetcher = async (input, init) => {
    const url = new URL(String(input));
    if (url.origin === 'http://localhost' && url.pathname.includes('/assets/')) return new Response('');
    calls.push(`${init?.method ?? 'GET'} ${url.pathname}`);
    if (url.pathname === '/v1/capabilities') return Response.json({ contract: 'mvp-v1', items: ['machines', 'machines.start', 'machines.session', 'workspaces'].map(name => ({ name, version: 1, status: 'available' })) });
    if (url.pathname === '/v1/identity/me') return Response.json({ id: 'user_A', name: 'Operator', workspace: '11', organizations: [] });
    if (url.pathname === '/v1/workspaces') return Response.json({ items: [{ id: '11', org: 'org_A', name: 'Alpha', role: 'owner' }], next_cursor: null });
    if (url.pathname === '/v1/machines') return new Response(null, { status: 404 });
    return new Response(null, { status: 404 });
  };
  fetcher.__jsdomApp = true; globalThis.fetch = fetcher;
  const app = await open(t, 'listo', 'machines-404', {}, undefined, {}, { web: true, beforeImport(w) { w.WebSocket = fake.Socket; globalThis.WebSocket = fake.Socket; } });
  await until(() => app.w.document.querySelector('[data-tira]'));
  await until(() => app.w.document.querySelector('[data-machines-unavailable]'));
  await until(() => calls.filter(call => call === 'GET /v1/machines').length >= 2);
  await until(() => app.w.document.querySelector('[data-task-location-machine]'));
  const label = app.w.document.querySelector('[data-task-location-machine]').textContent;
  assert.ok(!/This computer|Este equipo|Este Mac|This Mac/.test(label), `the task header names a local computer: ${label}`);
  assert.match(label, /Machines unavailable|Máquinas no disponibles/);
  assert.deepEqual(app.failures, []);
});

test('a 403 on the first mount prepares and retries by itself until the membership arrives', async t => {
  const calls = [];
  let meCalls = 0;
  const fetcher = async (input, init) => {
    const url = new URL(String(input));
    if (url.origin === 'http://localhost' && url.pathname.includes('/assets/')) return new Response('');
    calls.push(`${init?.method ?? 'GET'} ${url.pathname}`);
    if (['/v1/capabilities', '/v1/identity/organizations', '/v1/machines'].includes(url.pathname)) return new Response(null, { status: 404 });
    if (url.pathname === '/v1/identity/me') {
      meCalls++;
      if (meCalls === 1) return new Response(JSON.stringify({ code: 'forbidden' }), { status: 403, headers: { 'content-type': 'application/problem+json' } });
      return Response.json({ id: 'user_A', name: 'Operator', workspace: '11', organizations: [] });
    }
    if (url.pathname === '/v1/workspaces') return Response.json({ items: [{ id: '11', org: 'org_A', name: 'Alpha', role: 'owner' }], next_cursor: null });
    throw new Error(`Unexpected request ${url.pathname}`);
  };
  fetcher.__jsdomApp = true;
  globalThis.fetch = fetcher;
  const app = await open(t, 'listo', 'first-mount-403', {}, undefined, {}, { web: true, beforeImport(w) {
    w.WebSocket = class { constructor() { throw new Error('No relay is approved'); } };
    globalThis.WebSocket = w.WebSocket;
  } });
  const gate = () => app.w.document.querySelector('[data-web-gate]');
  await until(() => gate()?.querySelector('[data-web-preparing]'));
  assert.equal(gate().querySelector('[role="alert"]'), null, 'no fatal access error on the first mount');
  assert.ok(gate().querySelector('[data-web-sign-out]'), 'sign out stays visible while preparing');
  await until(() => app.w.document.querySelector('[data-tira]'));
  assert.ok(meCalls >= 2, 'identity was read again without the person asking');
  assert.equal(gate(), null);
  assert.ok(calls.includes('GET /v1/identity/me'));
  assert.deepEqual(app.failures, []);
});

test('an empty workspace list on the first mount prepares and mounts when the workspace arrives', async t => {
  let listed = 0;
  const fetcher = async (input, init) => {
    const url = new URL(String(input));
    if (url.origin === 'http://localhost' && url.pathname.includes('/assets/')) return new Response('');
    if (['/v1/capabilities', '/v1/identity/organizations', '/v1/machines'].includes(url.pathname)) return new Response(null, { status: 404 });
    if (url.pathname === '/v1/identity/me') return Response.json({ id: 'user_A', name: 'Operator', workspace: '11', organizations: [] });
    if (url.pathname === '/v1/workspaces') {
      listed++;
      return Response.json({ items: listed === 1 ? [] : [{ id: '11', org: 'org_A', name: 'Alpha', role: 'owner' }], next_cursor: null });
    }
    throw new Error(`Unexpected request ${url.pathname}`);
  };
  fetcher.__jsdomApp = true;
  globalThis.fetch = fetcher;
  const app = await open(t, 'listo', 'first-mount-empty', {}, undefined, {}, { web: true, beforeImport(w) {
    w.WebSocket = class { constructor() { throw new Error('No relay is approved'); } };
    globalThis.WebSocket = w.WebSocket;
  } });
  const gate = () => app.w.document.querySelector('[data-web-gate]');
  await until(() => gate()?.querySelector('[data-web-preparing]'));
  assert.equal(gate().querySelector('[role="alert"]'), null, 'the empty list is not fatal');
  await until(() => app.w.document.querySelector('[data-tira]'));
  assert.ok(listed >= 2);
  assert.equal(gate(), null);
  assert.deepEqual(app.failures, []);
});

for (const status of [401, 403, 503]) test(`identity HTTP ${status} stays distinct before mounting a machine`, async t => {
  const calls = [];
  const fetcher = async (input, init) => {
    const url = new URL(String(input));
    if (url.origin === 'http://localhost' && url.pathname.includes('/assets/')) return new Response('');
    calls.push(url.pathname);
    if (['/v1/capabilities', '/v1/identity/organizations', '/v1/machines'].includes(url.pathname)) return new Response(null, { status: 404 });
    assert.equal(url.pathname, '/v1/identity/me');
    assert.equal(init.credentials, 'include');
    return new Response(null, { status });
  };
  fetcher.__jsdomApp = true; globalThis.fetch = fetcher;
  const app = await open(t, 'listo', `window-denied-${status}`, {}, undefined, { 'danil.web.previous.11.tasks': 'private' }, { web: true });
  const selector = status === 401 ? 'a[href*="/v1/identity/login"]' : '[data-web-preparing]';
  await until(() => app.w.document.querySelector(selector));
  assert.equal(app.w.document.querySelector('[data-tira]'), null);
  assert.ok(calls.includes('/v1/capabilities'));
  assert.ok(calls.includes('/v1/identity/me'));
  assert.equal(app.w.localStorage.getItem('danil.web.previous.11.tasks'), status === 401 ? null : 'private');
  if (status === 401) assert.deepEqual([...calls].sort(), ['/v1/capabilities', '/v1/identity/me']);
  else {
    // 403/503 en el primer montaje no son fatales: se prepara y se reintenta solo.
    assert.equal(app.w.document.querySelector('[role="alert"]'), null);
    assert.equal(app.w.document.querySelector('a[href*="/login"]'), null);
    await until(() => calls.filter(path => path === '/v1/identity/me').length >= 2);
  }
  assert.deepEqual(app.failures, []);
});

test('a window without a session shows the original WorkOS sign-in screen and its button goes to /v1/identity/login', async t => {
  const fetcher = async input => {
    const url = new URL(String(input));
    if (url.origin === 'http://localhost' && url.pathname.includes('/assets/')) return new Response('');
    if (['/v1/capabilities', '/v1/identity/organizations', '/v1/machines'].includes(url.pathname)) return new Response(null, { status: 404 });
    if (url.pathname === '/v1/identity/me') return new Response(null, { status: 401 });
    throw new Error(`Unexpected request ${url.pathname}`);
  };
  fetcher.__jsdomApp = true; globalThis.fetch = fetcher;
  const app = await open(t, 'listo', 'window-original-signin', {}, undefined, {}, { web: true });
  const doc = app.w.document;
  await until(() => doc.querySelector('[data-web-auth="workos"]'));
  const screen = doc.querySelector('[data-web-auth="workos"]');
  assert.equal(screen.querySelector('h1').textContent, 'Danil');
  assert.equal(screen.querySelector('h2').textContent, 'Inicia sesión en Danil');
  assert.ok(screen.textContent.includes('Entra con tu cuenta de Danil.'));
  assert.ok(screen.querySelector('[data-access-request]'));
  const go = [...screen.querySelectorAll('a')].find(a => a.textContent === 'Continuar con tu correo');
  assert.ok(go, 'the original «Continuar con tu correo» button');
  const target = new URL(go.href);
  assert.equal(`${target.origin}${target.pathname}`, `${origin}/v1/identity/login`);
  assert.equal(new URL(target.searchParams.get('return_to')).origin, app.w.location.origin);
  // Nothing of the minimal platform entry is left on the way in.
  assert.equal(doc.querySelector('[data-web-gate]'), null);
  assert.equal(doc.querySelector('[data-platform-session]'), null);
  assert.equal(doc.querySelector('[data-tira]'), null);
  assert.deepEqual(app.failures, []);
});

test('an authenticated session with no workspaces shows the empty state without a plan or promo code and without asking compute', async t => {
  quickRetries(t);
  const calls = [];
  const fetcher = async input => {
    const url = new URL(String(input));
    if (url.origin === 'http://localhost' && url.pathname.includes('/assets/')) return new Response('');
    calls.push(url.pathname);
    if (['/v1/capabilities', '/v1/identity/organizations', '/v1/machines'].includes(url.pathname)) return new Response(null, { status: 404 });
    if (url.pathname === '/v1/identity/me') return Response.json({ id: 'user_A', name: 'Operator', workspace: '11', organizations: [] });
    if (url.pathname === '/v1/workspaces') return Response.json({ items: [], next_cursor: null });
    throw new Error(`Unexpected request ${url.pathname}`);
  };
  fetcher.__jsdomApp = true; globalThis.fetch = fetcher;
  const app = await open(t, 'listo', 'empty-cloud-workspaces', {}, undefined, {}, { web: true });
  await until(() => app.w.document.querySelector('[data-web-gate] [data-web-empty]'));
  const gate = app.w.document.querySelector('[data-web-gate]');
  assert.equal(gate.querySelector('[data-web-empty]').textContent, 'Esta organización no tiene workspaces.');
  assert.ok(!/Crea un plan/.test(gate.textContent));
  assert.equal(gate.querySelector('#promo-code'), null, 'no promo code on the empty gate');
  assert.ok(!calls.some(path => path.startsWith('/v1/compute')));
  assert.equal(app.w.document.querySelector('[data-tira]'), null);
});

for (const end of ['logout', '401']) test(`${end} revokes the mounted person's cached workspaces`, async t => {
  const calls = [];
  let expired = false;
  const fetcher = async (input, init) => {
    const url = new URL(String(input));
    if (url.origin === 'http://localhost' && url.pathname.includes('/assets/')) return new Response('');
    calls.push(url.pathname);
    if (['/v1/capabilities', '/v1/identity/organizations', '/v1/machines'].includes(url.pathname)) return new Response(null, { status: 404 });
    if (url.pathname === '/v1/identity/me') return expired ? new Response(null, { status: 401 }) : Response.json({ id: 'user_A', name: 'Operator', workspace: '11', organizations: [] });
    if (url.pathname === '/v1/workspaces') return Response.json({ items: [{ id: '11', org: 'org_A', name: 'Alpha', role: 'owner' }], next_cursor: null });
    if (url.pathname === '/v1/identity/csrf') return Response.json({ csrf_token: 'bound' });
    if (url.pathname === '/v1/identity/logout') { assert.equal(init.headers['X-CSRF-Token'], 'bound'); return new Response(null, { status: 204 }); }
    throw new Error(`Unexpected request ${url.pathname}`);
  };
  fetcher.__jsdomApp = true;
  globalThis.fetch = fetcher;
  const app = await open(t, 'listo', `cache-${end}`, {}, undefined, {
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

const ORGS = { items: [{ id: 'org_A', name: 'Danil', plan: 'enterprise', role: 'owner' }, { id: 'org_B', name: 'Otra', plan: 'team', role: 'member' }], next_cursor: null, active_organization_id: 'org_B' };
const CAPS = { contract: 'mvp-v1', items: [{ name: 'identity.organizations', version: 1, status: 'available' }] };
for (const [label, me] of [
  ['403 workspace_selection_required', () => new Response(JSON.stringify({ type: 'urn:danil:problem:workspace_selection_required', status: 403, code: 'workspace_selection_required' }), { status: 403, headers: { 'content-type': 'application/problem+json' } })],
  ['200 with workspace null', () => Response.json({ id: 'user_A', name: 'Operator', workspace: null, organizations: [] })],
]) test(`an organization without a workspace (${label}) shows the empty state with the organization selector and sign out, not a dead end`, async t => {
  const calls = [];
  const fetcher = async input => {
    const url = new URL(String(input));
    if (url.origin === 'http://localhost' && url.pathname.includes('/assets/')) return new Response('');
    calls.push(url.pathname);
    if (url.pathname === '/v1/identity/me') return me();
    if (url.pathname === '/v1/capabilities') return Response.json(CAPS);
    if (url.pathname === '/v1/identity/organizations') return Response.json(ORGS);
    if (url.pathname === '/v1/workspaces') return Response.json({ items: [], next_cursor: null });
    throw new Error(`Unexpected request ${url.pathname}`);
  };
  fetcher.__jsdomApp = true; globalThis.fetch = fetcher;
  const app = await open(t, 'listo', `org-without-workspace-${label.length}`, {}, undefined, {}, { web: true });
  const gate = () => app.w.document.querySelector('[data-web-gate]');
  await until(() => gate()?.querySelector('[data-web-organization="org_A"]'));
  assert.equal(gate().querySelector('[role="alert"]'), null, 'no «No tienes acceso»');
  assert.ok(gate().querySelector('[data-web-organization="org_B"][aria-pressed="true"]'), 'the active one is marked');
  assert.ok(gate().querySelector('[data-web-sign-out]'), 'sign out is offered');
  assert.ok(!calls.some(path => path.startsWith('/v1/compute')));
});

test('automatic material failure stays local and recovers through the beta machine-session window', async t => {
  const { engine } = await import('../helpers/fake-relay.mjs');
  const table = { ...engine, list_sources: undefined };
  const fake = relay({ table });
  const fetcher = async input => {
    const url = new URL(String(input));
    if (url.origin === 'http://localhost' && url.pathname.includes('/assets/')) return new Response('');
    if (url.pathname === '/v1/capabilities') return Response.json({ contract: 'mvp-v1', items: ['machines', 'machines.session', 'workspaces'].map(name => ({ name, version: 1, status: 'available' })) });
    if (url.pathname === '/v1/identity/me') return Response.json({ id: 'user_A', name: 'Operator', workspace: '11', organizations: [] });
    if (url.pathname === '/v1/workspaces') return Response.json({ items: [{ id: '11', org: 'org_A', name: 'Alpha', role: 'owner' }], next_cursor: null });
    if (url.pathname === '/v1/identity/csrf') return Response.json({ csrf_token: 'bound' });
    if (url.pathname === '/v1/machines') return Response.json({ items: [{ machine_id: 'm1', name: 'Danil', state: 'running', connection: 'connected' }], next_cursor: null });
    if (url.pathname === '/v1/machines/m1/tickets') return Response.json({ ticket: 'one-use', url: 'wss://connect.danil.ai/v1/machines/m1/session', expires_at: '2099-01-01T00:00:00Z' });
    if (url.pathname === '/v1/identity/organizations') return new Response(null, { status: 404 });
    throw new Error(`Unexpected request ${url.pathname}`);
  };
  fetcher.__jsdomApp = true;
  globalThis.fetch = fetcher;
  const app = await open(t, 'listo', 'beta-automatic-material', {}, undefined, {}, { web: true, beforeImport(w) {
    w.WebSocket = fake.Socket;
    globalThis.WebSocket = fake.Socket;
  } });
  await until(() => app.w.document.querySelector('[data-material-status]'));
  assert.equal(app.w.document.querySelector('[data-toast-error]'), null);
  table.list_sources = [];
  const before = fake.calls.filter(call => call.command === 'list_sources').length;
  app.w.document.querySelector('[data-material-status] button').click();
  await until(() => fake.calls.filter(call => call.command === 'list_sources').length > before);
  await new Promise(resolve => setTimeout(resolve, 100));
  assert.equal(app.w.document.querySelector('[data-material-status]'), null);
  assert.equal(app.w.document.querySelector('[data-toast-error]'), null);
  assert.deepEqual(app.failures, []);
});


for (const end of ['pagehide', '401']) test(`${end} during startup cannot mount a late identity snapshot`, async t => {
  let resolveProfile;
  const pending = new Promise(resolve => { resolveProfile = resolve; });
  const calls = [];
  const signals = [];
  const fetcher = async (input, init) => {
    const url = new URL(String(input));
    if (url.origin === 'http://localhost' && url.pathname.includes('/assets/')) return new Response('');
    calls.push(url.pathname); signals.push(init.signal);
    if (url.pathname === '/v1/identity/me') return pending;
    if (url.pathname === '/v1/capabilities') return end === '401' ? new Response(null, { status: 401 }) : Response.json({ items: [] });
    throw new Error(`Unexpected late startup request ${url.pathname}`);
  };
  fetcher.__jsdomApp = true; globalThis.fetch = fetcher;
  const app = await open(t, 'listo', `late-startup-${end}`, {}, undefined, {}, { web: true });
  if (end === 'pagehide') app.w.dispatchEvent(new app.w.Event('pagehide'));
  resolveProfile(Response.json({ id: 'user_A', name: 'A', workspace: '11', organizations: [] }));
  for (let i = 0; i < 20; i++) await new Promise(resolve => setImmediate(resolve));
  assert.ok(signals.every(signal => signal.aborted));
  assert.deepEqual([...calls].sort(), ['/v1/capabilities', '/v1/identity/me']);
  assert.equal(app.w.document.querySelector('[data-tira]'), null);
  assert.deepEqual(app.failures, []);
});

// La espera de la organización personal crece hasta 30 s; aquí se acorta sin cambiar cuántos intentos hay.
function quickRetries(t) {
  const original = globalThis.setTimeout;
  globalThis.setTimeout = (run, ms, ...rest) => original(run, ms >= 1000 ? 5 : ms, ...rest);
  t.after(() => { globalThis.setTimeout = original; });
}
const NO_ORG = { id: 'user_A', name: 'Operator', workspace: null, organizations: [], active_organization_id: null };

test('a new account without its personal organization waits for it with retry and sign out, and mounts when it arrives', async t => {
  let meCalls = 0;
  const calls = [];
  const fetcher = async input => {
    const url = new URL(String(input));
    if (url.origin === 'http://localhost' && url.pathname.includes('/assets/')) return new Response('');
    calls.push(url.pathname);
    if (['/v1/capabilities', '/v1/identity/organizations', '/v1/machines'].includes(url.pathname)) return new Response(null, { status: 404 });
    if (url.pathname === '/v1/identity/me') {
      meCalls++;
      return Response.json(meCalls < 3 ? NO_ORG : { id: 'user_A', name: 'Operator', workspace: '11', organizations: [{ id: 'org_P', name: 'Personal' }], active_organization_id: 'org_P' });
    }
    if (url.pathname === '/v1/workspaces') return Response.json({ items: [{ id: '11', org: 'org_P', name: 'Personal', role: 'owner' }], next_cursor: null });
    throw new Error(`Unexpected request ${url.pathname}`);
  };
  fetcher.__jsdomApp = true; globalThis.fetch = fetcher;
  const app = await open(t, 'listo', 'personal-org-pending', {}, undefined, {}, { web: true, beforeImport(w) {
    w.WebSocket = class { constructor() { throw new Error('No relay is approved'); } };
    globalThis.WebSocket = w.WebSocket;
  } });
  const gate = () => app.w.document.querySelector('[data-web-gate]');
  await until(() => gate()?.querySelector('[data-web-preparing]') && gate()?.querySelector('[data-web-sign-out]'));
  assert.equal(gate().querySelector('[data-web-preparing]').textContent, 'Preparando tu organización personal…');
  assert.ok(gate().querySelector('[data-web-retry]'), 'retry is offered while preparing');
  assert.equal(gate().querySelector('[data-web-empty]'), null, 'no empty state while preparing');
  assert.equal(gate().querySelector('#promo-code'), null);
  assert.equal(gate().querySelector('[role="alert"]'), null);
  assert.ok(!/Crea un plan/.test(gate().textContent));
  gate().querySelector('[data-web-retry]').click();
  await until(() => app.w.document.querySelector('[data-tira]'));
  assert.ok(meCalls >= 3);
  assert.equal(gate(), null);
  assert.deepEqual(app.failures, []);
});

test('a personal organization that never arrives ends in a clear error with retry and sign out', async t => {
  quickRetries(t);
  let meCalls = 0;
  const fetcher = async input => {
    const url = new URL(String(input));
    if (url.origin === 'http://localhost' && url.pathname.includes('/assets/')) return new Response('');
    if (['/v1/capabilities', '/v1/identity/organizations', '/v1/machines'].includes(url.pathname)) return new Response(null, { status: 404 });
    if (url.pathname === '/v1/identity/me') { meCalls++; return Response.json(NO_ORG); }
    throw new Error(`Unexpected request ${url.pathname}`);
  };
  fetcher.__jsdomApp = true; globalThis.fetch = fetcher;
  const app = await open(t, 'listo', 'personal-org-missing', {}, undefined, {}, { web: true });
  const gate = () => app.w.document.querySelector('[data-web-gate]');
  await until(() => gate()?.querySelector('[role="alert"]') && gate()?.querySelector('[data-web-sign-out]'));
  assert.equal(gate().querySelector('[role="alert"]').textContent, 'Tu organización personal no está lista. Vuelve a intentarlo en unos minutos.');
  assert.equal(gate().querySelector('[data-web-preparing]'), null);
  assert.equal(gate().querySelector('[data-web-empty]'), null);
  assert.equal(gate().querySelector('#promo-code'), null);
  const tries = meCalls;
  assert.ok(tries >= 8, `retried by itself before failing (${tries})`);
  await new Promise(resolve => setTimeout(resolve, 100));
  assert.equal(meCalls, tries, 'automatic retries stop after the error');
  gate().querySelector('[data-web-retry]').click();
  await until(() => meCalls > tries);
  assert.deepEqual(app.failures, []);
});
