import assert from 'node:assert/strict';
import test from 'node:test';
import { createSupportAccess, grantOf } from '../src/support-access.ts';

const session = (refresh = true) => ({ getToken: async () => 'jwt', unauthorized: async () => refresh });
const row = (over: Record<string, unknown> = {}) => ({
  id: 9, account_id: 44, operator_email: 'support@danil.ai', role: 'support_write', level: 'write', reason: 'Revisar el canal',
  ticket: null, created_at: '2026-10-30T10:00:00Z', expires_at: '2026-10-31T10:00:00Z', revoked_at: null, revoked_by_kind: null, status: 'active', ...over,
});

test('lists only the Danil workspaces the person manages, never ones entered through support', async () => {
  const seen: string[] = [];
  const api = createSupportAccess(session(), async (input) => {
    seen.push(String(input));
    return Response.json({ user: { accounts: [
      { id: 44, name: 'Cliente', role: 'owner' }, { id: 45, name: 'Otra', role: 'admin' },
      { id: 46, name: 'Lectura', role: 'viewer' }, { id: 47, name: 'Por soporte', role: 'support_write', access: 'support' },
    ] } });
  });
  assert.deepEqual(await api.workspaces(), [{ id: 44, name: 'Cliente' }, { id: 45, name: 'Otra' }]);
  assert.deepEqual(seen, ['/terminus/alpha-api/auth/profile']);
});

test('reads the grants of one workspace through the single allowed route', async () => {
  const seen: Array<{ url: string; auth: string | null }> = [];
  const api = createSupportAccess(session(), async (input, init) => {
    seen.push({ url: String(input), auth: new Headers(init?.headers).get('Authorization') });
    return Response.json({ grants: [row(), row({ id: 8, role: 'support_read', level: undefined, status: 'revoked', revoked_at: '2026-10-30T11:00:00Z', revoked_by_kind: 'client' })], can_revoke_all: true });
  });
  const result = await api.list(44);
  assert.equal(seen[0].url, '/terminus/alpha-api/auth/account/support-access?account_id=44');
  assert.equal(seen[0].auth, 'Bearer jwt');
  assert.equal(result.canRevokeAll, true);
  assert.deepEqual(result.grants.map(g => [g.id, g.level, g.status]), [[9, 'write', 'active'], [8, 'read', 'revoked']]);
});

test('fails closed on other accounts, unknown states and malformed answers', async () => {
  assert.throws(() => grantOf(row({ account_id: 99 }), 44), /invalid_scope/);
  assert.throws(() => grantOf(row({ status: 'pending' }), 44), /invalid_response/);
  assert.throws(() => grantOf(row({ id: 0 }), 44), /invalid_response/);
  assert.throws(() => grantOf(row({ operator_email: 5 }), 44), /invalid_response/);
  const api = (body: unknown, status = 200) => createSupportAccess(session(false), async () => Response.json(body, { status }));
  await assert.rejects(api({ grants: {}, can_revoke_all: true }).list(44), /invalid_response/);
  await assert.rejects(api({ grants: [] }).list(44), /invalid_response/);
  await assert.rejects(api({ error: 'members_manage_required' }, 403).list(44), /HTTP 403/);
  await assert.rejects(api({ grants: [], can_revoke_all: true }).list(0), /invalid_response/);
});

test('a 401 refreshes the session once and retries', async () => {
  let calls = 0;
  const api = createSupportAccess(session(true), async () => (++calls === 1 ? new Response('', { status: 401 }) : Response.json({ grants: [], can_revoke_all: false })));
  assert.deepEqual(await api.list(44), { grants: [], canRevokeAll: false });
  assert.equal(calls, 2);
});

