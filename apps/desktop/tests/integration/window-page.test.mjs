import assert from 'node:assert/strict';
import test from 'node:test';
import { boot } from '../helpers/jsdom-app.mjs';
import { relay } from '../helpers/fake-relay.mjs';

const origin = new URL(process.env.DANIL_WEB_API_ORIGIN).origin;
async function until(read, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
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

test('session verification shows loading and reads me, capabilities and workspaces in parallel only once', async t => {
  const calls = [];
  const pending = new Map();
  const fetcher = async input => {
    const url = new URL(String(input));
    if (url.origin === 'http://localhost' && url.pathname.includes('/assets/')) return new Response('');
    calls.push(url.pathname);
    if (['/v1/identity/me', '/v1/capabilities', '/v1/workspaces'].includes(url.pathname)) {
      return new Promise(resolve => pending.set(url.pathname, resolve));
    }
    return new Response(null, { status: 404 });
  };
  fetcher.__jsdomApp = true; globalThis.fetch = fetcher;
  const app = await open(t, 'listo', 'parallel-session-bootstrap', {}, undefined, {}, { web: true });
  t.after(() => { for (const release of pending.values()) release(new Response(null, { status: 401 })); });
  await until(() => calls.includes('/v1/identity/me'));
  assert.ok(app.w.document.querySelector('[data-web-session-loading] [role="status"]'));
  assert.equal(app.w.document.querySelector('[data-web-auth]'), null, 'login waits for an authoritative 401');
  assert.ok(pending.has('/v1/capabilities'), 'discovery starts without waiting for the profile');
  assert.ok(pending.has('/v1/workspaces'), 'directory starts without waiting for the profile');
  pending.get('/v1/capabilities')(new Response(null, { status: 404 }));
  await until(() => calls.includes('/v1/machines'));
  assert.ok(app.w.document.querySelector('[data-web-session-loading]'), 'machines starts while the profile is still pending');
  pending.get('/v1/workspaces')(Response.json({ items: [{ id: '11', org: 'org_A', name: 'Alpha', role: 'owner' }], next_cursor: null }));
  pending.get('/v1/identity/me')(Response.json({ id: 'user_A', name: 'Operator', workspace: '11', organizations: [] }));
  await until(() => app.w.document.querySelector('[data-tira]'));
  assert.equal(calls.filter(path => path === '/v1/identity/me').length, 1);
  assert.equal(calls.filter(path => path === '/v1/workspaces').length, 1);
  assert.equal(calls.filter(path => path === '/v1/capabilities').length, 1);
  await until(() => calls.includes('/v1/machines'));
  assert.deepEqual(app.failures, []);
});

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
  await until(() => gate()?.querySelector('[role="alert"]') && gate()?.querySelector('[data-web-organization="org_B"]'));
  assert.ok(gate().querySelector('[data-web-sign-out]'), 'sign out stays visible');
  assert.ok(gate().querySelector('[data-web-organization="org_A"][aria-pressed="true"]'));
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

for (const status of [401, 403, 503]) test(`identity HTTP ${status} stays distinct before mounting a machine`, async t => {
  const calls = [];
  const fetcher = async (input, init) => {
    const url = new URL(String(input));
    if (url.origin === 'http://localhost' && url.pathname.includes('/assets/')) return new Response('');
    calls.push(url.pathname);
    if (['/v1/capabilities', '/v1/identity/organizations', '/v1/machines'].includes(url.pathname)) return new Response(null, { status: 404 });
    assert.ok(['/v1/identity/me', '/v1/workspaces'].includes(url.pathname));
    assert.equal(init.credentials, 'include');
    return new Response(null, { status });
  };
  fetcher.__jsdomApp = true; globalThis.fetch = fetcher;
  const app = await open(t, 'listo', `window-denied-${status}`, {}, undefined, { 'danil.web.previous.11.tasks': 'private' }, { web: true });
  const selector = status === 401 ? 'a[href*="/v1/identity/login"]' : status === 403 ? '[role="status"] [data-spinner]' : '[role="alert"]';
  await until(() => app.w.document.querySelector(selector));
  assert.equal(app.w.document.querySelector('[data-tira]'), null);
  if (status === 403) {
    assert.match(app.w.document.querySelector('[role="status"]').textContent, /Preparando tu cuenta/);
    assert.equal(app.w.document.querySelector('[role="alert"]'), null);
  }
assert.equal(calls.filter(path => path === '/v1/identity/me').length, 1);
  assert.equal(app.w.localStorage.getItem('danil.web.previous.11.tasks'), status === 401 ? null : 'private');
  if (status !== 401) assert.equal(app.w.document.querySelector('a[href*="/login"]'), null);
  assert.deepEqual(app.failures, []);
});

test('a window without a session shows the original WorkOS sign-in screen and its button goes to /v1/identity/login', async t => {
  const fetcher = async input => {
    const url = new URL(String(input));
    if (url.origin === 'http://localhost' && url.pathname.includes('/assets/')) return new Response('');
    if (['/v1/capabilities', '/v1/identity/organizations', '/v1/machines'].includes(url.pathname)) return new Response(null, { status: 404 });
    if (['/v1/identity/me', '/v1/workspaces'].includes(url.pathname)) return new Response(null, { status: 401 });
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

test('an authenticated session with no workspaces shows the plan empty state without asking compute', async t => {
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
  await until(() => app.w.document.querySelector('[data-web-gate]')?.textContent.includes('No tienes nada. Crea un plan.'));
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

for (const status of [403, 404]) test(`startup HTTP ${status} shows preparation and recovers without an access error`, async t => {
  let ready = false;
  const fetcher = async input => {
    const url = new URL(String(input));
    if (url.origin === 'http://localhost' && url.pathname.includes('/assets/')) return new Response('');
    if (url.pathname === '/v1/identity/me') {
      if (!ready) return Response.json({ code: 'workspace_forbidden' }, { status, headers: { 'content-type': 'application/problem+json' } });
      return Response.json({ id: 'user_A', name: 'Operator', workspace: '11', organizations: [] });
    }
    if (url.pathname === '/v1/workspaces') return Response.json({ items: [{ id: '11', org: 'org_A', name: 'Alpha', role: 'owner' }], next_cursor: null });
    return new Response(null, { status: 404 });
  };
  fetcher.__jsdomApp = true; globalThis.fetch = fetcher;
  const app = await open(t, 'listo', `account-preparing-${status}`, {}, undefined, {}, { web: true });
  const doc = app.w.document;
  await until(() => doc.querySelector('[role="status"] [data-spinner]'));
  assert.match(doc.querySelector('[role="status"]').textContent, /Preparando tu cuenta/);
  assert.equal(doc.querySelector('[role="alert"]'), null);
  ready = true;
  await until(() => doc.querySelector('[data-tira]'));
  assert.equal(doc.querySelector('[data-web-gate]'), null);
  assert.deepEqual(app.failures, []);
});

test('free startup reloads the directory and selects the appearing Free organization with CSRF', async t => {
  let ready = false;
  let selected = false;
  const fetcher = async (input, init) => {
    const path = new URL(String(input)).pathname;
    if (path === '/v1/capabilities') return Response.json({ contract: 'mvp-v1', items: ['workspaces', 'identity.organizations'].map(name => ({ name, version: 1, status: 'available' })) });
    if (path === '/v1/identity/me') return Response.json({ id: 'user_new', name: 'New account', workspace: selected ? '11' : null,
      organizations: ready ? [{ id: 'org_free', name: 'Personal' }] : [], active_organization_id: selected ? 'org_free' : null });
    if (path === '/v1/workspaces') return Response.json({ items: selected ? [{ id: '11', org: 'org_free', name: 'Personal', role: 'owner' }] : [], next_cursor: null, empty_reason: selected ? null : 'no_organization' });
    if (path === '/v1/identity/organizations') return Response.json({ items: ready ? [{ id: 'org_free', name: 'Personal', role: 'owner', plan: 'free' }] : [], active_organization_id: selected ? 'org_free' : null });
    if (path === '/v1/identity/csrf') return Response.json({ csrf_token: 'session-bound' });
    if (path === '/v1/identity/organizations/select') {
      assert.equal(init.method, 'POST');
      assert.equal(init.credentials, 'include');
      assert.equal(new Headers(init.headers).get('x-csrf-token'), 'session-bound');
      assert.ok(new Headers(init.headers).get('idempotency-key'));
      assert.deepEqual(JSON.parse(init.body), { organization_id: 'org_free' });
      selected = true;
      return Response.json({ organization: { id: 'org_free', name: 'Personal', plan: 'free' }, workspace: '11' });
    }
    return new Response(null, { status: 404 });
  };
  fetcher.__jsdomApp = true; globalThis.fetch = fetcher;
  const app = await open(t, 'listo', 'free-startup-directory', {}, undefined, {}, { web: true });
  await until(() => app.w.document.querySelector('[data-web-gate]'));
  assert.equal(app.w.document.querySelector('[role="alert"]'), null);
  ready = true;
  await until(() => selected);
  await until(() => app.failures.some(failure => /Not implemented.*navigation/s.test(failure)));
  assert.ok(app.failures.every(failure => /Not implemented.*navigation/s.test(failure)), app.failures.join('\n'));
  app.w.dispatchEvent(new app.w.Event('pagehide'));
  const resumed = await open(t, 'listo', 'free-startup-selected', {}, undefined, {}, { web: true, beforeImport(w) {
    w.history.replaceState(null, '', '/?settings=plan');
  } });
  await until(() => resumed.w.document.querySelector('[data-promo-plan] #promo-code'));
  assert.equal(resumed.w.document.querySelector('[data-web-gate]'), null);
  assert.deepEqual(resumed.failures, []);
});

test('free startup stops preparing an empty directory and offers retry without granting a plan', async t => {
  const calls = [];
  const fetcher = async input => {
    const path = new URL(String(input)).pathname;
    calls.push(path);
    if (path === '/v1/capabilities') return Response.json({ contract: 'mvp-v1', items: ['workspaces', 'identity.organizations'].map(name => ({ name, version: 1, status: 'available' })) });
    if (path === '/v1/identity/me') return Response.json({ id: 'user_pending', name: 'Pending', workspace: null, organizations: [], active_organization_id: null });
    if (path === '/v1/workspaces') return Response.json({ items: [], next_cursor: null, empty_reason: 'no_organization' });
    if (path === '/v1/identity/organizations') return Response.json({ items: [], active_organization_id: null });
    return new Response(null, { status: 404 });
  };
  fetcher.__jsdomApp = true; globalThis.fetch = fetcher;
  const app = await open(t, 'listo', 'free-startup-expired', {}, undefined, {}, { web: true });
  const doc = app.w.document;
  await until(() => doc.querySelector('[role="status"] [data-spinner]'));
  assert.match(doc.querySelector('[role="status"]').textContent, /Preparando tu cuenta/);
  await until(() => doc.querySelector('[role="alert"]'), 25_000);
  assert.equal(doc.querySelector('[data-spinner]'), null);
  assert.ok([...doc.querySelectorAll('button')].some(button => /Reintentar/.test(button.textContent)));
  assert.equal(doc.querySelector('[data-promo-plan]'), null);
  assert.ok(!calls.includes('/v1/identity/organizations/select'));
  const reads = calls.length;
  await new Promise(resolve => setTimeout(resolve, 1200));
  assert.equal(calls.length, reads, 'preparation stops polling when its budget is exhausted');
  assert.deepEqual(app.failures, []);
});

test('promo redemption opens only in the active organization plan section', async t => {
  const fetcher = async input => {
    const path = new URL(String(input)).pathname;
    if (path === '/v1/capabilities') return Response.json({ contract: 'mvp-v1', items: ['workspaces', 'identity.organizations'].map(name => ({ name, version: 1, status: 'available' })) });
    if (path === '/v1/identity/me') return Response.json({ id: 'user_demo', name: 'Workshop', workspace: '11', organizations: [] });
    if (path === '/v1/workspaces') return Response.json({ items: [{ id: '11', org: 'org_demo', name: 'Workshop', role: 'owner' }], next_cursor: null });
    if (path === '/v1/identity/organizations') return Response.json({ items: [{ id: 'org_demo', name: 'Workshop', role: 'owner', plan: 'free' }], active_organization_id: 'org_demo' });
    return new Response(null, { status: 404 });
  };
  fetcher.__jsdomApp = true;
  globalThis.fetch = fetcher;
  const app = await open(t, 'listo', 'promo-plan-location', {}, undefined, {}, { web: true, beforeImport(w) {
    w.history.replaceState(null, '', '/?settings=plan');
  } });
  await until(() => app.w.document.querySelector('[data-promo-plan] #promo-code'));
  assert.equal(app.w.document.querySelectorAll('#promo-code').length, 1);
  assert.equal(app.w.document.querySelector('[data-web-gate] #promo-code'), null);
  assert.equal(app.w.document.querySelector('[data-profile-menu] #promo-code'), null);
  assert.deepEqual(app.failures, []);
});
