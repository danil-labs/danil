import assert from "node:assert/strict";
import test from "node:test";
import { mergeBridgeInventory } from "../../src/features/machines/bridge-inventory.ts";
import { createContextRelayPool } from "../../src/features/machines/context-relay-pool.ts";
import { createSessionCloud, mergeContextMachines } from "../../src/features/machines/session-cloud.ts";
import { createAccountWorkspaces } from "../../src/features/shell/session-account-workspaces.ts";
import { confirmEmailClose, emailContextCount } from "../../src/features/shell/session-close-confirm.ts";
import { createSessionEmptyState } from "../../src/features/shell/session-empty.ts";
import { sessionWorkspaceSource } from "../../src/features/shell/session-workspace-source.ts";
import { subscribeOrganizationProblems } from "../../src/lib/organization-problems.ts";

const contexts = [{ context_id: "a", org: "A" }, { context_id: "b", org: "B" }];
const machine = (id: string, org: string) => ({ computer_id: id, organization_id: org, state: "online" });
test("one machine retains each context and rejects mismatched organization endpoints", () => {
  const contexts = [{ context_id: "a", org: "A" }, { context_id: "b", org: "A" }];
  assert.deepEqual(mergeContextMachines(contexts.map((context) => ({ context, computers: [{ ...machine("same", "A"), kind: "organization" }, { ...machine("alien", "B"), kind: "organization" }] }))).map((m) => [m.computer_id, m.context]), [["same", "a"], ["same", "b"]]);
});

test("one inventory per context, admission and wake use the selected row, expired contexts cannot buy tickets", async () => {
  const calls: Record<string, unknown>[] = [];
  let connected = contexts;
  const cloud = createSessionCloud(async (command, args) => {
    if (command === "danil_session_status") return { sessions: [{ contexts: connected }] };
    calls.push(args!);
    const body = args?.path === "/v1/capabilities" ? { contract: "mvp-v1", items: [{ name: "machines", version: 1, status: "available" }] } : { items: [{ machine_id: "same", organization_id: "B", kind: "organization", state: "running", connection: "connected" }] };
    return { status: 200, body };
  });
  const rows = await cloud.rows();
  assert.ok(rows.state === "ready");
  assert.equal(rows.computers[0].context, "b");
  assert.deepEqual(calls.filter((c) => c.path === "/v1/machines").map((c) => c.context).sort(), ["a", "b"]);
  await cloud.client.admission("same", "b");
  await cloud.client.start("same", "b");
  assert.ok(calls.filter((c) => c.method === "POST").every((c) => c.context === "b"));
  connected = [];
  await cloud.rows();
  assert.throws(() => cloud.client.admission("same", "b"), { detail: "no_session" });
});

test("old status has a single inventory and no context; no sessions makes no edge calls", async () => {
  for (const status of [{ state: "connected" }, { sessions: [] }]) {
    const calls: Record<string, unknown>[] = [];
    const cloud = createSessionCloud(async (command, args) => {
      if (command === "danil_session_status") return status;
      calls.push(args!);
      return { status: 200, body: args?.path === "/v1/capabilities" ? { contract: "mvp-v1", items: [{ name: "machines", version: 1, status: "available" }] } : { items: [{ machine_id: "legacy", state: "running", connection: "connected" }] } };
    });
    const rows = await cloud.rows();
    assert.ok(rows.state === "ready");
    assert.ok(rows.computers.every((m) => !m.context));
    assert.equal(calls.length, "sessions" in status ? 0 : 2);
    assert.ok(calls.every((c) => !("context" in c)));
  }
});

test("Free needs native window, advertised E1, matching context org and server engine id; creation stays on the local machine", async () => {
  for (const native of [false, true]) for (const feature of [false, true]) for (const serverId of [false, true]) {
    const calls: { command: string; args?: Record<string, unknown> }[] = [];
    const group = { context_id: "free", org: "A", plan: "free" };
    const invoke = async <T>(command: string, args?: Record<string, unknown>) => {
      calls.push({ command, args });
      return (command === "machine_list" ? [{ id: "local", local: true, features: feature ? ["account_workspace_v1"] : [] }] : command === "list_workspaces" ? { workspaces: [{ id: "local-free", name: "Mine", account: { org: "A", account_id: "42" } }, { id: "local", name: "Local" }] } : {}) as T;
    };
    const accounts = createAccountWorkspaces(invoke, native, () => {});
    const send = async () => ({ status: 200, body: { items: [{ id: "wrong", org: "B", engine_workspace_id: "alien" }, { id: "42", org: "A", name: "Free", ...(serverId ? { engine_workspace_id: "engine-free" } : {}) }] } });
    await accounts.refresh([group], send);
    assert.equal(!!accounts.free("free"), native && feature && serverId);
    if (native && feature && serverId) {
      await accounts.create(group, async () => {});
      assert.deepEqual(calls.at(-1), { command: "create_account_workspace", args: { "x-terminus-machine": "local", id: "engine-free", name: "Free", account: { org: "A", account_id: "42" } } });
      assert.deepEqual(accounts.available("A").map((w) => w.id), ["local-free"]);
      assert.deepEqual(accounts.available("B"), []);
    } else await assert.rejects(accounts.create(group, async () => {}), { detail: "not_available_yet" });
    if (!native) assert.equal(calls.length, 0);
  }
});

