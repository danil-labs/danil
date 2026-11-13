import assert from 'node:assert/strict';
import test from 'node:test';
import { computeClient } from '../src/compute.ts';
import { RelaySession, SUBPROTOCOL, type SocketLike } from '../src/relay.ts';
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

test('compute admission follows B and refuses a ticket addressed outside the relay', async () => {
  for (const url of ['https://connect.danil.ai/v1/compute/computers/m/session', 'https://evil.test/v1/compute/computers/m/session']) {
    const api = computeClient(platformTransport({ origin: 'https://edge.danil.ai', timeoutMs: 1000 }, async (input, init) => {
      const r = new Request(input, init);
      if (r.url.endsWith('/csrf')) return Response.json({ csrf_token: 'bound' });
      assert.equal(r.url, 'https://edge.danil.ai/v1/compute/computers/m/tickets');
      assert.equal(r.method, 'POST');
      assert.equal(r.headers.get('x-csrf-token'), 'bound');
      assert.ok(r.headers.get('idempotency-key'));
      assert.equal(r.headers.has('authorization'), false);
      return Response.json({ url, ticket: 'one-use' });
    }));
    if (url.includes('evil')) await assert.rejects(api.admission('m'), /invalid_admission_url/);
    else assert.deepEqual(await api.admission('m'), { url: url.replace('https:', 'wss:'), ticket: 'one-use' });
  }
});

test('relay requests a fresh ticket on reconnect, sends no human-token renewal and stops on revocation', async t => {
  let grants = 0;
  let revoked = false;
  const sockets: (SocketLike & { url: string; protocols?: string[] })[] = [];
  const sent: string[] = [];
  const session = new RelaySession({ endpoint: 'https://unused.invalid', computerId: 'm', onUnauthorized: () => { revoked = true; }, getAdmission: async () => {
    grants++;
    return { url: 'wss://connect.danil.ai/v1/compute/computers/m/session', ticket: `one-use-${grants}` };
  } }, (url, protocols) => {
    const s = { url, protocols, readyState: 1, onopen: null, onmessage: null, onclose: null, onerror: null, send(value: string) { sent.push(value); }, close() {} };
    sockets.push(s); return s;
  });
  t.after(() => session.close());
  session.start();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(grants, 1);
  assert.deepEqual(sockets[0].protocols, [SUBPROTOCOL, 'ticket.one-use-1']);
  assert.equal(new URL(sockets[0].url).search, '');
  sockets[0].onopen?.({});
  sockets[0].onclose?.({ code: 4005 });
  const deadline = Date.now() + 2000;
  while (sockets.length < 2 && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(grants, 2);
  assert.deepEqual(sockets[1].protocols, [SUBPROTOCOL, 'ticket.one-use-2']);
  sockets[1].onopen?.({});
  sockets[1].onclose?.({ code: 4008 });
  assert.ok(revoked);
  assert.deepEqual(sent, [], 'tickets are not renewed with auth frames');
});
