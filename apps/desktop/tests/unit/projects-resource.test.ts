import assert from "node:assert/strict";
import test from "node:test";
import { createEffect, createRoot } from "solid-js";
import { createResource } from "../../src/lib/resource.ts";
import { createProjectsStore as projectsStore, type ProjectsScope } from "../../../../packages/features/projects/src/index.ts";
import type { Project } from "../../src/lib/model.ts";

function createProjectsStore(deps: Parameters<typeof projectsStore>[0]) {
  return createRoot(dispose => { const store = projectsStore(deps); return { ...store, dispose: () => { store.dispose(); dispose(); } }; });
}

function pending<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const row = (id: string): Project => ({ id, name: id, node: null, sources: [], created_at: 0, updated_at: 0, sessions: 0, kind: "folder" });

test("concurrent readers share one request", async () => {
  const reply = pending<string[]>(); let calls = 0;
  const resource = createResource({ read: async () => { calls++; return reply.promise; }, timeoutMs: 1000 });
  const first = resource.read("A"); const second = resource.read("A");
  assert.equal(first, second); assert.equal(calls, 1);
  reply.resolve(["one"]); assert.deepEqual(await first, ["one"]);
  assert.equal(resource.state().status, "ready"); resource.dispose();
});

test("changing key aborts the old reader and excludes a late response", async () => {
  const old = pending<string>(); const signals: AbortSignal[] = [];
  const resource = createResource({ read: async (key: string, signal) => { signals.push(signal); return key === "A" ? old.promise : "new"; }, timeoutMs: 1000 });
  const first = resource.read("A"); const rejected = assert.rejects(first, { name: "AbortError" });
  assert.equal(await resource.read("B"), "new"); await rejected;
  assert.equal(signals[0].aborted, true); old.resolve("old"); await Promise.resolve();
  assert.deepEqual(resource.state(), { status: "ready", key: "B", value: "new" }); resource.dispose();
});

test("failure preserves a cached value as stale", async () => {
  const failure = new Error("offline");
  const resource = createResource<string, string[]>({ read: async () => { throw failure; }, timeoutMs: 1000 });
  resource.seed("A", ["cached"]);
  await assert.rejects(resource.read("A"), error => error === failure);
  assert.deepEqual(resource.state(), { status: "stale", key: "A", value: ["cached"], error: failure }); resource.dispose();
});

test("invalidating an in-flight read joins one fresh read after it settles", async () => {
  const old = pending<string>(); let calls = 0;
  const resource = createResource({ read: async () => ++calls === 1 ? old.promise : "fresh", timeoutMs: 1000 });
  const reading = resource.read("A"); resource.invalidate(2);
  assert.equal(resource.read("A"), reading); resource.invalidate(2);
  assert.equal(calls, 1); old.resolve("obsolete");
  assert.equal(await reading, "fresh"); assert.equal(calls, 2); resource.dispose();
});

test("one deadline bounds a read and disposal cancels it", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const resource = createResource({ read: async () => new Promise<string>(() => {}), timeoutMs: 20 });
  const timed = assert.rejects(resource.read("A"), { name: "TimeoutError" });
  t.mock.timers.tick(20); await timed; assert.equal(resource.state().status, "error");
  const cancelled = assert.rejects(resource.read("B"), { name: "AbortError" }); resource.dispose(); await cancelled;
  assert.equal(resource.state().status, "idle");
});

test("project rows retain identity and workspace/machine scopes stay separate", async () => {
  let scope: ProjectsScope = { workspace: "A", machine: null }; const asked: unknown[] = []; let fail = false;
  const store = createProjectsStore({ scope: () => scope, invoke: async <T>(command: string, _args?: Record<string, unknown>, options?: { headers: Record<string, string> }) => { asked.push([command, options]); if (fail) throw new Error("offline"); return [row("one")] as T; } });
  await store.refresh(); const first = store.rows(); await store.refresh(); assert.equal(store.rows(), first);
  fail = true; await assert.rejects(store.refresh(), /offline/); assert.equal(store.rows(), first); assert.equal(store.state().status, "stale"); fail = false;
  scope = { workspace: "B", machine: "m2" }; store.workspaceChanged(); assert.deepEqual(store.rows(), []);
  await store.refresh(); assert.deepEqual(asked.at(-1), ["list_projects", { headers: { "x-terminus-workspace": "B", "x-terminus-machine": "m2" } }]); store.dispose();
});

test("a mutation finishes in its original scope and does not refresh another workspace", async () => {
  let scope: ProjectsScope = { workspace: "A", machine: null }; const changed = pending<unknown>(); const asked: string[] = [];
  const store = createProjectsStore({ scope: () => scope, invoke: async <T>(command: string) => { asked.push(command); return command === "rename_project" ? await changed.promise as T : [] as T; } });
  const mutation = store.rename("one", "renamed"); scope = { workspace: "B", machine: null }; store.workspaceChanged(); changed.resolve(null); await mutation;
  assert.deepEqual(asked, ["rename_project"]); assert.deepEqual(store.rows(), []); store.dispose();
});


test("invalidation churn cannot exceed the read budget", async () => {
  let calls = 0;
  const resource = createResource<string, string>({ read: async () => { calls++; resource.invalidate(); return "obsolete"; }, timeoutMs: 1000, maxReads: 2 });
  await assert.rejects(resource.read("A"), { name: "QuotaExceededError" });
  assert.equal(calls, 2); resource.dispose();
});

