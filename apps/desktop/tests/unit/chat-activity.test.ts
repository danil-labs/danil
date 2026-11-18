import assert from "node:assert/strict";
import test from "node:test";
import { coalesceLiveActivity, visibleActivityMessages, placeActivities, isActivityOnlyMessage, type ActivityBlock } from "../../src/features/chat/activityBlocks.ts";
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
