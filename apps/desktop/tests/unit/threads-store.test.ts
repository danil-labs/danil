import assert from "node:assert/strict";
import test from "node:test";
import { createRoot, createSignal } from "solid-js";
import { createThreadsStore } from "../../src/features/threads/index.ts";
import type { ChatEvent, Msg, Session } from "../../src/features/chat/index.ts";

const msg = (text: string, role: Msg["role"] = "agent"): Msg => ({ role, text });
const session = (turns: Session["turns"] = [], extra: Partial<Session> = {}): Session => ({ turns, provider: "claude", ...extra }) as Session;
import commentaryFixture from "../fixtures/assistant-durable-commentary.json" with { type: "json" };

const metadata = { author: null };
const event = (kind: ChatEvent["kind"], text: string, extra: Partial<ChatEvent> = {}): ChatEvent => ({ kind, text, session: "s", meta: null, ...extra });
function fixture(read?: Parameters<typeof createThreadsStore>[0]["invoke"]) {
  return createRoot(dispose => {
    const [workspace, setWorkspace] = createSignal<string | null>("A");
    const [activeSession, setActive] = createSignal<string | null>("s");
    let generation = 1;
    const live = new Set<string>(); const calls: unknown[] = [];
    const store = createThreadsStore({ scope: { workspace, generation: () => generation, paged: () => false }, activeSession, project: () => "p",
      invoke: async <T>(command: string, args?: Record<string, unknown>, options?: { headers?: Record<string, string> }) => { calls.push({ command, args, options }); return read ? read<T>(command, args, options) : session() as T; },
      route: () => ({ headers: { "x-terminus-machine": "m1" } }), liveThreads: () => live });
    return { store, live, calls, setActive, generation: () => generation,
      move: (id: string) => { store.saveWorkspace(workspace()); generation++; setWorkspace(id); store.activateWorkspace(id); },
      dispose: () => { store.dispose(); dispose(); } };
  });
}

test("queued deltas flush before a tool fact and unrelated thread identity survives", () => {
  const f = fixture(); f.store.appendLive("other", [msg("unchanged")]); const other = f.store.rows().other;
  f.store.event(event("delta", "hello"), metadata); f.store.event(event("tool", "Read", { id: "tool1", target: "file" }), metadata);
  const painted = f.store.rows().s.vivo;
  assert.equal(painted[0].text, "hello"); assert.equal(painted[1].paso?.corriendo, true); assert.equal(f.store.rows().other, other);
  f.store.event(event("tool_done", "Read", { id: "tool1", ok: true }), metadata);
  assert.equal(f.store.rows().s.vivo[1].paso?.corriendo, false); f.dispose();
});

test("persisted history keeps question reply routing and removes the duplicate live turn", () => {
  const f = fixture(); f.store.appendLive("s", [msg("answer")]);
  f.store.question("s", { turno: "turn1", questionRequestId: "request1" });
  f.store.replaceHistory("s", [{ ...msg("persisted"), turno: "turn1" }], false);
  assert.equal(f.store.rows().s.base[0].questionRequestId, "request1"); assert.deepEqual(f.store.rows().s.vivo, []);
  const base = f.store.rows().s.base; f.store.replaceHistory("s", [{ ...msg("persisted"), turno: "turn1" }], false);
  assert.equal(f.store.rows().s.base, base); f.dispose();
});

test("replay keeps human messages and optimistic adoption retains events already received", () => {
  const f = fixture(); const human = msg("pending", "user");
  f.store.appendPersisted("", [human]); f.store.appendLive("s", [msg("stream")]); f.store.adoptDraft("s");
  assert.equal(f.store.rows().s.base[0], human); assert.equal(f.store.rows().s.vivo[0].text, "stream");
  f.store.appendLive("s", [msg("steer", "user")]); f.store.replay("s");
  assert.equal(f.store.rows().s.vivo.length, 1); assert.equal(f.store.rows().s.vivo[0].text, "steer"); f.dispose();
});

test("workspace switches retain only live threads, including their background updates", () => {
  const f = fixture(); f.store.appendLive("s", [msg("A")]); f.store.appendLive("closed", [msg("discard")]); f.live.add("A/s");
  f.move("B"); f.store.appendLive("s", [msg("B")]); f.store.appendLive("s", [msg("A background")], "A"); f.move("A");
  assert.deepEqual(f.store.rows().s.vivo.map(row => row.text), ["A", "A background"]); assert.equal(f.store.rows().closed, undefined); f.dispose();
});

