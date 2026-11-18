import assert from "node:assert/strict";
import test from "node:test";
import { batch, createEffect, createRoot, createSignal } from "solid-js";
import { createConversationHandoff, type ConversationScope } from "../../src/features/conversation-handoff/index.ts";
import { createTaskQueues } from "../../src/features/task-queues/index.ts";

const scope: ConversationScope = { workspace: "A", generation: 1, project: "p", session: "s", route: { headers: { "x-terminus-machine": "m1" } } };
function fixture() {
  return createRoot(dispose => {
    let current = { workspace: scope.workspace, generation: scope.generation }, active = true;
    const stops: ConversationScope[] = [], released: string[] = [], selected: string[] = [], failures: string[] = [];
    const queued = new Map([["one", "queued text"], ["two", "queued text"]]);
    let resolve!: () => void, reject!: (error: unknown) => void;
    const pending = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
    const handoff = createConversationHandoff({ current: () => current,
      runtime: { active: () => active, stop: async captured => { stops.push(captured); await pending; } },
      queue: { message: (_scope, id) => queued.has(id) ? { text: queued.get(id)! } : undefined, select: (_scope, id) => { selected.push(id); return queued.has(id); }, release: (_scope, id) => { released.push(id); },
        failed: (_scope, id) => { failures.push(id); } } });
    return { handoff, stops, released, selected, failures, queued, resolve, reject, move: (workspace: string, generation: number) => { current = { workspace, generation }; },
      idle: () => { active = false; }, activate: () => { active = true; }, dispose: () => { handoff.dispose(); dispose(); } };
  });
}
test("stop intent is immediate with a blocked RPC and duplicate gestures issue one request", async () => {
  const f = fixture(), pending = f.handoff.requestStop(scope);
  assert.equal(f.handoff.view(scope).stopping, true); assert.equal(f.stops.length, 1);
  const second = f.handoff.requestStop(scope); assert.equal(f.stops.length, 1);
  f.resolve(); await Promise.all([pending, second]);
  assert.equal(f.handoff.view(scope).stopping, true); assert.deepEqual(f.released, []);
  f.handoff.observe({ kind: "terminal", scope }); assert.equal(f.handoff.view(scope).stopping, false); f.dispose();
});
test("replacement releases only after terminal and tracks submission through the actual start", async () => {
  const f = fixture(), pending = f.handoff.replaceWithQueued(scope, "one");
  assert.deepEqual(f.handoff.view(scope).pending, { queueItemId: "one", phase: "waiting-close" });
  f.resolve(); await pending; assert.deepEqual(f.released, []);
  f.handoff.observe({ kind: "terminal", scope }); f.handoff.observe({ kind: "terminal", scope });
  assert.deepEqual(f.released, ["one"]);
  f.handoff.observe({ kind: "dispatching", scope, itemIds: ["one"] }); assert.equal(f.handoff.view(scope).pending?.phase, "submitting");
  f.handoff.observe({ kind: "accepted", scope }); assert.equal(f.handoff.view(scope).pending?.phase, "awaiting-start");
  assert.equal(f.queued.get("one"), "queued text");
  f.handoff.observe({ kind: "started", scope }); assert.equal(f.handoff.view(scope).pending, null); f.dispose();
});
test("stop failure retains queue identity and does not dispatch or invent a close", async () => {
  const f = fixture(), failure = new Error("RPC rejected"), pending = f.handoff.replaceWithQueued(scope, "one");
  f.reject(failure); await pending;
  assert.equal(f.handoff.view(scope).error, failure); assert.equal(f.handoff.view(scope).pending?.queueItemId, "one");
  assert.equal(f.queued.size, 2); assert.deepEqual(f.released, []); f.dispose();
});
test("old A promises cannot change B or a later A generation", async () => {
  const f = fixture(), pending = f.handoff.replaceWithQueued(scope, "one");
  f.move("B", 2); f.move("A", 3); const returned = { ...scope, generation: 3 };
  f.reject(new Error("late A failure")); await pending;
  assert.deepEqual(f.handoff.view(returned), { stopping: false, pending: null, error: null, released: false });
  f.handoff.observe({ kind: "terminal", scope }); assert.deepEqual(f.released, []); f.dispose();
});
test("starting before the send ACK clears the pending handoff without replaying it", async () => {
  const f = fixture(); f.idle(); await f.handoff.replaceWithQueued(scope, "two");
  assert.equal(f.stops.length, 0); assert.deepEqual(f.released, ["two"]);
  f.handoff.observe({ kind: "dispatching", scope, itemIds: ["two"] }); f.handoff.observe({ kind: "started", scope });
  f.handoff.observe({ kind: "accepted", scope }); assert.equal(f.handoff.view(scope).pending, null); assert.deepEqual(f.released, ["two"]); f.dispose();
});

 test("terminal before the blocked stop ACK cannot release a successor into the late cancellation", async () => {
  const f = fixture(), pending = f.handoff.replaceWithQueued(scope, "one");
  f.handoff.observe({ kind: "terminal", scope });
  assert.deepEqual(f.released, []); assert.equal(f.handoff.view(scope).pending?.phase, "waiting-close");
  assert.equal(f.handoff.view(scope).stopping, true);
  f.resolve(); await pending; assert.deepEqual(f.released, ["one"]); f.dispose();
});

