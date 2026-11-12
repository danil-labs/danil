import assert from 'node:assert/strict';
import test from 'node:test';
import { FEATURES, contextKey, decodeSelection, emptySelection, encodeSelection, toggleFeature } from '../src/customization.ts';

test('preferences start empty, opt in explicitly and retain only unique eligible IDs in canonical order', () => {
  let state = emptySelection();
  assert.deepEqual(state.enabled, []);
  state = toggleFeature(toggleFeature(state, 'broadcasts'), 'inbox');
  assert.deepEqual(state.enabled, ['inbox', 'broadcasts']);
  assert.equal(toggleFeature(state, 'contacts'), state);
  assert.equal(toggleFeature(state, '__proto__'), state);
  assert.deepEqual(decodeSelection(encodeSelection(state)).enabled, state.enabled);
  assert.deepEqual(toggleFeature(state, 'inbox').enabled, ['broadcasts']);
  assert.deepEqual(decodeSelection('{"version":1,"enabled":["inbox","inbox"]}').enabled, []);
});

test('future preferences never enable features or get rewritten by this version', () => {
  for (const raw of ['{"version":2,"enabled":["inbox"]}', '{"enabled":["inbox"]}', ' '.repeat(4097)]) {
    const state = decodeSelection(raw);
    assert.deepEqual(state.enabled, []);
    assert.equal(toggleFeature(state, 'inbox'), state);
    assert.equal(encodeSelection(state), null);
  }
});

test('corruption cannot enable arbitrary features or change unrelated preferences', () => {
  for (const raw of ['null', '[]', 'false', '{broken', '{"version":1,"enabled":{}}', '{"version":1,"enabled":["contacts"]}', '{"version":1,"enabled":["inbox",4]}', JSON.stringify({version:1,enabled:Array(9).fill('inbox')})]) assert.deepEqual(decodeSelection(raw).enabled, []);
});

test('identity, workspace and space are explicit, collision-free and bounded', () => {
  const scope={user:'u',workspace:'w',space:'s'};
  const key=contextKey(scope);
  assert.ok(key);
  for (const change of [{user:'other'},{workspace:'other'},{space:'other'}]) assert.notEqual(contextKey({...scope,...change}),key);
  assert.notEqual(contextKey({user:'a/b',workspace:'c',space:'d'}),contextKey({user:'a',workspace:'b/c',space:'d'}));
  for (const user of [null,undefined,'',' ','u\n','x'.repeat(257)]) assert.equal(contextKey({...scope,user}),null);
});


test('retired calendar, funnels and metrics are absent from customization', () => {
  assert.ok(FEATURES.every(row => !['calendar', 'funnels', 'metrics'].includes(row.id)));
});
