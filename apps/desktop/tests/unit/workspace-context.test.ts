import assert from "node:assert/strict";
import test from "node:test";
import { createEffect, createRoot } from "solid-js";
import { createWorkspaceStore } from "../../../../packages/features/workspace/src/index.ts";

const startup = (active: string | null, root: string | null = null) => ({ active, workspaces: active ? [{ id: active, context_root: root, default_permission_mode: "plan" }] : [] });
const source = (id: string, root = false, missing = false) => ({ id, root, missing });

test("transition reserves invalidation before activating the next workspace", () => {
  const store = createWorkspaceStore();
  const a = store.beginTransition(startup("A")); store.activate(a);
  const b = store.beginTransition(startup("B", "root-b"));
  assert.equal(b.previous, "A"); assert.equal(store.active(), "A");
  assert.equal(store.current(a), false); assert.equal(store.activate(a), false);
  assert.equal(store.activate(b), true); assert.equal(store.active(), "B");
  assert.equal(store.mode(), "plan"); assert.equal(store.root(), "root-b"); assert.equal(store.confirmed(), false);
});

test("same ID and A to B to A always invalidate old work", () => {
  const store = createWorkspaceStore();
  const first = store.beginTransition(startup("A")); store.activate(first);
  const same = store.beginTransition(startup("A")); store.activate(same);
  assert.equal(store.current(first), false);
  const b = store.beginTransition(startup("B")); store.activate(b);
  const last = store.beginTransition(startup("A")); store.activate(last);
  assert.equal(store.current(first), false); assert.equal(store.current(same), false); assert.equal(store.current(last), true);
});

test("new material invalidates only material and cannot confirm stale responses", () => {
  const store = createWorkspaceStore(); const transition = store.beginTransition(startup("A")); store.activate(transition);
  const epoch = store.generation(); const old = store.beginMaterial(); const latest = store.beginMaterial();
  assert.equal(store.generation(), epoch); assert.equal(store.current(transition), true);
  assert.equal(store.confirmContext(old, "old", [source("old")]), "obsolete");
  assert.equal(store.confirmContext(latest, null, [source("root", true)]), "accepted");
  assert.equal(store.root(), "root"); assert.equal(store.confirmed(), true);
});

test("missing roots cannot confirm; a workspace without a root can", () => {
  const store = createWorkspaceStore(); const token = store.beginTransition(startup("A")); store.activate(token);
  assert.equal(store.confirmContext(token, "missing", []), "unavailable");
  assert.equal(store.confirmContext(token, "missing", [source("missing", true, true)]), "unavailable");
  assert.equal(store.confirmed(), false);
  assert.equal(store.confirmContext(token, null, []), "accepted"); assert.equal(store.root(), null); assert.equal(store.confirmed(), true);
});

test("mode updates are confined to the active workspace; null startup remains empty", () => {
  const store = createWorkspaceStore(); const a = store.beginTransition(startup("A")); store.activate(a);
  store.modeChanged("B", "other"); assert.equal(store.mode(), "plan");
  store.modeChanged("A", "accept"); assert.equal(store.mode(), "accept");
  const empty = store.beginTransition(startup(null)); store.activate(empty);
  assert.equal(store.active(), null); assert.equal(store.mode(), null); assert.equal(store.confirmed(), false);
});

test("a mode response from an earlier visit cannot change the same workspace later", () => {
  const store = createWorkspaceStore(); const first = store.beginTransition(startup("A")); store.activate(first);
  const epoch = store.generation();
  const b = store.beginTransition(startup("B")); store.activate(b);
  const again = store.beginTransition(startup("A")); store.activate(again);
  store.modeChanged("A", "obsolete", epoch); assert.equal(store.mode(), "plan");
  store.modeChanged("A", "current", store.generation()); assert.equal(store.mode(), "current");
});

test("disposal invalidates every outstanding token and blocks late writes", () => {
  const store = createWorkspaceStore(); const token = store.beginTransition(startup("A")); store.activate(token);
  store.dispose(); assert.equal(store.current(token), false); assert.equal(store.currentMaterial(token), false);
  assert.equal(store.activate(token), false); assert.equal(store.confirmContext(token, null, []), "obsolete");
  store.modeChanged("A", "late"); assert.equal(store.mode(), "plan");
  const generation = store.generation();
  store.beginTransition(startup("B", "late")); store.beginMaterial();
  assert.equal(store.generation(), generation); assert.equal(store.root(), null); assert.equal(store.mode(), "plan");
});

test("generation reads do not subscribe effects to workspace changes", async () => {
  let dispose!: () => void; let runs = 0;
  const store = createRoot(stop => { dispose = stop; const store = createWorkspaceStore(); createEffect(() => { store.generation(); runs++; }); return store; });
  await Promise.resolve(); const a = store.beginTransition(startup("A")); store.activate(a); store.beginMaterial();
  assert.equal(runs, 1); dispose(); store.dispose();
});
