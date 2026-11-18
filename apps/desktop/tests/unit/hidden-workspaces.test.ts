import assert from 'node:assert/strict';
import test from 'node:test';
import { createRoot } from 'solid-js';
import { createHiddenWorkspaces, keepSlots, matchesName, railHidden, railVisible } from '../../src/features/shell/hidden-workspaces.ts';
import { danilToAdd, railWithDanil } from '../../src/features/shell/danil-rail.ts';
import { capabilities, setCapabilities } from '../../src/lib/platform.ts';

const rail = [{ id: 'a', name: 'Alfa' }, { id: 'b', name: 'Beta' }, { id: 'c', name: 'Canción' }, { id: 'd', name: 'Delta' }];
const ids = (list: { id: string }[]) => list.map(w => w.id);

function storage(seed: Record<string, string> = {}) {
  const values = new Map(Object.entries(seed));
  Object.assign(globalThis, { localStorage: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) } });
  return values;
}

test('a hidden workspace leaves the rail and is listed under the +', () => {
  const hidden = new Set(['b']);
  assert.deepEqual(ids(railVisible(rail, hidden, 'a')), ['a', 'c', 'd']);
  assert.deepEqual(ids(railHidden(rail, hidden)), ['b']);
  assert.deepEqual(ids(railVisible(rail, new Set(), 'a')), ['a', 'b', 'c', 'd'], 'with none hidden the rail is the whole list');
});

test('the open workspace shows while open though hidden, and hides again when another opens', () => {
  const hidden = new Set(['b']);
  assert.deepEqual(ids(railVisible(rail, hidden, 'b')), ['a', 'b', 'c', 'd']);
  assert.deepEqual(ids(railHidden(rail, hidden)), ['b'], 'opening it does not unhide it');
  assert.deepEqual(ids(railVisible(rail, hidden, 'c')), ['a', 'c', 'd']);
});

test('a hidden id that no longer exists breaks nothing and is not listed', () => {
  const hidden = new Set(['gone', 'c']);
  assert.deepEqual(ids(railVisible(rail, hidden, 'a')), ['a', 'b', 'd']);
  assert.deepEqual(ids(railHidden(rail, hidden)), ['c']);
  assert.deepEqual(railHidden([], hidden), []);
});

test('reordering the visible ones keeps each hidden one in its place', () => {
  const full = ids(rail);
  const visible = ids(railVisible(rail, new Set(['b']), 'a'));
  assert.deepEqual(keepSlots(full, ['d', 'a', 'c']), ['d', 'b', 'a', 'c'], 'b keeps the second place');
  assert.deepEqual(keepSlots(full, visible), full, 'an unchanged order saves the same list');
  assert.deepEqual(keepSlots(full, ['c', 'a', 'd', 'new']), ['c', 'b', 'a', 'd', 'new'], 'an id outside the list goes last');
});

test('the search ignores case and accents', () => {
  assert.ok(matchesName('Canción', 'cancion'));
  assert.ok(matchesName('Canción', 'CANCIÓN'));
  assert.ok(matchesName('Delta', '  '));
  assert.ok(!matchesName('Delta', 'alfa'));
});

test('hiding and showing persist under workspaces.hidden on desktop', () => {
  const values = storage();
  createRoot(dispose => {
    try {
      const hidden = createHiddenWorkspaces();
      hidden.hide('b');
      hidden.hide('b');
      hidden.hide('c');
      assert.equal(values.get('harness.layout.workspaces.hidden'), '["b","c"]');
      hidden.show('b');
      hidden.show('missing');
      assert.deepEqual([...createHiddenWorkspaces().ids()], ['c'], 'a new mount reads what was saved');
    } finally { dispose(); }
  });
});

test('on the web each person of the browser has their own hidden list', () => {
  const values = storage({ 'harness.layout.workspaces.hidden': '["legacy"]' });
  const original = capabilities();
  const person = (id: string) => setCapabilities({ ...original, nativeWindow: false, webAccounts: {
    current: { user_id: id, email: null, name: null, extra: false }, others: () => [], open: () => {}, add: () => {}, remove: async () => {}, signOut: () => {},
  } });
  createRoot(dispose => {
    try {
      const hidden = createHiddenWorkspaces();
      person('user_A');
      assert.deepEqual([...hidden.ids()], []);
      hidden.hide('a');
      assert.equal(values.get('danil.web.user_A.preferences.workspaces.hidden'), '["a"]');
      person('user_B');
      assert.deepEqual([...hidden.ids()], [], 'another person does not see the first one\'s list');
      hidden.hide('b');
      person('user_A');
      assert.deepEqual([...hidden.ids()], ['a']);
      assert.equal(values.get('harness.layout.workspaces.hidden'), '["legacy"]', 'the desktop key is untouched');
    } finally { setCapabilities(original); dispose(); }
  });
});