test("optimistic updates and rejection affect only their own message references", () => {
  const f = fixture(); const optimistic = msg("own", "user"), other = msg("other", "user"); f.store.appendPersisted("s", [optimistic, other]);
  f.store.reviseOptimistic("s", optimistic, { author: null }); assert.notEqual(f.store.rows().s.base[0], optimistic); assert.equal(f.store.rows().s.base[1], other);
  f.store.rejectOptimistic("s", [other]); assert.equal(f.store.rows().s.base.length, 1); f.dispose();
});

test("a read pins its machine/workspace and old generations cannot accept it", async () => {
  let resolve!: (value: Session) => void; const f = fixture(async <T>() => new Promise<Session>(yes => { resolve = yes; }) as Promise<T>);
  const generation = f.generation(), pending = f.store.read("p", "s"); f.move("B"); resolve(session()); const result = await pending;
  assert.deepEqual((f.calls[0] as { options: unknown }).options, { headers: { "x-terminus-machine": "m1", "x-terminus-workspace": "A" } });
  assert.equal(f.store.acceptSession("s", result, false, generation), false); assert.equal(f.store.rows().s, undefined); f.dispose();
});

test("an older page that returns after a workspace change cannot paint the new workspace", async () => {
  let resolve!: (value: Session) => void;
  const f = fixture(async <T>() => new Promise<Session>(yes => { resolve = yes; }) as Promise<T>);
  const page = { version: 1, start: 1, end: 2, total: 2, limit: 1, has_more: true };
  f.store.acceptSession("s", session([{ id: "new", role: "user", text: "new" }], { history: page }), false, f.generation());
  const pending = f.store.older("p", "s"); f.move("B");
  resolve(session([{ id: "old", role: "user", text: "old" }], { history: { ...page, start: 0, end: 1, has_more: false } }));
  assert.equal(await pending, null); assert.equal(f.store.rows().s, undefined); f.dispose();
});

test("metadata, loading and waking belong to the accepted task; finishing another load does not hide it", () => {
  const f = fixture(); f.store.startLoading("s"); f.store.startLoading("next"); f.store.finishLoading("s"); assert.equal(f.store.loading(), "next");
  assert.equal(f.store.acceptSession("s", session([], { offline: { machine: "m1" }, can_hand_over: true }), false, f.generation()), true);
  assert.equal(f.store.offline().s, "m1"); assert.equal(f.store.handovers().s.can, true);
  f.store.markMachineWait("s", { machine: "m1", phase: "waking" }); assert.deepEqual(f.store.machineWaits().s, { machine: "m1", phase: "waking" }); f.store.markAwake("s"); assert.equal(f.store.offline().s, undefined); f.dispose();
});

test("service reset clears live output and retained streams while keeping persisted messages", () => {
  const f = fixture(); const base = msg("saved"); f.store.appendPersisted("s", [base]); f.store.appendLive("s", [msg("live")]);
  f.store.resetService(); assert.equal(f.store.rows().s.base[0], base); assert.deepEqual(f.store.rows().s.vivo, []); f.dispose();
});

test("disposal rejects fresh reads and ignores a queued delta and late history", async () => {
  const f = fixture(); const generation = f.generation(); f.store.event(event("delta", "late"), metadata); f.store.dispose();
  assert.equal(f.store.acceptSession("s", session(), false, generation), false); assert.equal(f.store.rows().s, undefined);
  f.store.appendLive("s", [msg("late")]); assert.equal(f.store.rows().s, undefined);
  await assert.rejects(f.store.read("p", "s"), { name: "AbortError" }); f.dispose();
});

test("presence and empty painting facts do not create conversation rows", () => {
  const f = fixture();
  for (const kind of ["presence", "started", "task_launched", "segment_saved", "image"] as const) f.store.event(event(kind, ""), metadata);
  assert.deepEqual(f.store.rows(), {}); f.dispose();
});

test("history started before an own send cannot erase its optimistic message", async () => {
  let resolve!: (value: Session) => void;
  const f = fixture(async <T>() => new Promise<Session>(yes => { resolve = yes; }) as Promise<T>);
  const generation = f.generation(), pending = f.store.read("p", "s");
  const own = msg("already sent", "user");
  f.store.appendOptimistic("s", [own]);
  f.store.appendLive("s", [msg("live response")]);
  resolve(session([{ id: "prior", role: "user", text: "older message" }]));
  f.store.acceptSession("s", await pending, false, generation);
  assert.ok(f.store.messages().includes(own));
  assert.deepEqual(f.store.messages().map(row => row.text), ["already sent", "live response"]);
  f.dispose();
});

