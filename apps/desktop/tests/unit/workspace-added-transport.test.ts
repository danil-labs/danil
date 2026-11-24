import assert from 'node:assert/strict';
import test from 'node:test';
import { platformTransport } from '../../../../packages/session/src/platform-session.ts';
import { createAddedSync } from '../../../../packages/shell/src/shell/workspace-added-sync.ts';
import { edgeAddedTransport, prefsAddedStore, webAddedTransport } from '../../../../packages/shell/src/shell/workspace-added-transport.ts';

const json = (status: number, body: unknown, problem = status >= 400) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': problem ? 'application/problem+json' : 'application/json' } });
const problem = (status: number, code: string) => json(status, { type: `urn:danil:problem:${code}`, title: code, status, code });

type Route = (init: RequestInit) => Response | Promise<Response>;
function server(routes: Record<string, Route>) {
  const seen: { method: string; path: string; csrf: string | null; body: string | null; credentials?: RequestCredentials }[] = [];
  const request = (async (url: string, init: RequestInit = {}) => {
    const path = new URL(url).pathname;
    const method = init.method ?? 'GET';
    seen.push({ method, path, csrf: new Headers(init.headers).get('x-csrf-token'), body: typeof init.body === 'string' ? init.body : null, credentials: init.credentials });
    const route = routes[`${method} ${path}`];
    return route ? route(init) : problem(404, 'not_found');
  }) as typeof fetch;
  return { seen, transport: webAddedTransport(platformTransport({ origin: 'https://edge.example', timeoutMs: 1000 }, request)) };
}
const CSRF = { 'GET /v1/identity/csrf': () => json(200, { csrf_token: 'tok' }) };

test('web: GET by cookie; PUT, DELETE and the seed ask for CSRF and send it', async () => {
  const s = server({
    ...CSRF,
    'GET /v1/workspaces/preferences': () => json(200, { version: 0, added: [], nuevo: true }),
    'PUT /v1/workspaces/preferences/added/ws_b': () => new Response(null, { status: 204 }),
    'DELETE /v1/workspaces/preferences/added/ws_a': () => new Response(null, { status: 204 }),
    'PUT /v1/workspaces/preferences': () => problem(409, 'already_initialized'),
  });
  assert.deepEqual(await s.transport.get(), { status: 200, body: { version: 0, added: [], nuevo: true } });
  assert.deepEqual(await s.transport.put('ws_b'), { status: 204 });
  assert.deepEqual(await s.transport.remove('ws_a'), { status: 204 });
  assert.deepEqual(await s.transport.seed(['ws_a']), { status: 409, body: { code: 'already_initialized' } });
  assert.deepEqual(s.seen.map(r => `${r.method} ${r.path} ${r.csrf ?? '-'}`), [
    'GET /v1/workspaces/preferences -',
    'GET /v1/identity/csrf -', 'PUT /v1/workspaces/preferences/added/ws_b tok',
    'GET /v1/identity/csrf -', 'DELETE /v1/workspaces/preferences/added/ws_a tok',
    'GET /v1/identity/csrf -', 'PUT /v1/workspaces/preferences tok',
  ]);
  assert.deepEqual(JSON.parse(s.seen.at(-1)?.body ?? 'null'), { added: ['ws_a'], if_version: 0 });
  assert.ok(s.seen.every(r => r.credentials === 'include'), 'always the page cookie');
});

test('web: a refusal keeps its status and code; a network failure rejects; a malformed id never leaves', async () => {
  const s = server({ 'GET /v1/workspaces/preferences': () => problem(403, 'organization_selection_required') });
  assert.deepEqual(await s.transport.get(), { status: 403, body: { code: 'organization_selection_required' } });
  const offline = webAddedTransport(platformTransport({ origin: 'https://edge.example', timeoutMs: 1000 }, (async () => { throw new TypeError('Failed to fetch'); }) as typeof fetch));
  await assert.rejects(offline.get(), TypeError);
  const quiet = server(CSRF);
  assert.equal((await quiet.transport.put('../machines')).status, 422);
  assert.equal((await quiet.transport.remove('a b')).status, 422);
  assert.equal(quiet.seen.length, 0);
});

test('desk: one edgeFetch per operation with the exact path and the seed body', async () => {
  const calls: string[] = [];
  const t = edgeAddedTransport(async (method, path, body) => {
    calls.push(`${method} ${path}${body ? ` ${JSON.stringify(body)}` : ''}`);
    return { status: method === 'GET' ? 403 : 204, body: method === 'GET' ? { code: 'organization_selection_required' } : null };
  });
  assert.deepEqual(await t.get(), { status: 403, body: { code: 'organization_selection_required' } });
  await t.put('ws_b');
  await t.remove('ws_b');
  await t.seed(['ws_a', 'ws_b']);
  assert.equal((await t.put('no/slash')).status, 422);
  assert.deepEqual(calls, [
    'GET /v1/workspaces/preferences',
    'PUT /v1/workspaces/preferences/added/ws_b',
    'DELETE /v1/workspaces/preferences/added/ws_b',
    'PUT /v1/workspaces/preferences {"added":["ws_a","ws_b"],"if_version":0}',
  ]);
});

test('the record lives under one prefs key by person:organization; what is unreadable does not count', () => {
  let saved: unknown = { 'user_1:org_A': { local: ['ws_a', 'no.dots', 3], pending: [{ op: 'add', id: 'ws_b' }, { op: 'rename', id: 'x' }] }, broken: 'yes' };
  const store = prefsAddedStore(() => saved, all => { saved = all; });
  assert.deepEqual(store.read('user_1:org_A'), { local: ['ws_a'], pending: [{ op: 'add', id: 'ws_b' }] });
  assert.equal(store.read('broken'), null);
  store.write('user_1:org_B', { local: null, pending: [] });
  assert.deepEqual(Object.keys(saved as object), ['user_1:org_A', 'broken', 'user_1:org_B']);
});

test('web end to end: 403 keeps a local added list; when the route answers, the seed uploads it', async () => {
  let row: { version: number; added: string[] } | null = null;
  let ready = false;
  const s = server({
    ...CSRF,
    'GET /v1/workspaces/preferences': () => (ready ? json(200, row ?? { version: 0, added: [] }) : problem(403, 'organization_selection_required')),
    'PUT /v1/workspaces/preferences': (init) => { row = { version: 1, added: JSON.parse(String(init.body)).added }; return new Response(null, { status: 204 }); },
  });
  let saved: unknown = {};
  const sync = createAddedSync({
    transport: s.transport,
    store: prefsAddedStore(() => saved, all => { saved = all; }),
    scope: () => ({ person: 'user_1', organization: 'org_A' }),
    available: () => [{ id: 'ws_a' }, { id: 'ws_b' }],
    shown: () => new Set(['ws_a']),
    hidden: () => new Set(),
    onChange: () => {},
    schedule: () => {},
  });
  await sync.sync();
  assert.deepEqual([...sync.added()!], ['ws_a'], 'local list, nothing thrown');
  ready = true;
  await sync.sync();
  assert.deepEqual(row, { version: 1, added: ['ws_a'] });
});