const danilRail = [{ id: 'local', name: 'Local' }, { id: 'acme', name: 'Acme' }, { id: 'ops', name: 'Ops' }, { id: 'old', name: 'Viejo' }];
const make = (w: { id: string; name: string }) => ({ ...w });

test('with the source settled, Danil workspaces show only if added; locals keep their hidden list', () => {
  const view = { available: [{ id: 'acme', name: 'Acme' }, { id: 'ops', name: 'Ops' }, { id: 'labs', name: 'Labs' }], added: new Set(['acme', 'labs']) };
  assert.deepEqual(ids(railWithDanil(danilRail, new Set(['old']), 'local', view, make)), ['local', 'acme', 'labs'], 'ops is not added, old is hidden, labs comes from the organization');
  assert.deepEqual(ids(railWithDanil(danilRail, new Set(), 'ops', view, make)), ['local', 'acme', 'ops', 'old', 'labs'], 'the open one always shows');
  assert.deepEqual(ids(railWithDanil(danilRail, new Set(['acme']), null, view, make)), ['local', 'acme', 'ops', 'old', 'labs'].filter((id) => id !== 'ops'), 'a local hidden list never hides a Danil workspace');
  assert.deepEqual(danilToAdd(view)?.map((w) => w.id), ['ops']);
});

test('without the source or the added list the rail stays as it was, and nothing is offered to add', () => {
  assert.deepEqual(ids(railWithDanil(danilRail, new Set(['old']), null, { available: null, added: new Set(['acme']) }, make)), ['local', 'acme', 'ops']);
  assert.deepEqual(ids(railWithDanil(danilRail, new Set(), null, { available: [{ id: 'acme', name: 'Acme' }], added: null }, make)), ids(danilRail));
  assert.equal(danilToAdd({ available: null, added: null }), null);
  assert.deepEqual(danilToAdd({ available: [{ id: 'acme', name: 'Acme' }], added: null })?.map((w) => w.id), ['acme'], 'a new account offers everything');
});

test('a Danil tile says so to who cannot see its mark; a local one does not', async () => {
  const { tileLabel } = await import('../../src/features/shell/danil-rail.ts');
  const t = (key: string, v: Record<string, string>) => key === 'shell.workspaces.danil_tile' ? `${v.name}, workspace de Danil` : `${v.name}: ${v.state}`;
  assert.equal(tileLabel('Acme', true, null, t), 'Acme, workspace de Danil');
  assert.equal(tileLabel('Acme', true, 'Espera', t), 'Acme, workspace de Danil: Espera');
  assert.equal(tileLabel('Mío', false, null, t), 'Mío');
  assert.equal(tileLabel('Mío', false, 'Espera', t), 'Mío: Espera');
});

test('regression: on entering, a Danil workspace the person did not add is not the open one', async () => {
  const { openOnStart } = await import('../../src/features/shell/danil-rail.ts');
  const list = [{ id: 'local' }, { id: 'acme' }, { id: 'ops' }, { id: 'old' }];
  const available = [{ id: 'acme', name: 'Acme' }, { id: 'ops', name: 'Ops' }, { id: 'labs', name: 'Labs' }];
  assert.equal(openOnStart(list, 'ops', new Set(), { available, added: new Set(['labs', 'acme']) }), 'acme', 'the first added in the rail');
  assert.equal(openOnStart(list, 'ops', new Set(), { available, added: new Set(['labs']) }), 'labs', 'an added one the rail did not know yet');
  assert.equal(openOnStart(list, 'ops', new Set(['local']), { available, added: new Set() }), 'old', 'with none added, the first local not hidden');
  assert.equal(openOnStart(list, 'acme', new Set(), { available, added: new Set(['acme']) }), null, 'an added one stays open');
  assert.equal(openOnStart(list, 'local', new Set(), { available, added: new Set() }), null, 'a local one stays open');
  assert.equal(openOnStart(list, 'ops', new Set(), { available: null, added: new Set() }), null, 'without the source nothing changes');
  assert.equal(openOnStart([{ id: 'ops' }], 'ops', new Set(), { available, added: new Set() }), null, 'with nowhere else to go it stays');
});

test('regression (beta): with unknown added ones the rail shows the organization workspaces and the + offers only the rest', () => {
  const available = [{ id: 'acme', name: 'Acme' }, { id: 'ops', name: 'Ops' }];
  const hiddenIds = new Set(['ops']);
  const view = { available, added: new Set(available.map((w) => w.id).filter((id) => !hiddenIds.has(id))) };
  assert.deepEqual(ids(railWithDanil([{ id: 'local', name: 'L' }], hiddenIds, 'local', view, make)), ['local', 'acme'], 'the organization one shows though the rail did not know it');
  assert.deepEqual(danilToAdd(view)?.map((w) => w.id), ['ops'], 'only the hidden one is offered');
});