test("acknowledged sends survive old reads and become durable once a fresh read confirms them", async () => {
  const replies: ((value: Session) => void)[] = [];
  const f = fixture(async <T>() => new Promise<Session>(yes => replies.push(yes)) as Promise<T>);
  const own = msg("same text", "user"), generation = f.generation();
  f.store.appendOptimistic("s", [own]);
  const old = f.store.read("p", "s");
  f.store.acknowledgeOptimistic("s", [own]);
  replies[0](session()); f.store.acceptSession("s", await old, true, generation);
  assert.deepEqual(f.store.messages(), [own]);
  const fresh = f.store.read("p", "s");
  replies[1](session([{ id: "durable-1", role: "user", text: "same text" }, { id: "durable-2", role: "user", text: "same text" }]));
  f.store.acceptSession("s", await fresh, false, generation);
  assert.deepEqual(f.store.messages().map(row => row.turno), ["durable-1", "durable-2"]);
  assert.equal(f.store.messages().length, 2); f.dispose();
});

test("rejecting a revised optimistic send removes its original identity and prevents resurrection", () => {
  const f = fixture(), own = msg("rejected", "user"), context = msg("context", "system");
  f.store.appendOptimistic("s", [own, context]);
  f.store.reviseOptimistic("s", own, { author: null });
  f.store.rejectOptimistic("s", [own, context]);
  f.store.replaceHistory("s", [], false);
  assert.deepEqual(f.store.messages(), []); f.dispose();
});

test("a known durable id confirms an optimistic row without comparing message text", () => {
  const f = fixture(), own = { ...msg("original", "user"), turno: "durable" };
  f.store.appendOptimistic("s", [own]);
  f.store.replaceHistory("s", [{ ...own, text: "canonical" }], false);
  assert.deepEqual(f.store.messages().map(row => row.text), ["canonical"]); f.dispose();
});

test("a late older read cannot erase a newer confirmed snapshot", async () => {
  const replies: ((value: Session) => void)[] = [];
  const f = fixture(async <T>() => new Promise<Session>(yes => replies.push(yes)) as Promise<T>), generation = f.generation();
  const old = f.store.read("p", "s"), own = msg("sent", "user");
  f.store.appendOptimistic("s", [own]); f.store.acknowledgeOptimistic("s", [own]);
  const fresh = f.store.read("p", "s");
  replies[1](session([{ id: "durable", role: "user", text: "sent" }]));
  f.store.acceptSession("s", await fresh, false, generation);
  replies[0](session());
  assert.equal(f.store.acceptSession("s", await old, true, generation), false);
  assert.equal(f.store.messages()[0].turno, "durable"); f.dispose();
});

test("A to B to A rejects old scoped reads even when a caller supplies the current generation", async () => {
  let resolve!: (value: Session) => void;
  const f = fixture(async <T>() => new Promise<Session>(yes => { resolve = yes; }) as Promise<T>);
  const pending = f.store.read("p", "s"), own = msg("A own", "user");
  f.store.appendOptimistic("s", [own]); f.live.add("A/s");
  f.move("B"); f.store.appendOptimistic("s", [msg("B own", "user")]);
  f.move("A"); resolve(session());
  assert.equal(f.store.acceptSession("s", await pending, false, f.generation()), false);
  assert.deepEqual(f.store.messages(), [own]); f.dispose();
});

 test("started snapshot with persisted own input stays staged until a causal post-ACK read", async () => {
  const f = fixture(async <T>() => session([{ id: "durable", role: "user", text: "own" }]) as T);
  const own = msg("own", "user"); f.store.appendOptimistic("s", [own]);
  const started = await f.store.read("p", "s");
  f.store.acceptSession("s", started, false, f.generation());
  assert.deepEqual(f.store.messages(), [own]);
  f.store.acknowledgeOptimistic("s", [own]);
  assert.deepEqual(f.store.messages(), [own]);
  const fresh = await f.store.read("p", "s"); f.store.acceptSession("s", fresh, false, f.generation());
  assert.deepEqual(f.store.messages().map(row => row.turno), ["durable"]); f.dispose();
});

