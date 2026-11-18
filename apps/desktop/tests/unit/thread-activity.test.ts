import assert from "node:assert/strict";
import test from "node:test";
import { activityElapsed, createActivityProjection } from "../../src/features/threads/index.ts";
import type { Msg } from "../../src/features/chat/index.ts";
const message = (text: string, extra: Partial<Msg> = {}): Msg => ({ role: "agent", text, ...extra });

test("last observed action follows updates to an earlier native message, not array position", () => {
  const model = createActivityProjection(); model.begin("A", "s", 1_000);
  const reasoning = message("already answered", { nativeMessageId: "native", razonamiento: [{ text: "first" }] });
  const tool = message("Read", { role: "system", meta: "usó" });
  model.observe("A", "s", [], [reasoning]); model.observe("A", "s", [reasoning], [reasoning, tool]);
  assert.equal(model.project("A", "s", [reasoning, tool])[0].observation?.message, tool);
  const updated = { ...reasoning, razonamiento: [{ text: "first continued" }] };
  model.observe("A", "s", [reasoning, tool], [updated, tool]);
  assert.equal(model.project("A", "s", [updated, tool])[0].observation?.message, updated);
  assert.equal(model.project("A", "s", [updated, tool])[0].observation?.kind, "thinking");
  const savedTool = { ...tool, tramo: "saved" };
  model.observe("A", "s", [updated, tool], [updated, savedTool]);
  assert.equal(model.project("A", "s", [updated, savedTool])[0].observation?.message, updated);
});

test("draft adoption keeps the newest observation and follows later edits through its alias", () => {
  const model = createActivityProjection(); model.begin("A", "", 1_000); model.begin("A", "s", 1_100);
  const first = message("first"); model.observe("A", "s", [], [first]);
  model.adopt("A", "", "s");
  assert.equal(model.project("A", "s", [first])[0].observation?.message, first);
  const updated = { ...first, text: "first continued" }; model.observe("A", "s", [first], [updated]);
  assert.equal(model.project("A", "s", [updated])[0].observation?.message, updated);
});

test("recovered history and injected user inputs never invent the latest model action", () => {
  const model = createActivityProjection(); model.begin("A", "s", null);
  const history = message("saved", { turno: "old", clave: "old:0" });
  model.reconcile("A", "s", [], [history], false);
  assert.equal(model.project("A", "s", [history])[0].observation, null);
  const steer = message("continue", { role: "user", inyectado: { tras: "old" } });
  model.observe("A", "s", [history], [history, steer]);
  assert.equal(model.project("A", "s", [history, steer])[0].observation, null);
});

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

for (const startedOnSession of [false, true]) test(`adoption keeps the active draft after older closed session history (${startedOnSession ? "started" : "not started"})`, () => {
  const model = createActivityProjection(), old = message("previous", { turno: "old", clave: "old:0" });
  model.begin("A", "s", 1_000, []); model.observe("A", "s", [], [old]); model.finish("A", "s");
  const oldKey = model.project("A", "s", [old])[0].key;
  model.begin("A", "", 2_000, []);
  const draft = message("draft output"); model.observe("A", "", [], [draft]);
  const draftKey = model.project("A", "", [draft])[0].key;
  const answer = message("session output");
  if (startedOnSession) { model.begin("A", "s", 2_100, [old]); model.observe("A", "s", [], [answer]); }
  model.adopt("A", "", "s");
  const visible = [old, draft, ...(startedOnSession ? [answer] : [])];
  const adopted = model.project("A", "s", visible);
  assert.equal(adopted.find(activity => activity.key === oldKey)?.active, false);
  assert.deepEqual(adopted.filter(activity => activity.active).map(activity => activity.key), [draftKey]);
  assert.equal(model.finish("A", "s"), true);
  assert.equal(model.project("A", "s", visible).some(activity => activity.active), false);
  model.begin("A", "s", 3_000, visible);
  const next = message("next output"); model.observe("A", "s", [], [next]); model.finish("A", "s");
  assert.equal(model.project("A", "s", [...visible, next]).some(activity => activity.active), false);
});

