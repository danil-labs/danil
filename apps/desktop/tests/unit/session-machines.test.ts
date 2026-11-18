import assert from "node:assert/strict";
import test from "node:test";
import { mergeBridgeInventory } from "../../src/features/machines/bridge-inventory.ts";
import { createSessionCloud, mergeContextMachines } from "../../src/features/machines/session-cloud.ts";
import { createAccountWorkspaces } from "../../src/features/shell/session-account-workspaces.ts";
import { confirmEmailClose, emailContextCount } from "../../src/features/shell/session-close-confirm.ts";
import { createSessionEmptyState } from "../../src/features/shell/session-empty.ts";
import { sessionWorkspaceSource } from "../../src/features/shell/session-workspace-source.ts";
import { subscribeOrganizationProblems } from "../../src/lib/organization-problems.ts";

const contexts = [{ context_id: "a", org: "A" }, { context_id: "b", org: "B" }];
const machine = (id: string, org: string) => ({ computer_id: id, organization_id: org, state: "online" });
test("duplicate machines prefer their organization context, otherwise the first listing", () => {
  assert.deepEqual(mergeContextMachines(contexts.map((context) => ({ context, computers: [machine("same", "B"), machine("first", "C")] }))).map((m) => [m.computer_id, m.context]), [["same", "b"], ["first", "a"]]);
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
  await cloud.client.start("same");
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