test("inverse ACKs defer partial snapshots and replace equal-text sends only after the last ACK", async () => {
  let answer = session();
  const f = fixture(async <T>() => structuredClone(answer) as T), generation = f.generation();
  const first = msg("same", "user"), second = msg("same", "user");
  f.store.appendOptimistic("s", [first]); f.store.appendOptimistic("s", [second]);
  f.store.acknowledgeOptimistic("s", [second]);
  answer = session([{ id: "two", role: "user", text: "same" }]);
  const partial = await f.store.read("p", "s");
  assert.equal(f.store.acceptSession("s", partial, false, generation), false);
  assert.deepEqual(f.store.messages(), [first, second]);
  f.store.acknowledgeOptimistic("s", [first]);
  assert.equal(f.store.acceptSession("s", partial, false, generation), false);
  answer = session([{ id: "one", role: "user", text: "same" }, { id: "two", role: "user", text: "same" }]);
  f.store.acceptSession("s", await f.store.read("p", "s"), false, generation);
  assert.deepEqual(f.store.messages().map(row => row.turno), ["one", "two"]); f.dispose();
});

test("a causal tail kept outside the reading window retains own sends until latest applies it", async () => {
  const page = (start: number, total: number) => ({ version: 1, start, end: start + 1, total, limit: 1, has_more: start > 0 });
  const tail = session([{ id: "durable", role: "user", text: "own" }], { history: page(20, 21) });
  const f = fixture(async <T>() => structuredClone(tail) as T), generation = f.generation();
  f.store.acceptSession("s", session([{ id: "old", role: "user", text: "older" }], { history: page(0, 10) }), false, generation);
  f.store.reading("s", true);
  const own = msg("own", "user"); f.store.appendOptimistic("s", [own]); f.store.acknowledgeOptimistic("s", [own]);
  f.store.acceptSession("s", await f.store.read("p", "s"), false, generation);
  assert.ok(f.store.messages().includes(own)); assert.equal(f.store.messages().filter(row => row.text === "own").length, 1);
  assert.equal(f.store.recentTail().s[0].turno, "durable");
  await f.store.latest("s");
  assert.deepEqual(f.store.messages().map(row => row.turno), ["durable"]);
  assert.equal(f.store.recentTail().s, undefined); f.dispose();
});

 test("an ACK arriving in B settles only its retained A send before returning to A", async () => {
  const f = fixture(async <T>() => session([{ id: "durable-A", role: "user", text: "A own" }]) as T);
  const own = msg("A own", "user"), other = msg("B own", "user");
  f.store.appendOptimistic("s", [own]); f.live.add("A/s"); f.move("B");
  f.store.appendOptimistic("s", [other]);
  f.store.acknowledgeOptimistic("s", [own]);
  assert.deepEqual(f.store.messages(), [other]);
  f.move("A");
  f.store.acceptSession("s", await f.store.read("p", "s"), false, f.generation());
  assert.deepEqual(f.store.messages().map(row => row.turno), ["durable-A"]); f.dispose();
});

 test("a rejection arriving in B removes only its retained A input", () => {
  const f = fixture(), own = msg("A own", "user"), other = msg("B own", "user");
  f.store.appendOptimistic("s", [own]); f.live.add("A/s"); f.move("B");
  f.store.appendOptimistic("s", [other]); f.store.rejectOptimistic("s", [own]);
  assert.deepEqual(f.store.messages(), [other]); f.move("A");
  assert.deepEqual(f.store.messages(), []); f.dispose();
});

test("older-page rewrite recovery cannot paint a durable own row before ACK", async () => {
  const page = (start: number, total: number) => ({ version: 1, start, end: start + 1, total, limit: 1, has_more: start > 0 });
  const f = fixture(async <T>(_command: string, args?: Record<string, unknown>) => {
    const before = (args?.history_request as { before: number | null }).before;
    return session([{ id: before === null ? "durable-own" : "rewritten", role: "user", text: before === null ? "own" : "rewrite" }], { history: page(0, 1) }) as T;
  });
  f.store.acceptSession("s", session([{ id: "old", role: "user", text: "older" }], { history: page(1, 2) }), false, f.generation());
  const own = msg("own", "user"); f.store.appendOptimistic("s", [own]);
  await f.store.older("p", "s");
  assert.deepEqual(f.store.messages().map(row => row.text), ["older", "own"]);
  f.store.acknowledgeOptimistic("s", [own]);
  await f.store.older("p", "s");
  assert.deepEqual(f.store.messages().map(row => row.turno), ["durable-own"]); f.dispose();
});

