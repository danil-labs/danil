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

function edge({ expireX = () => false, lateX2 = () => true, personalPlan = 'pro', machineName = null, machineKind = 'organization', machinesFor = null, extraX = [] } = {}) {
  const state = { calls: [], unscoped: [], selects: [], expired: 0, admitted: [] };
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
      case '/v1/identity/contexts': if (state.admitFails) return Response.json({ code: 'unavailable' }, { status: 503, headers: { 'content-type': 'application/problem+json' } }); state.admitted.push(JSON.parse(String(init.body))); return Response.json({ context_id: 'ctx_x', org: 'org_x' });
      case '/v1/identity/sessions': return Response.json({ version: 1, items: [{ session_id: 'ses_a', sub: 'user_a', email: 'a@example.test', contexts: [
        { context_id: 'ctx_p', org: 'org_p', org_name: 'Personal', plan: personalPlan, personal: true },
        { context_id: 'ctx_x', org: 'org_x', org_name: 'Org X', plan: 'pro', role: 'member' }] }], primary: 'ses_a', default_context: 'ctx_p' });
      case '/v1/identity/sessions/catalog': return Response.json({ version: 1, items: [{ session_id: 'ses_a', sub: 'user_a', email: 'a@example.test', contexts: [
        { context_id: 'ctx_p', org: 'org_p', org_name: 'Personal', catalog_state: 'listed', workspaces: [{ account_id: 'p1', engine_workspace_id: 'wp', name: 'Personal Uno' }] },
        { context_id: 'ctx_x', org: 'org_x', org_name: 'Org X', catalog_state: 'listed', workspaces: [{ account_id: 'x1', engine_workspace_id: 'wx1', name: 'X Uno' }, ...(lateX2() ? [{ account_id: 'x2', engine_workspace_id: 'wx2', name: 'X Dos' }] : []), ...extraX.map(w => ({ account_id: w.account, engine_workspace_id: w.id, name: w.name }))] }] }] });
      case '/v1/identity/me': return echo(context, { id: 'user_a', name: 'QA A', email: 'a@example.test', workspace: null, organizations: [] });
      case '/v1/workspaces/preferences': return echo(context, { version: 1, added: context === 'ctx_p' ? ['wp'] : ['wx1', 'wx2', ...extraX.map(w => w.id)] });
      case '/v1/workspaces': return echo(context, { items: context === 'ctx_x' ? [{ id: 'x1', org: 'org_x', name: 'X Uno', role: 'member', engine_workspace_id: 'wx1', placement: { kind: 'organization_machine' } }] : [], next_cursor: null });
      case '/v1/credits/balance': return echo(context, { items: [] });
      case '/v1/machines': if (machinesFor) return echo(context, { items: machinesFor(context), next_cursor: null });
        return echo(context, { items: [{ machine_id: context === 'ctx_p' ? 'mp' : 'mx', name: machineName ?? (context === 'ctx_p' ? 'Nube P' : 'Nube X'), kind: machineKind, organization_id: ORGS[context], state: 'running', connection: 'connected' }], next_cursor: null });
    }
    if (/^\/v1\/machines\/m[a-z]*\/tickets$/.test(url.pathname)) return echo(context, { ticket: 'one-use', url: `wss://connect.danil.ai${url.pathname.replace('/tickets', '/session')}`, expires_at: '2099-01-01T00:00:00Z' });
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
  assert.ok(doc.querySelector('[data-web-reauth-sign-in]'), 'and it offers to sign in to X again');
  state.admitFails = true;
  doc.querySelector('[data-web-reauth-sign-in]').click();
  await until(() => doc.querySelector('[data-web-reauth-failed]'), 'a failed admission is shown on the notice');
  state.admitFails = false;
  state.admitted.length = 0;
  expire = false;
  doc.querySelector('[data-web-reauth-sign-in]').click();
  await until(() => state.admitted.length === 1, 'signing in again admits only X');
  assert.deepEqual(state.admitted, [{ organization: 'org_x', session_id: 'ses_a' }]);
  assert.deepEqual(app.failures.filter(f => f.includes('navigation')), [], 'no full login: the other organizations of the cookie stay');
  assert.ok(tile(doc, 'wp'));
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
  await until(() => {
    if (!tile(doc, 'wx2')) doc.querySelector('[data-org-stack="org_x"]')?.click();
    return tile(doc, 'wx2');
  }, 'the new workspace arrives by the poll, without focus or reload');
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

function danilRows(macLists) {
  // Las filas reales de la organización Danil en beta: la hospedada (Nube, lista solo otro workspace) y la Mac conectada.
  const machinesFor = context => context === 'ctx_x'
    ? [{ machine_id: 'mxhosted', name: 'Nube', kind: 'hosted', organization_id: 'org_x', state: 'running', connection: 'connected' },
       { machine_id: 'mxmac', name: 'Mac.domain.name', kind: 'connected', person_id: 'user_a', organization_id: 'org_x', state: 'running', connection: 'connected' }]
    : [{ machine_id: 'mp', name: 'Mac.domain.name', kind: 'connected', person_id: 'user_a', organization_id: 'org_p', state: 'running', connection: 'connected' }];
  const lists = { mxhosted: [{ id: 'acvnube', name: 'ACV NUBE', context_root: null }], mxmac: macLists ? [{ id: 'wx1', name: 'X Uno', context_root: null }] : [] };
  return { machinesFor, lists };
}

