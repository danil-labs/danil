import assert from 'node:assert/strict';
import test from 'node:test';
import { RelaySession, type SocketLike } from '../src/relay.ts';
const turn = () => new Promise(resolve => setImmediate(resolve));
function setup(protocol = 'danil.machine-session.v1', lifetime?: number) {
  const sockets: Array<SocketLike & { protocol: string; protocols?: string[]; sent: string[]; closed: boolean }> = [];
  let tickets = 0;
  let revoked = false;
  const session = new RelaySession({ endpoint: 'wss://machines.danil.ai', computerId: 'm', getAdmission: async () => ({
    url: 'wss://machines.danil.ai/v1/machines/m/session', ticket: `ticket-${++tickets}`, protocol: 'danil.machine-session.v1',
    ...(lifetime ? { session_expires_at: new Date(Date.now() + lifetime).toISOString() } : {}),
  }), onUnauthorized: () => { revoked = true; } }, (_url, protocols) => {
    const socket = { protocol, protocols, readyState: 1, onopen: null, onclose: null, onmessage: null, onerror: null,
      sent: [] as string[], closed: false, send(data: string) { this.sent.push(data); }, close() { this.closed = true; },
    };
    sockets.push(socket); return socket;
  });
  session.start();
  return { session, sockets, tickets: () => tickets, revoked: () => revoked };
}
test('ticket mode offers the v1 machine protocol and closes an unnegotiated socket', async t => {
  const app = setup(''); t.after(() => app.session.close());
  await turn();
  assert.deepEqual(app.sockets[0].protocols, ['danil.machine-session.v1', 'ticket.ticket-1']);
  app.sockets[0].onopen?.({});
  assert.equal(app.sockets[0].closed, true);
});
test('without renewal the client opens a fresh ticket session before expiry and then retires the old socket', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const app = setup('danil.machine-session.v1', 1000); t.after(() => app.session.close());
  await turn(); app.sockets[0].onopen?.({});
  t.mock.timers.tick(950); await turn();
  assert.equal(app.tickets(), 2);
  assert.equal(app.sockets[0].closed, false, 'the old channel stays open during admission');
  app.sockets[1].onopen?.({});
  assert.equal(app.sockets[0].closed, true);
  assert.deepEqual(app.sockets[1].protocols, ['danil.machine-session.v1', 'ticket.ticket-2']);
  assert.ok(app.sockets.every(socket => socket.sent.every(frame => JSON.parse(frame).type !== 'auth')));
});
test('4005 reconnects with a fresh ticket; revocation stops and requests a context refresh', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const app = setup(); t.after(() => app.session.close());
  await turn(); app.sockets[0].onopen?.({});
  app.sockets[0].onclose?.({ code: 4005, reason: 'session_expired' });
  t.mock.timers.tick(500); await turn();
  assert.equal(app.tickets(), 2);
  app.sockets[1].onopen?.({});
  app.sockets[1].onclose?.({ code: 4003 });
  t.mock.timers.tick(2000); await turn();
  assert.equal(app.tickets(), 2);
  assert.equal(app.revoked(), true);
});

test('during a ticket handover the old socket keeps answering, an answered call is not resent, and close() closes both', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const app = setup('danil.machine-session.v1', 1000); t.after(() => app.session.close());
  await turn(); app.sockets[0].onopen?.({});
  const answered = app.session.call('a', 'list_projects', 'w', null, {});
  const waiting = app.session.call('b', 'list_projects', 'w', null, {});
  t.mock.timers.tick(950); await turn();
  assert.equal(app.sockets.length, 2, 'the new ticket opens a second socket');
  // The relay answers on the old socket before the new one opens: the answer arrives.
  app.sockets[0].onmessage?.({ data: JSON.stringify({ type: 'result', id: 'a', value: 1 }) });
  assert.deepEqual((await answered).value, 1);
  app.sockets[1].onopen?.({});
  assert.equal(app.sockets[0].closed, true);
  const resent = app.sockets[1].sent.map(frame => JSON.parse(frame)).filter(frame => frame.type === 'call').map(frame => frame.id);
  assert.deepEqual(resent, ['b'], 'only the unanswered call moves to the new socket');
  app.sockets[1].onmessage?.({ data: JSON.stringify({ type: 'result', id: 'b', value: 2 }) });
  assert.deepEqual((await waiting).value, 2);
});

test('close() during a handover closes the old and the pending socket', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const app = setup('danil.machine-session.v1', 1000);
  await turn(); app.sockets[0].onopen?.({});
  t.mock.timers.tick(950); await turn();
  assert.equal(app.sockets.length, 2);
  app.session.close();
  assert.equal(app.sockets[0].closed, true, 'old');
  assert.equal(app.sockets[1].closed, true, 'pending');
});

test('a handover socket that fails keeps the live session and tries again', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const app = setup('danil.machine-session.v1', 60_000); t.after(() => app.session.close());
  await turn(); app.sockets[0].onopen?.({});
  t.mock.timers.tick(54_500); await turn();
  assert.equal(app.sockets.length, 2);
  app.sockets[1].onclose?.({ code: 1006 });
  assert.equal(app.sockets[0].closed, false, 'the live socket stays');
  const call = app.session.call('c', 'list_projects', 'w', null, {});
  assert.equal(JSON.parse(app.sockets[0].sent.at(-1)!).id, 'c', 'calls still go out on the live socket');
  app.sockets[0].onmessage?.({ data: JSON.stringify({ type: 'result', id: 'c', value: 3 }) });
  assert.deepEqual((await call).value, 3);
  t.mock.timers.tick(2_000); await turn();
  assert.ok(app.sockets.length >= 3, 'tries the handover again');
});

for (const code of [4003, 4008]) test(`a ${code} on the live socket during a handover stops the session, cancels the pending socket and never promotes it`, async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const app = setup('danil.machine-session.v1', 1000); t.after(() => app.session.close());
  await turn(); app.sockets[0].onopen?.({});
  t.mock.timers.tick(950); await turn();
  assert.equal(app.sockets.length, 2, 'handover in progress');
  app.session.subscribe?.(0);
  app.sockets[0].onclose?.({ code });
  assert.equal(app.revoked(), true, 'asks to reread /v1/machines');
  assert.equal(app.sockets[1].closed, true, 'the pending socket is cancelled');
  app.sockets[1].onopen?.({});
  assert.equal(app.session.connected(), false, 'never promoted');
  const late = app.session.call('late', 'list_projects', 'w', null, {}).catch(error => error);
  t.mock.timers.tick(10_000); await turn();
  assert.equal(app.tickets(), 2, 'no new ticket after revocation');
  assert.equal(app.sockets.length, 2, 'no reconnection');
  assert.deepEqual(app.sockets[1].sent, [], 'the cancelled socket sends no subscribe nor call');
  assert.ok(app.sockets[0].sent.every(frame => JSON.parse(frame).id !== 'late'), 'a call after revocation does not go out');
  assert.equal((await late)?.code, 'app_unavailable');
});
