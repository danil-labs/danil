import assert from 'node:assert/strict';
import test from 'node:test';
import { platformTransport } from '../../src/web/platform-session.ts';
import { createHiddenSync } from '../../src/features/shell/workspace-hidden-sync.ts';
import { edgePreferencesTransport, prefsSyncStore, syncScope, webPreferencesTransport } from '../../src/features/shell/workspace-hidden-transport.ts';

const json = (status: number, body: unknown, problem = status >= 400) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': problem ? 'application/problem+json' : 'application/json' } });
const problem = (status: number, code: string) => json(status, { type: `urn:danil:problem:${code}`, title: code, status, code });

type Route = (init: RequestInit) => Response | Promise<Response>;
function server(routes: Record<string, Route>) {
  const seen: { method: string; path: string; csrf: string | null; credentials?: RequestCredentials }[] = [];
  const request = (async (url: string, init: RequestInit = {}) => {
    const path = new URL(url).pathname;
    const method = init.method ?? 'GET';
    seen.push({ method, path, csrf: new Headers(init.headers).get('x-csrf-token'), credentials: init.credentials });
    const route = routes[`${method} ${path}`];
    return route ? route(init) : problem(404, 'not_found');
  }) as typeof fetch;
  return { seen, transport: webPreferencesTransport(platformTransport({ origin: 'https://edge.example', timeoutMs: 1000 }, request)) };
}
const CSRF = { 'GET /v1/identity/csrf': () => json(200, { csrf_token: 'tok' }) };

test('web: GET goes by cookie; PUT and DELETE ask for CSRF first and send it', async () => {
  const s = server({
    ...CSRF,
    'GET /v1/workspaces/preferences': () => json(200, { version: 3, hidden: ['ws_a'], nuevo: true }),
    'PUT /v1/workspaces/preferences/hidden/ws_b': () => new Response(null, { status: 204 }),
    'DELETE /v1/workspaces/preferences/hidden/ws_a': () => new Response(null, { status: 204 }),
  });
  assert.deepEqual(await s.transport.get(), { status: 200, body: { version: 3, hidden: ['ws_a'], nuevo: true } });
  assert.deepEqual(await s.transport.put('ws_b'), { status: 204 });
  assert.deepEqual(await s.transport.remove('ws_a'), { status: 204 });
  assert.deepEqual(s.seen.map(r => `${r.method} ${r.path} ${r.csrf ?? '-'}`), [
    'GET /v1/workspaces/preferences -',
    'GET /v1/identity/csrf -',
    'PUT /v1/workspaces/preferences/hidden/ws_b tok',
    'GET /v1/identity/csrf -',
    'DELETE /v1/workspaces/preferences/hidden/ws_a tok',
  ]);
  assert.ok(s.seen.every(r => r.credentials === 'include'), 'always the page cookie');
});

test('web: an edge refusal becomes {status, body:{code}}, also from identity/csrf', async () => {
  const s = server({
    'GET /v1/workspaces/preferences': () => problem(403, 'organization_selection_required'),
    'GET /v1/identity/csrf': () => problem(501, 'not_implemented'),
  });
  assert.deepEqual(await s.transport.get(), { status: 403, body: { code: 'organization_selection_required' } });
  assert.deepEqual(await s.transport.put('ws_b'), { status: 501, body: { code: 'not_implemented' } });
  const plain = server({ 'GET /v1/workspaces/preferences': () => new Response('nope', { status: 404 }) });
  assert.deepEqual(await plain.transport.get(), { status: 404, body: { code: null } }, 'a 404 without problem+json keeps its status');
});

test('web: a network failure rejects, and a malformed id never leaves', async () => {
  const offline = webPreferencesTransport(platformTransport({ origin: 'https://edge.example', timeoutMs: 1000 }, (async () => { throw new TypeError('Failed to fetch'); }) as typeof fetch));
  await assert.rejects(offline.get(), TypeError);
  await assert.rejects(offline.put('ws_b'), TypeError);
  const s = server(CSRF);
  assert.equal((await s.transport.put('../machines')).status, 422);
  assert.equal((await s.transport.remove('a b')).status, 422);
  assert.equal(s.seen.length, 0);
});