function integrated() {
  return createRoot(dispose => {
    const [active, setActive] = createSignal(true); let stopAck!: () => void, stopFailure!: (error: unknown) => void;
    let sends = 0;
    const queue = createTaskQueues({ scope: () => scope, readQueue: async () => [], writeQueue: async () => undefined, onSaveFailure: () => assert.fail("unexpected save failure") });
    const handoff = createConversationHandoff({ current: () => scope,
      runtime: { active, stop: async () => new Promise<void>((yes, no) => { stopAck = yes; stopFailure = no; }) },
      queue: { message: (_scope, id) => queue.items().find(item => item.id === id), select: (_scope, id) => { if (!queue.items().some(item => item.id === id)) return false; queue.prioritize(id); return true; },
        release: () => queue.retain(null), failed: () => queue.retain("fallo") } });
    createEffect(() => {
      const next = queue.next({ busy: active() || handoff.blocked(scope), waiting: false });
      if (next?.kind === "message") { sends++; handoff.observe({ kind: "dispatching", scope, itemIds: next.itemIds }); }
    });
    return { queue, handoff, sends: () => sends, stopAck: () => stopAck(), stopFailure: (error: unknown) => stopFailure(error),
      terminal: () => batch(() => { setActive(false); handoff.observe({ kind: "terminal", scope }); }),
      dispose: () => { handoff.dispose(); queue.dispose(); dispose(); } };
  });
}
for (const order of ["terminal-first", "ack-first"] as const) test(`the real queue dispatcher preserves handoff until both facts: ${order}`, async () => {
  const f = integrated(); await f.queue.openSession("s", "p");
  const original = { id: "original", text: "queued message", provider: "codex", model: null, effort: null, permission_mode: null, attachments: [] };
  f.queue.enqueue(original); const pending = f.handoff.replaceWithQueued(scope, original.id);
  assert.equal(f.queue.items()[0], original); assert.equal(f.sends(), 0);
  assert.equal(f.handoff.presentation(scope)?.phase, "waiting-close");
  assert.equal((f.handoff.presentation(scope) as { pendingMessage: unknown }).pendingMessage, original);
  if (order === "terminal-first") { f.terminal(); assert.equal(f.sends(), 0); f.stopAck(); await pending; }
  else { f.stopAck(); await pending; assert.equal(f.sends(), 0); f.terminal(); }
  assert.equal(f.sends(), 1); assert.equal(f.handoff.view(scope).pending?.phase, "submitting");
  assert.deepEqual(f.handoff.presentation(scope), { phase: "submitting", queueItemId: original.id });
  f.handoff.observe({ kind: "accepted", scope }); assert.equal(f.handoff.view(scope).pending?.phase, "awaiting-start");
  f.handoff.observe({ kind: "terminal", scope }); assert.equal(f.sends(), 1); assert.equal(f.handoff.view(scope).pending, null); f.dispose();
});
test("a rejected stop preserves the original object in the real queue through a natural close", async () => {
  const f = integrated(); await f.queue.openSession("s", "p");
  const original = { id: "original", text: "queued message", provider: "codex", model: null, effort: null, permission_mode: null, attachments: [] };
  f.queue.enqueue(original); const pending = f.handoff.replaceWithQueued(scope, original.id);
  f.stopFailure(new Error("stop rejected")); await pending; f.terminal();
  assert.equal(f.queue.items()[0], original); assert.equal(f.queue.retained(), "fallo"); assert.equal(f.sends(), 0); f.dispose();
});

 test("the native shell not-applied reply clears intent without releasing a queue or declaring terminal", async () => {
  const released: string[] = [];
  const handoff = createConversationHandoff({ current: () => scope, runtime: { active: () => true, stop: async () => false },
    queue: { message: () => undefined, select: () => true, release: (_scope, id) => { released.push(id); }, failed: () => assert.fail("unexpected failure") } });
  await handoff.replaceWithQueued(scope, "native-next");
  assert.equal(handoff.view(scope).stopping, false); assert.deepEqual(released, []);
  handoff.observe({ kind: "terminal", scope }); assert.deepEqual(released, ["native-next"]); handoff.dispose();
});
 test("stop captures the machine route before asynchronous context changes", async () => {
  const f = fixture(), capturedScope = { ...scope, route: { headers: { "x-terminus-machine": "original-machine" } } };
  const pending = f.handoff.requestStop(capturedScope); capturedScope.route.headers["x-terminus-machine"] = "other-machine";
  assert.equal(f.stops[0].route?.headers["x-terminus-machine"], "original-machine");
  f.move("B", 2); f.resolve(); await pending; assert.deepEqual(f.released, []); f.dispose();
});

 test("removing the queued replacement drops its reference without settling a pending stop", async () => {
  const f = fixture(), pending = f.handoff.replaceWithQueued(scope, "one");
  f.handoff.observe({ kind: "queue-removed", scope, queueItemId: "one" });
  assert.equal(f.handoff.view(scope).pending, null); assert.equal(f.handoff.view(scope).stopping, true);
  f.handoff.observe({ kind: "terminal", scope }); assert.equal(f.handoff.view(scope).stopping, true);
  f.resolve(); await pending; assert.equal(f.handoff.view(scope).stopping, false); assert.deepEqual(f.released, []); f.dispose();
});

 test("a queued input attached after terminal still waits for the original stop RPC", async () => {
  const f = fixture(), stopping = f.handoff.requestStop(scope); f.idle(); f.handoff.observe({ kind: "terminal", scope });
  const replacement = f.handoff.replaceWithQueued(scope, "one");
  assert.deepEqual(f.released, []); assert.equal(f.stops.length, 1); assert.equal(f.handoff.blocked(scope), true);
  f.resolve(); await Promise.all([stopping, replacement]); assert.deepEqual(f.released, ["one"]); f.dispose();
});
 test("changing the replacement after terminal preserves the same pending cancellation barrier", async () => {
  const f = fixture(), first = f.handoff.replaceWithQueued(scope, "one"); f.idle(); f.handoff.observe({ kind: "terminal", scope });
  const second = f.handoff.replaceWithQueued(scope, "two");
  assert.deepEqual(f.released, []); assert.equal(f.stops.length, 1);
  f.resolve(); await Promise.all([first, second]); assert.deepEqual(f.released, ["two"]); f.dispose();
});
for (const order of ["terminal-first", "ack-first"] as const) test(`stopping a submitted successor creates its own cancellation: ${order}`, async () => {
  const f = fixture(); f.idle(); await f.handoff.replaceWithQueued(scope, "one");
  f.handoff.observe({ kind: "dispatching", scope, itemIds: ["one"] }); f.handoff.observe({ kind: "accepted", scope }); f.activate();
  const stopping = f.handoff.requestStop(scope);
  f.handoff.observe({ kind: "started", scope });
  assert.equal(f.handoff.blocked(scope), true); assert.equal(f.handoff.view(scope).pending, null);
  if (order === "terminal-first") { f.idle(); f.handoff.observe({ kind: "terminal", scope }); assert.equal(f.handoff.blocked(scope), true); f.resolve(); await stopping; }
  else { f.resolve(); await stopping; assert.equal(f.handoff.blocked(scope), true); f.idle(); f.handoff.observe({ kind: "terminal", scope }); }
  assert.equal(f.handoff.blocked(scope), false); assert.equal(f.handoff.view(scope).stopping, false);
  assert.deepEqual(f.released, ["one"]); f.dispose();
});

