import assert from "node:assert/strict";
import test from "node:test";
import { createServiceStream, type ServicePage, type PollRequest, type ServiceFailure } from "../../../../packages/features/service-stream/src/index.ts";
const page = (extra: Partial<ServicePage> = {}): ServicePage => ({ cursor: 1, gap: false, replay: false, runtime: "r1", reset: false, ...extra });
const settle = () => new Promise(resolve => setImmediate(resolve));
function fixture(read: (request: PollRequest) => Promise<ServicePage>, failure: ServiceFailure = "unavailable", ready = Promise.resolve()) {
  let now = 0, nextId = 0, visible = ["s1"];
  const scheduled = new Map<number, { run: () => void; delay: number }>();
  const requests: PollRequest[] = [], filters: string[][] = [], status: (string | null)[] = [], order: string[] = [];
  const stream = createServiceStream({ ready: () => ready, read: request => { requests.push(request); return read(request); },
    filter: async sessions => { filters.push(sessions); }, visibleSessions: () => visible,
    applyBatches: () => { order.push("batches"); }, applyPage: (result, recovered) => { order.push(recovered ? "recovered" : "page"); },
    classifyFailure: () => failure, connectionStatus: value => status.push(value),
    clock: { now: () => now, schedule: (run, delay) => { const id = ++nextId; scheduled.set(id, { run, delay }); return id; }, cancel: handle => scheduled.delete(handle as number), microtask: queueMicrotask },
  });
  return { stream, requests, filters, status, order, scheduled, setNow: (value: number) => { now = value; }, visible: (items: string[]) => { visible = items; },
    next: async () => { const [id, timer] = scheduled.entries().next().value!; scheduled.delete(id); timer.run(); await settle(); return timer.delay; } };
}
test("listeners precede first poll and duplicate starts do not multiply loops", async () => {
  let resolve!: () => void; const ready = new Promise<void>(done => { resolve = done; });
  const f = fixture(async () => page(), "unavailable", ready); f.stream.start(); f.stream.start(); await settle();
  assert.equal(f.requests.length, 0); resolve(); await settle(); assert.equal(f.requests.length, 1); assert.equal(f.scheduled.size, 1); f.stream.dispose();
});
test("cursor replay runtime advance and nonpush cadence stays 250ms", async () => {
  const f = fixture(async () => page()); f.stream.start(); await settle(); assert.deepEqual(f.requests[0], { cursor: null, workspace: null, replay: true, runtime: null });
  assert.equal(await f.next(), 250); assert.deepEqual(f.requests[1], { cursor: 1, workspace: null, replay: false, runtime: "r1" }); f.stream.dispose();
});
test("push mode delivers batches before page, enables filter and loops immediately", async () => {
  const f = fixture(async () => page({ push: true, batches: [] })); f.stream.start(); await settle();
  assert.deepEqual(f.order, ["batches", "page"]); assert.equal(f.stream.paged(), true); assert.deepEqual(f.filters, [["s1"]]); assert.equal(await f.next(), 0); f.stream.dispose();
});
test("filter changes coalesce and identical visible sessions do not resend", async () => {
  const f = fixture(async () => page({ push: true })); f.stream.start(); await settle(); f.stream.filterChanged(); f.stream.filterChanged(); await settle(); assert.equal(f.filters.length, 1);
  f.visible(["s1", "s2"]); f.stream.filterChanged(); f.stream.filterChanged(); await settle(); assert.deepEqual(f.filters[1], ["s1", "s2"]); f.stream.dispose();
});
test("generic failure threshold and recovery preserve stream replay state", async () => {
  let failed = true; const f = fixture(async () => { if (failed) throw Error("offline"); return page(); }); f.stream.start(); await settle(); assert.deepEqual(f.status, []);
  f.setNow(10_000); await f.next(); assert.deepEqual(f.status, []); f.setNow(10_001); await f.next(); assert.deepEqual(f.status, ["chat.error.service_unavailable"]);
  failed = false; await f.next(); assert.equal(f.order.at(-1), "recovered"); assert.equal(f.status.at(-1), null); f.stream.dispose();
});
test("engine failure threshold is two seconds and sleeping is quiet", async () => {
  const f = fixture(async () => { throw Error("missing"); }, "missing"); f.stream.start(); await settle(); f.setNow(2001); await f.next(); assert.deepEqual(f.status, ["shell.service.engine_missing"]); f.stream.dispose();
  const sleeping = fixture(async () => { throw Error("sleep"); }, "sleep"); sleeping.stream.start(); await settle(); sleeping.setNow(20000); await sleeping.next(); assert.deepEqual(sleeping.status, [null, null]); sleeping.stream.dispose();
});
test("dispose discards late page and prevents timer or filter after teardown", async () => {
  let resolve!: (value: ServicePage) => void; const f = fixture(() => new Promise(done => { resolve = done; })); f.stream.start(); await settle(); f.stream.dispose(); resolve(page({ push: true, batches: [] })); await settle();
  assert.deepEqual(f.order, []); assert.equal(f.scheduled.size, 0); assert.deepEqual(f.filters, []);
});
test("dispose cancels a scheduled next poll", async () => {
  const f = fixture(async () => page()); f.stream.start(); await settle(); assert.equal(f.scheduled.size, 1); f.stream.dispose(); assert.equal(f.scheduled.size, 0);
});

test("disposal from batch callback stops page delivery, status and filter", async () => {
  const events: string[] = [];
  const stream = createServiceStream({ ready: async () => {}, read: async () => page({ push: true, batches: [] }),
    filter: async () => { events.push("filter"); }, visibleSessions: () => ["s1"],
    applyBatches: () => { events.push("batches"); stream.dispose(); }, applyPage: () => { events.push("page"); },
    classifyFailure: () => "unavailable", connectionStatus: () => { events.push("status"); },
  });
  stream.start(); await settle(); assert.deepEqual(events, ["batches"]);
});
