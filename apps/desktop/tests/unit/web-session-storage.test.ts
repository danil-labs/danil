import assert from 'node:assert/strict';
import test from 'node:test';
import { sessionStorageScope, clearWebCaches } from '../../src/web/session-storage.ts';

const memory = () => {
  const entries = new Map<string, string>();
  return { entries, get length() { return entries.size; }, key: (i: number) => [...entries.keys()][i] ?? null,
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => { entries.set(key, value); }, removeItem: (key: string) => { entries.delete(key); } };
};
test('logout or expiry erases every workspace of the current person and revokes late writes', () => {
  const store = memory();
  const scope = sessionStorageScope(store, 'user_A', '11');
  scope.storage.setItem('tasks', 'private');
  store.setItem('danil.web.user_A.12.tasks', 'other workspace');
  store.setItem('danil.web.user_A.preferences.machines.run_on', 'machine');
  store.setItem('danil.web.user_B.11.tasks', 'another person');
  store.setItem('unrelated', 'keep');
  scope.clear();
  scope.storage.setItem('tasks', 'late callback');
  assert.equal(scope.storage.getItem('tasks'), null);
  assert.deepEqual([...store.entries.keys()], ['danil.web.user_B.11.tasks', 'unrelated']);
});
test('an initial 401 with no known identity erases all web caches', () => {
  const store = memory();
  store.setItem('danil.web.user_A.11.tasks', 'private');
  store.setItem('unrelated', 'keep');
  clearWebCaches(store);
  assert.deepEqual([...store.entries.keys()], ['unrelated']);
});