async function openDanil(t, name, macLists, target = 'wx1') {
  const { machinesFor, lists } = danilRows(macLists);
  edge({ machinesFor, extraX: [{ id: 'acvnube', name: 'ACV NUBE', account: 'x9' }] });
  const fake = relay({ table });
  const sent = [];
  const Socket = class extends fake.Socket {
    send(data) {
      const m = JSON.parse(data);
      const machine = /machines\/([a-z]+)\//.exec(this.url)?.[1];
      if (m.type === 'call') sent.push({ machine, command: m.command, workspace: m.workspace });
      if (m.type === 'call' && lists[machine] && ['list_workspaces', 'workspaces_startup', 'list_workspace_attention'].includes(m.command))
        return void setTimeout(() => this.onmessage?.({ data: JSON.stringify({ type: 'result', id: m.id, value: m.command === 'list_workspace_attention' ? [] : { workspaces: lists[machine], active: null } }) }), 0);
      return super.send(data);
    }
  };
  // Una visita anterior dejó la Mac elegida en «Ejecutar en».
  const app = await boot('listo', name, {}, undefined, {}, { web: true, beforeImport(w) { w.localStorage.setItem('danil.web.user_a.preferences.machines.run_on', JSON.stringify({ wx1: 'mxmac' })); w.WebSocket = Socket; globalThis.WebSocket = Socket; } });
  t.after(() => app.w.dispatchEvent(new app.w.Event('pagehide')));
  const doc = app.w.document;
  await until(() => (tile(doc, target) || doc.querySelector('[data-org-stack="org_x"]')) && fake.sockets.length >= 3, 'rail and the three machines');
  await until(() => {
    if (tile(doc, target)?.dataset.clicked === '1') return true;
    if (!tile(doc, target)) doc.querySelector('[data-org-stack="org_x"]')?.click();
    else if (tile(doc, target).dataset.clicked !== '1') { tile(doc, target).dataset.clicked = '1'; tile(doc, target).click(); }
    return false;
  }, `${target} open`);
  return { app, doc, sent };
}

test('a workspace that no machine lists is not sent anywhere and says so', async t => {
  const { app, doc, sent } = await openDanil(t, 'web-multi-session-unlisted', false);
  await until(() => doc.body.textContent.includes('Ninguna máquina con acceso tiene este workspace'), 'a clear notice');
  await new Promise(resolve => setTimeout(resolve, 300));
  assert.deepEqual(sent.filter(s => s.workspace === 'wx1' && ['list_live_sessions', 'list_projects', 'list_models', 'list_accounts'].includes(s.command)), [], 'nothing is asked of a machine that does not list it');
  const list = await app.w.__TAURI_INTERNALS__.invoke('machine_list');
  assert.equal(list.find(m => m.active)?.id ?? null, null, `no machine is picked: ${JSON.stringify(list)}`);
  // El encabezado nombra la última máquina elegida (la Mac guardada en «Ejecutar en»), en gris: no sirve este workspace.
  await until(() => doc.querySelector('[data-task-location-machine]')?.textContent.includes('Mac.domain.name') && doc.querySelector('[data-task-location]')?.dataset.taskLocationOn === 'false', 'the header names the last chosen machine, greyed');
  assert.equal(doc.body.textContent.includes('Sin máquina'), false);
  assert.equal([...doc.querySelectorAll('button, span')].some(e => e.textContent.trim() === 'local'), false, 'never «local» on the web');
});

test('a workspace opens on the online machine that lists it, whatever its kind', async t => {
  const { app, sent } = await openDanil(t, 'web-multi-session-listed', true);
  await until(() => sent.some(s => s.command === 'list_live_sessions' && s.workspace === 'wx1'), 'tasks of X are asked');
  const asked = sent.filter(s => ['list_live_sessions', 'list_projects', 'list_models'].includes(s.command) && s.workspace === 'wx1');
  assert.ok(asked.every(s => s.machine === 'mxmac'), `only the machine that lists it: ${JSON.stringify(asked)}`);
  const list = await app.w.__TAURI_INTERNALS__.invoke('machine_list');
  assert.equal(list.find(m => m.active)?.id ?? null, 'mxmac');
});