test("rewrite recovery started before a newer ACK cannot replace the current history", async () => {
  const page = (start: number, total: number) => ({ version: 1, start, end: start + 1, total, limit: 1, has_more: start > 0 });
  let recover!: (value: Session) => void, started!: () => void;
  const waiting = new Promise<void>(yes => { started = yes; });
  const f = fixture(async <T>(_command: string, args?: Record<string, unknown>) => {
    const before = (args?.history_request as { before: number | null }).before;
    if (before !== null) return session([{ id: "rewritten", role: "user", text: "rewrite" }], { history: page(0, 1) }) as T;
    started(); return new Promise<Session>(yes => { recover = yes; }) as Promise<T>;
  });
  f.store.acceptSession("s", session([{ id: "old", role: "user", text: "older" }], { history: page(1, 2) }), false, f.generation());
  const own = msg("first", "user"); f.store.appendOptimistic("s", [own]); f.store.acknowledgeOptimistic("s", [own]);
  const pending = f.store.older("p", "s"); await waiting;
  const newer = msg("newer", "user"); f.store.appendOptimistic("s", [newer]); f.store.acknowledgeOptimistic("s", [newer]);
  recover(session([{ id: "durable-first", role: "user", text: "first" }], { history: page(0, 1) }));
  await pending;
  assert.deepEqual(f.store.messages().map(row => row.text), ["older", "first", "newer"]); f.dispose();
});

test("ordinary older pagination still prepends its shared page", async () => {
  const f = fixture(async <T>() => session([{ id: "older", role: "user", text: "older" }, { id: "tail", role: "user", text: "tail" }], {
    history: { version: 1, start: 0, end: 2, total: 2, limit: 2, has_more: false },
  }) as T);
  f.store.acceptSession("s", session([{ id: "tail", role: "user", text: "tail" }], {
    history: { version: 1, start: 1, end: 2, total: 2, limit: 1, has_more: true },
  }), false, f.generation());
  const apply = await f.store.older("p", "s"); assert.ok(apply); apply();
  assert.deepEqual(f.store.messages().map(row => row.turno), ["older", "tail"]); f.dispose();
});

test("a superseded rewrite recovery cannot cancel a newer older-page request", async () => {
  const page = (start: number, end: number, total: number) => ({ version: 1, start, end, total, limit: 2, has_more: start > 0 });
  let recover!: (value: Session) => void, prepend!: (value: Session) => void;
  let recoveryStarted!: () => void, prependStarted!: () => void;
  const recoveryWaiting = new Promise<void>(yes => { recoveryStarted = yes; });
  const prependWaiting = new Promise<void>(yes => { prependStarted = yes; });
  let tails = 0, older = 0;
  const f = fixture(async <T>(_command: string, args?: Record<string, unknown>) => {
    const before = (args?.history_request as { before: number | null }).before;
    if (before === null && ++tails === 1) { recoveryStarted(); return new Promise<Session>(yes => { recover = yes; }) as Promise<T>; }
    if (before === null) return session([{ id: "latest", role: "user", text: "latest" }], { history: page(5, 6, 6) }) as T;
    if (++older === 1) return session([{ id: "rewrite", role: "user", text: "rewrite" }], { history: page(0, 1, 1) }) as T;
    prependStarted(); return new Promise<Session>(yes => { prepend = yes; }) as Promise<T>;
  });
  f.store.acceptSession("s", session([{ id: "old", role: "user", text: "old" }], { history: page(1, 2, 2) }), false, f.generation());
  const stale = f.store.older("p", "s"); await recoveryWaiting;
  await f.store.latest("s");
  const current = f.store.older("p", "s"); await prependWaiting;
  recover(session([{ id: "stale", role: "user", text: "stale" }], { history: page(0, 1, 1) }));
  await stale;
  prepend(session([{ id: "older-new", role: "user", text: "older-new" }, { id: "latest", role: "user", text: "latest" }], { history: page(4, 6, 6) }));
  const apply = await current; assert.ok(apply); apply();
  assert.deepEqual(f.store.messages().map(row => row.turno), ["older-new", "latest"]); f.dispose();
});


test("a persisted commentary snapshot cannot duplicate unbound live output or hide concurrent user input", async () => {
  const durable = commentaryFixture as Session["turns"][number], text = durable.pieces![0] as { text: string };
  const previous = { id: "earlier", role: "agent", text: "Earlier durable answer" };
  const answer = session([previous, { id: "prior", role: "user", text: "prior input" }, durable, { id: "concurrent", role: "user", text: "concurrent input" }]);
  const f = fixture(async <T>() => structuredClone(answer) as T);
  f.store.acceptSession("s", session([previous]), true, f.generation());
  f.store.event(event("delta", text.text, { starts_message: true, message_id: "native-commentary" }), metadata);
  f.store.flush();
  f.store.acceptSession("s", await f.store.read("p", "s"), false, f.generation());
  assert.equal(f.store.messages().filter(row => row.text === text.text).length, 1);
  assert.ok(f.store.messages().some(row => row.turno === "concurrent"));
  assert.ok(f.store.messages().some(row => row.turno === "earlier"));
  assert.equal(f.store.handovers().s.provider, "claude");
  f.store.event(event("segment_saved", "", { id: durable.id! }), metadata);
  assert.equal(f.store.messages().filter(row => row.text === text.text).length, 1);
  assert.ok(f.store.messages().some(row => row.text === text.text && row.avanceDe === durable.id)); f.dispose();
});