for (const deferred of [false, true]) test(`recovered active activity stays between accepted input and saved response (${deferred ? "deferred history" : "snapshot"})`, () => {
  const model = createActivityProjection();
  const user = message("hola", { role: "user", turno: "u", clave: "u:0" });
  const answer = message("saved response", { turno: "a", clave: "a:0" });
  model.begin("A", "s", null, deferred ? null : [user, answer]);
  if (deferred) model.reconcile("A", "s", [], [user, answer], false);
  const activity = model.project("A", "s", [user, answer])[0];
  assert.equal(activity.anchor, answer); assert.equal(activity.anchorIndex, 1);
  assert.deepEqual(activity.messages, [], "placement does not invent history ownership");
  assert.equal(activity.active, true);
});

test("accepted new input replaces the historical input boundary before its output arrives", () => {
  const model = createActivityProjection();
  const oldUser = message("old input", { role: "user", turno: "old-user", clave: "old-user:0" });
  const oldAnswer = message("old response", { turno: "old-answer", clave: "old-answer:0" });
  model.begin("A", "s", 1_000, [oldUser, oldAnswer]);
  const user = message("new input", { role: "user" });
  model.observe("A", "s", [oldUser, oldAnswer], [oldUser, oldAnswer, user]);
  assert.equal(model.project("A", "s", [oldUser, oldAnswer, user])[0].anchorIndex, 3);
  const savedAnswer = message("saved before live output", { turno: "answer", clave: "answer:0" });
  model.reconcile("A", "s", [], [oldUser, oldAnswer, user, savedAnswer], false);
  const output = message("late live output");
  model.observe("A", "s", [], [output]);
  const activity = model.project("A", "s", [oldUser, oldAnswer, user, savedAnswer, output])[0];
  assert.equal(activity.anchor, savedAnswer); assert.equal(activity.anchorIndex, 3);
  assert.deepEqual(activity.messages, [user, output]);
});

test("prepending history and replacing user objects preserve the captured boundary identity", () => {
  const model = createActivityProjection();
  const user = message("hola", { role: "user", turno: "u", clave: "u:0" });
  const answer = message("saved response", { turno: "a", clave: "a:0" });
  model.begin("A", "s", null, [user, answer]);
  const older = message("older input", { role: "user", turno: "older", clave: "older:0" });
  const restoredUser = { ...user }, restoredAnswer = { ...answer };
  model.reconcile("A", "s", [user, answer], [older, restoredUser, restoredAnswer], false);
  const activity = model.project("A", "s", [older, restoredUser, restoredAnswer])[0];
  assert.equal(activity.anchor, restoredAnswer); assert.equal(activity.anchorIndex, 2);
  assert.deepEqual(activity.messages, []);
  model.finish("A", "s");
  assert.deepEqual(model.project("A", "s", [older, restoredUser, restoredAnswer]), []);
});

test("adoption preserves the accepted draft input anchor ahead of recovered response", () => {
  const model = createActivityProjection();
  const older = message("older", { turno: "older", clave: "older:0" });
  model.begin("A", "s", 1_000, []); model.observe("A", "s", [], [older]); model.finish("A", "s");
  model.begin("A", "", 2_000, []);
  const user = message("accepted", { role: "user" }); model.observe("A", "", [], [user]);
  model.adopt("A", "", "s");
  const answer = message("recovered answer", { turno: "answer", clave: "answer:0" });
  model.reconcile("A", "s", [], [older, user, answer], false);
  const active = model.project("A", "s", [older, user, answer]).find(activity => activity.active)!;
  assert.equal(active.anchor, answer); assert.equal(active.anchorIndex, 2);
  assert.deepEqual(active.messages, [user]);
});

