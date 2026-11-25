import assert from "node:assert/strict";
import test from "node:test";
import { coalesceLiveActivity, consolidateTurnActivities, visibleActivityMessages, placeActivities, isActivityOnlyMessage, type ActivityBlock, type PresentedActivityBlock } from "../../../../packages/features/chat/src/model/activityBlocks.ts";
import { pasoDe } from "../../../../packages/ui/src/lib/steps.ts";
type Message = { nativeMessageId?: string; turno?: string; duration_ms?: number; text: string; preguntas?: unknown[] };
const work = (i: number, msg: Message): ActivityBlock<Message> => ({ tipo: "trabajo", i, msg, pasos: [] });

test("live progress shares one activity without copying its messages or losing the first row key", () => {
  const first = { nativeMessageId: "stream-1", text: "Checking" }, last = { nativeMessageId: "stream-2", text: "Answer" };
  const input = [work(0, first), work(2, last)]; const output = coalesceLiveActivity(input, true);
  assert.equal(output.length, 1); const grouped = output[0]; assert.equal(grouped.i, 0);
  assert.ok(grouped.tipo === "trabajo"); assert.equal(grouped.msg, last); assert.equal(grouped.avance?.[0].msg, first);
  assert.equal(input.length, 2); assert.equal(input[0].tipo, "trabajo");
});
test("a live tool tail carries the same progress into its eventual answer without duplicate chunks", () => {
  const first = { nativeMessageId: "stream-1", text: "Checking" };
  const tail = coalesceLiveActivity([work(0, first), { tipo: "pasos", i: 1, pasos: [] }], true)[0];
  assert.ok(tail.tipo === "pasos"); assert.equal(tail.avance?.length, 1);
  const answer = coalesceLiveActivity([work(0, first), work(2, { nativeMessageId: "stream-2", text: "Done" })], true)[0];
  assert.ok(answer.tipo === "trabajo"); assert.equal(answer.avance?.length, 1);
});
test("completed and unknown messages do not get reclassified as live progress", () => {
  for (const previous of [{ turno: "saved", text: "old" }, { duration_ms: 12, text: "old", nativeMessageId: "1" }, { text: "unknown" }]) {
    const input = [work(0, previous), work(2, { nativeMessageId: "2", text: "new" })];
    assert.equal(coalesceLiveActivity(input, true), input);
  }
});
test("finished history and intervening user or failure rows preserve their boundaries", () => {
  const first = work(0, { nativeMessageId: "1", text: "one" }), last = work(2, { nativeMessageId: "2", text: "two" });
  const input: ActivityBlock<Message>[] = [first, { tipo: "msg", i: 1, msg: { text: "user or error" } }, last];
  assert.equal(coalesceLiveActivity(input, true), input); assert.equal(coalesceLiveActivity([first, last], false).length, 2);
});

test("stream questions retain their identity alongside one activity when later output arrives", () => {
  const question = { nativeMessageId: "stream-1", turno: "question-id", text: "", preguntas: [{}] };
  const output = coalesceLiveActivity([work(0, question), work(2, { nativeMessageId: "stream-2", text: "answer" })], true);
  assert.equal(output.length, 1); assert.ok(output[0].tipo === "trabajo"); assert.equal(output[0].avance?.[0].msg, question);
});

test("startsMessage pieces with the same native ID remain outside the activity fold", () => {
  const first = { nativeMessageId: "one-stream", text: "Primera respuesta" };
  const last = { nativeMessageId: "one-stream", text: "Segunda respuesta" };
  const grouped = coalesceLiveActivity([work(0, first), work(2, last)], true)[0];
  assert.ok(grouped.tipo === "trabajo");
  assert.equal(grouped.avance?.[0].outside, true);
  assert.equal(grouped.avance?.[0].msg, first);
  assert.equal(grouped.msg, last);
  const tail = coalesceLiveActivity([work(0, first), { tipo: "pasos", pasos: [], i: 1 }], true)[0];
  assert.ok(tail.tipo === "pasos");
  assert.equal(tail.avance?.[0].outside, true);
});