test("closing one organization needs no confirmation; email count includes every family, dismissal cannot restore revoked context", () => {
  const families = [{ family: "1", email: "ONE@EXAMPLE.COM", contexts: [1, 2] }, { family: "2", email: "one@example.com", contexts: [3] }, { family: "3", email: "other@example.com", contexts: [4] }];
  assert.equal(emailContextCount(families, "one@example.com", "1"), 3);
  let prompted = 0;
  assert.equal(confirmEmailClose(1, String, () => { prompted++; return false; }), true);
  assert.equal(confirmEmailClose(3, String, (message) => { prompted++; assert.equal(message, "3"); return false; }), false);
  assert.equal(prompted, 1);
  const empty = createSessionEmptyState();
  empty.update({ removed: [{ context_id: "gone", org: "Organization", reason: "organization_access_denied" }] });
  assert.equal(empty.removed()[0].org, "Organization");
  empty.dismiss("gone");
  empty.update({ removed: [{ context_id: "gone", org: "Organization", reason: "organization_access_denied" }] });
  assert.deepEqual(empty.removed(), []);
  assert.equal(empty.excludes("gone"), true);
});

test("missing context echo discards every scoped inventory and falls back to unscoped legacy rows", async () => {
  const cloud = createSessionCloud(async (command, args) => {
    if (command === "danil_session_status") return { sessions: [{ contexts }] };
    if (args?.context) throw { detail: "session_echo_mismatch" };
    return { status: 200, body: args?.path === "/v1/capabilities" ? { contract: "mvp-v1", items: [{ name: "machines", version: 1, status: "available" }] } : { items: [{ machine_id: "legacy", state: "running", connection: "connected" }] } };
  });
  const result = await cloud.rows();
  assert.ok(result.state === "ready");
  assert.equal(result.computers[0].computer_id, "legacy");
  assert.equal("context" in result.computers[0], false);
});


test("paid groups never offer local seals, Free never offers another machine, and unknown plans use organization machines", () => {
  const remote = [{ id: "org-machine", name: "Paid" }];
  const local = [{ id: "here", name: "Sealed on this computer" }];
  const group = (plan: string | null) => sessionWorkspaceSource(plan, () => remote, () => local);
  assert.deepEqual(group("paid"), remote);
  assert.deepEqual(group(null), remote);
  assert.deepEqual(group("free"), local);
  assert.equal(group("paid")?.some((w) => w.id === "here"), false);
  assert.equal(group("free")?.some((w) => w.id === "org-machine"), false);
  assert.deepEqual(sessionWorkspaceSource("paid", () => null, () => local), null);
});

test("the bridge remains the base without sessions, retaining organization and engine capabilities", () => {
  const organization = { organization_id: "A", workspace: { id: "paid", name: "Paid" } };
  const bridge = { computer_id: "same", state: "offline", name: "Bridge", organization, service_features: ["engine-feature"], os: "linux", host_version: "v1", workspaces: ["paid"] };
  const merged = mergeBridgeInventory([bridge], [{ computer_id: "same", state: "online", kind: "organization", organization_id: "A", service_features: [] }]);
  assert.deepEqual(merged, [{ ...bridge, state: "online", kind: "organization", organization_id: "A" }]);
  assert.equal("context" in merged[0], false);
  assert.equal(mergeBridgeInventory([bridge], [{ computer_id: "same", state: "online", context: "ctx" }])[0].context, "ctx");
});

test("status command failure falls back to legacy inventory and admission without a stale context", async () => {
  let fail = false;
  const calls: Record<string, unknown>[] = [];
  const cloud = createSessionCloud(async (command, args) => {
    if (command === "danil_session_status") { if (fail) throw new Error("IPC unavailable"); return { sessions: [{ contexts }] }; }
    calls.push(args!);
    return { status: 200, body: args?.path === "/v1/capabilities" ? { contract: "mvp-v1", items: [{ name: "machines", version: 1, status: "available" }] } : { items: [{ machine_id: "legacy", state: "running", connection: "connected" }] } };
  });
  await cloud.rows();
  fail = true;
  calls.length = 0;
  const result = await cloud.rows();
  assert.ok(result.state === "ready");
  assert.equal(result.computers[0].computer_id, "legacy");
  await cloud.client.admission("legacy");
  assert.ok(calls.length >= 3);
  assert.ok(calls.every((c) => !("context" in c)));
});


