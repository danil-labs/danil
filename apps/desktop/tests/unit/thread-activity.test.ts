import assert from "node:assert/strict";
import test from "node:test";
import { activityElapsed, createActivityProjection } from "../../src/features/threads/index.ts";
import type { Msg } from "../../src/features/chat/index.ts";
const message = (text: string, extra: Partial<Msg> = {}): Msg => ({ role: "agent", text, ...extra });

test("explicit start anchors before first output without a native message ID", () => {
  const model = createActivityProjection(), old = message("history", { turno: "old", clave: "old:0" });
  model.begin("A", "s", 1_000);
  const empty = model.project("A", "s", [old])[0];
  assert.equal(empty.anchorIndex, 1); assert.equal(empty.anchor, null);
  const first = message("first"), tool = message("Read", { role: "system", meta: "usó" });
  model.observe("A", "s", [], [first, tool]);
  const activity = model.project("A", "s", [old, first, tool])[0];
  assert.equal(activity.key, empty.key); assert.equal(activity.anchor, first); assert.equal(activity.anchorIndex, 1);
  assert.deepEqual(activity.messages, [first, tool]);
});
test("distinct startsMessage answers with the same native ID keep their own references", () => {
  const model = createActivityProjection(); model.begin("A", "s", 1_000);
  const first = message("one", { nativeMessageId: "same" }), second = message("two", { nativeMessageId: "same" });
  model.observe("A", "s", [], [first, second]);
  assert.deepEqual(model.project("A", "s", [first, second])[0].messages, [first, second]);
});
test("question permission and an injected user never create a turn boundary", () => {
  const model = createActivityProjection(); model.begin("A", "s", 1_000);
  const first = message("first"), steer = message("continue", { role: "user", inyectado: { tras: null } });
  const question = message("", { questionRequestId: "request", preguntas: [] });
  const permission = message("decision", { role: "user" }), last = message("last");
  const rows = [first, steer, question, permission, last]; model.observe("A", "s", [], rows);
  const activities = model.project("A", "s", rows);
  assert.equal(activities.length, 1); assert.equal(activities[0].anchor, first); assert.deepEqual(activities[0].messages, rows);
});
test("done and persisted history preserve the observed activity key and answer order", () => {
  const model = createActivityProjection(); model.begin("A", "s", 1_000, []);
  const live = message("first"), last = message("last"); model.observe("A", "s", [], [live, last]);
  const key = model.project("A", "s", [live, last])[0].key;
  model.finish("A", "s");
  const saved = [message("first", { clave: "turn:0", avanceDe: "turn" }), message("last", { clave: "turn:1", turno: "turn", duration_ms: 8_000 })];
  model.reconcile("A", "s", [], saved, true);
  const completed = model.project("A", "s", saved)[0];
  assert.equal(completed.key, key); assert.equal(completed.anchor, saved[0]); assert.equal(completed.active, false);
  assert.equal(completed.durationMs, 8_000); assert.deepEqual(completed.messages, saved);
  const reread = saved.map(row => ({ ...row })); model.reconcile("A", "s", saved, reread, false);
  assert.equal(model.project("A", "s", [message("older", { clave: "older:0" }), ...reread])[0].anchorIndex, 1);
});
test("new turn and workspace changes do not reuse another activity identity", () => {
  const model = createActivityProjection(); model.begin("A", "s", 1_000);
  const first = message("first"); model.observe("A", "s", [], [first]); const key = model.project("A", "s", [first])[0].key;
  model.finish("A", "s"); model.begin("A", "s", 2_000); model.begin("B", "s", 2_000);
  assert.notEqual(model.project("A", "s", [first])[1].key, key);
  assert.equal(model.project("A", "s", [first])[0].key, key);
  assert.equal(model.project("B", "s", [first])[0].messages.length, 0);
});
test("elapsed uses the real epoch and unknown start remains unknown", () => {
  assert.equal(activityElapsed(1_000, 6_000), 5_000); assert.equal(activityElapsed(null, 6_000), null);
  assert.equal(activityElapsed(0, 6_000), null); assert.equal(activityElapsed(7_000, 6_000), 0);
  const model = createActivityProjection(); model.begin("A", "s", null);
  assert.equal(model.project("A", "s", [])[0].startedAt, null);
});
test("response text never declares completion and a remount cannot restart elapsed time", () => {
  const model = createActivityProjection(); model.begin("A", "s", 1_000);
  const row = message("Done. Everything finished."); model.observe("A", "s", [], [row]);
  model.begin("A", "s", 90_000);
  const projected = model.project("A", "s", [row])[0]; assert.equal(projected.active, true); assert.equal(projected.startedAt, 1_000);
});
test("draft adoption retains the visible anchor key when started already arrived on its session", () => {
  const model = createActivityProjection(); model.begin("A", "", 1_000);
  const prompt = message("prompt", { role: "user" }); model.observe("A", "", [], [prompt]);
  const key = model.project("A", "", [prompt])[0].key;
  model.begin("A", "s", 1_200); const answer = message("answer"); model.observe("A", "s", [], [answer]);
  model.adopt("A", "", "s"); const activities = model.project("A", "s", [prompt, answer]);
  assert.equal(activities.length, 1); assert.equal(activities[0].key, key); assert.equal(activities[0].anchor, answer);
});
test("thread owner publishes begin and finish without waiting for another message", async () => {
  const { createRoot, createEffect } = await import("solid-js");
  const { createThreadsStore } = await import("../../src/features/threads/index.ts");
  const states: boolean[] = [];
  const f = createRoot(dispose => {
    const store = createThreadsStore({ scope: { workspace: () => "A", generation: () => 1, paged: () => false },
      activeSession: () => "s", project: () => "p", invoke: async <T>() => ({ turns: [] }) as T,
      route: () => undefined, liveThreads: () => new Set() });
    createEffect(() => { const activities = store.activities("s", store.messages()); states.push(activities[0]?.active ?? false); });
    return { store, dispose: () => { store.dispose(); dispose(); } };
  });
  await Promise.resolve(); f.store.replaceHistory("s", [], true); f.store.beginActivity("s", 1_000); assert.equal(states.at(-1), true);
  f.store.appendLive("s", [message("answer")]); f.store.finishActivity("s"); assert.equal(states.at(-1), false);
  const key = f.store.activities("s", f.store.messages())[0].key;
  f.store.replaceHistory("s", [message("answer", { turno: "persisted", clave: "persisted:0", duration_ms: 10 })], true);
  const completed = f.store.activities("s", f.store.messages())[0]; assert.equal(completed.key, key); assert.equal(completed.active, false);
  f.dispose();
});
test("closed run does not adopt unknown older history prepended before its saved frontier", () => {
  const model = createActivityProjection(); const history = message("known history", { turno: "known", clave: "known:0" });
  model.begin("A", "s", 1_000, [history]); const live = message("current"); model.observe("A", "s", [], [live]); model.finish("A", "s");
  const older = message("older", { turno: "older", clave: "older:0" }); model.reconcile("A", "s", [history], [older, history], true);
  assert.deepEqual(model.project("A", "s", [older, history, live])[0].messages, [live]);
  const unknown = createActivityProjection(); unknown.begin("A", "s", null); unknown.finish("A", "s");
  unknown.reconcile("A", "s", [], [older], true); assert.deepEqual(unknown.project("A", "s", [older]), []);
});
test("a done from workspace A closes A while B stays active and A remains closed on return", async () => {
  const { createRoot, createSignal } = await import("solid-js");
  const { createThreadsStore } = await import("../../src/features/threads/index.ts");
  const f = createRoot(dispose => {
    const [workspace, setWorkspace] = createSignal<string | null>("A");
    const store = createThreadsStore({ scope: { workspace, generation: () => 1, paged: () => false }, activeSession: () => "s", project: () => "p",
      invoke: async <T>() => ({ turns: [] }) as T, route: () => undefined, liveThreads: () => new Set(["A/s", "B/s"]) });
    const move = (next: string) => { store.saveWorkspace(workspace()); setWorkspace(next); store.activateWorkspace(next); };
    return { store, move, dispose: () => { store.dispose(); dispose(); } };
  });
  try {
    f.store.beginActivity("s", 1_000); f.store.appendLive("s", [message("A answer")]); f.move("B");
    f.store.beginActivity("s", 2_000); f.store.appendLive("s", [message("B answer")]);
    f.store.finishActivity("s", "A");
    assert.equal(f.store.activities("s", f.store.messages())[0].active, true);
    f.move("A"); assert.equal(f.store.activities("s", f.store.messages())[0].active, false);
  } finally { f.dispose(); }
});
test("dropping a thread and resetting service remove its presentation activity", async () => {
  const { createRoot } = await import("solid-js");
  const { createThreadsStore } = await import("../../src/features/threads/index.ts");
  const f = createRoot(dispose => {
    const store = createThreadsStore({ scope: { workspace: () => "A", generation: () => 1, paged: () => false }, activeSession: () => "s", project: () => "p",
      invoke: async <T>() => ({ turns: [] }) as T, route: () => undefined, liveThreads: () => new Set() });
    return { store, dispose: () => { store.dispose(); dispose(); } };
  });
  try {
    f.store.beginActivity("s", 1_000); f.store.appendLive("s", [message("first")]); f.store.drop("s");
    assert.deepEqual(f.store.activities("s", f.store.messages()), []);
    f.store.beginActivity("s", 2_000); f.store.appendLive("s", [message("second")]); f.store.resetService();
    assert.deepEqual(f.store.activities("s", f.store.messages()), []);
  } finally { f.dispose(); }
});
