import assert from 'node:assert/strict';
import test from 'node:test';
import { boot } from '../helpers/jsdom-app.mjs';
import { relay } from '../helpers/fake-relay.mjs';

const origin = new URL(process.env.DANIL_WEB_API_ORIGIN).origin;
const machine = { computer_id: 'm', name: 'Laptop', state: 'online', workspaces: ['w'] };
async function until(read) {
  const deadline = Date.now() + 8000;
  while (!read()) {
    if (Date.now() > deadline) throw new Error('Window condition timed out');
    await new Promise(resolve => setTimeout(resolve, 15));
  }
}

test('the cookie session mounts the real task window over a ticket relay, with account and settings', async () => {
  const calls = [];
  const fake = relay();
  const fetcher = async (input, init) => {
    const url = new URL(String(input));
    if (url.origin === 'http://localhost' && url.pathname.includes('/assets/')) return new Response('');
    assert.equal(url.origin, origin);
    assert.equal(init.credentials, 'include');
    assert.equal(new Headers(init.headers).has('authorization'), false);
    calls.push(url.pathname);
    if (url.pathname === '/v1/identity/me') return Response.json({ id: 'user_A', name: 'Operator', workspace: '11', organizations: [{ id: 'org_A', name: 'Org' }] });
    if (url.pathname === '/v1/workspaces') return Response.json({ items: [{ id: '11', org: 'org_A', name: 'Alpha', role: 'owner' }, { id: '12', org: 'org_A', name: 'Beta', role: 'owner' }], next_cursor: null });
    if (url.pathname === '/v1/identity/csrf') return Response.json({ csrf_token: 'bound' });
    if (url.pathname === '/v1/compute/computers') return Response.json({ computers: [machine] });
    if (url.pathname === '/v1/compute/workspaces') return Response.json({ workspaces: [{ id: 'w', name: 'Work', projects: [], computers: ['m'] }] });
    if (url.pathname === '/v1/compute/computers/m/tickets') return Response.json({ ticket: 'one-use', url: 'wss://connect.danil.ai/v1/compute/computers/m/session' });
    throw new Error(`Unexpected request ${url.pathname}`);
  };
  fetcher.__jsdomApp = true;
  globalThis.fetch = fetcher;
  const app = await boot('listo', 'edge-real-window', {}, undefined, {}, { web: true, beforeImport(w) {
    w.WebSocket = fake.Socket;
    globalThis.WebSocket = fake.Socket;
  } });
  await until(() => app.w.document.querySelector('[data-tira]'));
  await until(() => app.w.document.querySelector('[data-danil-foot]'));
  assert.ok(fake.calls.some(c => c.command === 'workspaces_startup' || c.command === 'list_workspaces'));
  assert.ok(calls.includes('/v1/compute/computers/m/tickets'));
  assert.ok(!calls.some(path => /messaging|alpha-api|rest\/v1/.test(path)));
  assert.equal(app.w.document.querySelector('[data-platform-session]'), null);
  assert.deepEqual(app.failures, []);
});

for (const status of [401, 403, 503]) test(`identity HTTP ${status} stays distinct before mounting a machine`, async () => {
  const calls = [];
  const fetcher = async (input, init) => {
    const url = new URL(String(input));
    if (url.origin === 'http://localhost' && url.pathname.includes('/assets/')) return new Response('');
    calls.push(url.pathname);
    assert.equal(url.pathname, '/v1/identity/me');
    assert.equal(init.credentials, 'include');
    return new Response(null, { status });
  };
  fetcher.__jsdomApp = true; globalThis.fetch = fetcher;
  const app = await boot('listo', `window-denied-${status}`, {}, undefined, {}, { web: true });
  const selector = status === 401 ? 'a[href*="/v1/identity/login"]' : '[role="alert"]';
  await until(() => app.w.document.querySelector(selector));
  assert.equal(app.w.document.querySelector('[data-tira]'), null);
  assert.deepEqual(calls, ['/v1/identity/me']);
  if (status !== 401) assert.equal(app.w.document.querySelector('a[href*="/login"]'), null);
  assert.deepEqual(app.failures, []);
});

test('an authenticated session with no workspaces shows the plan empty state without asking compute', async () => {
  const calls = [];
  const fetcher = async input => {
    const url = new URL(String(input));
    if (url.origin === 'http://localhost' && url.pathname.includes('/assets/')) return new Response('');
    calls.push(url.pathname);
    if (url.pathname === '/v1/identity/me') return Response.json({ id: 'user_A', name: 'Operator', workspace: '11', organizations: [] });
    if (url.pathname === '/v1/workspaces') return Response.json({ items: [], next_cursor: null });
    throw new Error(`Unexpected request ${url.pathname}`);
  };
  fetcher.__jsdomApp = true; globalThis.fetch = fetcher;
  const app = await boot('listo', 'empty-cloud-workspaces', {}, undefined, {}, { web: true });
  await until(() => app.w.document.querySelector('[data-web-gate]')?.textContent.includes('No tienes nada. Crea un plan.'));
  assert.ok(!calls.some(path => path.startsWith('/v1/compute')));
  assert.equal(app.w.document.querySelector('[data-tira]'), null);
});