test("a scoped inventory refusal keeps its own organization instead of notifying the default selector", async () => {
  const problems: string[] = [];
  const legacyProblems: unknown[] = [];
  const stop = subscribeOrganizationProblems((problem) => problems.push(problem.context));
  try {
    const cloud = createSessionCloud(async (command, args) => {
      if (command === "danil_session_status") return { sessions: [{ contexts }] };
      if (args?.path === "/v1/capabilities") return { status: 200, body: { contract: "mvp-v1", items: [{ name: "machines", version: 1, status: "available" }] } };
      return args?.context === "b" ? { status: 403, body: { code: "organization_selection_required" } } : { status: 200, body: { items: [] } };
    }, (problem) => legacyProblems.push(problem));
    await cloud.rows();
    assert.deepEqual(problems, ["b"]);
    assert.deepEqual(legacyProblems, []);
  } finally { stop(); }
});

test("two people on the same organization buy tickets with their own context", async () => {
  const calls: Record<string, unknown>[] = [];
  const contexts = [{ context_id: "ana", org: "A" }, { context_id: "bea", org: "A" }];
  const cloud = createSessionCloud(async (command, args) => {
    if (command === "danil_session_status") return { sessions: [{ contexts }] };
    calls.push(args!);
    return { status: 200, body: args?.path === "/v1/capabilities" ? { contract: "mvp-v1", items: [{ name: "machines", version: 1, status: "available" }] } : { items: [{ machine_id: "same", organization_id: "A", kind: "organization", state: "running", connection: "connected" }] } };
  });
  const answer = await cloud.rows();
  assert.ok(answer.state === "ready");
  assert.deepEqual(answer.computers.map((row) => row.context), ["ana", "bea"]);
  await cloud.client.admission("same", "ana");
  await cloud.client.admission("same", "bea");
  assert.deepEqual(calls.filter((call) => call.method === "POST").map((call) => call.context), ["ana", "bea"]);
  assert.throws(() => cloud.client.admission("same"), { detail: "no_session" });
  const merged = mergeBridgeInventory([{ computer_id: "same", state: "online", service_features: ["known"] }], answer.computers);
  assert.deepEqual(merged.map((row) => [row.context, row.service_features]), [["ana", ["known"]], ["bea", ["known"]]]);
});

test("the context relay pool caps physical connections, reopens the correct identity and expires idle links", async () => {
  let now = 0;
  let serial = 0;
  const timers = new Map<number, { at: number; run(): void }>();
  const time = { now: () => now, set: (run: () => void, ms: number) => { const id = ++serial; timers.set(id, { at: now + ms, run }); return id; }, clear: (id: unknown) => { timers.delete(id as number); } };
  const tick = (ms: number) => { now += ms; for (const [id, timer] of [...timers]) if (timer.at <= now) { timers.delete(id); timer.run(); } };
  const pool = createContextRelayPool(time);
  let active = 0;
  let peak = 0;
  const opened: string[] = [];
  const calls: string[] = [];
  const links = ["a", "b", "c", "d", "e"].map((context) => pool.link("machine", () => {
    let started = false;
    return {
      state: () => "online", onState: () => () => {}, onEvents: () => () => {}, subscribe: () => {},
      start() { if (!started) { started = true; active++; peak = Math.max(peak, active); opened.push(context); } },
      close() { if (started) { started = false; active--; } },
      async call() { calls.push(context); return { value: context, cached: null }; },
    };
  }));
  for (const link of links) link.start();
  assert.equal(active, 4);
  await links[4].call("request", "list_workspaces", null, null, {});
  assert.equal(active, 4);
  assert.equal(peak, 4);
  assert.equal(calls.at(-1), "e");
  await links[0].call("request", "list_workspaces", null, null, {});
  assert.equal(calls.at(-1), "a");
  assert.equal(opened.filter((context) => context === "a").length, 2);
  tick(5 * 60_000 - 1);
  assert.equal(active, 4);
  tick(1);
  assert.equal(active, 0);
  await links[4].call("request", "list_workspaces", null, null, {});
  assert.equal(active, 1);
  assert.equal(calls.at(-1), "e");
  for (const link of links) link.close();
  assert.equal(active, 0);
  assert.equal(timers.size, 0);
});

