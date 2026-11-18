import assert from 'node:assert/strict';
import test from 'node:test';
import { createHiddenSync, effectiveHidden, enqueue, outcomeOf, parseHidden, type PreferencesReply, type SyncRecord, type SyncScope } from '../../src/features/shell/workspace-hidden-sync.ts';

const ID = /^[A-Za-z0-9_-]{1,128}$/;

/** El servicio según `workspace-preferences-v1` (workspaces#40): una lista por (sub, org). */
function service(options: { down?: number | 'network' } = {}) {
  const rows = new Map<string, { version: number; hidden: string[] }>();
  let org = 'org_A';
  let down = options.down;
  const calls: string[] = [];
  const row = () => rows.get(org) ?? { version: 0, hidden: [] };
  const fail = (): PreferencesReply | null => {
    if (down === undefined) return null;
    if (down === 'network') throw new Error('network');
    return { status: down, body: down === 403 ? { code: 'organization_selection_required' } : { code: 'not_found' } };
  };
  return {
    calls, rows,
    as(next: string) { org = next; },
    up() { down = undefined; },
    transport: {
      async get() { calls.push('GET'); return fail() ?? { status: 200, body: structuredClone(row()) }; },
      async put(id: string) {
        calls.push(`PUT ${id}`);
        const failed = fail(); if (failed) return failed;
        if (!ID.test(id)) return { status: 422, body: { code: 'invalid_workspace_id' } };
        const r = row(); rows.set(org, { version: r.version + 1, hidden: r.hidden.includes(id) ? r.hidden : [...r.hidden, id] });
        return { status: 204 };
      },
      async remove(id: string) {
        calls.push(`DELETE ${id}`);
        const failed = fail(); if (failed) return failed;
        const r = row(); rows.set(org, { version: r.version + 1, hidden: r.hidden.filter((x) => x !== id) });
        return { status: 204 };
      },
    },
  };
}

function setup(svc: ReturnType<typeof service>, scope: { current: SyncScope | null }, local: Set<string> = new Set()) {
  const records = new Map<string, SyncRecord>();
  const retries: (() => void)[] = [];
  const sync = createHiddenSync({
    transport: svc.transport,
    store: { read: (k) => structuredClone(records.get(k) ?? null), write: (k, r) => void records.set(k, structuredClone(r)) },
    scope: () => scope.current,
    local: () => local,
    onChange: () => {},
    schedule: (run) => void retries.push(run),
  });
  return { sync, records, retries };
}

const scopeA = (served: string[]) => ({ current: { person: 'user_1', organization: 'org_A', served: new Set(served) } as SyncScope | null });

test('responses: 2xx applies, 422 is dropped, everything else is local only', () => {
  assert.equal(outcomeOf({ status: 204 }), 'ok');
  assert.equal(outcomeOf({ status: 422 }), 'refused');
  for (const status of [403, 404, 429, 501, 503, 500]) assert.equal(outcomeOf({ status }), 'local', String(status));
});

test('the GET body is read tolerantly: unknown fields ignored, invalid ids and repeats dropped', () => {
  assert.deepEqual(parseHidden({ version: 3, hidden: ['ws_alpha', 'B-2'], updated_at: '2026-11-17T18:00:00.000Z', extra: 1 }), ['ws_alpha', 'B-2']);
  assert.deepEqual(parseHidden({ version: 0, hidden: [] }), []);
  assert.deepEqual(parseHidden({ hidden: ['a', 'a', 'no.dots', 7] }), ['a']);
  assert.equal(parseHidden({ version: 1 }), null);
  assert.equal(parseHidden(null), null);
});

test('the account decides only for what the organization serves; local ids stay local', () => {
  const served = new Set(['org1', 'org2']);
  const local = new Set(['mine', 'org1']);
  assert.deepEqual([...effectiveHidden(local, null, served)].sort(), ['mine', 'org1'], 'without the account, only local');
  assert.deepEqual([...effectiveHidden(local, new Set(['org2', 'mine']), served)].sort(), ['mine', 'org2'], 'the account cannot hide or show a local workspace');
});

