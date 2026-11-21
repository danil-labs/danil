/**
 * La web con varias sesiones a la vez (plan web varias sesiones, W2–W4 y W6), contra un borde
 * simulado con dos organizaciones del mismo correo y un relay simulado:
 * - el riel sale del catálogo y de `added` de cada contexto, sin botones desactivados;
 * - abrir un workspace de otra organización es un cambio en el cliente, sin `organizations/select`,
 *   sin `workspaces/select` y sin recargar, diez veces ida y vuelta;
 * - toda llamada de la ventana lleva su `X-Danil-Session`, salvo las rutas de la sesión misma;
 * - un 401 de un contexto no cierra la página.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { boot } from '../helpers/jsdom-app.mjs';
import { engine, relay } from '../helpers/fake-relay.mjs';

const EXEMPT = new Set(['/v1/capabilities', '/v1/identity/sessions', '/v1/identity/sessions/catalog', '/v1/identity/csrf', '/v1/identity/contexts', '/v1/identity/logout']);
const ORGS = { ctx_p: 'org_p', ctx_x: 'org_x' };
const WORKSPACES = [{ id: 'wp', name: 'Personal Uno' }, { id: 'wx1', name: 'X Uno' }, { id: 'wx2', name: 'X Dos' }];

async function until(read, what = 'Window condition') {
  const deadline = Date.now() + 10000;
  while (!read()) {
    if (Date.now() > deadline) throw new Error(`${what} timed out`);
    await new Promise(resolve => setTimeout(resolve, 15));
  }
}

function edge({ expireX = () => false, lateX2 = () => true } = {}) {
  const state = { calls: [], unscoped: [], selects: [], expired: 0 };
  const echo = (context, body, init = {}) => Response.json(body, { ...init, headers: { 'X-Danil-Session-Applied': context, 'X-Danil-Session-Applied-Org': ORGS[context] } });
  const fetcher = async (input, init = {}) => {
    const url = new URL(String(input));
    if (url.origin === 'http://localhost' && url.pathname.includes('/assets/')) return new Response('');
    const context = new Headers(init.headers).get('X-Danil-Session');
    const method = init.method ?? 'GET';
    state.calls.push(`${method} ${url.pathname} ${context ?? '-'}`);
    if (!context && !EXEMPT.has(url.pathname)) state.unscoped.push(`${method} ${url.pathname}`);
    if (/\/(organizations|workspaces)\/select$/.test(url.pathname)) state.selects.push(url.pathname);
    if (context && !ORGS[context]) return Response.json({ code: 'session_not_in_set' }, { status: 401, headers: { 'content-type': 'application/problem+json' } });
    if (context === 'ctx_x' && expireX()) state.expired++;
    if (context === 'ctx_x' && expireX()) return Response.json({ code: 'session_expired', context_id: 'ctx_x' }, { status: 401, headers: { 'content-type': 'application/problem+json' } });
    switch (url.pathname) {
      case '/v1/capabilities': return Response.json({ contract: 'mvp-v1', items: ['machines', 'machines.session', 'workspaces'].map(name => ({ name, version: 1, status: 'available' })) });
      case '/v1/identity/csrf': return Response.json({ csrf_token: 'bound' });
      case '/v1/identity/sessions': return Response.json({ version: 1, items: [{ session_id: 'ses_a', sub: 'user_a', email: 'a@example.test', contexts: [
        { context_id: 'ctx_p', org: 'org_p', org_name: 'Personal', plan: 'pro', personal: true },
        { context_id: 'ctx_x', org: 'org_x', org_name: 'Org X', plan: 'pro', role: 'member' }] }], primary: 'ses_a', default_context: 'ctx_p' });
      case '/v1/identity/sessions/catalog': return Response.json({ version: 1, items: [{ session_id: 'ses_a', sub: 'user_a', email: 'a@example.test', contexts: [
        { context_id: 'ctx_p', org: 'org_p', org_name: 'Personal', catalog_state: 'listed', workspaces: [{ account_id: 'p1', engine_workspace_id: 'wp', name: 'Personal Uno' }] },
        { context_id: 'ctx_x', org: 'org_x', org_name: 'Org X', catalog_state: 'listed', workspaces: [{ account_id: 'x1', engine_workspace_id: 'wx1', name: 'X Uno' }, ...(lateX2() ? [{ account_id: 'x2', engine_workspace_id: 'wx2', name: 'X Dos' }] : [])] }] }] });
      case '/v1/identity/me': return echo(context, { id: 'user_a', name: 'QA A', email: 'a@example.test', workspace: null, organizations: [] });
      case '/v1/workspaces/preferences': return echo(context, { version: 1, added: context === 'ctx_p' ? ['wp'] : ['wx1', 'wx2'] });
      case '/v1/workspaces': return echo(context, { items: [], next_cursor: null });
      case '/v1/credits/balance': return echo(context, { items: [] });
      case '/v1/machines': return echo(context, { items: [{ machine_id: context === 'ctx_p' ? 'mp' : 'mx', name: context === 'ctx_p' ? 'Nube P' : 'Nube X', kind: 'organization', organization_id: ORGS[context], state: 'running', connection: 'connected' }], next_cursor: null });
    }
    if (/^\/v1\/machines\/m[px]\/tickets$/.test(url.pathname)) return echo(context, { ticket: 'one-use', url: `wss://connect.danil.ai${url.pathname.replace('/tickets', '/session')}`, expires_at: '2099-01-01T00:00:00Z' });
    return echo(context, {}, { status: 404 });
  };
  fetcher.__jsdomApp = true;
  globalThis.fetch = fetcher;
  return state;
}

async function open(t, name, fake, search = '') {
  const app = await boot('listo', name, {}, undefined, {}, { web: true, beforeImport(w) { if (search) w.history.replaceState(null, '', `/${search}`); w.WebSocket = fake.Socket; globalThis.WebSocket = fake.Socket; } });
  t.after(() => app.w.dispatchEvent(new app.w.Event('pagehide')));
  return app;
}

const table = { ...engine, list_workspaces: { workspaces: WORKSPACES.map(w => ({ ...w, context_root: null })), active: null }, workspaces_startup: { workspaces: WORKSPACES.map(w => ({ ...w, context_root: null })), active: null }, set_active_workspace: null };
const tile = (doc, id) => doc.querySelector(`[data-workspace-tile="${id}"]`);

test('the rail shows every organization of the cookie set from the catalog and opens each one in the client, ten times back and forth', async t => {
  const state = edge();
  const fake = relay({ table });
  const app = await open(t, 'web-multi-session-rail', fake);
  const doc = app.w.document;
  await until(() => tile(doc, 'wp') && (tile(doc, 'wx1') || doc.querySelector('[data-org-stack="org_x"]')), 'rail of both organizations');
  await until(() => fake.sockets.length >= 2, 'a relay session per organization machine');
  const rail = doc.querySelector('[data-workspace-column]');
  assert.equal(rail.querySelectorAll('[disabled], [aria-disabled="true"]').length, 0, 'no disabled control in the rail');
  for (let round = 0; round < 10; round++) {
    for (const [id, context] of [['wp', 'ctx_p'], ['wx1', 'ctx_x']]) {
      const button = tile(doc, id) ?? doc.querySelector('[data-org-stack="org_x"]');
      button.click();
      if (!tile(doc, id)) { await until(() => tile(doc, id), `stack opens ${id}`); tile(doc, id).click(); }
      await until(() => tile(doc, id)?.getAttribute('aria-current') === 'true' && tile(doc, id)?.dataset.workspaceContext === context, `open ${id} (round ${round})`);
    }
  }
  assert.match(app.w.location.search, /workspace=wx1&org=org_x&account=user_a/, 'the URL keeps the open workspace and its owner, not its context');
  assert.deepEqual(state.selects, [], 'no organizations/select nor workspaces/select');
  assert.deepEqual(state.unscoped, [], 'every window call carries its X-Danil-Session');
  await until(() => fake.calls.some(call => ['list_projects', 'list_live_sessions'].includes(call.command)), 'the open workspace reads its tasks from its machine');
  assert.deepEqual(app.failures.filter(f => !f.includes('Not implemented: HTMLCanvasElement')), [], 'no reload, no error');
});

test('a 401 of one organization (its API and its machine ticket) leaves the page and the other organization open, and marks only that group', async t => {
  const realTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (run, ms, ...rest) => realTimeout(run, ms >= 1000 ? 30 : ms, ...rest);
  t.after(() => { globalThis.setTimeout = realTimeout; });
  let expire = false;
  const state = edge({ expireX: () => expire });
  const fake = relay({ table });
  const app = await open(t, 'web-multi-session-401', fake);
  const doc = app.w.document;
  await until(() => tile(doc, 'wp') && fake.sockets.length >= 2, 'both organizations connected');
  tile(doc, 'wp').click();
  await until(() => tile(doc, 'wp')?.getAttribute('aria-current') === 'true', 'personal open');
  expire = true;
  fake.drop(4001, 'expired');
  app.w.dispatchEvent(new app.w.Event('focus'));
  await until(() => state.expired >= 1, 'X answered 401 after it expired');
  const xTile = () => tile(doc, 'wx1') ?? doc.querySelector('[data-org-stack="org_x"]');
  await until(() => {
    xTile()?.dispatchEvent(new app.w.KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true }));
    return doc.body.textContent.includes('Vuelve a entrar a esta organización');
  }, 'the X group says to sign in again');
  assert.equal(doc.querySelector('[data-web-gate]'), null, 'the page stays');
  assert.equal(doc.querySelector('[data-web-auth]'), null, 'no sign-in screen');
  assert.ok(tile(doc, 'wp'), 'the personal workspace stays in the rail');
  assert.ok(doc.querySelector('[data-rail-organization="org_x"]'), 'the X group stays, marked');
});

test('a machine that goes off keeps its tile, and a workspace added to the catalog later appears without a reload', async t => {
  const realTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (run, ms, ...rest) => realTimeout(run, ms >= 1000 ? 30 : ms, ...rest);
  t.after(() => { globalThis.setTimeout = realTimeout; });
  let late = false;
  const state = edge({ lateX2: () => late });
  const fake = relay({ table });
  const app = await open(t, 'web-multi-session-off', fake);
  const doc = app.w.document;
  await until(() => tile(doc, 'wp') && tile(doc, 'wx1') && fake.sockets.length >= 2, 'rail with both organizations');
  assert.equal(tile(doc, 'wx2'), null);
  fake.setState('offline');
  await new Promise(resolve => realTimeout(resolve, 400));
  assert.ok(tile(doc, 'wp') && tile(doc, 'wx1'), 'machines off do not remove tiles');
  late = true;
  await until(() => tile(doc, 'wx2') || doc.querySelector('[data-org-stack="org_x"]'), 'the new workspace arrives by the poll, without focus or reload');
  assert.deepEqual(state.selects, []);
  assert.deepEqual(app.failures.filter(f => f.includes('navigation')), []);
});

test('a reload opens the workspace of the URL with the session of its (email, organization)', async t => {
  const state = edge();
  const fake = relay({ table });
  const app = await open(t, 'web-multi-session-reload', fake, '?workspace=wx2&org=org_x&account=user_a');
  const doc = app.w.document;
  await until(() => tile(doc, 'wp'), 'rail after reload');
  if (!tile(doc, 'wx2')) doc.querySelector('[data-org-stack="org_x"]')?.click();
  await until(() => tile(doc, 'wx2')?.getAttribute('aria-current') === 'true' && tile(doc, 'wx2')?.dataset.workspaceContext === 'ctx_x', 'wx2 open after reload');
  assert.ok(tile(doc, 'wp') && tile(doc, 'wx1'), 'the rail is the same after reload');
  assert.deepEqual(state.selects, []);
  assert.deepEqual(state.unscoped, []);
});