test("different pieces and native messages with equal commentary survive segment reconciliation", async () => {
  const text = "Same legitimate commentary";
  const durable = { id: "saved-equal-pieces", role: "agent", text: text + text + "Final", tools: [{ name: "Read", target: "fixture.txt", ok: true }],
    pieces: [{ text }, { tool: 0 }, { text }, { tool: 0 }, { text: "Final" }] };
  const f = fixture(async <T>() => session([durable]) as T);
  for (const id of ["native-first", "native-second"]) f.store.event(event("delta", text, { starts_message: true, message_id: id }), metadata);
  f.store.flush();
  f.store.acceptSession("s", await f.store.read("p", "s"), false, f.generation());
  assert.equal(f.store.messages().filter(row => row.text === text).length, 2);
  f.store.event(event("segment_saved", "", { id: durable.id }), metadata);
  const rows = f.store.messages().filter(row => row.text === text);
  assert.equal(rows.length, 2); assert.notEqual(rows[0].clave, rows[1].clave); f.dispose();
});

test("done materializes a deferred segment and its late marker cannot bind the next turn", async () => {
  const durable = commentaryFixture as Session["turns"][number], text = (durable.pieces![0] as { text: string }).text;
  const f = fixture(async <T>() => session([durable]) as T);
  f.store.beginActivity("s", 1000);
  f.store.event(event("delta", text, { starts_message: true, message_id: "cancelled-run" }), metadata); f.store.flush();
  f.store.acceptSession("s", await f.store.read("p", "s"), false, f.generation());
  f.store.finishActivity("s");
  f.store.acceptSession("s", await f.store.read("p", "s"), true, f.generation());
  assert.equal(f.store.messages().filter(row => row.text === text).length, 1);
  f.store.beginActivity("s", 2000);
  f.store.event(event("delta", text, { starts_message: true, message_id: "next-run" }), metadata); f.store.flush();
  f.store.event(event("segment_saved", "", { id: durable.id! }), metadata);
  assert.equal(f.store.messages().filter(row => row.text === text).length, 2);
  assert.equal(f.store.activities("s", f.store.messages()).at(-1)?.active, true);
  assert.equal(f.store.rows().s.vivo[0].tramo, undefined); f.dispose();
});

test("deferred commentary survives a scoped A to B to A reload without tagging B output", async () => {
  const durable = commentaryFixture as Session["turns"][number], text = (durable.pieces![0] as { text: string }).text;
  const f = fixture(async <T>() => session([durable]) as T);
  f.store.event(event("delta", text, { starts_message: true, message_id: "A-output" }), metadata); f.store.flush(); f.live.add("A/s");
  f.store.acceptSession("s", await f.store.read("p", "s"), false, f.generation());
  f.move("B"); f.store.event(event("delta", "B output", { workspace: "B", starts_message: true }), metadata); f.store.flush();
  f.store.event(event("segment_saved", "", { workspace: "A", id: durable.id! }), metadata);
  assert.equal(f.store.rows().s.vivo[0].tramo, undefined);
  f.move("A");
  f.store.acceptSession("s", await f.store.read("p", "s"), false, f.generation());
  assert.equal(f.store.messages().filter(row => row.text === text).length, 1); f.dispose();
});

test("catchup markers bind replayed output already represented in durable history", async () => {
  const durable = commentaryFixture as Session["turns"][number], text = (durable.pieces![0] as { text: string }).text;
  const f = fixture(async <T>() => session([durable]) as T);
  f.store.acceptSession("s", await f.store.read("p", "s"), true, f.generation());
  f.store.replay("s", "A");
  f.store.event(event("delta", text, { starts_message: true, message_id: "replayed" }), metadata);
  f.store.event(event("segment_saved", "", { id: durable.id! }), metadata);
  assert.equal(f.store.messages().filter(row => row.text === text).length, 1); f.dispose();
});