test('the first sync uploads only the local hidden ids of that organization, once per person and organization', async () => {
  const svc = service();
  const scope = scopeA(['org1', 'org2']);
  const { sync, records } = setup(svc, scope, new Set(['org1', 'mine']));
  await sync.sync();
  assert.deepEqual(svc.calls, ['GET', 'PUT org1']);
  assert.deepEqual(svc.rows.get('org_A')?.hidden, ['org1']);
  assert.deepEqual([...(sync.account() ?? [])], ['org1']);
  assert.equal(records.get('user_1:org_A')?.migrated, true);
  svc.calls.length = 0;
  await sync.sync();
  assert.deepEqual(svc.calls, ['GET'], 'a second sync does not migrate again');
  scope.current = { person: 'user_2', organization: 'org_A', served: new Set(['org1', 'org2']) };
  assert.equal(sync.account(), null, 'another person does not see the first one\'s account list');
});

test('hiding and showing go by id, so two devices do not lose each other\'s changes', async () => {
  const svc = service();
  const a = setup(svc, scopeA(['org1', 'org2']));
  const b = setup(svc, scopeA(['org1', 'org2']));
  await a.sync.sync();
  await b.sync.sync();
  a.sync.hide('org1');
  b.sync.hide('org2');
  await a.sync.sync();
  await b.sync.sync();
  assert.deepEqual(svc.rows.get('org_A')?.hidden.sort(), ['org1', 'org2']);
  await a.sync.sync();
  assert.deepEqual([...(a.sync.account() ?? [])].sort(), ['org1', 'org2'], 'the other device sees both');
  a.sync.hide('mine');
  assert.ok(!svc.calls.includes('PUT mine'), 'a local workspace never travels');
});

for (const down of [404, 501, 403, 'network'] as const) {
  test(`with ${down} it stays local without error, keeps pending operations and syncs when the route appears`, async () => {
    const svc = service({ down });
    const { sync, records, retries } = setup(svc, scopeA(['org1']));
    await sync.sync();
    assert.equal(sync.account(), null, 'local only');
    sync.hide('org1');
    await sync.sync();
    assert.deepEqual(records.get('user_1:org_A')?.pending, [{ op: 'add', id: 'org1' }], 'the change waits as an operation');
    assert.ok(retries.length > 0, 'and a retry is scheduled');
    svc.up();
    retries.shift()?.();
    await sync.sync();
    assert.deepEqual(svc.rows.get('org_A')?.hidden, ['org1']);
    assert.deepEqual(records.get('user_1:org_A')?.pending, []);
  });
}

test('offline, the last intention per id wins and a 422 drops only that operation', async () => {
  assert.deepEqual(enqueue([{ op: 'add', id: 'x' }, { op: 'add', id: 'y' }], { op: 'remove', id: 'x' }), [{ op: 'add', id: 'y' }, { op: 'remove', id: 'x' }]);
  const svc = service();
  const { sync, records } = setup(svc, scopeA(['org1', 'bad.id']));
  await sync.sync();
  sync.hide('bad.id');
  sync.hide('org1');
  await sync.sync();
  await sync.sync();
  assert.deepEqual(records.get('user_1:org_A')?.pending, []);
  assert.deepEqual(svc.rows.get('org_A')?.hidden, ['org1']);
});

test('changing organization does not mix lists', async () => {
  const svc = service();
  const scope = scopeA(['org1']);
  const { sync } = setup(svc, scope);
  await sync.sync();
  sync.hide('org1');
  await sync.sync();
  svc.as('org_B');
  scope.current = { person: 'user_1', organization: 'org_B', served: new Set(['orgB1']) };
  await sync.sync();
  assert.deepEqual([...(sync.account() ?? [])], [], 'org_B starts empty');
  assert.deepEqual(svc.rows.get('org_A')?.hidden, ['org1']);
});

test('a change made before the scope is known is not lost once the person is known', async () => {
  const svc = service();
  const scope = scopeA(['org1']);
  const { sync, records } = setup(svc, scope);
  await sync.sync();
  const known = scope.current;
  scope.current = null;
  sync.hide('org1');
  sync.hide('mine');
  scope.current = known;
  await sync.sync();
  assert.deepEqual(svc.rows.get('org_A')?.hidden, ['org1'], 'the organization one is uploaded');
  assert.ok(!svc.calls.includes('PUT mine'), 'a local one never travels');
  assert.deepEqual([...(sync.account() ?? [])], ['org1']);
  assert.deepEqual(records.get('*')?.pending ?? [], []);
});
