import assert from "node:assert/strict";
import { test } from "node:test";
import { previewScope } from "../../src/features/sites/scope.ts";
import { previewSession } from "../../src/features/sites/preview-session.ts";
import type { PreviewClient, PreviewLease } from "../../../../packages/computers/src/previews.ts";

const scope = { machine: "mch_1", workspace: "ws_1", session: "task_1" };
const lease: PreviewLease = { id: "pvw_1", url: "https://prv-test.daizero.com/", deadline: 60_000, renewAfterMs: 30_000 };
function fixture(patch: Partial<PreviewClient> = {}) {
  let now = 0;
  const jobs = new Map<ReturnType<typeof setTimeout> | number, { at: number; fn: () => void }>();
  let next = 0;
  const closed: string[] = [];
  const states: { kind: string; url?: string; code?: string }[] = [];
  const client: PreviewClient = { open: async () => lease, renew: async () => now + 60_000, close: async (_, id) => { closed.push(id); }, ...patch };
  const session = previewSession({ client, changed: state => states.push(state), now: () => now, random: () => 0.5,
    schedule: (fn, ms) => { const id = ++next as unknown as ReturnType<typeof setTimeout>; jobs.set(id, { at: now + ms, fn }); return id; },
    cancel: id => { jobs.delete(id); },
  });
  return { session, closed, states, jobs, advance: async (ms: number) => {
    now += ms;
    for (const [id, job] of [...jobs]) if (job.at <= now) { jobs.delete(id); job.fn(); }
    await new Promise(resolve => setImmediate(resolve));
  } };
}

test("closing while create is pending closes the late lease without rendering it", async () => {
  let resolve!: (value: PreviewLease) => void;
  const f = fixture({ open: () => new Promise(done => { resolve = done; }) });
  const opening = f.session.open(scope, 5173, "/app?x=1#hello");
  f.session.close();
  resolve(lease);
  await opening;
  assert.deepEqual(f.closed, ["pvw_1"]);
  assert.equal(f.states.some(state => state.kind === "live"), false);
  assert.equal(f.jobs.size, 0);
});

test("a lease renews without remounting the iframe and stops renewing after close", async () => {
  let renewed = 0;
  const f = fixture({ renew: async () => { renewed++; return 90_000; } });
  await f.session.open(scope, 5173, "/app?x=1#hello");
  assert.equal(f.states.at(-1)?.url, `${lease.url}app?x=1#hello`);
  f.session.loaded();
  await f.advance(30_000);
  assert.equal(renewed, 1);
  assert.equal(lease.deadline, 60_000);
  assert.equal(f.states.filter(state => state.kind === "live").length, 1);
  f.session.close();
  await f.advance(90_000);
  assert.equal(renewed, 1);
  assert.deepEqual(f.closed, [lease.id]);
});

test("a failed renewal removes the iframe, releases the lease and cannot keep it alive", async () => {
  const f = fixture({ renew: async () => { throw Object.assign(new Error("forbidden"), { status: 403 }); } });
  await f.session.open(scope, 5173, "/");
  f.session.loaded();
  await f.advance(30_000);
  assert.equal(f.states.at(-1)?.kind, "failed");
  assert.equal(f.states.at(-1)?.url, undefined);
  assert.deepEqual(f.closed, [lease.id]);
  assert.equal(f.jobs.size, 0);
});

test("older deployments retry capability discovery and stop polling when the tab closes", async () => {
  let opens = 0;
  const f = fixture({ open: async () => { if (++opens === 1) throw new Error("capability_missing"); return { ...lease, deadline: 90_000 }; } });
  await f.session.open(scope, 5173, "/");
  assert.equal(f.states.at(-1)?.kind, "unavailable");
  await f.advance(30_000);
  assert.equal(opens, 2);
  assert.equal(f.states.at(-1)?.kind, "loading");
  f.session.close();
  assert.equal(f.jobs.size, 0);
});

test("a slow page retains its lease and can finish loading after the notice", async () => {
  const f = fixture();
  await f.session.open(scope, 5173, "/");
  await f.advance(30_000);
  assert.equal(f.states.at(-1)?.kind, "loading");
  assert.deepEqual(f.closed, []);
  f.session.loaded();
  assert.equal(f.states.at(-1)?.kind, "live");
  f.session.close();
});


test("one failed renewal retries within the current lease without replacing the iframe", async () => {
  let calls = 0;
  const f = fixture({ renew: async () => { if (++calls === 1) throw Object.assign(new Error("network"), { status: 503 }); return 90_000; } });
  await f.session.open(scope, 5173, "/");
  f.session.loaded();
  await f.advance(30_000);
  assert.equal(f.states.at(-1)?.kind, "live");
  assert.deepEqual(f.closed, []);
  await f.advance(2_000);
  assert.equal(calls, 2);
  assert.equal(f.states.filter(s => s.kind === "loading").length, 1);
  f.session.close();
});

test("repeated network failures cannot extend the authenticated lease", async () => {
  const f = fixture({ renew: async () => { throw new Error("network"); } });
  await f.session.open(scope, 5173, "/");
  f.session.loaded();
  await f.advance(30_000);
  await f.advance(31_000);
  assert.equal(f.states.at(-1)?.kind, "failed");
  assert.equal(f.states.at(-1)?.code, "lease_expired");
  assert.deepEqual(f.closed, [lease.id]);
});


test("a task without a resolved machine never uses the machine selected for new tasks", () => {
  assert.equal(previewScope({ workspace: "ws_1", session: "s_1" }, () => null), null);
  assert.deepEqual(previewScope({ workspace: "ws_1", session: "mch_1~s_1" }, () => "mch_1"), { machine: "mch_1", workspace: "ws_1", session: "s_1" });
});