test("external start refreshes its cached input boundary from recent history but never an older page", () => {
  const model = createActivityProjection();
  const oldUser = message("old input", { role: "user", turno: "old-u", clave: "old-u:0" });
  const oldAnswer = message("old answer", { turno: "old-a", clave: "old-a:0" });
  const user = message("external input", { role: "user", turno: "new-u", clave: "new-u:0" });
  const answer = message("external answer", { turno: "new-a", clave: "new-a:0" });
  model.begin("A", "s", 1_000, [oldUser, oldAnswer]);
  model.reconcile("A", "s", [oldUser, oldAnswer], [oldUser, oldAnswer, user, answer], false);
  assert.equal(model.project("A", "s", [oldUser, oldAnswer, user, answer])[0].anchorIndex, 3);
  model.reconcile("A", "s", [user, answer], [oldUser, oldAnswer], false, true);
  const activity = model.project("A", "s", [oldUser, oldAnswer, user, answer])[0];
  assert.equal(activity.anchor, answer); assert.equal(activity.anchorIndex, 3);
  assert.deepEqual(activity.messages, []);
});

test("permission and question answers are not accepted input anchors", () => {
  const model = createActivityProjection();
  const user = message("accepted input", { role: "user", turno: "user", clave: "user:0" });
  const answer = message("answer", { turno: "answer", clave: "answer:0" });
  const permission = message("allow", { role: "user", permission: {} as NonNullable<Msg["permission"]> });
  const decision = message("decision", { role: "user", respuestas: [{} as NonNullable<Msg["respuestas"]>[number]] });
  const unanswered = message("", { role: "user", respuestas: [] });
  model.begin("A", "s", null, [user, answer, permission, decision, unanswered]);
  const activity = model.project("A", "s", [user, answer, permission, decision, unanswered])[0];
  assert.equal(activity.anchor, answer); assert.equal(activity.anchorIndex, 1);
});

test("live output before recent history does not confirm a cached historical input", () => {
  const model = createActivityProjection();
  const oldUser = message("old input", { role: "user", turno: "old-u", clave: "old-u:0" });
  const oldAnswer = message("old answer", { turno: "old-a", clave: "old-a:0" });
  const user = message("external input", { role: "user", turno: "new-u", clave: "new-u:0" });
  const answer = message("external answer", { turno: "new-a", clave: "new-a:0" });
  const live = message("output arriving before history");
  model.begin("A", "s", 1_000, [oldUser, oldAnswer]);
  model.observe("A", "s", [], [live]);
  model.reconcile("A", "s", [oldUser, oldAnswer], [oldUser, oldAnswer, user, answer], false);
  const activity = model.project("A", "s", [oldUser, oldAnswer, user, answer, live])[0];
  assert.equal(activity.anchor, answer); assert.equal(activity.anchorIndex, 3);
  assert.deepEqual(activity.messages, [live]);
  model.reconcile("A", "s", [user, answer], [oldUser, oldAnswer], false, true);
  assert.equal(model.project("A", "s", [oldUser, oldAnswer, user, answer, live])[0].anchor, answer);
});

test("revalidating cached history moves a recovered activity to its current input only while active", () => {
  const model = createActivityProjection();
  const cached = [message("old input", { role: "user" }), message("old answer")];
  const user = message("current input", { role: "user" });
  const answer = message("current answer");
  const refreshed = [...cached, user, answer];
  model.begin("A", "s", 1_000, cached);
  model.reconcile("A", "s", cached, cached, false);
  model.reconcile("A", "s", cached, refreshed, false);
  const active = model.project("A", "s", refreshed)[0];
  assert.equal(active.anchorIndex, 3);
  assert.deepEqual(active.messages, []);
  const live = message("live continuation");
  model.observe("A", "s", [], [live]);
  model.finish("A", "s");
  const later = [...refreshed, live, message("next input", { role: "user" })];
  model.reconcile("A", "s", refreshed, later, false);
  assert.equal(model.project("A", "s", later)[0].anchor, answer);
});


