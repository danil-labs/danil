import assert from 'node:assert/strict';
import test from 'node:test';
import { type AddedRecord, type AddedScope, createAddedSync, outcomeOf, parsePreferences, type PreferencesReply, seedOf } from '../../src/features/shell/workspace-added-sync.ts';

const ID = /^[A-Za-z0-9_-]{1,128}$/;

/** El servicio del plan 2026-11-18 § 5: `added` por (sub, org) y la siembra con `if_version: 0`. */
function service(options: { down?: number | 'network' } = {}) {
  const rows = new Map<string, { version: number; added: string[] }>();
  let org = 'org_A';
  let down = options.down;
  const calls: string[] = [];
  const fail = (): PreferencesReply | null => {
    if (down === undefined) return null;
    if (down === 'network') throw new Error('network');
    return { status: down, body: down === 403 ? { code: 'organization_selection_required' } : {} };
  };
  const write = (next: (r: { version: number; added: string[] }) => string[]) => {
    const r = rows.get(org) ?? { version: 0, added: [] };
    rows.set(org, { version: r.version + 1, added: next(r) });
  };
  return {
    calls, rows,
    as(next: string) { org = next; },
    up() { down = undefined; },
    transport: {
      async get() { calls.push('GET'); return fail() ?? { status: 200, body: structuredClone(rows.get(org) ?? { version: 0, added: [] }) }; },
      async put(id: string) {
        calls.push(`PUT ${id}`);
        const f = fail(); if (f) return f;
        if (!ID.test(id)) return { status: 422, body: { code: 'invalid_workspace_id' } };
        write((r) => (r.added.includes(id) ? r.added : [...r.added, id]));
        return { status: 204 };
      },
      async remove(id: string) {
        calls.push(`DELETE ${id}`);
        const f = fail(); if (f) return f;
        write((r) => r.added.filter((x) => x !== id));
        return { status: 204 };
      },
      async seed(added: readonly string[]) {
        calls.push(`SEED ${added.join(',')}`);
        const f = fail(); if (f) return f;
        const r = rows.get(org);
        if (r) return { status: 409, body: { code: 'already_initialized', version: r.version } };
        rows.set(org, { version: 1, added: [...added] });
        return { status: 204 };
      },
    },
  };
}

type World = { scope: AddedScope | null; available: { id: string }[] | null; shown: Set<string>; hidden: Set<string> };

function device(svc: ReturnType<typeof service>, world: World) {
  const records = new Map<string, AddedRecord>();
  const retries: (() => void)[] = [];
  const seeded: string[][] = [];
  const sync = createAddedSync({
    transport: svc.transport,
    store: { read: (k) => structuredClone(records.get(k) ?? null), write: (k, r) => void records.set(k, structuredClone(r)) },
    scope: () => world.scope,
    available: () => world.available,
    shown: () => world.shown,
    hidden: () => world.hidden,
    onSeeded: (ids) => void seeded.push([...ids]),
    onChange: () => {},
    schedule: (run) => void retries.push(run),
  });
  return { sync, records, retries, seeded };
}

const world = (over: Partial<World> = {}): World => ({
  scope: { person: 'user_1', organization: 'org_A' },
  available: [{ id: 'acme' }, { id: 'ops' }, { id: 'labs' }],
  shown: new Set(['acme', 'ops', 'mine']),
  hidden: new Set(['ops']),
  ...over,
});
const list = (s: ReadonlySet<string> | null) => (s ? [...s].sort() : null);

test('responses and the GET body are read tolerantly', () => {
  assert.equal(outcomeOf({ status: 204 }), 'ok');
  assert.equal(outcomeOf({ status: 409 }), 'conflict');
  assert.equal(outcomeOf({ status: 422 }), 'refused');
  for (const status of [403, 404, 429, 501, 503]) assert.equal(outcomeOf({ status }), 'local');
  assert.deepEqual(parsePreferences({ version: 3, added: ['a', 'a', 'no.dots', 4], updated_at: 'x', extra: true }), { version: 3, added: ['a'] });
  assert.deepEqual(parsePreferences({ added: [] }), { version: 0, added: [] });
  assert.equal(parsePreferences({ version: 2, hidden: ['a'] }), null);
});

test('the seed keeps the Danil workspaces the rail showed, without the hidden ones', () => {
  assert.deepEqual(seedOf([{ id: 'acme' }, { id: 'ops' }, { id: 'labs' }], new Set(['acme', 'ops']), new Set(['ops'])), ['acme']);
  assert.deepEqual(seedOf([{ id: 'acme' }], new Set(), new Set()), [], 'no previous evidence: a new account starts empty');
});