test("stop then a newly typed queued input shares the original RPC barrier in the real dispatcher", async () => {
  const f = integrated(); await f.queue.openSession("s", "p");
  const stopping = f.handoff.requestStop(scope); f.terminal();
  const original = { id: "typed-after-stop", text: "new user intent", provider: "codex", model: null, effort: null, permission_mode: null, attachments: [] };
  f.queue.enqueue(original); const replacement = f.handoff.replaceWithQueued(scope, original.id);
  assert.equal(f.queue.items()[0], original); assert.equal(f.sends(), 0);
  assert.equal((f.handoff.presentation(scope) as { pendingMessage: unknown }).pendingMessage, original);
  f.stopAck(); await Promise.all([stopping, replacement]); assert.equal(f.sends(), 1); f.dispose();
});

for (const phase of ["submitting", "awaiting-start"] as const) test(`an authoritative terminal before started retires ${phase} without resending the consumed queue item`, async () => {
  const f = fixture(); f.idle(); await f.handoff.replaceWithQueued(scope, "one");
  f.handoff.observe({ kind: "dispatching", scope, itemIds: ["one"] });
  if (phase === "awaiting-start") f.handoff.observe({ kind: "accepted", scope });
  f.handoff.observe({ kind: "terminal", scope });
  assert.equal(f.handoff.view(scope).pending, null); assert.equal(f.handoff.blocked(scope), false);
  assert.deepEqual(f.released, ["one"]); f.handoff.observe({ kind: "accepted", scope });
  assert.equal(f.handoff.presentation(scope), null); f.dispose();
});