test("execution confirmation upgrades a pending activity without inventing a timestamp or output", () => {
  const model = createActivityProjection();
  model.begin("A", "s", null);
  const pending = model.project("A", "s", [])[0];
  assert.equal(pending.startConfirmed, false);
  assert.equal(model.begin("A", "s", null, null, true), true);
  const confirmed = model.project("A", "s", [])[0];
  assert.equal(confirmed.key, pending.key);
  assert.equal(confirmed.startConfirmed, true);
  assert.equal(confirmed.startedAt, null);
  assert.equal(confirmed.observation, null);
  assert.deepEqual(confirmed.messages, []);
  assert.equal(model.begin("A", "s", null, null, true), false);
  model.begin("A", "s", null);
  assert.equal(model.project("A", "s", [])[0].startConfirmed, true);
});

for (const confirmedDraft of [false, true]) test(`adoption preserves execution confirmation from ${confirmedDraft ? "draft" : "runtime"}`, () => {
  const model = createActivityProjection();
  model.begin("A", "", null, [], confirmedDraft);
  model.begin("A", "s", null, [], !confirmedDraft);
  model.adopt("A", "", "s");
  const activities = model.project("A", "s", []);
  assert.equal(activities.length, 1);
  assert.equal(activities[0].startConfirmed, true);
  assert.equal(activities[0].startedAt, null);
});

test("content and history do not replace explicit runtime start confirmation", () => {
  const model = createActivityProjection();
  model.begin("A", "s", null);
  const user = message("hello", { role: "user" });
  model.observe("A", "s", [], [user]);
  assert.equal(model.project("A", "s", [user])[0].startConfirmed, false);
  const history = message("older output", { turno: "old" });
  model.reconcile("A", "s", [], [history, user], false);
  assert.equal(model.project("A", "s", [history, user])[0].startConfirmed, false);
  const thinking = message("", { razonamiento: [{ text: "working" }] });
  model.observe("A", "s", [user], [user, thinking]);
  assert.equal(model.project("A", "s", [user, thinking])[0].startConfirmed, false);
  assert.equal(model.project("A", "s", [user, thinking])[0].startedAt, null);
});


test("a late update owned by a closed activity does not confirm its successor", () => {
  const model = createActivityProjection();
  const old = message("old answer");
  model.begin("A", "s", 1_000);
  model.observe("A", "s", [], [old]);
  model.finish("A", "s");
  model.begin("A", "s", null, [old]);
  const updated = { ...old, text: "late old answer" };
  model.observe("A", "s", [old], [updated]);
  assert.equal(model.project("A", "s", [updated]).at(-1)?.startConfirmed, false);
});


test("replayed content from a closed segment is not a runtime start confirmation", () => {
  const model = createActivityProjection();
  const old = message("old answer", { tramo: "segment-A" });
  model.begin("A", "s", 1_000, [], true);
  model.observe("A", "s", [], [old]);
  model.finish("A", "s");
  model.begin("A", "s", null, [old]);
  const replay = { ...old };
  model.observe("A", "s", [], [replay]);
  assert.equal(model.project("A", "s", [replay]).at(-1)?.startConfirmed, false);
});


for (const field of ["turno", "tramo"] as const) test(`replayed output with a known ${field} keeps its closed owner`, () => {
  const model = createActivityProjection();
  const old = message("old output", { [field]: "old-segment" });
  model.begin("A", "s", 1_000);
  model.observe("A", "s", [], [old]);
  const oldKey = model.project("A", "s", [old])[0].key;
  model.finish("A", "s");
  model.begin("A", "s", null, [], true);
  const replay = { ...old };
  const current = message("new output");
  model.observe("A", "s", [], [replay, current]);
  const activities = model.project("A", "s", [replay, current]);
  assert.deepEqual(activities.find(activity => activity.key === oldKey)?.messages, [replay]);
  assert.deepEqual(activities.find(activity => activity.active)?.messages, [current]);
});