test("machine-specific reads deduplicate without replacing the aggregate rows", async () => {
  const remote = pending<Project[]>(); let calls = 0;
  const store = createProjectsStore({ scope: () => ({ workspace: "A", machine: null }), invoke: async <T>(_command: string, _args?: Record<string, unknown>, options?: { headers: Record<string, string> }) => {
    if (!options?.headers["x-terminus-machine"]) return [row("aggregate")] as T;
    calls++; return await remote.promise as T;
  } });
  await store.refresh();
  const first = store.readForMachine("m1"); store.workspaceChanged(true); const second = store.readForMachine("m1");
  assert.equal(first, second); assert.equal(calls, 1); remote.resolve([row("remote")]); await first;
  assert.equal(store.rows()[0].id, "aggregate"); store.dispose();
});


test("status changes and equal replies do not notify row consumers", async () => {
  let updates = 0;
  let release!: () => void;
  const store = createRoot(dispose => {
    const current = projectsStore({ scope: () => ({ workspace: "A", machine: null }), invoke: async <T>() => [row("one")] as T });
    createEffect(() => { current.rows(); updates++; });
    release = () => { current.dispose(); dispose(); };
    return current;
  });
  assert.equal(updates, 1); await store.refresh(); assert.equal(updates, 2);
  await store.refresh(); assert.equal(updates, 2); release();
});


test("a project change during a read joins a fresh snapshot without clearing deduplication", async () => {
  const old = pending<Project[]>(); let calls = 0;
  const store = createProjectsStore({ scope: () => ({ workspace: "A", machine: null }), invoke: async <T>() => ++calls === 1 ? await old.promise as T : [row("fresh")] as T });
  const reading = store.refresh(); const changed = store.changed(); assert.equal(reading, changed);
  old.resolve([row("obsolete")]); await changed;
  assert.equal(calls, 2); assert.equal(store.rows()[0].id, "fresh"); store.dispose();
});

test("imperative refresh does not subscribe its calling effect to resource state", async () => {
  let effects = 0; let reads = 0; let release!: () => void;
  const store = createRoot(dispose => {
    const current = projectsStore({ scope: () => ({ workspace: "A", machine: null }), invoke: async <T>() => { reads++; return [row("one")] as T; } });
    createEffect(() => { effects++; void current.refresh(); });
    release = () => { current.dispose(); dispose(); }; return current;
  });
  for (let i = 0; i < 20; i++) await Promise.resolve();
  assert.equal(effects, 1); assert.equal(reads, 1); assert.equal(store.rows()[0].id, "one"); release();
});


test("project mutations pin both workspace and machine before awaiting the reply", async () => {
  let scope: ProjectsScope = { workspace: "A", machine: "m1" }; const reply = pending<unknown>();
  const calls: { command: string; headers: Record<string, string> | undefined }[] = [];
  const store = createProjectsStore({ scope: () => scope, invoke: async <T>(command: string, _args?: Record<string, unknown>, options?: { headers: Record<string, string> }) => {
    calls.push({ command, headers: options?.headers }); return await reply.promise as T;
  } });
  const writing = store.rename("one", "renamed");
  scope = { workspace: "B", machine: "m2" }; store.workspaceChanged(); reply.resolve(null); await writing;
  assert.deepEqual(calls, [{ command: "rename_project", headers: { "x-terminus-workspace": "A", "x-terminus-machine": "m1" } }]); store.dispose();
});

test("empty project snapshots do not restart row consumers", async () => {
  let updates = 0; let release!: () => void;
  const store = createRoot(dispose => {
    const current = projectsStore({ scope: () => ({ workspace: "A", machine: null }), invoke: async <T>() => [] as T });
    createEffect(() => { current.rows(); updates++; });
    release = () => { current.dispose(); dispose(); }; return current;
  });
  const initial = store.rows();
  store.workspaceChanged();
  await store.refresh();
  store.fromCache([]);
  assert.equal(store.rows(), initial);
  assert.equal(updates, 1);
  release();
});

test("confirmed scope announces an empty project catalog once per workspace transition", async () => {
  let scope: ProjectsScope = { workspace: "A", machine: null };
  const confirmed: (string | null)[] = [];
  let release!: () => void;
  const store = createRoot(dispose => {
    const current = projectsStore({ scope: () => scope, invoke: async <T>() => [] as T });
    createEffect(() => { const ready = current.readyScope(); if (ready) confirmed.push(ready.workspace); });
    release = () => { current.dispose(); dispose(); }; return current;
  });
  const empty = store.rows();
  assert.equal(store.readyScope(), null);
  await store.refresh(); const first = store.readyScope();
  assert.equal(store.rows(), empty); assert.deepEqual(confirmed, ["A"]);
  await store.refresh(); assert.equal(store.readyScope(), first); assert.deepEqual(confirmed, ["A"]);
  scope = { workspace: "B", machine: null }; store.workspaceChanged(); assert.equal(store.readyScope(), null);
  await store.refresh(); assert.equal(store.rows(), empty); assert.deepEqual(confirmed, ["A", "B"]);
  store.workspaceChanged(); await store.refresh(); assert.deepEqual(confirmed, ["A", "B", "B"]);
  release();
});

test("cached projects and a stale reply cannot confirm another workspace", async () => {
  let scope: ProjectsScope = { workspace: "A", machine: null }; const reply = pending<Project[]>();
  const store = createProjectsStore({ scope: () => scope, invoke: async <T>() => reply.promise as Promise<T> });
  store.fromCache([]); assert.equal(store.readyScope(), null);
  const old = store.refresh(); const aborted = assert.rejects(old, { name: "AbortError" });
  scope = { workspace: "B", machine: null }; store.workspaceChanged();
  reply.resolve([]); await aborted; assert.equal(store.readyScope(), null); store.dispose();
});