test("a snapshot before the first delta can still bind its segment to the current observed run", async () => {
  const f = fixture(async <T>() => session([{ id: "current-segment", role: "agent", text: "valid output" }]) as T);
  f.store.beginActivity("s", 1000);
  f.store.acceptSession("s", await f.store.read("p", "s"), false, f.generation());
  f.store.event(event("delta", "valid output", { message_id: "native-current", starts_message: true }), metadata); f.store.flush();
  f.store.event(event("segment_saved", "", { id: "current-segment" }), metadata);
  assert.equal(f.store.messages().filter(row => row.text === "valid output").length, 1);
  assert.equal(f.store.rows().s.vivo[0].tramo, "current-segment"); f.dispose();
});

test("one replay epoch can span pages without discarding earlier native deltas", () => {
  const f = fixture();
  f.store.replay("s", "A", "subscription-one");
  f.store.event(event("delta", "first ", { starts_message: true, message_id: "native-one" }), metadata); f.store.flush();
  f.store.replay("s", "A", "subscription-one");
  f.store.event(event("delta", "second", { message_id: "native-one" }), metadata); f.store.flush();
  assert.equal(f.store.messages().at(-1)?.text, "first second");
  f.store.replay("s", "A", "subscription-two");
  f.store.event(event("delta", "replacement", { starts_message: true, message_id: "native-two" }), metadata); f.store.flush();
  assert.equal(f.store.messages().at(-1)?.text, "replacement"); f.dispose();
});

test("retained replay prefixes survive navigation and continuation reactivates its durable guard", () => {
  const f = fixture(); f.live.add("A/s");
  f.store.replay("s", "A", "subscription-one");
  f.store.event(event("delta", "first ", { workspace: "A", starts_message: true, message_id: "native-one" }), metadata); f.store.flush();
  f.move("B"); f.move("A");
  f.store.replay("s", "A", "subscription-one");
  f.store.event(event("delta", "second", { workspace: "A", message_id: "native-one" }), metadata); f.store.flush();
  assert.equal(f.store.messages().at(-1)?.text, "first second");
  f.store.acceptSession("s", session([{ id: "saved-one", role: "agent", text: "first second" }]), false, f.generation());
  f.store.event(event("segment_saved", "", { workspace: "A", id: "saved-one" }), metadata);
  assert.equal(f.store.messages().filter(row => row.text === "first second").length, 1); f.dispose();
});

for (const provider of ["codex", "claude", "gemini", "opencode"]) test(`producer segment identity prevents snapshot/replay duplication for ${provider} before its save marker`, () => {
  const f = fixture();
  try {
    const saved = { id: "segment-A", role: "agent", text: "same answer" };
    f.store.acceptSession("s", session([saved]), true, f.generation());
    f.store.beginActivity("s", 1000);
    f.store.event(event("delta", "same answer", { starts_message: true, message_id: "reused-native", segment_id: "segment-A" }), { author: null, provider });
    f.store.flush();
    assert.equal(f.store.messages().filter(row => row.text === "same answer").length, 1, "durable and live representations of one segment must not both paint");
    f.store.event(event("delta", "same answer", { starts_message: true, message_id: "reused-native", segment_id: "segment-B" }), { author: null, provider });
    f.store.flush();
    assert.equal(f.store.messages().filter(row => row.text === "same answer").length, 2, "different segments may legitimately have equal text");
  } finally { f.dispose(); }
});

test("tokens and native IDs remain within their producer segment before any save marker", () => {
  const f = fixture();
  try {
    f.store.event(event("delta", "first", { message_id: "native", segment_id: "A" }), metadata);
    f.store.event(event("delta", " chunk", { message_id: "native", segment_id: "A" }), metadata);
    f.store.event(event("delta", "second", { message_id: "native", segment_id: "B" }), metadata);
    f.store.flush();
    assert.deepEqual(f.store.rows().s.vivo.map(row => [row.text, row.tramo]), [["first chunk", "A"], ["second", "B"]]);
    f.store.event(event("segment_saved", "", { id: "A" }), metadata);
    assert.equal(f.store.rows().s.vivo.at(-1)?.tramo, "B", "late marker cannot capture the next segment");
  } finally { f.dispose(); }
});

