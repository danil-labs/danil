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


for (const status of [501, 503]) test(`/v1/workspaces ${status} mounts the window and keeps reading the list by itself`, async t => {
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
  const doc = app.w.document;
  await until(() => doc.querySelector('[data-tira]'));
  assert.equal(doc.querySelector('[data-web-gate]'), null);
  await until(() => calls.filter(path => path === '/v1/workspaces').length >= 2);
  doc.querySelector('[data-profile-menu] button').click();
  await until(() => doc.querySelector('[data-sign-out]'));
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

test('a 403 from identity on the first mount keeps loading and retries by itself until the profile arrives', async t => {
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
  await until(() => meCalls >= 1);
  assert.equal(gate(), null, 'no blocking screen while identity is retried');
  assert.equal(app.w.document.querySelector('[data-web-auth]'), null, 'no sign-in while the session is checked');
  assert.equal(app.w.document.querySelector('[role="alert"]'), null, 'no fatal access error on the first mount');
  await until(() => app.w.document.querySelector('[data-tira]'));
  assert.ok(meCalls >= 2, 'identity was read again without the person asking');
  assert.equal(gate(), null);
  assert.ok(calls.includes('GET /v1/identity/me'));
  assert.deepEqual(app.failures, []);
});

test('an empty workspace list on the first mount mounts the window and adopts the workspace when it arrives', async t => {
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
  const doc = app.w.document;
  await until(() => doc.querySelector('[data-tira]'));
  assert.ok(listed >= 1, 'the window mounts on the empty answer');
  assert.equal(gate(), null);
  await until(() => listed >= 2);
  doc.querySelector('[data-profile-menu] button').click();
  await until(() => [...doc.querySelectorAll('button[aria-pressed="true"]')].some(b => b.textContent === 'Alpha'));
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
  const selector = status === 401 ? 'a[href*="/v1/identity/login"]' : '[data-web-loading]';
  await until(() => app.w.document.querySelector(selector));
  assert.equal(app.w.document.querySelector('[data-tira]'), null);
  assert.ok(calls.includes('/v1/capabilities'));
  assert.ok(calls.includes('/v1/identity/me'));
  assert.equal(app.w.localStorage.getItem('danil.web.previous.11.tasks'), status === 401 ? null : 'private');
  if (status === 401) assert.deepEqual([...calls].sort(), ['/v1/capabilities', '/v1/identity/me']);
  else {
    // 403/503 en el primer montaje no son fatales: sigue la carga y se reintenta solo.
    assert.equal(app.w.document.querySelector('[role="alert"]'), null);
    assert.equal(app.w.document.querySelector('[data-web-gate]'), null);
    assert.equal(app.w.document.querySelector('[data-web-auth]'), null);
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
  // P6: cualquiera puede darse de alta; nada de pedir acceso. El aviso del código y la contraseña se queda.
  assert.equal(screen.querySelector('[data-access-request]'), null);
  assert.ok(!screen.textContent.includes('Solicitar acceso'), screen.textContent);
  assert.ok(!screen.textContent.includes('hola@danil.ai'), screen.textContent);
  assert.ok(screen.textContent.includes('Puedes entrar con un código que te enviamos por correo.'), 'the password hint stays (product-lead, 2026-11-19)');
  assert.equal(screen.querySelector('[aria-busy]'), null);
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

test('an authenticated session with no workspaces mounts the window without the plan empty state or compute', async t => {
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
  await until(() => app.w.document.querySelector('[data-tira]'));
  assert.equal(app.w.document.querySelector('[data-web-gate]'), null);
  assert.ok(!app.w.document.body.textContent.includes('No tienes nada'));
  assert.ok(!calls.some(path => path.startsWith('/v1/compute')));
  assert.deepEqual(app.failures, []);
});

// P2 de la revisión: la espera del primer montaje tiene salida, y agotada deja «Reintentar» y «Cerrar sesión».
for (const end of ['sign out', 'exhausted']) test(`identity retried on the first mount offers a way out (${end})`, async t => {
  const realTimeout = globalThis.setTimeout;
  // Los ocho reintentos tardan unos dos minutos: aquí cada espera larga dura un instante.
  if (end === 'exhausted') globalThis.setTimeout = (run, ms, ...rest) => realTimeout(run, ms >= 1000 ? 5 : ms, ...rest);
  t.after(() => { globalThis.setTimeout = realTimeout; });
  let meCalls = 0;
  const calls = [];
  const fetcher = async (input, init) => {
    const url = new URL(String(input));
    if (url.origin === 'http://localhost' && url.pathname.includes('/assets/')) return new Response('');
    calls.push(`${init?.method ?? 'GET'} ${url.pathname}`);
    if (['/v1/capabilities', '/v1/identity/organizations', '/v1/machines'].includes(url.pathname)) return new Response(null, { status: 404 });
    if (url.pathname === '/v1/identity/me') { meCalls++; return new Response(JSON.stringify({ code: 'forbidden' }), { status: 403, headers: { 'content-type': 'application/problem+json' } }); }
    if (url.pathname === '/v1/identity/csrf') return Response.json({ csrf_token: 'bound' });
    if (url.pathname === '/v1/identity/logout') return new Response(null, { status: 204 });
    throw new Error(`Unexpected request ${url.pathname}`);
  };
  fetcher.__jsdomApp = true; globalThis.fetch = fetcher;
  const app = await open(t, 'listo', `first-mount-way-out-${end.length}`, {}, undefined, {}, { web: true });
  const doc = app.w.document;
  if (end === 'sign out') {
    await until(() => doc.querySelector('[data-web-loading] [data-web-sign-out]'));
    assert.equal(doc.querySelector('[data-web-auth]'), null);
    doc.querySelector('[data-web-loading] [data-web-sign-out]').click();
    await until(() => doc.querySelector('a[href*="/v1/identity/login"]'));
    assert.ok(calls.includes('POST /v1/identity/logout'));
  } else {
    await until(() => doc.querySelector('[data-web-gate] [role="alert"]'));
    assert.ok(meCalls >= 8, 'every first-mount attempt, then the error');
    assert.ok([...doc.querySelectorAll('[data-web-gate] button')].some(b => /Reintentar|Retry/.test(b.textContent)), 'retry is offered');
    assert.ok(doc.querySelector('[data-web-gate] [data-web-sign-out]'), 'sign out is offered');
  }
  assert.deepEqual(app.failures, []);
});

test('sign out stays active and stable through the retries, and a click during a read cancels and signs out', async t => {
  const realTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (run, ms, ...rest) => realTimeout(run, ms >= 1000 ? 150 : ms, ...rest);
  t.after(() => { globalThis.setTimeout = realTimeout; });
  let meCalls = 0;
  let hold = false;
  let release;
  const calls = [];
  const fetcher = async (input, init) => {
    const url = new URL(String(input));
    if (url.origin === 'http://localhost' && url.pathname.includes('/assets/')) return new Response('');
    calls.push(`${init?.method ?? 'GET'} ${url.pathname}`);
    if (['/v1/capabilities', '/v1/identity/organizations', '/v1/machines'].includes(url.pathname)) return new Response(null, { status: 404 });
    if (url.pathname === '/v1/identity/me') {
      meCalls++;
      if (hold) await new Promise(resolve => { release = resolve; });
      return hold ? Response.json({ id: 'user_A', name: 'Operator', workspace: '11', organizations: [] })
        : new Response(JSON.stringify({ code: 'forbidden' }), { status: 403, headers: { 'content-type': 'application/problem+json' } });
    }
    if (url.pathname === '/v1/workspaces') return Response.json({ items: [{ id: '11', org: 'org_A', name: 'Alpha', role: 'owner' }], next_cursor: null });
    if (url.pathname === '/v1/identity/csrf') return Response.json({ csrf_token: 'bound' });
    if (url.pathname === '/v1/identity/logout') return new Response(null, { status: 204 });
    throw new Error(`Unexpected request ${url.pathname}`);
  };
  fetcher.__jsdomApp = true; globalThis.fetch = fetcher;
  const app = await open(t, 'listo', 'loading-sign-out-stable', {}, undefined, {}, { web: true });
  const doc = app.w.document;
  await until(() => doc.querySelector('[data-web-loading] [data-web-sign-out]'));
  const screen = doc.querySelector('[data-web-loading]');
  const button = screen.querySelector('[data-web-sign-out]');
  const seen = meCalls;
  await until(() => meCalls >= seen + 2);
  assert.equal(doc.querySelector('[data-web-loading]'), screen, 'the loading screen is not painted again on each retry');
  assert.equal(screen.querySelector('[data-web-sign-out]'), button, 'the same button keeps its place and focus');
  assert.equal(button.disabled, false, 'sign out stays active during the retries');
  assert.equal(screen.getAttribute('aria-busy'), null);
  hold = true;
  await until(() => release);
  assert.equal(button.disabled, false, 'still active while a read is in flight');
  button.click();
  await until(() => doc.querySelector('a[href*="/v1/identity/login"]'));
  assert.ok(calls.includes('POST /v1/identity/logout'));
  const after = meCalls;
  release();
  await new Promise(resolve => realTimeout(resolve, 400));
  assert.equal(doc.querySelector('[data-tira]'), null, 'the late identity reply does not mount the window');
  assert.equal(meCalls, after, 'no retry after signing out');
  assert.ok(doc.querySelector('a[href*="/v1/identity/login"]'));
  assert.deepEqual(app.failures, []);
});

// P1: identity crea la organización Free al darse de alta y workspaces la tiene ~40 s después.
test('a brand-new account enters the window at once, without onboarding, and adopts its workspace in the background', async t => {
  const { engine } = await import('../helpers/fake-relay.mjs');
  const calls = [];
  let ready = false;
  const fake = relay({ table: { ...engine, list_workspaces: { workspaces: [], active: null }, workspaces_startup: { workspaces: [], active: null } } });
  const fetcher = async (input, init) => {
    const url = new URL(String(input));
    if (url.origin === 'http://localhost' && url.pathname.includes('/assets/')) return new Response('');
    calls.push(`${init?.method ?? 'GET'} ${url.pathname}`);
    if (url.pathname === '/v1/capabilities') return Response.json({ contract: 'mvp-v1', items: ['machines', 'machines.session', 'workspaces'].map(name => ({ name, version: 1, status: 'available' })) });
    if (url.pathname === '/v1/identity/me') return Response.json({ id: 'user_N', name: 'New', workspace: ready ? '21' : null, organizations: [] });
    if (url.pathname === '/v1/workspaces') return ready ? Response.json({ items: [{ id: '21', org: 'org_N', name: 'Mi espacio', role: 'owner' }], next_cursor: null })
      : new Response(JSON.stringify({ code: 'organization_selection_required' }), { status: 403, headers: { 'content-type': 'application/problem+json' } });
    if (url.pathname === '/v1/identity/csrf') return Response.json({ csrf_token: 'bound' });
    if (url.pathname === '/v1/machines') return Response.json({ items: [{ machine_id: 'm1', name: 'Danil', state: 'running', connection: 'connected' }], next_cursor: null });
    if (url.pathname === '/v1/machines/m1/tickets') return Response.json({ ticket: 'one-use', url: 'wss://connect.danil.ai/v1/machines/m1/session', expires_at: '2099-01-01T00:00:00Z' });
    if (url.pathname === '/v1/identity/organizations') return new Response(null, { status: 404 });
    throw new Error(`Unexpected request ${url.pathname}`);
  };
  fetcher.__jsdomApp = true; globalThis.fetch = fetcher;
  const app = await open(t, 'listo', 'brand-new-account', {}, undefined, {}, { web: true, beforeImport(w) { w.WebSocket = fake.Socket; globalThis.WebSocket = fake.Socket; } });
  const doc = app.w.document;
  await until(() => doc.querySelector('[data-tira]'));
  await until(() => fake.calls.some(c => c.command === 'workspaces_startup' || c.command === 'list_workspaces'));
  await new Promise(resolve => setTimeout(resolve, 300));
  assert.equal(doc.querySelector('[data-web-gate]'), null, 'no blocking screen');
  assert.equal(doc.querySelector('[data-web-onboarding]'), null, 'no «Crea tu workspace» onboarding on the web');
  assert.ok(!doc.body.textContent.includes('Preparando tu espacio'));
  await until(() => doc.querySelector('[data-web-preparing-workspace]'));
  assert.equal(doc.querySelector('[data-web-preparing-workspace]').getAttribute('role'), 'status', 'a notice that does not interrupt');
  assert.equal(doc.querySelector('[data-web-preparing-workspace]').textContent, 'Preparando tu workspace…');
  const meBefore = calls.filter(call => call === 'GET /v1/identity/me').length;
  await until(() => calls.filter(call => call === 'GET /v1/identity/me').length > meBefore);
  const tira = doc.querySelector('[data-tira]');
  ready = true;
  doc.querySelector('[data-profile-menu] button').click();
  await until(() => [...doc.querySelectorAll('button[aria-pressed="true"]')].some(b => b.textContent === 'Mi espacio'));
  assert.equal(doc.querySelector('[data-tira]'), tira, 'the same window stays mounted, without reloading');
  await until(() => !doc.querySelector('[data-web-preparing-workspace]'));
  assert.equal(doc.querySelector('[data-web-gate]'), null);
  assert.equal(doc.querySelector('[data-web-onboarding]'), null);
  assert.deepEqual(app.failures, []);
});

// P5: con sesión válida, mientras se comprueba se ve la carga y nunca la entrada.
test('a valid session shows only the loading screen while it is checked and then the window, never the sign-in', async t => {
  let release;
  const held = new Promise(resolve => { release = resolve; });
  const fetcher = async input => {
    const url = new URL(String(input));
    if (url.origin === 'http://localhost' && url.pathname.includes('/assets/')) return new Response('');
    if (['/v1/capabilities', '/v1/identity/organizations', '/v1/machines'].includes(url.pathname)) return new Response(null, { status: 404 });
    if (url.pathname === '/v1/identity/me') { await held; return Response.json({ id: 'user_A', name: 'Operator', workspace: '11', organizations: [] }); }
    if (url.pathname === '/v1/workspaces') return Response.json({ items: [{ id: '11', org: 'org_A', name: 'Alpha', role: 'owner' }], next_cursor: null });
    throw new Error(`Unexpected request ${url.pathname}`);
  };
  fetcher.__jsdomApp = true; globalThis.fetch = fetcher;
  let signIn = 0;
  const app = await open(t, 'listo', 'valid-session-loading', {}, undefined, {}, { web: true, beforeImport(w) {
    new w.MutationObserver(() => { if (w.document.querySelector('[data-web-auth]')) signIn++; }).observe(w.document, { childList: true, subtree: true });
  } });
  const doc = app.w.document;
  await until(() => doc.querySelector('[data-web-loading]'));
  assert.equal(doc.querySelector('[data-web-auth]'), null);
  assert.equal(doc.querySelector('a[href*="/v1/identity/login"]'), null, 'no sign-in button while loading');
  assert.equal(doc.querySelector('[data-web-loading] button, [data-web-loading] a'), null);
  release();
  await until(() => doc.querySelector('[data-tira]'));
  assert.equal(doc.querySelector('[data-web-loading]'), null);
  assert.equal(signIn, 0, 'the sign-in screen never painted');
  assert.deepEqual(app.failures, []);
});

test('a sign-in return error stays visible with its button active while the session is checked', async t => {
  const fetcher = async input => {
    const url = new URL(String(input));
    if (url.origin === 'http://localhost' && url.pathname.includes('/assets/')) return new Response('');
    if (['/v1/capabilities', '/v1/identity/organizations', '/v1/machines'].includes(url.pathname)) return new Response(null, { status: 404 });
    if (url.pathname === '/v1/identity/me') return new Promise(() => {});
    throw new Error(`Unexpected request ${url.pathname}`);
  };
  fetcher.__jsdomApp = true; globalThis.fetch = fetcher;
  const app = await open(t, 'listo', 'return-error', {}, undefined, {}, { web: true, beforeImport(w) { w.history.replaceState(null, '', '/?error=callback_failed'); } });
  const doc = app.w.document;
  await until(() => doc.querySelector('[data-web-auth="workos"] [role="alert"]'));
  assert.ok(doc.querySelector('[data-web-auth="workos"] a[href*="/v1/identity/login"]'), 'the button stays active');
  assert.equal(doc.querySelector('[data-web-loading]'), null);
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
const SELECTION = () => new Response(JSON.stringify({ type: 'urn:danil:problem:workspace_selection_required', status: 403, code: 'workspace_selection_required' }), { status: 403, headers: { 'content-type': 'application/problem+json' } });
const TWO = [{ id: '11', org: 'org_B', name: 'Alpha', role: 'owner' }, { id: '12', org: 'org_B', name: 'Beta', role: 'owner' }];
for (const [label, me, workspaces] of [
  ['403 workspace_selection_required', SELECTION, TWO],
  ['403 workspace_selection_required and no workspaces', SELECTION, []],
  ['200 with workspace null', () => Response.json({ id: 'user_A', name: 'Operator', workspace: null, organizations: [] }), []],
]) test(`an organization without a workspace (${label}) offers the organization selector and sign out, never «No tienes nada»`, async t => {
  const calls = [];
  const fetcher = async input => {
    const url = new URL(String(input));
    if (url.origin === 'http://localhost' && url.pathname.includes('/assets/')) return new Response('');
    calls.push(url.pathname);
    if (url.pathname === '/v1/identity/me') return me();
    if (url.pathname === '/v1/capabilities') return Response.json(CAPS);
    if (url.pathname === '/v1/identity/organizations') return Response.json(ORGS);
    if (url.pathname === '/v1/workspaces') return Response.json({ items: workspaces, next_cursor: null });
    throw new Error(`Unexpected request ${url.pathname}`);
  };
  fetcher.__jsdomApp = true; globalThis.fetch = fetcher;
  const app = await open(t, 'listo', `org-without-workspace-${label.length}`, {}, undefined, {}, { web: true });
  const doc = app.w.document;
  if (label.startsWith('403') && workspaces.length === 0) {
    // Sin workspace que elegir no hay caja vacía: la carga, con cerrar sesión, y se reintenta.
    await until(() => doc.querySelector('[data-web-loading] [data-web-sign-out]'));
    assert.equal(doc.querySelector('[data-web-gate]'), null);
    assert.equal(doc.querySelector('[data-web-auth]'), null);
  } else if (label.startsWith('403')) {
    // Varios workspaces y ninguno elegido: identity no da perfil y se elige aquí.
    const gate = () => doc.querySelector('[data-web-gate]');
    await until(() => gate()?.querySelector('[data-web-organization="org_A"]'));
    assert.equal(gate().querySelector('[role="alert"]'), null, 'no «No tienes acceso»');
    assert.ok(gate().querySelector('[data-web-organization="org_B"][aria-pressed="true"]'), 'the active one is marked');
    assert.ok(gate().querySelector('[data-web-sign-out]'), 'sign out is offered');
    assert.deepEqual([...gate().querySelectorAll('button')].map(b => b.textContent).filter(name => ['Alpha', 'Beta'].includes(name)), ['Alpha', 'Beta']);
  } else {
    await until(() => doc.querySelector('[data-tira]'));
    assert.equal(doc.querySelector('[data-web-gate]'), null);
    doc.querySelector('[data-profile-menu] button').click();
    await until(() => doc.querySelector('[data-sign-out]'));
  }
  assert.ok(!doc.body.textContent.includes('No tienes nada'));
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

// H2: la ventana montada resuelve sola la organización de una cuenta nueva.
const ORG_CAPS = { contract: 'mvp-v1', items: ['identity.organizations'].map(name => ({ name, version: 1, status: 'available' })) };
const NEW_ORG = { id: 'org_N', name: 'Personal', plan: 'free', role: 'owner' };
const problemOf = (status, code, extra = {}) => new Response(JSON.stringify({ type: `urn:danil:problem:${code}`, status, code, ...extra }), { status, headers: { 'content-type': 'application/problem+json' } });
const navigations = app => app.failures.filter(f => f.includes('Not implemented: navigation'));
const others = app => app.failures.filter(f => !f.includes('Not implemented: navigation'));

/** Una cuenta nueva sin workspace; `select` contesta lo que diga la prueba y el canje exige contexto. */
function newAccount({ orgs = [NEW_ORG], orgsAfter, after = edge => edge.listed > 1, machines, select = () => Response.json({ organization: NEW_ORG, workspace: null }), me = () => ({ id: 'user_N', name: 'New', workspace: null, organizations: [] }) } = {}) {
  const edge = { calls: [], redeemed: [], selected: null, listed: 0, me: 0 };
  const fetcher = async (input, init) => {
    const url = new URL(String(input));
    if (url.origin === 'http://localhost' && url.pathname.includes('/assets/')) return new Response('');
    edge.calls.push(`${init?.method ?? 'GET'} ${url.pathname}`);
    if (url.pathname === '/v1/capabilities') return Response.json(machines ? { ...ORG_CAPS, items: [...ORG_CAPS.items, { name: 'machines', version: 1, status: 'available' }] } : ORG_CAPS);
    if (url.pathname === '/v1/machines') return machines ? machines(edge) : new Response(null, { status: 404 });
    if (url.pathname === '/v1/identity/me') { edge.me++; return Response.json(me(edge)); }
    if (url.pathname === '/v1/identity/csrf') return Response.json({ csrf_token: 'bound' });
    if (url.pathname === '/v1/identity/organizations') {
      edge.listed++;
      const items = orgsAfter && after(edge) ? orgsAfter : orgs;
      return Response.json({ items, next_cursor: null, active_organization_id: edge.selected });
    }
    if (url.pathname === '/v1/identity/organizations/select') {
      const reply = await select(JSON.parse(init.body).organization_id);
      if (reply.ok) edge.selected = JSON.parse(init.body).organization_id;
      return reply;
    }
    if (url.pathname === '/v1/workspaces/promo/redeem') {
      edge.redeemed.push(new Headers(init.headers).get('idempotency-key'));
      return edge.selected ? Response.json({ machine: { state: 'provisioning' } }) : problemOf(403, 'organization_selection_required');
    }
    throw new Error(`Unexpected request ${url.pathname}`);
  };
  fetcher.__jsdomApp = true; globalThis.fetch = fetcher;
  return edge;
}

test('Q1: a new account with one organization and none active selects it by itself', async t => {
  const edge = newAccount();
  const app = await open(t, 'listo', 'h2-q1', {}, undefined, {}, { web: true });
  await until(() => app.w.document.querySelector('[data-tira]'));
  await until(() => edge.selected === 'org_N');
  assert.equal(edge.calls.filter(c => c === 'POST /v1/identity/organizations/select').length, 1);
  assert.deepEqual(navigations(app), [], 'no sign-in');
  assert.deepEqual(others(app), []);
});

test('Q1b: when me returns the selected organization as active the page reloads once, without a loop', async t => {
  const edge = newAccount({ me: edge => ({ id: 'user_N', name: 'New', workspace: null, organizations: edge.selected ? [NEW_ORG] : [], active_organization_id: edge.selected }) });
  const app = await open(t, 'listo', 'h2-q1b', {}, undefined, {}, { web: true });
  await until(() => edge.selected === 'org_N');
  await until(() => navigations(app).length === 1);
  const me = edge.me;
  await new Promise(resolve => setTimeout(resolve, 2500));
  assert.equal(navigations(app).length, 1, 'one reload when the personal organization is chosen');
  assert.equal(edge.me, me, 'nothing keeps polling after the reload');
  assert.equal(edge.calls.filter(c => c === 'POST /v1/identity/organizations/select').length, 1);
  assert.deepEqual(others(app), []);
});

test('Q2: organization_auth_required on select goes to the sign-in once, without a blocking screen', async t => {
  const edge = newAccount({ select: () => problemOf(409, 'organization_auth_required', { organization: 'org_N' }) });
  const app = await open(t, 'listo', 'h2-q2', {}, undefined, {}, { web: true });
  await until(() => navigations(app).length === 1);
  assert.ok(app.w.sessionStorage.getItem('danil.web.org-auth.org_N'), 'the loop guard is marked for that organization');
  await new Promise(resolve => setTimeout(resolve, 1500));
  assert.equal(navigations(app).length, 1, 'a single redirect');
  assert.equal(edge.calls.filter(c => c === 'POST /v1/identity/organizations/select').length, 1);
  assert.equal(app.w.document.querySelector('[data-web-gate]'), null);
  assert.deepEqual(others(app), []);
});

test('Q3: the same 409 right after coming back does not redirect again and offers to sign in again', async t => {
  newAccount({ select: () => problemOf(409, 'organization_auth_required', { organization: 'org_N' }) });
  const app = await open(t, 'listo', 'h2-q3', {}, undefined, {}, { web: true, beforeImport(w) { w.sessionStorage.setItem('danil.web.org-auth.org_N', String(Date.now() - 30_000)); } });
  const doc = app.w.document;
  await until(() => doc.querySelector('[data-tira]'));
  doc.querySelector('[data-profile-menu] button').click();
  await until(() => doc.querySelector('[data-web-reauth-sign-in]'));
  const again = doc.querySelector('[data-web-reauth-sign-in]');
  assert.equal(again.disabled, false, 'the button is active');
  assert.match(again.textContent, /Volver a iniciar sesión/);
  assert.deepEqual(navigations(app), [], 'no second redirect');
  again.click();
  await until(() => navigations(app).length === 1);
  assert.deepEqual(others(app), []);
});

test('Q5: several organizations and none active keep the selector, without selecting by themselves', async t => {
  const edge = newAccount({ orgs: [NEW_ORG, { id: 'org_O', name: 'Otra', plan: 'team', role: 'member' }] });
  const app = await open(t, 'listo', 'h2-q5', {}, undefined, {}, { web: true });
  const doc = app.w.document;
  await until(() => doc.querySelector('[data-tira]'));
  await until(() => edge.listed >= 1);
  await new Promise(resolve => setTimeout(resolve, 1500));
  assert.ok(!edge.calls.includes('POST /v1/identity/organizations/select'), 'no automatic selection');
  const state = edge.calls.filter(c => c === 'GET /v1/identity/organizations').length;
  assert.ok(state >= 1, 'the organizations were read');
  assert.deepEqual(navigations(app), []);
  assert.deepEqual(others(app), []);
});

// P2 de la revisión de H2: la organización llega después de montar y la ventana la elige sola, sin canjear.
for (const [label, machines] of [
  ['/v1/machines answers 403 organization_selection_required', edge => edge.selected ? Response.json({ items: [], next_cursor: null }) : problemOf(403, 'organization_selection_required')],
  ['no route answers 403', null],
]) test(`an organization created after mounting is selected by itself (${label})`, async t => {
  const edge = newAccount({ orgs: [], orgsAfter: [NEW_ORG], ...(machines ? { machines } : {}) });
  const app = await open(t, 'listo', `h2-late-org-${label.length}`, {}, undefined, {}, { web: true });
  await until(() => app.w.document.querySelector('[data-tira]'));
  await until(() => edge.selected === 'org_N');
  assert.ok(edge.listed >= 2, 'the list was read again');
  assert.deepEqual(edge.redeemed, [], 'nobody redeemed');
  assert.deepEqual(navigations(app), []);
  assert.deepEqual(others(app), []);
});