test("busy relay sessions are not evicted and queued work keeps its own context", async () => {
  const pool = createContextRelayPool();
  const finish = new Map<string, () => void>();
  let active = 0;
  const calls: string[] = [];
  const links = ["a", "b", "c", "d", "e"].map((context) => pool.link("machine", () => ({
    state: () => "online", onState: () => () => {}, onEvents: () => () => {}, subscribe: () => {},
    start() { active++; assert.ok(active <= 4); }, close() { active--; },
    async call() { calls.push(context); await new Promise<void>((resolve) => finish.set(context, resolve)); return { value: context, cached: null }; },
  })));
  const pending = links.map((link) => link.call("request", "list_workspaces", null, null, {}));
  await Promise.resolve();
  assert.deepEqual(calls, ["a", "b", "c", "d"]);
  finish.get("b")!();
  await pending[1];
  await Promise.resolve();
  assert.deepEqual(calls, ["a", "b", "c", "d", "e"]);
  assert.equal(active, 4);
  for (const resolve of finish.values()) resolve();
  await Promise.all(pending);
  for (const link of links) link.close();
  assert.equal(active, 0);
});

test("a synchronous relay factory failure releases its reservation and preserves other member state", { timeout: 1_000 }, async () => {
  const pool = createContextRelayPool(undefined, 1);
  const error = new Error("factory unavailable");
  let fail = true;
  const make = (value: string) => ({
    state: () => "online" as const, onState: () => () => {}, onEvents: () => () => {}, subscribe: () => {}, start() {}, close() {},
    async call() { return { value, cached: null }; },
  });
  const first = pool.link("machine", () => make("first"));
  const failing = pool.link("machine", () => { if (fail) throw error; return make("retry"); });
  try {
    first.start();
    await assert.rejects(failing.call("request", "list_workspaces", null, null, {}, 50), (failure) => failure === error);
    assert.equal(first.state(), "online");
    fail = false;
    assert.equal((await failing.call("request", "list_workspaces", null, null, {}, 50)).value, "retry");
    assert.equal((await first.call("request", "list_workspaces", null, null, {}, 50)).value, "first");
  } finally { first.close(); failing.close(); }
});

test("a factory failure while waking a queued caller rejects it and permits a later retry", { timeout: 1_000 }, async () => {
  const pool = createContextRelayPool(undefined, 1);
  let release!: () => void;
  let fail = true;
  const error = new Error("queued factory unavailable");
  const make = (value: string, wait = false) => ({
    state: () => "online" as const, onState: () => () => {}, onEvents: () => () => {}, subscribe: () => {}, start() {}, close() {},
    async call() { if (wait) await new Promise<void>((resolve) => { release = resolve; }); return { value, cached: null }; },
  });
  const first = pool.link("machine", () => make("busy", true));
  const queued = pool.link("machine", () => { if (fail) throw error; return make("retry"); });
  try {
    const active = first.call("request", "list_workspaces", null, null, {}, 50);
    await Promise.resolve();
    const rejected = assert.rejects(queued.call("request", "list_workspaces", null, null, {}, 50), (failure) => failure === error);
    release();
    await active;
    await rejected;
    fail = false;
    assert.equal((await queued.call("request", "list_workspaces", null, null, {}, 50)).value, "retry");
  } finally { first.close(); queued.close(); }
});

test("real streamed events refresh relay use while empty heartbeat pages do not", () => {
  let now = 0;
  let serial = 0;
  const timers = new Map<number, { at: number; run(): void }>();
  const time = { now: () => now, set: (run: () => void, ms: number) => { const id = ++serial; timers.set(id, { at: now + ms, run }); return id; }, clear: (id: unknown) => { timers.delete(id as number); } };
  const tick = (ms: number) => { now += ms; for (const [id, timer] of [...timers]) if (timer.at <= now) { timers.delete(id); timer.run(); } };
  const pool = createContextRelayPool(time);
  let active = 0;
  let emit!: (page: { cursor: number | null; events?: { name: string; payload: unknown }[] }) => void;
  const link = pool.link("machine", () => ({
    state: () => "online", onState: () => () => {}, onEvents: (listener) => { emit = listener; return () => {}; }, subscribe: () => {},
    start() { active++; }, close() { active--; }, async call() { return { value: null, cached: null }; },
  }));
  link.start();
  tick(4 * 60_000);
  emit({ cursor: 1, events: [{ name: "chat", payload: { text: "still working" } }] });
  tick(60_000);
  assert.equal(active, 1);
  emit({ cursor: 1, events: [] });
  emit({ cursor: 1 });
  tick(4 * 60_000 - 1);
  assert.equal(active, 1);
  tick(1);
  assert.equal(active, 0);
  link.close();
  assert.equal(timers.size, 0);
});
