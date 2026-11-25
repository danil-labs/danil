import assert from 'node:assert/strict';
import test from 'node:test';
import { createRoot } from 'solid-js';
import { capabilities, setCapabilities } from '../../../../packages/host/src/platform.ts';
import { createPref } from '../../src/lib/prefs.ts';

test('the selected machine follows the person even when the preference was created before web mounted', () => {
  const values = new Map<string, string>([['harness.layout.machines.run_on', '{"w":"legacy"}']]);
  Object.assign(globalThis, { localStorage: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) } });
  const original = capabilities();
  const person = (id: string) => setCapabilities({ ...original, nativeWindow: false, webAccounts: {
    current: { user_id: id, email: null, name: null, extra: false }, others: () => [], open: () => {}, add: () => {}, remove: async () => {}, signOut: () => {},
  } });
  createRoot(dispose => {
    try {
      const [read, write] = createPref<Record<string, string>>('machines.run_on', {});
      person('user_A');
      assert.deepEqual(read(), {});
      write({ w: 'machine_A' });
      assert.equal(values.get('danil.web.user_A.preferences.machines.run_on'), '{"w":"machine_A"}');
      person('user_B');
      assert.deepEqual(read(), {});
      write({ w: 'machine_B' });
      person('user_A');
      assert.deepEqual(read(), { w: 'machine_A' });
      assert.equal(values.get('harness.layout.machines.run_on'), '{"w":"legacy"}');
    } finally { setCapabilities(original); dispose(); }
  });
});

test('the last picked projects follow the person on the web', () => {
  const values = new Map<string, string>();
  Object.assign(globalThis, { localStorage: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) } });
  const original = capabilities();
  const person = (id: string) => setCapabilities({ ...original, nativeWindow: false, webAccounts: {
    current: { user_id: id, email: null, name: null, extra: false }, others: () => [], open: () => {}, add: () => {}, remove: async () => {}, signOut: () => {},
  } });
  createRoot(dispose => {
    try {
      const [read, write] = createPref<Record<string, Record<string, number>>>('projects.last_picked', {});
      person('user_A');
      write({ w: { p1: 1 } });
      assert.equal(values.get('danil.web.user_A.preferences.projects.last_picked'), '{"w":{"p1":1}}');
      person('user_B');
      assert.deepEqual(read(), {});
      person('user_A');
      assert.deepEqual(read(), { w: { p1: 1 } });
    } finally { setCapabilities(original); dispose(); }
  });
});

test('the projects hidden from the picker follow the person on the web', () => {
  const values = new Map<string, string>();
  Object.assign(globalThis, { localStorage: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) } });
  const original = capabilities();
  const person = (id: string) => setCapabilities({ ...original, nativeWindow: false, webAccounts: {
    current: { user_id: id, email: null, name: null, extra: false }, others: () => [], open: () => {}, add: () => {}, remove: async () => {}, signOut: () => {},
  } });
  createRoot(dispose => {
    try {
      const [read, write] = createPref<Record<string, string[]>>('projects.hidden', {});
      person('user_A');
      write({ w: ['p1'] });
      assert.equal(values.get('danil.web.user_A.preferences.projects.hidden'), '{"w":["p1"]}');
      assert.equal(values.has('harness.layout.projects.hidden'), false, 'not shared by the browser');
      person('user_B');
      assert.deepEqual(read(), {});
      person('user_A');
      assert.deepEqual(read(), { w: ['p1'] });
    } finally { setCapabilities(original); dispose(); }
  });
});