test("a late tool result updates its bound segment even after the presentation stopped running", () => {
  const f = fixture();
  try {
    f.store.event(event("tool", "Read", { id: "tool", target: "file.ts", segment_id: "A" }), metadata);
    f.store.finishSteps("s");
    f.store.event(event("tool_done", "Read", { id: "tool", segment_id: "A", ok: true }), metadata);
    assert.equal(f.store.rows().s.vivo.filter(row => row.paso).length, 1);
    assert.equal(f.store.rows().s.vivo[0].paso?.ok, true);
  } finally { f.dispose(); }
});


test("a quick next input stays after the previous live answer and owns only the next activity", () => {
  const f = fixture();
  try {
    f.store.replaceHistory("s", [{ role: "user", text: "hola", turno: "u1", clave: "u1:0" }], false);
    f.store.beginActivity("s", 1000);
    f.store.event(event("delta", "Hola, ¿en qué te ayudo?", { message_id: "first-answer" }), metadata);
    f.store.flush(); f.store.finishActivity("s");
    f.store.beginActivity("s", 2000);
    const next = msg("qué haces?", "user");
    f.store.appendOptimistic("s", [next]);
    assert.deepEqual(f.store.messages().map(row => row.text), ["hola", "Hola, ¿en qué te ayudo?", "qué haces?"]);
    const activities = f.store.activities("s", f.store.messages());
    assert.equal(activities.length, 2);
    assert.equal(activities[0].anchorIndex, 1);
    assert.equal(activities[1].anchorIndex, 3);
    f.store.event(event("delta", "Estoy listo", { starts_message: true, message_id: "second-answer" }), metadata); f.store.flush();
    assert.deepEqual(f.store.messages().map(row => row.text), ["hola", "Hola, ¿en qué te ayudo?", "qué haces?", "Estoy listo"]);
    f.store.rejectOptimistic("s", [next]);
    assert.deepEqual(f.store.messages().map(row => row.text), ["hola", "Hola, ¿en qué te ayudo?", "Estoy listo"]);
  } finally { f.dispose(); }
});


test("replay and service reset preserve all pending send rows until ACK or rejection", () => {
  const f = fixture();
  try {
    const context = msg("attached context", "system"), own = msg("pending input", "user");
    f.store.appendOptimistic("s", [context, own]);
    f.store.appendLive("s", [msg("partial output")]);
    f.store.replay("s", "A", "new-replay");
    assert.deepEqual(f.store.messages(), [context, own]);
    f.store.resetService();
    assert.deepEqual(f.store.messages(), [context, own]);
    f.store.rejectOptimistic("s", [context, own]);
    assert.deepEqual(f.store.messages(), []);
  } finally { f.dispose(); }
});


test("a tool result without provider ID cannot match an assistant row in its segment", () => {
  const f = fixture();
  try {
    f.store.event(event("delta", "answer", { segment_id: "A" }), metadata); f.store.flush();
    f.store.event(event("tool_done", "Read", { segment_id: "A", ok: true }), metadata);
    assert.equal(f.store.messages()[0].text, "answer");
    assert.equal(f.store.messages().filter(row => row.paso?.ok).length, 1);
  } finally { f.dispose(); }
});


test("late identified tokens stay above the next input in their original segment", () => {
  const f = fixture();
  try {
    f.store.event(event("delta", "first", { message_id: "native", segment_id: "A" }), metadata); f.store.flush();
    f.store.appendOptimistic("s", [msg("next input", "user")]);
    f.store.event(event("delta", " tail", { message_id: "native", segment_id: "A" }), metadata); f.store.flush();
    assert.deepEqual(f.store.messages().map(row => row.text), ["first tail", "next input"]);
  } finally { f.dispose(); }
});

test("a rapid next input stays ordered when its fresh history precedes the save marker", async () => {
  let turns: Session["turns"] = [{ id: "u1", role: "user", text: "hola" }];
  const f = fixture(async <T>() => session(turns) as T);
  try {
    f.store.acceptSession("s", await f.store.read("p", "s"), false, f.generation());
    f.store.beginActivity("s", 1000);
    f.store.event(event("delta", "respuesta", { segment_id: "A" }), metadata); f.store.flush(); f.store.finishActivity("s");
    f.store.beginActivity("s", 2000);
    const next = msg("qué haces?", "user"); f.store.appendOptimistic("s", [next]); f.store.acknowledgeOptimistic("s", [next]);
    turns = [...turns, { id: "A", role: "agent", text: "respuesta" }, { id: "u2", role: "user", text: "qué haces?" }];
    f.store.acceptSession("s", await f.store.read("p", "s"), false, f.generation());
    assert.deepEqual(f.store.messages().map(row => row.text), ["hola", "respuesta", "qué haces?"]);
  } finally { f.dispose(); }
});
