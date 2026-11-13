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
