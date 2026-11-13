import assert from 'node:assert/strict';
import test from 'node:test';
import { platformSession, PlatformSessionError } from '../../src/web/platform-session.ts';
import { organizationSession } from '../../src/web/organization-session.ts';

const options = { origin: 'https://edge.test', timeoutMs: 1000 };
const org = { id: 'org_A', name: 'Danil', plan: 'enterprise', role: 'owner' };
test('organization list is paginated and selection is cookie/CSRF protected with the contract body', async () => {
  const api = platformSession(options, async (input, init) => {
    const req = new Request(input, init), url = new URL(req.url);
    assert.equal(req.credentials, 'include');
    assert.equal(req.headers.has('authorization'), false);
    if (url.pathname.endsWith('/csrf')) return Response.json({ csrf_token: 'bound' });
    if (req.method === 'POST') {
      assert.equal(req.headers.get('idempotency-key'), 'intent-1');
      assert.equal(req.headers.get('x-csrf-token'), 'bound');
      assert.deepEqual(await req.json(), { organization_id: 'org_A' });
      return Response.json({ organization: org, workspace: null, extra: true });
    }
    return Response.json({ items: [org], next_cursor: url.search ? null : 'next', active_organization_id: 'org_A', future: true });
  });
  assert.equal((await api.organizations()).items.length, 2);
  assert.equal((await api.selectOrganization('org_A', 'intent-1')).workspace, null);
});
for (const status of [404, 501]) test(`${status} falls back to me and keeps a rejected selection pending for automatic retry`, async () => {
  let available = false;
  const writes: string[] = [];
  const api = platformSession(options, async (input, init) => {
    const req = new Request(input, init), url = new URL(req.url);
    if (url.pathname.endsWith('/csrf')) return Response.json({ csrf_token: 'bound' });
    if (url.pathname.endsWith('/me')) return Response.json({ id: 'user_A', name: 'A', workspace: null, organizations: [org], active_organization_id: 'org_A' });
    if (req.method === 'POST') writes.push(req.headers.get('idempotency-key')!);
    if (!available) return new Response(null, { status });
    if (req.method === 'POST') return Response.json({ organization: org, workspace: null });
    return Response.json({ items: [org], next_cursor: null, active_organization_id: 'org_A' });
  });
  const session = organizationSession(api, () => 'same-intent');
  const fallback = await session.list(await api.me());
  assert.equal(fallback.fallback, true);
  assert.equal(fallback.items[0].name, 'Danil');
  await assert.rejects(session.choose('org_A'), (e: unknown) => e instanceof PlatformSessionError && e.status === status);
  assert.equal(session.uncertain(), true);
  assert.equal(session.active(), null);
  available = true;
  await session.reconcile();
  assert.equal(session.active(), 'org_A');
  assert.deepEqual(writes, ['same-intent', 'same-intent']);
});
test('a refused organization never becomes active', async () => {
  const api = platformSession(options, async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('/csrf')) return Response.json({ csrf_token: 'bound' });
    if (init?.method === 'POST') return new Response(null, { status: 403 });
    if (url.pathname.endsWith('/me')) return Response.json({ id: 'user_A', name: 'A', workspace: '11', organizations: [org], active_organization_id: 'org_A' });
    return Response.json({ items: [org], next_cursor: null, active_organization_id: 'org_A' });
  });
  const session = organizationSession(api);
  await assert.rejects(session.choose('org_B'));
  assert.equal(session.active(), 'org_A');
  assert.equal(session.uncertain(), false);
});