test('desk: one edgeFetch per operation with the exact path; its rejection passes through', async () => {
  const calls: string[] = [];
  const t = edgePreferencesTransport(async (method, path) => {
    calls.push(`${method} ${path}`);
    if (method === 'DELETE') throw { detail: 'unavailable' };
    return method === 'GET' ? { status: 403, body: { code: 'organization_selection_required' }, location: 'x' } as { status: number; body?: unknown } : { status: 204, body: null };
  });
  assert.deepEqual(await t.get(), { status: 403, body: { code: 'organization_selection_required' } });
  assert.deepEqual(await t.put('ws_b'), { status: 204, body: null });
  await assert.rejects(t.remove('ws_b'), (e: unknown) => (e as { detail?: string }).detail === 'unavailable');
  assert.equal((await t.put('no/slash')).status, 422);
  assert.deepEqual(calls, ['GET /v1/workspaces/preferences', 'PUT /v1/workspaces/preferences/hidden/ws_b', 'DELETE /v1/workspaces/preferences/hidden/ws_b']);
});

test('scope: only the rows of the active organization serve; without person, organization or rows it is local', () => {
  const rows = [
    { organization: { id: 'org_A', workspaces: [{ id: 'ws_a' }, { id: 'ws_b' }] } },
    { organization: { id: 'org_B', workspaces: [{ id: 'ws_x' }] } },
    { organization: null },
    {},
  ];
  const scope = syncScope('user_1', 'org_A', rows);
  assert.deepEqual(scope && { ...scope, served: [...scope.served] }, { person: 'user_1', organization: 'org_A', served: ['ws_a', 'ws_b'] });
  assert.equal(syncScope(null, 'org_A', rows), null);
  assert.equal(syncScope('user_1', null, rows), null);
  assert.equal(syncScope('user_1', 'org_A', []), null);
  assert.equal(syncScope('user_1', 'org_C', rows), null, 'an organization with no machine row here stays local');
});

test('the record lives under one prefs key by person:organization, and what is unreadable does not count', () => {
  let saved: unknown = { 'user_1:org_A': { migrated: true, pending: [{ op: 'add', id: 'ws_a' }, { op: 'rename', id: 'x' }, 7] }, broken: 'yes' };
  const store = prefsSyncStore(() => saved, all => { saved = all; });
  assert.deepEqual(store.read('user_1:org_A'), { migrated: true, pending: [{ op: 'add', id: 'ws_a' }] });
  assert.equal(store.read('broken'), null);
  assert.equal(store.read('user_1:org_B'), null);
  store.write('user_1:org_B', { migrated: false, pending: [] });
  assert.deepEqual(Object.keys(saved as object), ['user_1:org_A', 'broken', 'user_1:org_B'], 'writing one keeps the others');
  assert.equal(prefsSyncStore(() => ['not', 'a', 'map'], () => {}).read('user_1:org_A'), null);
});

test('web end to end: 403 organization_selection_required stays local; when the route answers, it syncs', async () => {
  let ready = false;
  const hidden = new Set<string>();
  const s = server({
    ...CSRF,
    'GET /v1/workspaces/preferences': () => (ready ? json(200, { hidden: [...hidden] }) : problem(403, 'organization_selection_required')),
    'PUT /v1/workspaces/preferences/hidden/ws_a': () => (hidden.add('ws_a'), new Response(null, { status: 204 })),
  });
  let saved: unknown = {};
  const retries: (() => void)[] = [];
  const sync = createHiddenSync({
    transport: s.transport,
    store: prefsSyncStore(() => saved, all => { saved = all; }),
    scope: () => syncScope('user_1', 'org_A', [{ organization: { id: 'org_A', workspaces: [{ id: 'ws_a' }] } }]),
    local: () => new Set(['ws_a', 'mine']),
    onChange: () => {},
    schedule: run => void retries.push(run),
  });
  await sync.sync();
  assert.equal(sync.account(), null, 'still local, nothing thrown');
  assert.equal(retries.length, 1);
  ready = true;
  await sync.sync();
  assert.deepEqual([...sync.account()!], ['ws_a'], 'the local hidden of the organization migrated; `mine` did not travel');
  assert.deepEqual([...hidden], ['ws_a']);
});