test("search keeps both same-ID answers and answers before a tool tail, excluding explicit hidden progress", () => {
  const first = { nativeMessageId: "same", text: "Primera respuesta única" }, last = { nativeMessageId: "same", text: "Segunda respuesta distinta" };
  const grouped = coalesceLiveActivity([work(0, first), work(2, last)], true)[0];
  assert.deepEqual(visibleActivityMessages(grouped), [first, last]);
  const tail = coalesceLiveActivity([work(0, first), { tipo: "pasos", pasos: [], i: 1 }], true)[0];
  assert.deepEqual(visibleActivityMessages(tail), [first]);
  assert.deepEqual(visibleActivityMessages({ tipo: "trabajo", pasos: [], msg: last, i: 0, avance: [{ pasos: [], msg: first }] }), [last]);
});

test("a semantic activity anchor precedes every response without merging injected inputs or no-ID messages", () => {
  const first = { text: "First answer without provider ID" }, second = { text: "Second answer" }, injected = { text: "Injected user input" };
  const activity = { key: "scope:turn:1", anchor: first, anchorIndex: 1, active: true, startedAt: 100, durationMs: null, messages: [first, injected, second] };
  const rows = [work(2, first), { tipo: "msg", i: 3, msg: injected } as ActivityBlock<Message>, work(5, second)];
  const projected = placeActivities(rows, [activity]);
  assert.equal(projected[0].activity, activity);
  assert.equal(projected[1], rows[0]); assert.equal(projected[2], rows[1]); assert.equal(projected[3], rows[2]);
  assert.equal(projected[1].tipo === "trabajo" && projected[1].msg, first);
  assert.equal(projected[3].tipo === "trabajo" && projected[3].msg, second);
});

test("empty active turns and settled rows keep the supplied activity identity without guessing from prose", () => {
  const active = { key: "stable", anchor: null, anchorIndex: 0, active: true, startedAt: null, durationMs: null, messages: [] as Message[] };
  const empty = placeActivities<Message>([], [active]);
  assert.equal(empty[0].activity?.key, "stable");
  const answer = { text: "Final response" };
  const settled = { ...active, active: false, anchor: answer, messages: [answer], durationMs: 12 };
  const rows = placeActivities([work(0, answer)], [settled]);
  assert.equal(rows[0].activity?.key, empty[0].activity?.key);
  assert.equal(rows[1].tipo === "trabajo" && rows[1].msg, answer);
});

test("manual shell output remains a separate card even when it carries a tool step", () => {
  assert.equal(isActivityOnlyMessage({ role: "system", meta: "usó", paso: {}, shell: { output: "manual command result" } }), false);
  assert.equal(isActivityOnlyMessage({ role: "system", meta: "usó", paso: {} }), true);
});

test("consolidateTurnActivities absorbs unowned mid-turn steps and thinking segments into the single active TurnActivity", () => {
  const step1 = pasoDe("read_file", "a.ts", { id: "t1", ok: true });
  const step2 = pasoDe("edit_file", "b.ts", { id: "t2", ok: true });
  const step3 = pasoDe("run_command", "pnpm test", { id: "t3", corriendo: true });
  const liveActivity = {
    key: "ws:s:activity:1",
    anchor: null,
    anchorIndex: 1,
    active: true,
    startedAt: 1_000,
    durationMs: null,
    messages: [
      { role: "agent", text: "", razonamiento: [{ text: "Target elements render identical child content" }] },
      { role: "system", text: "a.ts", meta: "usó", paso: step1 },
    ],
  };
  const blocks: PresentedActivityBlock<Record<string, unknown>>[] = [
    { tipo: "msg", i: 0, msg: { role: "user", text: "revisa" } },
    { tipo: "pasos", i: 1, pasos: [], activity: liveActivity },
    // Unowned reloaded segments that previously rendered duplicate "Trabajo >", "Trabajo >", and "Preparando… >"
    { tipo: "trabajo", i: 2, pasos: [step1, step2], msg: { role: "agent", text: "", razonamiento: [{ text: "Checking second segment" }] } },
    { tipo: "pasos", i: 3, pasos: [step3] },
  ];
  const consolidated = consolidateTurnActivities(blocks);
  assert.equal(consolidated.length, 2, "only user message + one single active TurnActivity remain");
  assert.equal(consolidated[0].tipo, "msg");
  assert.equal(consolidated[1].activity?.key, "ws:s:activity:1");
  // step1 was already in liveActivity so it must not be duplicated; step2 and step3 are merged cleanly
  const mergedSteps = consolidated[1].activity!.messages.filter((m) => Boolean(m.paso));
  assert.equal(mergedSteps.length, 3, "deduplicates overlapping step1 and keeps step2 + step3");
});

