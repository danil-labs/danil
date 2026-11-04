import assert from "node:assert/strict";
import test from "node:test";
import { HistoryPager, hasRecentGap, olderCursor, prependHistory, refreshHistory, type HistoryPage, type HistoryRead } from "../src/history.ts";

type Turn = { id: string; text?: string };

/** A saved transcript as the engine serves it: 50 turns a page, `revision` hashing the whole file. */
class Engine {
  turns: Turn[] = [];
  writes = 0;
  size: number;
  limit: number;
  constructor(count: number, size = 0, limit = 50) {
    this.size = size;
    this.limit = limit;
    this.append(count);
  }
  append(count = 1) {
    for (let i = 0; i < count; i++) this.turns.push({ id: `t${this.turns.length}`, text: "x".repeat(this.size) });
    this.writes++;
  }
  page(before: number | null): HistoryRead<Turn> {
    const end = Math.min(before ?? this.turns.length, this.turns.length);
    const start = Math.max(0, end - this.limit);
    const history: HistoryPage = { version: 1, revision: `r${this.writes}`, total: this.turns.length, start, end, limit: this.limit, has_more: start > 0 };
    return { turns: this.turns.slice(start, end), history };
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

const ids = (turns: Turn[]) => turns.map(turn => Number(turn.id.slice(1)));
const consecutive = (turns: Turn[]) => ids(turns).every((id, n, all) => n === 0 || id === all[n - 1] + 1);

test("a new revision with the same turns is an append, not a rewrite", () => {
  const engine = new Engine(400);
  const first = engine.page(null);
  const opened = refreshHistory(undefined, first.turns, first.history);
  const older = engine.page(olderCursor(opened));
  const merged = prependHistory(opened, older.turns, older.history)!;
  assert.equal(merged.start, 301);
  engine.append();
  const tail = engine.page(null);
  const grown = refreshHistory(merged, tail.turns, tail.history);
  assert.equal(grown.start, 301, "the turns already read stay");
  assert.equal(grown.total, 401);
  assert.ok(consecutive(grown.turns));
  assert.equal(grown.revision, "r2");
});

test("reading the whole of an active task reaches its first turn", async () => {
  const engine = new Engine(388);
  const pager = new HistoryPager<Turn>({ retryMs: 0, read: async before => engine.page(before) });
  const opened = engine.page(null);
  pager.accept(opened.turns, opened.history);
  for (let n = 0; n < 200 && pager.loaded!.start > 0; n++) {
    engine.append();
    const tail = engine.page(null);
    pager.accept(tail.turns, tail.history);
    (await pager.fetchOlder())?.();
    assert.ok(consecutive(pager.loaded!.turns));
  }
  assert.equal(pager.loaded!.start, 0);
  assert.equal(pager.loaded!.turns[0].id, "t0");
});

test("an append that lands while the page travels neither loses it nor leaves a hole", async () => {
  const engine = new Engine(200);
  const gate = deferred<void>();
  let held = false;
  const pager = new HistoryPager<Turn>({
    retryMs: 0,
    read: async before => {
      const answer = engine.page(before);
      if (held) { held = false; await gate.promise; }
      return answer;
    },
  });
  const opened = engine.page(null);
  pager.accept(opened.turns, opened.history);
  held = true;
  const asked = pager.fetchOlder();
  engine.append(3);
  const tail = engine.page(null);
  pager.accept(tail.turns, tail.history);
  gate.resolve();
  (await asked)?.();
  const loaded = pager.loaded!;
  assert.equal(loaded.turns.at(-1)?.id, "t202");
  assert.ok(consecutive(loaded.turns));
  assert.equal(new Set(ids(loaded.turns)).size, loaded.turns.length);
  assert.equal(loaded.start, 101);
});

test("a tail that lands between fetching the page and putting it in stays", async () => {
  const engine = new Engine(200);
  const pager = new HistoryPager<Turn>({ retryMs: 0, read: async before => engine.page(before) });
  const opened = engine.page(null);
  pager.accept(opened.turns, opened.history);
  const put = await pager.fetchOlder();
  engine.append(2);
  const tail = engine.page(null);
  pager.accept(tail.turns, tail.history);
  put?.();
  assert.equal(pager.loaded!.start, 101);
  assert.equal(pager.loaded!.turns.at(-1)?.id, "t201");
  assert.ok(consecutive(pager.loaded!.turns));
});

test("a failed page stays visible, keeps the window and can be retried", async () => {
  const engine = new Engine(200);
  let broken = true;
  const pager = new HistoryPager<Turn>({ retryMs: 0, read: async before => { if (broken && before !== null) throw new Error("offline"); return engine.page(before); } });
  const opened = engine.page(null);
  const loaded = pager.accept(opened.turns, opened.history);
  assert.equal(await pager.fetchOlder(), null);
  assert.equal(pager.older, "failed");
  assert.equal(pager.loaded, loaded);
  broken = false;
  (await pager.fetchOlder())?.();
  assert.equal(pager.older, "idle");
  assert.equal(pager.loaded!.start, 101);
});

test("one request at a time", async () => {
  const engine = new Engine(200);
  let reads = 0;
  const pager = new HistoryPager<Turn>({ retryMs: 0, read: async before => { reads++; return engine.page(before); } });
  const opened = engine.page(null);
  pager.accept(opened.turns, opened.history);
  await Promise.all([pager.fetchOlder(), pager.fetchOlder(), pager.fetchOlder()]);
  assert.equal(reads, 1);
});

test("an answer after closing changes nothing", async () => {
  const engine = new Engine(200);
  const gate = deferred<HistoryRead<Turn>>();
  const pager = new HistoryPager<Turn>({ retryMs: 0, read: () => gate.promise });
  const opened = engine.page(null);
  const loaded = pager.accept(opened.turns, opened.history);
  const asked = pager.fetchOlder();
  pager.close();
  gate.resolve(engine.page(151));
  assert.equal(await asked, null);
  assert.equal(pager.loaded, loaded);
  assert.equal(pager.older, "idle");
});

test("a host that keeps answering with its tail ends in a failure, not in a loop of requests", async () => {
  const engine = new Engine(200);
  let reads = 0;
  const pager = new HistoryPager<Turn>({ retryMs: 0, read: async () => { reads++; return engine.page(null); } });
  const opened = engine.page(null);
  pager.accept(opened.turns, opened.history);
  assert.equal(await pager.fetchOlder(), null);
  assert.equal(pager.older, "failed");
  assert.equal(reads, 2);
});

test("a rewrite under the window goes back to the tail without mixing turns", async () => {
  const engine = new Engine(200);
  const pager = new HistoryPager<Turn>({ retryMs: 0, read: async before => engine.page(before) });
  const opened = engine.page(null);
  pager.accept(opened.turns, opened.history);
  engine.turns = Array.from({ length: 220 }, (_, n) => ({ id: `n${n}` }));
  engine.writes++;
  assert.equal(await pager.fetchOlder(), null);
  assert.equal(pager.loaded!.turns[0].id, "n170");
  assert.equal(pager.older, "idle");
});

test("past the budget the window can reach the first turn, and the tail comes back on request", async () => {
  const engine = new Engine(120, 100_000);
  const pager = new HistoryPager<Turn>({ retryMs: 0, read: async before => engine.page(before) });
  const opened = engine.page(null);
  pager.accept(opened.turns, opened.history);
  assert.ok(pager.loaded!.start > 0);
  for (let n = 0; n < 200 && pager.loaded!.start > 0; n++) {
    engine.append();
    const tail = engine.page(null);
    pager.accept(tail.turns, tail.history, { reading: true });
    (await pager.fetchOlder())?.();
  }
  assert.equal(pager.loaded!.turns[0].id, "t0");
  assert.ok(hasRecentGap(pager.loaded!));
  assert.ok(JSON.stringify(pager.loaded!.turns).length <= 2 * 1024 * 1024);
  await pager.latest();
  assert.equal(pager.loaded!.turns.at(-1)?.id, engine.turns.at(-1)?.id);
  assert.equal(hasRecentGap(pager.loaded!), false);
});

test("a window away from the tail does not move when the tail does", () => {
  const engine = new Engine(400);
  const middle = engine.page(200);
  const previous = { ...middle.history, start: 150, total: 400, turns: middle.turns };
  engine.append(10);
  const tail = engine.page(null);
  const next = refreshHistory(previous, tail.turns, tail.history);
  assert.equal(next.start, 150);
  assert.equal(next.turns, previous.turns);
  assert.equal(next.total, 410);
});

test("a single turn over the budget survives", () => {
  const engine = new Engine(1, 3 * 1024 * 1024);
  const first = engine.page(null);
  assert.equal(refreshHistory(undefined, first.turns, first.history).turns.length, 1);
});

test("latest while a page travels leaves the pager usable, even if the tail fails", async () => {
  const engine = new Engine(200);
  const gate = deferred<HistoryRead<Turn>>();
  let mode: "hold" | "fail" | "serve" = "hold";
  const pager = new HistoryPager<Turn>({ retryMs: 0, read: async before => {
    if (mode === "hold") return gate.promise;
    if (mode === "fail") throw new Error("offline");
    return engine.page(before);
  } });
  const opened = engine.page(null);
  pager.accept(opened.turns, opened.history);
  const asked = pager.fetchOlder();
  mode = "fail";
  await assert.rejects(pager.latest());
  gate.resolve(engine.page(151));
  assert.equal(await asked, null);
  assert.equal(pager.older, "idle");
  mode = "serve";
  (await pager.fetchOlder())?.();
  assert.equal(pager.loaded!.start, 101);
});

test("latest after closing does not touch the window", async () => {
  const engine = new Engine(200);
  const gate = deferred<HistoryRead<Turn>>();
  const pager = new HistoryPager<Turn>({ read: () => gate.promise });
  const opened = engine.page(null);
  const loaded = pager.accept(opened.turns, opened.history);
  const back = pager.latest();
  pager.close();
  gate.resolve(engine.page(null));
  await back;
  assert.equal(pager.loaded, loaded);
});

test("turns without id join although their references name a new revision", () => {
  const legacy = (n: number, revision: string) => ({ text: "", at: n, history_refs: [{ version: 1, turn: n, pointer: "/text", bytes: 20_000, revision }] });
  const page = (start: number, end: number, revision: string): HistoryPage => ({ version: 1, revision, total: 200, start, end, limit: 50, has_more: true });
  const window = { revision: "a", start: 60, total: 200, turns: Array.from({ length: 140 }, (_, n) => legacy(60 + n, "a")) };
  const next = refreshHistory(window, Array.from({ length: 50 }, (_, n) => legacy(150 + n, "b")), page(150, 200, "b"));
  assert.equal(next.start, 60);
});

test("an older answer to the tail costs nothing: shared turns decide, not the total", () => {
  const turns = (from: number, to: number) => Array.from({ length: to - from }, (_, n) => ({ id: `t${from + n}` }));
  const page = (start: number, end: number, total: number): HistoryPage => ({ version: 1, revision: `r${total}`, total, start, end, limit: 50, has_more: true });
  const window = { start: 50, total: 200, turns: turns(50, 200) };
  const stale = refreshHistory(window, turns(148, 198), page(148, 198, 198));
  assert.equal(stale.start, 50);
  assert.equal(stale.total, 198);
});

test("next to the window with nothing shared is not a join", () => {
  const turns = (from: number, to: number) => Array.from({ length: to - from }, (_, n) => ({ id: `t${from + n}` }));
  const page: HistoryPage = { version: 1, revision: "b", total: 150, start: 100, end: 150, limit: 50, has_more: true };
  const next = refreshHistory({ start: 50, total: 100, turns: turns(50, 100) }, turns(100, 150), page);
  assert.equal(next.start, 100);
});

test("a read that collides with a save is retried before anyone sees a failure", async () => {
  const engine = new Engine(200);
  let collisions = 2;
  const pager = new HistoryPager<Turn>({ retryMs: 0, read: async before => {
    if (before !== null && collisions-- > 0) throw { what: "revision_changed" };
    return engine.page(before);
  } });
  const opened = engine.page(null);
  pager.accept(opened.turns, opened.history);
  (await pager.fetchOlder())?.();
  assert.equal(pager.older, "idle");
  assert.equal(pager.loaded!.start, 101);
});

test("a page that adds nothing ends in a visible failure, not a quiet stop", async () => {
  const engine = new Engine(200, 0, 1);
  const pager = new HistoryPager<Turn>({ retryMs: 0, read: async before => engine.page(before) });
  const tail = engine.page(null);
  pager.accept(engine.turns.slice(100), { ...tail.history!, start: 100 });
  assert.equal(await pager.fetchOlder(), null);
  assert.equal(pager.older, "failed");
});

test("long text keeps its quotes out and survives a file that keeps changing", async () => {
  const { readDetailText } = await import("../src/historyDetail.ts");
  const ref = { version: 1 as const, turn: 2, pointer: "/text", revision: "old", bytes: 9 };
  let writes = 0;
  const read = {
    part: async (current: typeof ref) => {
      if (current.revision !== "r2") throw { what: "revision_changed" };
      return { version: 1 as const, revision: "r2", offset: 0, next: 9, total: 9, done: true, text: '"a\\nb \\"c"' };
    },
    turns: async () => ({ turns: [{ id: "x", history_refs: [{ ...ref, revision: `r${++writes}` }] }], history: { start: 2, end: 3, total: 3, limit: 50, has_more: true } }),
  };
  assert.equal(await readDetailText(read, ref, "x"), 'a\nb "c');
  await assert.rejects(readDetailText({ ...read, part: async () => { throw new Error("gone"); } }, ref, "other"));
});