test('a Free personal workspace is served by its own connected machine: tasks, accounts and models carry the workspace and go to that machine', async t => {
  // El caso real de beta: la Mac de la persona, conectada a cada organización, llega como `kind: personal`.
  const state = edge({ personalPlan: 'free', machineName: 'Mac.domain.name', machineKind: 'personal' });
  const fake = relay({ table: { ...table, list_accounts: [], account_status: { connected: false }, list_models: { provider: 'codex', models: [], fallback: false } } });
  const sent = [];
  const Socket = class extends fake.Socket { send(data) { const m = JSON.parse(data); if (m.type === 'call') sent.push({ machine: /machines\/(m[px])\//.exec(this.url)?.[1], command: m.command, workspace: m.workspace }); return super.send(data); } };
  const app = await boot('listo', 'web-multi-session-free', {}, undefined, {}, { web: true, beforeImport(w) { w.WebSocket = Socket; globalThis.WebSocket = Socket; } });
  t.after(() => app.w.dispatchEvent(new app.w.Event('pagehide')));
  const doc = app.w.document;
  await until(() => tile(doc, 'wp') && fake.sockets.length >= 2, 'rail and both machines');
  tile(doc, 'wp').click();
  await until(() => tile(doc, 'wp')?.getAttribute('aria-current') === 'true', 'personal open');
  await app.w.__TAURI_INTERNALS__.invoke('list_accounts', {}).catch(() => {});
  await until(() => ['list_live_sessions', 'list_models', 'list_accounts'].every(c => sent.some(s => s.command === c && s.workspace === 'wp')), 'tasks, models and accounts of DW reach a machine');
  for (const command of ['list_live_sessions', 'list_models', 'list_accounts']) {
    const calls = sent.filter(s => s.command === command && s.workspace === 'wp');
    assert.ok(calls.every(s => s.machine === 'mp'), `${command} goes to the personal organization's machine, not X's: ${JSON.stringify(calls)}`);
  }
  assert.deepEqual(sent.filter(s => ['list_live_sessions', 'list_models', 'list_accounts'].includes(s.command) && !s.workspace), [], 'no call without its workspace');
  const names = [...doc.querySelectorAll('[data-machine-row], [data-sync-machine]')].map(e => e.textContent);
  const machineNames = (await app.w.__TAURI_INTERNALS__.invoke('machine_list')).map(m => m.name);
  assert.equal(new Set(machineNames).size, machineNames.length, `one computer in two organizations is told apart: ${machineNames.join(', ')} ${names.join(', ')}`);
  assert.deepEqual(state.selects, []);
});


test('the hosted machine\'s own workspace (ACV NUBE) shows its tasks: they are asked of the machine that lists it', async t => {
  const { doc, sent } = await openDanil(t, 'web-multi-session-acv', false, 'acvnube');
  await until(() => sent.some(s => s.command === 'list_live_sessions' && s.workspace === 'acvnube' && s.machine === 'mxhosted'), 'the task list of ACV NUBE is asked of the Nube');
  await until(() => doc.body.textContent.includes('Tarea t1'), 'its tasks are shown');
  assert.deepEqual(sent.filter(s => s.workspace === 'wx1' && s.machine === 'mxhosted' && /list_(agents|accounts|live_sessions)/.test(s.command)), [], 'nothing of another workspace goes to the Nube');
});

test('the usage control reads the active account again after switching workspaces with identical providers', async t => {
  edge();
  const fake = relay({ table: {
    ...table,
    list_providers: [{ id: 'codex', label: 'Codex', available: true, driver: true, limits: true }],
    list_accounts: ({ provider }, { workspace }) => ({
      provider, env_var: '',
      accounts: workspace === 'wx1' ? [{ id: 'cloud', label: 'Cloud', created_at: 1 }] : [],
      active: workspace === 'wx1' ? 'cloud' : null,
    }),
    account_status: { connected: true },
    account_limits: { mode: 'read', windows: [], at: Date.now() },
    list_spaces: [{ id: 'cloud-space', name: 'Cloud', folders: [], created_at: 1, updated_at: 1 }],
    send_message: 'test-task',
  } });
  const app = await open(t, 'web-usage-workspace', fake, '?workspace=wp&org=org_p&account=user_a');
  const doc = app.w.document;
  await until(() => fake.calls.some(c => c.command === 'list_accounts' && c.workspace === 'wp'), 'usage reads the initial workspace');
  if (!tile(doc, 'wx1')) doc.querySelector('[data-org-stack="org_x"]')?.click();
  await until(() => tile(doc, 'wx1'), 'organization workspace tile');
  tile(doc, 'wx1').click();
  await until(() => fake.calls.some(c => c.command === 'account_limits' && c.workspace === 'wx1' && c.args.id === 'cloud'), 'usage reads the cloud account');
  await until(() => doc.querySelector('button[aria-label="Lo que te queda en las cuentas activas"]'), 'usage button appears');
  const headers = { 'x-danil-context': 'ctx_x', 'x-terminus-workspace': 'wx1', 'x-terminus-machine': 'mx' };
  const workspaceSpaces = await app.w.__TAURI_INTERNALS__.invoke('list_spaces', {}, { headers });
  assert.equal(workspaceSpaces[0].id, 'mx~cloud-space');
  const task = await app.w.__TAURI_INTERNALS__.invoke('send_message', { text: 'Test', space: workspaceSpaces[0].id }, { headers });
  assert.equal(task, 'mx~test-task');
  assert.ok(fake.calls.some(c => c.command === 'send_message' && c.workspace === 'wx1' && c.args.space === 'cloud-space'));

});
