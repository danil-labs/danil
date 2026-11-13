import assert from 'node:assert/strict';
import test from 'node:test';
import { computeClient } from '../src/compute.ts';
import { RelaySession, SUBPROTOCOL } from '../src/relay.ts';
import { platformTransport } from '../../../apps/desktop/src/web/platform-session.ts';

test('compute lists and wakes through the cookie edge; writes carry CSRF and idempotency', async () => {
  const calls: Request[] = [];
  const api = computeClient(platformTransport({ origin: 'https://edge.danil.ai', timeoutMs: 1000 }, async (url, init) => {
    const r = new Request(url, init); calls.push(r);
    assert.equal(r.credentials, 'include');
    assert.equal(r.headers.has('authorization'), false);
    if (r.url.endsWith('/identity/csrf')) return Response.json({ csrf_token: 'bound' });
    if (r.method !== 'GET') {
      assert.equal(r.headers.get('x-csrf-token'), 'bound');
      assert.ok(r.headers.get('idempotency-key'));
    }
    if (r.url.endsWith('/start')) return Response.json({ state: 'starting' });
    if (r.url.endsWith('/workspaces')) return Response.json({ workspaces: [{ id: 'engine_w', name: 'Work', computers: ['m'], projects: [] }] });
    return Response.json({ computers: [{ computer_id: 'm', name: 'Laptop', state: 'offline' }] });
  }));
  assert.deepEqual(await api.list(), { kind: 'ok', value: [{ computer_id: 'm', name: 'Laptop', state: 'offline' }] });
  assert.equal((await api.workspaces()).kind, 'ok');
  assert.deepEqual(await api.start('m'), { kind: 'ok', value: { state: 'starting' } });
  assert.ok(calls.some(r => r.url === 'https://edge.danil.ai/v1/compute/computers/m/start'));
});

test('compute preserves problem status and refuses malformed lists', async () => {
  const api = computeClient(platformTransport({ origin: 'https://edge.danil.ai', timeoutMs: 1000 }, async () =>
    Response.json({ code: 'access_denied' }, { status: 403, headers: { 'content-type': 'application/problem+json' } })));
  assert.deepEqual(await api.list(), { kind: 'error', status: 403, code: 'access_denied' });
  assert.equal((await computeClient({ call: async () => Response.json({ items: 'bad' }), mutation: async () => { throw Error('unused'); } }).list()).kind, 'error');
});

test('relay obtains a fresh admission ticket per connection and never renews it as a human token', async () => {
  let grants = 0;
  const sockets: { url: string; protocols?: string[]; readyState: number; onopen: null | (() => void); onmessage: null; onclose: null; onerror: null; send(): void; close(): void }[] = [];
  const session = new RelaySession({ endpoint: 'https://unused.invalid', computerId: 'm', getAdmission: async () => {
    grants++;
    return { url: 'wss://connect.danil.ai/v1/compute/computers/m/session', ticket: `one-use-${grants}` };
  } }, (url, protocols) => {
    const s = { url, protocols, readyState: 1, onopen: null, onmessage: null, onclose: null, onerror: null, send() {}, close() {} };
    sockets.push(s); return s;
  });
  session.start();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(grants, 1);
  assert.deepEqual(sockets[0].protocols, [SUBPROTOCOL, 'ticket.one-use-1']);
  assert.equal(new URL(sockets[0].url).search, '');
  session.close();
});