test("consolidateTurnActivities merges settled TurnActivity with unowned final duration_ms answer into one header", () => {
  const step1 = pasoDe("read_file", "deploy.ts", { ok: true });
  const settledActivity = {
    key: "ws:s:activity:2",
    anchor: null,
    anchorIndex: 1,
    active: false,
    startedAt: 1_000,
    durationMs: null,
    messages: [{ role: "system", text: "deploy.ts", meta: "usó", paso: step1 }],
  };
  const blocks: PresentedActivityBlock<Record<string, unknown>>[] = [
    { tipo: "msg", i: 0, msg: { role: "user", text: "ya se ve?" } },
    { tipo: "pasos", i: 1, pasos: [], activity: settledActivity },
    {
      tipo: "trabajo",
      i: 2,
      pasos: [step1],
      msg: { role: "agent", text: "Todavía no se ve porque el build sigue en curso", duration_ms: 43_000 },
    },
  ];
  const consolidated = consolidateTurnActivities(blocks);
  assert.equal(consolidated.length, 3, "user + one activity header + responseOnly answer");
  assert.equal(consolidated[1].activity?.durationMs, 43_000, "lifts 43s duration into the single activity header");
  assert.equal(consolidated[2].tipo, "trabajo");
  assert.equal(consolidated[2].responseOnly, true, "suppresses duplicate Trabajó durante 43s header on the answer block");
  assert.equal(consolidated[2].tipo === "trabajo" && consolidated[2].pasos.length, 0);
});

test("consolidateTurnActivities collapses consecutive historical work-only segments into the following answer", () => {
  const s1 = pasoDe("read_file", "1.ts", { ok: true });
  const s2 = pasoDe("read_file", "2.ts", { ok: true });
  const blocks: PresentedActivityBlock<Record<string, unknown>>[] = [
    { tipo: "msg", i: 0, msg: { role: "user", text: "hola" } },
    { tipo: "trabajo", i: 1, pasos: [s1], msg: { role: "agent", text: "", razonamiento: [{ text: "p1" }] } },
    { tipo: "pasos", i: 2, pasos: [s2] },
    { tipo: "trabajo", i: 3, pasos: [], msg: { role: "agent", text: "Listo", duration_ms: 12_000 } },
  ];
  const consolidated = consolidateTurnActivities(blocks);
  assert.equal(consolidated.length, 2, "collapses all consecutive work-only segments into the final answer block");
  assert.equal(consolidated[1].tipo, "trabajo");
  if (consolidated[1].tipo === "trabajo") {
    assert.equal(consolidated[1].pasos.length, 2);
    assert.equal(consolidated[1].msg.text, "Listo");
    assert.equal(consolidated[1].msg.duration_ms, 12_000);
  }
});

test("consolidateTurnActivities never crosses a new user message boundary", () => {
  const step = pasoDe("read_file", "a.ts", { ok: true });
  const activity = {
    key: "ws:s:activity:1",
    anchor: null,
    anchorIndex: 1,
    active: false,
    startedAt: 1_000,
    durationMs: 5_000,
    messages: [{ role: "system", text: "a.ts", meta: "usó", paso: step }],
  };
  const blocks: PresentedActivityBlock<Record<string, unknown>>[] = [
    { tipo: "msg", i: 0, msg: { role: "user", text: "turno 1" } },
    { tipo: "pasos", i: 1, pasos: [], activity },
    { tipo: "trabajo", i: 2, pasos: [], msg: { role: "agent", text: "resp 1" }, responseOnly: true },
    { tipo: "msg", i: 3, msg: { role: "user", text: "turno 2" } },
    { tipo: "trabajo", i: 4, pasos: [step], msg: { role: "agent", text: "resp 2", duration_ms: 9_000 } },
  ];
  const consolidated = consolidateTurnActivities(blocks);
  assert.equal(consolidated.length, 5);
  assert.equal(consolidated[4].responseOnly, undefined, "turn 2 keeps its own work header");
});
