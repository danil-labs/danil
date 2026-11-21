import assert from "node:assert/strict";
import test from "node:test";
import { createRoot, createSignal } from "solid-js";
import { createTaskQueues, type QueueScope } from "../../src/features/task-queues/index.ts";
import type { Encolado } from "../../src/features/chat/index.ts";
const message = (id: string, text = id): Encolado => ({ id, text, provider: "codex", model: null, effort: null, permission_mode: null, attachments: [] });
function fixture(read: (scope: QueueScope) => Promise<Encolado[]> = async () => []) {
  return createRoot(dispose => {
    const [scope, setScope] = createSignal<QueueScope>({ workspace: "A", generation: 1, session: "s1", project: "p1" });
    const writes: { scope: QueueScope; items: Encolado[] }[] = [], failures: unknown[] = [];
    const queue = createTaskQueues({ scope, readQueue: read, writeQueue: async (scope, items) => { writes.push({ scope, items }); }, onSaveFailure: error => { failures.push(error); } });
    return { queue, scope, setScope, writes, failures, dispose };
  });
}
test("detach empties hand without overwriting departed session", async () => {
  const f = fixture(); await f.queue.openSession("s1", "p1"); f.queue.enqueue(message("a"));
  const writes = f.writes.length; f.queue.detach(); assert.equal(f.writes.length, writes);
  assert.deepEqual(f.queue.saved("s1")?.items.map(item => item.id), ["a"]); f.dispose();
});
test("the memory copy of a disk queue takes precedence when the task is reopened", async () => {
  let reads = 0; const f = fixture(async () => { reads++; return [message("disk")]; });
  await f.queue.openSession("s1", "p1"); f.queue.enqueue(message("fresh")); f.queue.detach();
  await f.queue.openSession("s1", "p1"); assert.equal(reads, 1); assert.deepEqual(f.queue.items().map(item => item.id), ["disk", "fresh"]); f.dispose();
});
test("late read across A B A cannot adopt old queue", async () => {
  let resolve!: (items: Encolado[]) => void; const f = fixture(() => new Promise(done => { resolve = done; }));
  const reading = f.queue.openSession("s1", "p1"); f.queue.workspaceChanged(); f.setScope({ ...f.scope(), workspace: "B", generation: 2 });
  f.queue.workspaceChanged(); f.setScope({ ...f.scope(), workspace: "A", generation: 3 }); resolve([message("late")]); await reading;
  assert.deepEqual(f.queue.items(), []); assert.equal(f.queue.owner(), null); f.dispose();
});
test("old same-workspace task reopen cannot replace a fresh read", async () => {
  const resolves: ((rows: Encolado[]) => void)[] = [];
  const f = fixture(() => new Promise(done => resolves.push(done)));
  const old = f.queue.openSession("s1", "p1"); f.queue.detach();
  f.setScope({ ...f.scope(), session: "s2" }); f.queue.detach(); f.setScope({ ...f.scope(), session: "s1" });
  const fresh = f.queue.openSession("s1", "p1"); resolves[0]([message("obsolete")]); await old;
  resolves[1]([message("fresh")]); await fresh; assert.deepEqual(f.queue.items().map(item => item.id), ["fresh"]); f.dispose();
});
test("saved queue snapshots cannot overtake an earlier write for the same task", async () => {
  const pending: { items: Encolado[]; commit: () => void }[] = []; let persisted: string[] = [];
  const queue = createRoot(() => createTaskQueues({ scope: () => ({ workspace: "A", generation: 1, session: null, project: "p1" }), readQueue: async () => [],
    writeQueue: async (_scope, items) => new Promise<void>(done => pending.push({ items, commit: () => { persisted = items.map(item => item.id); done(); } })), onSaveFailure: () => {} }));
  const old = queue.persist("s1", "p1", [message("old")]); const newest = queue.persist("s1", "p1", [message("new")]);
  assert.equal(pending.length, 1, "a newer snapshot waits for the older write instead of racing it");
  pending[0].commit(); await old; await Promise.resolve(); assert.equal(pending.length, 2); pending[1].commit(); await newest;
  assert.deepEqual(persisted, ["new"]); queue.dispose();
});
test("saving another workspace is independent of a delayed write", async () => {
  let scope: QueueScope = { workspace: "A", generation: 1, session: null, project: "p1" };
  const pending: { workspace: string | null; commit: () => void }[] = [];
  const queue = createRoot(() => createTaskQueues({ scope: () => scope, readQueue: async () => [], writeQueue: async captured => new Promise<void>(done => pending.push({ workspace: captured.workspace, commit: done })), onSaveFailure: () => {} }));
  const a = queue.persist("s1", "p1", [message("A")]); scope = { ...scope, workspace: "B", generation: 2 };
  const b = queue.persist("s1", "p1", [message("B")]); assert.deepEqual(pending.map(write => write.workspace), ["A", "B"]);
  pending[1].commit(); await b; pending[0].commit(); await a; queue.dispose();
});
test("a failed save is reported to its caller and does not stall newer edits", async () => {
  let reject!: (error: unknown) => void; let writes = 0; const failure = new Error("save failed");
  const queue = createRoot(() => createTaskQueues({ scope: () => ({ workspace: "A", generation: 1, session: null, project: "p1" }), readQueue: async () => [],
    writeQueue: async () => ++writes === 1 ? new Promise<void>((_, no) => { reject = no; }) : undefined, onSaveFailure: () => {} }));
  const first = queue.persist("s1", "p1", [message("old")]); const rejected = assert.rejects(first, error => error === failure);
  const next = queue.persist("s1", "p1", [message("new")]); reject(failure); await rejected; await next; assert.equal(writes, 2); queue.dispose();
});
test("accepted queued saves survive view disposal without accepting new work", async () => {
  const pending: (() => void)[] = [];
  const queue = createRoot(() => createTaskQueues({ scope: () => ({ workspace: "A", generation: 1, session: null, project: "p1" }), readQueue: async () => [], writeQueue: async () => new Promise<void>(done => pending.push(done)), onSaveFailure: () => {} }));
  const first = queue.persist("s1", "p1", [message("old")]), second = queue.persist("s1", "p1", [message("new")]);
  queue.dispose(); await queue.persist("s1", "p1", [message("late")]); pending[0](); await first; await Promise.resolve(); assert.equal(pending.length, 2); pending[1](); await second;
});