test('revoke posts to the single revoke route and accepts only known outcomes', async () => {
  const seen: Array<{ url: string; method: string }> = [];
  const api = createSupportAccess(session(), async (input, init) => {
    seen.push({ url: String(input), method: init?.method ?? 'GET' });
    return Response.json({ status: 'revoked' });
  });
  assert.equal(await api.revoke(44, 9), 'revoked');
  assert.deepEqual(seen, [{ url: '/terminus/alpha-api/auth/account/support-access/9/revoke?account_id=44', method: 'POST' }]);
  const odd = createSupportAccess(session(false), async () => Response.json({ status: 'deleted' }));
  await assert.rejects(odd.revoke(44, 9), /invalid_response/);
  const blocked = createSupportAccess(session(false), async () => Response.json({ error: 'method_not_allowed' }, { status: 405 }));
  await assert.rejects(blocked.revoke(44, 9), /HTTP 405/);
  await assert.rejects(blocked.revoke(44, 0), /invalid_response/);
});

test('memberships keep the role, and organization and plan only when the profile sends them', async () => {
  const api = createSupportAccess(session(), async () => Response.json({ user: { accounts: [
    { id: 44, name: 'Cliente', role: 'owner', organization: { name: 'Danil' }, plan: 'teams' },
    { id: 45, name: 'Otra', role: 'member' },
    { id: 47, name: 'Por soporte', role: 'support_write', access: 'support' },
  ] } }));
  assert.deepEqual(await api.memberships(), [
    { id: 44, name: 'Cliente', role: 'owner', organization: 'Danil', plan: 'teams' },
    { id: 45, name: 'Otra', role: 'member', organization: null, plan: null },
  ]);
});

test('only an explicit organization: null marks a workspace personal; a missing field stays unknown', async () => {
  const api = createSupportAccess(session(), async () => Response.json({ user: { accounts: [
    { id: 476, name: 'Danil Workspace', role: 'owner', organization: { id: 189, name: 'Danil' } },
    { id: 600, name: 'Mío', role: 'owner', organization: null },
    { id: 45, name: 'Antiguo', role: 'owner' },
  ] } }));
  assert.deepEqual(await api.memberships(), [
    { id: 476, name: 'Danil Workspace', role: 'owner', organization: 'Danil', plan: null, organizationId: 189 },
    { id: 600, name: 'Mío', role: 'owner', organization: null, plan: null, personal: true },
    { id: 45, name: 'Antiguo', role: 'owner', organization: null, plan: null },
  ]);
});

test('organization workspaces is one read scoped to the workspace, with names and member counts', async () => {
  const seen: string[] = [];
  const api = createSupportAccess(session(), async (input) => {
    seen.push(String(input));
    return Response.json({ organization: { id: 189, name: 'Danil' }, workspaces: [{ id: 82, name: 'Danil Demo Account', members: 5 }, { id: 476, name: 'Danil Workspace', members: 6 }] });
  });
  assert.deepEqual(await api.organizationWorkspaces(476), [{ id: 82, name: 'Danil Demo Account', members: 5 }, { id: 476, name: 'Danil Workspace', members: 6 }]);
  assert.deepEqual(seen, ['/terminus/alpha-api/auth/organization/workspaces?account_id=476']);
  const personal = createSupportAccess(session(), async () => Response.json({ organization: null, workspaces: [] }));
  assert.deepEqual(await personal.organizationWorkspaces(600), []);
  const broken = createSupportAccess(session(), async () => Response.json({ organization: { id: 1, name: 'X' }, workspaces: [{ id: 1, name: 'A', members: -1 }] }));
  await assert.rejects(broken.organizationWorkspaces(1), /invalid_response/);
  await assert.rejects(api.organizationWorkspaces(0), /invalid_response/);
});

test('an organization without a name still counts as an organization', async () => {
  const api = createSupportAccess(session(), async () => Response.json({ user: { accounts: [
    { id: 476, name: 'Danil Workspace', role: 'owner', organization: { id: 189, name: '' } },
  ] } }));
  assert.deepEqual(await api.memberships(), [
    { id: 476, name: 'Danil Workspace', role: 'owner', organization: null, plan: null, organizationId: 189 },
  ]);
});
