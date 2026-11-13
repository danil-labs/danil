/**
 * Una sesión de Danil por cuenta contra un motor simulado (`__TAURI_INTERNALS__`):
 * leer las sesiones, elegir la cuenta de un workspace, sus errores y el motor
 * anterior que no las trae.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

type Call = { command: string; args: Record<string, unknown> | undefined };
type Reply = (args: Record<string, unknown> | undefined) => unknown;

function engine(replies: Record<string, Reply>) {
  const calls: Call[] = [];
  (globalThis as { window?: unknown }).window = {
    __TAURI_INTERNALS__: {
      invoke: async (command: string, args?: Record<string, unknown>) => {
        calls.push({ command, args });
        const reply = replies[command];
        if (!reply) throw { what: { clave: "shell.service.command" }, detail: "command" };
        return reply(args);
      },
    },
  };
  return calls;
}

const sessions = () => import("../../src/features/settings/danil-sessions.ts");

const ALBERTO = {
  account: "u_alberto",
  email: "alberto@danil.ai",
  name: "Alberto Ceballos",
  photo: null,
  computer_id: "cmp_a",
  computer_name: "Mac de Alberto",
  default: true,
  workspaces: ["w1", "w2"],
  status: "connected" as const,
  online: true,
};
const FUNDACION = {
  ...ALBERTO,
  account: "u_fdb",
  email: "alberto@dondebanco.org",
  name: "Alberto",
  computer_id: "cmp_b",
  default: false,
  workspaces: ["w3"],
  online: false,
};
const PENDING = {
  account: null,
  email: null,
  name: null,
  photo: null,
  computer_id: null,
  default: false,
  workspaces: [],
  status: "pending" as const,
  online: false,
  user_code: "WDJB-MJHT",
  verification_uri_complete: "https://app.danil.ai/terminus/connect?code=WDJB-MJHT",
};

test("an engine without danil_sessions reads as null, so the window keeps the single account", async () => {
  engine({});
  const { readSessions, readWorkspaceAccount } = await sessions();
  assert.equal(await readSessions(), null);
  assert.equal(await readWorkspaceAccount("w1"), null);
});

test("Desk has one account: the engine's sessions are not read, even if it has them", async () => {
  const calls = engine({ danil_sessions: () => [ALBERTO, FUNDACION, PENDING] });
  const { readSessions } = await sessions();
  assert.equal(await readSessions(), null);
  assert.ok(!calls.some((c) => c.command === "danil_sessions"));
});

test("the sessions split into signed-in accounts and the sign-in in progress", async () => {
  const { connectedSessions, pendingSession, defaultSession, sessionOf } = await sessions();
  const list = [ALBERTO, FUNDACION, PENDING] as never;
  assert.deepEqual(connectedSessions(list).map((s) => s.account), ["u_alberto", "u_fdb"]);
  assert.equal(pendingSession(list)?.user_code, "WDJB-MJHT");
  assert.equal(defaultSession(list)?.account, "u_alberto");
  assert.equal(sessionOf(list, "cmp_b")?.account, "u_fdb", "a session is also named by its computer");
  assert.equal(sessionOf(list, "u_nadie"), null);
  assert.equal(defaultSession([{ ...FUNDACION }])?.account, "u_fdb", "without a flagged default, the first signed-in one");
});

test("the account picker offers the signed-in accounts, the default first, and keeps a signed-out current one", async () => {
  const { accountChoices } = await sessions();
  const list = [FUNDACION, ALBERTO, PENDING];
  assert.deepEqual(
    accountChoices(list, { account: "u_fdb", email: "alberto@dondebanco.org", signed_in: true, linked: true }),
    [
      { value: "u_alberto", label: "alberto@danil.ai", signedIn: true },
      { value: "u_fdb", label: "alberto@dondebanco.org", signedIn: true },
    ],
  );
  const choices = accountChoices([ALBERTO], { account: "u_ytw", email: "alberto@yucatantechweek.mx", signed_in: false, linked: false });
  assert.deepEqual(choices.at(-1), { value: "u_ytw", label: "alberto@yucatantechweek.mx", signedIn: false });
});

test("a workspace talks as its account; signed out, as nobody", async () => {
  const { sessionForWorkspace, syncLine } = await sessions();
  const list = [ALBERTO, FUNDACION];
  assert.equal(sessionForWorkspace(list, { account: "u_fdb", email: null, signed_in: true, linked: true })?.computer_id, "cmp_b");
  assert.equal(sessionForWorkspace(list, null)?.computer_id, "cmp_a", "an engine that cannot say falls back to the default");
  assert.equal(sessionForWorkspace(list, { account: "u_ytw", email: "a@ytw.mx", signed_in: false, linked: false }), null);
  assert.equal(sessionForWorkspace([], { account: null, email: null, signed_in: false, linked: false }), null);

  assert.deepEqual(syncLine({ account: "u_fdb", email: "alberto@dondebanco.org", signed_in: true, linked: true }, list), {
    kind: "synced",
    email: "alberto@dondebanco.org",
  });
  assert.deepEqual(syncLine({ account: "u_fdb", email: null, signed_in: true, linked: true }, list), {
    kind: "synced",
    email: "alberto@dondebanco.org",
  }, "the email comes from the session when the map has none");
  assert.deepEqual(syncLine({ account: "u_fdb", email: "alberto@dondebanco.org", signed_in: true, linked: false }, list), {
    kind: "unlinked",
    email: "alberto@dondebanco.org",
  }, "signed in but not joined (workspace_id_taken) is not called synced");
  assert.deepEqual(syncLine({ account: "u_ytw", email: "a@ytw.mx", signed_in: false, linked: false }, list), { kind: "unsynced", email: "a@ytw.mx" });
  assert.deepEqual(syncLine(null, list), { kind: "unsynced", email: null });
  assert.deepEqual(syncLine({ account: null, email: null, signed_in: false, linked: false }, list), { kind: "none" }, "nobody chose an account");
});

test("the other machines of the person follow the open workspace's account, or the default session when it is of no account", async () => {
  const { railSession } = await sessions();
  const list = [ALBERTO, FUNDACION];
  assert.equal(railSession(list, { account: "u_fdb", email: null, signed_in: true, linked: true })?.computer_id, "cmp_b");
  assert.equal(railSession(list, { account: null, email: null, signed_in: false, linked: false })?.computer_id, "cmp_a", "a local workspace of no account");
  assert.equal(railSession(list, { account: "u_ytw", email: "a@ytw.mx", signed_in: false, linked: false }), null, "an account signed out here does not talk as another");
  assert.equal(railSession([], { account: null, email: null, signed_in: false, linked: false }), null, "no session at all: nobody");
});

test("adding an account starts the flow with add and opens the approval page", async () => {
  const calls = engine({
    danil_connect_start: () => ({ state: "pending", user_code: "WDJB-MJHT", verification_uri_complete: "https://app.danil.ai/terminus/connect?code=WDJB-MJHT" }),
    open_external: () => null,
  });
  const { addAccount } = await sessions();
  await addAccount();
  assert.deepEqual(calls[0], { command: "danil_connect_start", args: { add: true } });
  assert.equal(calls[1].args?.target, "https://app.danil.ai/terminus/connect?code=WDJB-MJHT");
  await addAccount(" Mac ");
  assert.deepEqual(calls[2].args, { name: "Mac", add: true });
});

test("default, sign out and the workspace's account name the account", async () => {
  const calls = engine({
    danil_set_default_account: () => [{ ...FUNDACION, default: true }, { ...ALBERTO, default: false }],
    danil_disconnect: () => ({ state: "disconnected", online: false }),
    danil_workspace_account: () => ({ account: "u_alberto", email: "alberto@danil.ai", signed_in: true, linked: true }),
    danil_workspace_set_account: (args) => ({ account: args?.account, email: null, signed_in: true, linked: false, error: "workspace_id_taken" }),
  });
  const { setDefaultAccount, signOutAccount, readWorkspaceAccount, setWorkspaceAccount, changeProblem } = await sessions();
  const after = await setDefaultAccount("u_fdb");
  assert.equal(after[0].default, true);
  await signOutAccount("u_fdb");
  assert.equal((await readWorkspaceAccount("w3"))?.account, "u_alberto");
  const result = await setWorkspaceAccount("w3", "u_fdb");
  assert.deepEqual(
    calls.map((c) => [c.command, c.args]),
    [
      ["danil_set_default_account", { account: "u_fdb" }],
      ["danil_disconnect", { account: "u_fdb" }],
      ["danil_workspace_account", { workspace: "w3" }],
      ["danil_workspace_set_account", { workspace: "w3", account: "u_fdb" }],
    ],
  );
  assert.equal(changeProblem(result), "workspace_id_taken", "the control plane kept it with the other account");
  assert.equal(changeProblem({ account: "u_fdb", email: null, signed_in: true, linked: true }), null);
});

test("an account that is no longer signed in is told apart when changing a workspace", async () => {
  engine({
    danil_workspace_set_account: () => {
      throw { what: { clave: "danil.error.account_not_found" }, detail: "account_not_found" };
    },
  });
  const { setWorkspaceAccount, changeProblem } = await sessions();
  const refused = await setWorkspaceAccount("w1", "u_gone").catch((e: unknown) => e);
  assert.equal(changeProblem(null, refused), "account_not_found");
  assert.equal(changeProblem(null, new Error("x")), "failed");
});

test("the account that just signed in is the first connected one that was not there before", async () => {
  const { newSessionKey } = await sessions();
  const s = (account: string | null, status = "connected", computer_id: string | null = null) =>
    ({ account, email: null, name: null, photo: null, computer_id, default: false, workspaces: [], status, online: true }) as never;
  assert.equal(newSessionKey(["u_a"], [s("u_a")]), null, "the same account signing in again is not new");
  assert.equal(newSessionKey(["u_a"], [s("u_a"), s(null, "pending")]), null, "a pending one is not an account yet");
  assert.equal(newSessionKey(["u_a"], [s("u_a"), s("u_b")]), "u_b");
  assert.equal(newSessionKey([], [s(null, "connected", "cmp_x")]), "cmp_x", "without a person id, its computer names it");
  assert.equal(newSessionKey([], null), null);
});

test("a read failure never selects the legacy account model", async () => {
  const failure = { detail: "unauthorized" };
  engine({ danil_sessions: () => { throw failure; }, danil_workspace_account: () => { throw failure; } });
  const { readWorkspaceAccount } = await sessions();
  await assert.rejects(readWorkspaceAccount("w1"), (error) => error === failure);
  engine({ danil_workspace_account: () => ({}) });
  await assert.rejects(readWorkspaceAccount("w1"), { detail: "invalid_response" });
});

test("workspace machines come from that account's registry and refuse actions outside its membership", async () => {
  const { workspaceComputersSource } = await import("../../src/features/machines/workspace-computers.ts");
  const renamed: string[] = [];
  let fail = false;
  const source = {
    workspaces: async () => fail ? { kind: "unauthorized" as const } : { kind: "ok" as const, value: [
      { id: "w1", name: "One", projects: [], computers: ["cmp_a"] },
      { id: "w2", name: "Two", projects: [], computers: ["cmp_b"] },
    ] },
    list: async () => ({ kind: "ok" as const, value: [
      { computer_id: "cmp_a", state: "online", workspaces: ["w2"] },
      { computer_id: "cmp_b", state: "offline", workspaces: ["w1"] },
      { computer_id: "foreign", state: "online" },
    ] }),
    rename: async (id: string, name: string) => { renamed.push(id); return { kind: "ok" as const, value: { computer_id: id, name } }; },
    onRenamed: () => {},
  };
  const first = workspaceComputersSource(source, "w1");
  const second = workspaceComputersSource(source, "w2");
  assert.deepEqual(await first.list(), { kind: "ok", value: [{ computer_id: "cmp_a", state: "online", workspaces: ["w2"] }] });
  assert.deepEqual(await second.list(), { kind: "ok", value: [{ computer_id: "cmp_b", state: "offline", workspaces: ["w1"] }] });
  assert.equal((await first.rename("cmp_b", "No")).kind, "missing");
  await first.rename("cmp_a", "Yes");
  assert.deepEqual(renamed, ["cmp_a"]);
  fail = true;
  assert.deepEqual(await first.list(), { kind: "unauthorized" });
  assert.equal((await first.rename("cmp_a", "No")).kind, "missing", "a failed authority read revokes stale actions");
  fail = false;
  assert.equal((await workspaceComputersSource(source, "absent").list()).kind, "missing");
});

test("a stale machine read cannot restore permissions after a newer authority failure", async () => {
  const { workspaceComputersSource } = await import("../../src/features/machines/workspace-computers.ts");
  let release!: () => void;
  const old = new Promise<void>((resolve) => { release = resolve; });
  let reads = 0;
  const source = workspaceComputersSource({
    workspaces: async () => {
      if (++reads > 1) return { kind: "unauthorized" };
      await old;
      return { kind: "ok", value: [{ id: "w", name: "W", projects: [], computers: ["cmp"] }] };
    },
    list: async () => ({ kind: "ok", value: [{ computer_id: "cmp", state: "online" }] }),
    rename: async () => { throw new Error("stale permission"); },
    onRenamed: () => {},
  }, "w");
  const first = source.list();
  assert.equal((await source.list()).kind, "unauthorized");
  release();
  assert.equal((await first).kind, "error");
  assert.equal((await source.rename("cmp", "No")).kind, "missing");
});