test('criterion 3: the first start with a previous rail seeds atomically, and hidden Danil ids go only after a 204', async () => {
  const svc = service();
  const d = device(svc, world());
  await d.sync.sync();
  assert.deepEqual(svc.calls, ['GET', 'SEED acme']);
  assert.deepEqual(list(d.sync.added()), ['acme']);
  assert.deepEqual(d.seeded, [['acme']]);
});

test('criterion 2: a new account starts empty and adding one creates the row', async () => {
  const svc = service();
  const d = device(svc, world({ shown: new Set() }));
  await d.sync.sync();
  assert.ok(!svc.calls.some((c) => c.startsWith('SEED')), 'an empty list is never seeded');
  assert.deepEqual(list(d.sync.added()), []);
  d.sync.add('labs');
  await d.sync.sync();
  assert.deepEqual(svc.rows.get('org_A')?.added, ['labs']);
  assert.deepEqual(list(d.sync.added()), ['labs']);
});

test('criterion 10: with the source unsettled nothing is seeded and the rail keeps what it showed', async () => {
  const svc = service();
  const w = world({ available: null });
  const d = device(svc, w);
  await d.sync.sync();
  assert.ok(!svc.calls.some((c) => c.startsWith('SEED')));
  assert.equal(d.sync.added(), null, 'unknown, so the rail does not empty');
  assert.equal(d.retries.length, 1);
  w.available = [{ id: 'acme' }];
  d.retries.shift()?.();
  await d.sync.sync();
  assert.deepEqual(list(d.sync.added()), ['acme']);
});

test('criterion 11: a second device does not seed again what the first removed (409)', async () => {
  const svc = service();
  const a = device(svc, world());
  await a.sync.sync();
  a.sync.remove('acme');
  await a.sync.sync();
  assert.deepEqual(svc.rows.get('org_A')?.added, []);
  const b = device(svc, world({ hidden: new Set() }));
  await b.sync.sync();
  await b.sync.sync();
  assert.ok(!svc.calls.includes('SEED acme,ops') || svc.rows.get('org_A')?.version !== 1, 'a row exists, so no second seed lands');
  assert.deepEqual(list(b.sync.added()), [], 'the server decides');
  assert.deepEqual(b.seeded, [], 'and its hidden list is untouched');
});

test('two devices seeding at once: the second gets 409 and adopts the server list', async () => {
  const svc = service();
  svc.rows.set('org_A', { version: 1, added: ['labs'] });
  const realGet = svc.transport.get;
  let first = true;
  svc.transport.get = async () => { if (first) { first = false; return { status: 200, body: { version: 0, added: [] } }; } return realGet(); };
  const d = device(svc, world());
  await d.sync.sync();
  await d.sync.sync();
  assert.ok(svc.calls.includes('SEED acme'));
  assert.deepEqual(list(d.sync.added()), ['labs']);
  assert.deepEqual(d.seeded, []);
});

for (const down of [404, 501, 403, 'network'] as const) {
  test(`criterion 5: with ${down} the rail does not empty, removing works on a local list, and it is uploaded when the route appears`, async () => {
    const svc = service({ down });
    const d = device(svc, world());
    await d.sync.sync();
    assert.deepEqual(list(d.sync.added()), ['acme'], 'a local list seeded with the same rule');
    d.sync.add('labs');
    d.sync.remove('acme');
    await d.sync.sync();
    assert.deepEqual(list(d.sync.added()), ['labs']);
    assert.deepEqual(d.seeded, [], 'hidden ids stay while the server has not answered 204');
    svc.up();
    d.retries.shift()?.();
    await d.sync.sync();
    assert.deepEqual(svc.rows.get('org_A')?.added, ['labs']);
    assert.deepEqual(d.records.get('user_1:org_A'), { local: null, pending: [] });
    assert.deepEqual(d.seeded, [['labs']]);
  });
}

test('criterion 4: removing on one device removes it on the other', async () => {
  const svc = service();
  const a = device(svc, world());
  const b = device(svc, world());
  await a.sync.sync();
  await b.sync.sync();
  a.sync.remove('acme');
  await a.sync.sync();
  await b.sync.sync();
  assert.deepEqual(list(b.sync.added()), []);
});

test('without person or organization nothing is called and nothing is known', async () => {
  const svc = service();
  const d = device(svc, world({ scope: null }));
  await d.sync.sync();
  d.sync.add('acme');
  assert.deepEqual(svc.calls, []);
  assert.equal(d.sync.added(), null);
});

test('changing organization does not mix lists', async () => {
  const svc = service();
  const w = world();
  const d = device(svc, w);
  await d.sync.sync();
  svc.as('org_B');
  w.scope = { person: 'user_1', organization: 'org_B' };
  w.available = [{ id: 'beta' }];
  await d.sync.sync();
  assert.deepEqual(list(d.sync.added()), [], 'org_B has no evidence: empty');
  assert.deepEqual(svc.rows.get('org_A')?.added, ['acme']);
});
