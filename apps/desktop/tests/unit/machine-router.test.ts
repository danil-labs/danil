/**
 * El escritorio con la cuenta de Danil, local primero (`features/machines/router.ts`)
 * con la flota de verdad (`@terminus/fleet`), sesiones de relay falsas y un IPC
 * nativo simulado: lo de aquí nunca espera a otra máquina, la máquina sale solo
 * del sobre y nadie contestando nunca es una lista vacía.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { isDeferrable } from "@terminus/computers";
import { Fleet, type Link, type MachineInfo, classOf } from "@terminus/fleet";
import "../helpers/catalog.ts";
import { withoutAbout } from "../../src/lib/taskMentions.ts";
import { createRouter } from "../../src/features/machines/router.ts";
import type { EngineWorkspace } from "../../src/features/machines/engine-workspaces.ts";
import { runsWorkspace } from "../../src/features/machines/runs-workspace.ts";

type Args = Record<string, unknown>;
type Call = { command: string; args: Args; workspace: string | null; id: string };

/** Una sesión de relay en memoria; `silent` no contesta nunca, como una VM colgada. */
function fakeLink(answers: Record<string, unknown>, state: "online" | "offline" | "stopped" = "online", silent = false) {
  const calls: Call[] = [];
  const link: Link & { calls: Call[] } = {
    calls,
    state: () => state,
    call(id, command, workspace, _folder, args, timeout) {
      calls.push({ id, command, workspace, args: args as Args });
      return new Promise((resolve, reject) => {
        // Como el relay: una acción ligera con la máquina apagada se guarda en su cola.
        if (state !== "online" && isDeferrable(command)) return resolve({ value: null, cached: null, deferred: { queued_at: "2026-10-23T00:00:00Z" } });
        if (state !== "online") return reject({ code: "machine_off" });
        if (silent) return void setTimeout(() => reject({ code: "io", detail: "timeout" }), timeout ?? 50);
        const answer = answers[command];
        if (answer === undefined) return reject({ code: "command" });
        Promise.resolve(typeof answer === "function" ? (answer as (a: Args) => unknown)(args as Args) : answer).then(value => resolve({ value, cached: null }), reject);
      });
    },
    onState: () => () => {},
    onEvents: () => () => {},
    subscribe() {},
    start() {},
    close() {},
  };
  return link;
}

const row = (id: string, title = id) => ({ id, title, updated_at: 0 });
const VM: MachineInfo = { id: "cmp_vm", name: "Danil VM", wakes: true };
const MAC: MachineInfo = { id: "cmp_mac", name: "Mac de Ana", wakes: false };

function setup(links: Record<string, ReturnType<typeof fakeLink>>, local: Record<string, unknown> = {}, picked: string | null = null, home?: () => { wakes?: boolean; os?: "linux" | "macos" | "windows" }, directory?: () => { workspace_id: string | null; name: string; owner?: boolean }[], engineWorkspaces?: () => readonly EngineWorkspace[] | null) {
  const native: { command: string; args: Args; options: unknown }[] = [];
  const changes: string[][] = [];
  const fleet = new Fleet({ self: "cmp_home", connect: (info) => links[info.id], deadlines: { read: 40, action: 200, intent: 400 } });
  const answers: Record<string, unknown> = {
    list_workspaces: { workspaces: [{ id: "w", name: "W" }], active: "w" },
    list_live_sessions: [row("t1", "local")],
    list_projects: [{ id: "p1", name: "P1" }],
    danil_sessions: [],
    list_accounts: { accounts: [], active: null },
    send_message: "t9",
    set_active_workspace: null,
    ...local,
  };
  const router = createRouter({
    self: "cmp_home",
    fleet,
    native: async (command, args = {}, options) => {
      native.push({ command, args, options });
      if (!(command in answers)) throw { what: { clave: "shell.service.command" }, detail: "command" };
      return answers[command];
    },
    onSlices: (c) => changes.push(c),
    pickedFor: () => picked,
    home,
    directory,
    engineWorkspaces,
  });
  fleet.setMachines([VM, MAC].filter((m) => links[m.id]));
  return { router, fleet, native, changes };
}

const on = (machine: string) => ({ headers: { "x-terminus-machine": machine } });
const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

test("Free policy read, accept and revoke keep their captured destination in the unified desktop router", async (t) => {
  t.mock.method(console, "error", () => {});
  const vm = fakeLink({ workspaces_startup: { active: "w2" }, set_provider_consent: null });
  const { router, native } = setup({ cmp_vm: vm }, {
    workspaces_startup: { active: "w2" }, set_provider_consent: null,
  });
  await router.handle("set_active_workspace", { id: "w" });
  const operations: [string, Args][] = [
    ["workspaces_startup", {}],
    ["set_provider_consent", { provider: "opaque-reference", accepted: true }],
    ["set_provider_consent", { provider: "free-router-opencode", accepted: false }],
  ];
  for (const [command, args] of operations) {
    const before = native.length;
    const remoteBefore = vm.calls.length;
    await router.handle(command, args, { headers: {
      "x-terminus-workspace": "w2", "x-terminus-machine": "cmp_home",
    } });
    const sent = native.slice(before).filter((c) => c.command === command);
    assert.equal(sent.length, 1);
    assert.deepEqual(sent[0].args, args);
    const headers = new Headers((sent[0].options as { headers?: HeadersInit }).headers);
    assert.equal(headers.get("x-terminus-workspace"), "w2");
    assert.equal(headers.get("x-terminus-machine"), null);
    assert.equal(vm.calls.length, remoteBefore);
    await router.handle(command, args, { headers: {
      "x-terminus-workspace": "w2", "x-terminus-machine": "cmp_vm",
    } });
    const remote = vm.calls.filter((c) => c.command === command).at(-1);
    assert.ok(remote);
    assert.equal(remote.workspace, "w2");
    assert.deepEqual(remote.args, args);
    const counts = [native.length, vm.calls.length];
    await assert.rejects(router.handle(command, args, { headers: {
      "x-terminus-workspace": "w2", "x-terminus-machine": "removed",
    } }), (error: { detail: string }) => error.detail === "unknown_machine");
    assert.deepEqual([native.length, vm.calls.length], counts);
  }
});

test("the router removes the machine header only when it delivers to native IPC", async () => {
  const vm = fakeLink({ send_message: "remote-task" });
  const { router, native } = setup({ cmp_vm: vm });
  await router.handle("list_workspaces");
  await router.handle("send_message", { text: "local" }, { headers: { "x-terminus-machine": "cmp_home", "x-terminus-workspace": "w" } });
  const local = native.filter((call) => call.command === "send_message").at(-1);
  assert.ok(local);
  const headers = new Headers((local.options as { headers?: HeadersInit } | undefined)?.headers);
  assert.equal(headers.get("x-terminus-machine"), null);
  assert.equal(headers.get("x-terminus-workspace"), "w");
  await router.handle("send_message", { text: "remote" }, on("cmp_vm"));
  assert.equal(native.filter((call) => call.command === "send_message").length, 1);
  assert.equal(vm.calls.filter((call) => call.command === "send_message").length, 1);
});

test("the machine comes only from the envelope: a VM id in the args of this computer's call is refused before sending", async () => {
  const vm = fakeLink({ load_session: ({ id }: Args) => ({ id }) });
  const { router, native } = setup({ cmp_vm: vm });
  await router.handle("list_workspaces");
  // Llegar al candado es un bug: se registra y la persona ve el fallo genérico, sin la frase de «dos máquinas».
  const logged: unknown[][] = [];
  const error = console.error;
  console.error = (...args: unknown[]) => void logged.push(args);
  try {
    await assert.rejects(router.handle("load_session", { project: "p1", id: "cmp_vm~t1" }), (e: { detail: string; what: unknown }) => {
      assert.equal(e.detail, "cross_machine");
      assert.deepEqual(e.what, { clave: "shell.service.failed" });
      return true;
    });
  } finally {
    console.error = error;
  }
  assert.ok(String(logged[0]?.[0]).includes("cross_machine"), "registered as a failure");
  assert.equal(native.filter((c) => c.command === "load_session").length, 0, "the local engine never got another machine's id");
  assert.equal(vm.calls.length, 0, "and the id did not pick the VM either");
  assert.deepEqual(await router.handle("load_session", { project: "p1", id: "cmp_vm~t1" }, on("cmp_vm")), { id: "cmp_vm~t1" });
  assert.deepEqual(vm.calls.map((c) => [c.command, c.args.id, c.workspace]), [["load_session", "t1", "w"]]);
  console.error = () => {};
  try {
    await assert.rejects(router.handle("send_message", { session: "t1", prompt: "x" }, on("cmp_vm")), (e: { detail: string }) => e.detail === "cross_machine", "a bare id is this computer's");
  } finally {
    console.error = error;
  }
});

test("moving a VM task to this window's space goes to the VM with the same id, after sharing it; no window memory", async () => {
  const vm = fakeLink({ move_task_to_space: ({ space }: Args) => ({ id: space, name: "Trabajo" }) });
  const { router, fleet, native } = setup({ cmp_vm: vm }, { share_space: { id: "s1", name: "Trabajo", folders: [], created_at: 1, updated_at: 1, account: true } });
  fleet.setRegistry([{ id: "w", name: "W", projects: [], computers: ["cmp_vm"] }]);
  await router.handle("list_workspaces");
  const moved = await router.handle("move_task_to_space", { project: "p1", id: "cmp_vm~t1", space: "s1" }, on("cmp_vm"));
  assert.deepEqual(moved, { id: "s1", name: "Trabajo" });
  assert.deepEqual(native.find((c) => c.command === "share_space")?.args, { id: "s1" });
  assert.deepEqual(vm.calls.find((c) => c.command === "move_task_to_space")?.args, { project: "p1", id: "t1", space: "s1" });
});

test("learning that a space is the account's (its spaces just migrated) makes the window read the tasks again, once", async () => {
  const { router, changes } = setup({}, { list_spaces: [{ id: "s2", name: "General", folders: [], created_at: 1, updated_at: 1, account: true }] });
  await router.handle("list_workspaces");
  await router.handle("list_spaces");
  await sleep(300);
  assert.deepEqual(changes, [["sessions"]], "tasks of other machines named it with a prefix before");
  await router.handle("list_spaces");
  await sleep(300);
  assert.deepEqual(changes, [["sessions"]], "nothing new, no reread");
});

test("this computer's list answers at once with its own rows; the VM's slice is added when it arrives", async () => {
  const vm = fakeLink({ list_live_sessions: [row("t1", "vm")] });
  const { router, changes } = setup({ cmp_vm: vm });
  await router.handle("list_workspaces");
  const first = (await router.handle("list_live_sessions", { project: "p1", open: ["t1", "cmp_vm~t1"] })) as { id: string }[];
  assert.deepEqual(first.map((r) => r.id), ["t1"], "nothing waited on the VM");
  await sleep(300);
  assert.deepEqual(changes, [["sessions"]], "the window is told to read again");
  const second = (await router.handle("list_live_sessions", { project: "p1", open: ["t1", "cmp_vm~t1"] })) as { id: string; machine?: string; machine_status?: string }[];
  assert.deepEqual(second.map((r) => [r.id, r.machine ?? null, r.machine_status ?? null]), [["t1", null, null], ["cmp_vm~t1", "cmp_vm", "ok"]]);
  assert.deepEqual(vm.calls[0].args.open, ["t1"], "the VM gets only its own open tab");
});

test("a workspace only other machines have, with nobody answering, is a named error and never an empty list", async () => {
  const vm = fakeLink({}, "online", true);
  const { router, fleet, native } = setup({ cmp_vm: vm });
  fleet.setRegistry([{ id: "w2", name: "Producto", projects: [], computers: ["cmp_vm"] }]);
  await router.handle("list_workspaces");
  assert.equal(await router.handle("set_active_workspace", { id: "w2" }), null);
  assert.equal(native.filter((c) => c.command === "set_active_workspace").length, 0, "this computer's engine is not moved to a workspace it lacks");
  const started = Date.now();
  await assert.rejects(router.handle("list_live_sessions", { project: "p1" }), (e: { detail: string }) => e.detail === "machine_timeout");
  assert.ok(Date.now() - started < 1_000, "bounded");
});

test("a workspace only other machines have answers at once from their last slice, and reads again behind", async () => {
  let title = "vieja";
  let slow = false;
  const vm = fakeLink({ list_live_sessions: () => (slow ? new Promise(() => {}) : [row("t1", title)]) });
  const { router, fleet } = setup({ cmp_vm: vm });
  fleet.setRegistry([{ id: "w2", name: "Producto", projects: [], computers: ["cmp_vm"] }]);
  await router.handle("list_workspaces");
  await router.handle("set_active_workspace", { id: "w2" });
  const first = (await router.handle("list_live_sessions", { project: "p1" })) as { title: string }[];
  assert.deepEqual(first.map((r) => r.title), ["vieja"], "with nothing kept, the first read waits for the VM");
  await sleep(1_600);
  title = "nueva";
  slow = true;
  const started = Date.now();
  const again = (await router.handle("list_live_sessions", { project: "p1" })) as { title: string }[];
  assert.ok(Date.now() - started < 30, "with a slice kept, nothing waits on the VM");
  assert.deepEqual(again.map((r) => r.title), ["vieja"]);
  assert.equal(vm.calls.length, 2, "and the VM is asked again behind");
});

test("danil_* always stays on this computer, whatever the header says", async () => {
  const vm = fakeLink({ danil_sessions: [{ account: "x" }] });
  const { router, native } = setup({ cmp_vm: vm });
  assert.deepEqual(await router.handle("danil_sessions", {}, on("cmp_vm")), []);
  assert.equal(vm.calls.length, 0);
  assert.deepEqual(native.map((c) => c.command), ["danil_sessions"]);
});

test("AI accounts: the list joins every machine's, grouped with their machines; an action goes to the machine of the header", async () => {
  const ana = (id: string) => ({ provider: "codex", accounts: [{ id, label: "Ana", identity: "ana@x.com", plan: "Pro" }], active: id });
  const vm = fakeLink({ list_accounts: ana("a"), remove_account: null });
  const { router, native } = setup({ cmp_vm: vm }, { list_accounts: ana("h"), remove_account: null });
  const listed = (await router.handle("list_accounts", { provider: "codex" })) as { accounts: { machines: { machine: string }[] }[] };
  assert.equal(listed.accounts.length, 1, "the same email and plan on two machines is one account");
  assert.deepEqual(listed.accounts[0].machines.map((m) => m.machine).sort(), ["cmp_home", "cmp_vm"]);
  await router.handle("remove_account", { provider: "codex", id: "a" }, on("cmp_vm"));
  assert.deepEqual(vm.calls.map((c) => c.command), ["list_accounts", "remove_account"]);
  assert.ok(!native.some((c) => c.command === "remove_account"), "signing out there never touches this computer");
  await router.handle("remove_account", { provider: "codex", id: "h" }, on("cmp_home"));
  assert.equal(native.at(-1)?.command, "remove_account");
});

test("the account's credentials are the workspace's: here by default, on the machine of the header when it names one", async () => {
  const listing = { credentials: [], recipients: [], local_only: [] };
  const vm = fakeLink({ account_credentials_list: { ...listing, from: "vm" }, account_credential_remove_machine: { credential: null } });
  const { router, native } = setup({ cmp_vm: vm }, { account_credentials_list: listing });
  await router.handle("list_workspaces");
  assert.deepEqual(await router.handle("account_credentials_list", {}), listing);
  assert.deepEqual(await router.handle("account_credentials_list", {}, on("cmp_vm")), { ...listing, from: "vm" });
  await router.handle("account_credential_remove_machine", { credential: "c1", computer: "cmp_home" }, on("cmp_vm"));
  assert.deepEqual(native.filter((c) => c.command.startsWith("account_credential")).map((c) => c.command), ["account_credentials_list"]);
  assert.deepEqual(vm.calls.map((c) => [c.command, c.workspace]), [["account_credentials_list", "w"], ["account_credential_remove_machine", "w"]]);
});

test("without a pick something new is born on the window's machine; «Ejecutar en» decides only when set", async () => {
  const vm = fakeLink({});
  const plain = setup({ cmp_vm: vm });
  await plain.router.handle("list_workspaces");
  assert.deepEqual(plain.router.createsOn("w"), { machine: "cmp_home", lead: true });
  const list = (await plain.router.handle("machine_list")) as { id: string; active: boolean }[];
  assert.deepEqual(list.map((m) => [m.id, m.active]), [["cmp_home", true], ["cmp_vm", false]], "«Ejecutar en» starts on this computer");
  const picked = setup({ cmp_vm: fakeLink({}) }, {}, "cmp_vm");
  await picked.router.handle("list_workspaces");
  assert.deepEqual(picked.router.createsOn("w"), { machine: "cmp_vm", lead: false });
});

test("machine_list says which machines wake and names a system only when the row has one", async () => {
  const { router, fleet } = setup({ cmp_vm: fakeLink({}), cmp_mac: fakeLink({}, "offline") }, {}, null, () => ({ wakes: true, os: "linux" }));
  fleet.setMachines([{ ...VM, os: "linux" }, MAC]);
  await router.handle("list_workspaces");
  const list = (await router.handle("machine_list")) as { id: string; wakes?: boolean; os?: string }[];
  const row = (id: string) => list.find((m) => m.id === id);
  assert.equal(row("cmp_vm")?.wakes, true);
  assert.equal(row("cmp_vm")?.os, "linux");
  assert.equal(row("cmp_mac")?.wakes, false);
  assert.equal(row("cmp_mac")?.os, undefined);
  assert.equal(row("cmp_home")?.wakes, true, "this window can be the managed VM");
  assert.equal(row("cmp_home")?.os, "linux");
});

test("an action to the person's own machine that is off says so plainly, without trying to start it", async () => {
  const mac = fakeLink({ send_message: "x" }, "offline");
  const { router } = setup({ cmp_mac: mac });
  await assert.rejects(router.handle("send_message", { project: "p1", session: "cmp_mac~t1", prompt: "hola" }, on("cmp_mac")), (e: { what: string; detail: string }) => {
    assert.equal(e.what, "Mac de Ana está sin conexión. Verifica que Danil esté abierto y tenga acceso a internet.");
    assert.equal(e.detail, "machine_off");
    return true;
  });
  assert.equal(mac.calls.length, 0);
});

test("the workspace listing adds the account's workspaces that live elsewhere, with their machines", async () => {
  const { router, fleet } = setup({ cmp_vm: fakeLink({}) });
  fleet.setRegistry([{ id: "w2", name: "Producto", projects: [], computers: ["cmp_vm"] }]);
  const listed = (await router.handle("list_workspaces")) as { workspaces: { id: string; machines: string[] }[]; active: string };
  assert.deepEqual(listed.workspaces.map((w) => [w.id, w.machines]), [["w", ["cmp_home"]], ["w2", ["cmp_vm"]]]);
  assert.equal(listed.active, "w");
});

test("a file of another machine's task does not open on this computer", async () => {
  const { router, native } = setup({ cmp_vm: fakeLink({}) }, { open_file_external: null });
  await assert.rejects(router.handle("open_file_external", { target: "/x" }, on("cmp_vm")), (e: { detail: string }) => e.detail === "machine_files");
  await assert.rejects(router.handle("tree_open_external", { session: "cmp_vm~t1", path: "a" }), (e: { detail: string }) => e.detail === "machine_files");
  assert.equal(await router.handle("open_file_external", { target: "/x" }), null, "this computer's own opens");
  assert.deepEqual(native.map((c) => c.command), ["open_file_external"]);
});

test("an action on a machine stopped by the license says so by name", async () => {
  const vm = fakeLink({ send_message: "x" });
  Object.assign(vm, { blocked: () => "license_required" as const });
  const { router } = setup({ cmp_vm: vm });
  await assert.rejects(router.handle("send_message", { project: "p1", session: "cmp_vm~t1", prompt: "hola" }, on("cmp_vm")), (e: { what: string; detail: string }) => {
    assert.equal(e.detail, "license_required");
    assert.equal(e.what, "Usar tus otras computadoras desde aquí es parte de Danil de pago.");
    return true;
  });
  assert.equal(vm.calls.length, 0);
});

test("by the relay every call says its workspace: making one its own included; the engine's refusals are named", async () => {
  const vm = fakeLink({ materialize_workspace: null, send_message: "r1", rename_session: null });
  const { router, fleet } = setup({ cmp_vm: vm });
  fleet.setRegistry([{ id: "w", name: "W", projects: [], computers: ["cmp_home"] }]);
  await router.handle("list_workspaces");
  assert.equal(await router.handle("send_message", { project: "p1", session: null, prompt: "hola" }, on("cmp_vm")), "cmp_vm~r1");
  assert.deepEqual(vm.calls.map((c) => [c.command, c.workspace]), [["materialize_workspace", "w"], ["send_message", "w"]], "never without a workspace");

  const refusing = (code: string, detail: unknown) => {
    const link = fakeLink({});
    link.call = (id, command, workspace) => {
      link.calls.push({ id, command, workspace, args: {} });
      return Promise.reject({ code, detail });
    };
    return link;
  };
  const mismatch = setup({ cmp_vm: refusing("workspace_mismatch", null) });
  await mismatch.router.handle("list_workspaces");
  await assert.rejects(mismatch.router.handle("rename_session", { project: "p1", id: "cmp_vm~t1", title: "x" }, on("cmp_vm")), (e: { what: string; detail: string }) => {
    assert.equal(e.detail, "workspace_mismatch");
    assert.equal(e.what, "Danil VM no deja hacer esto desde aquí: es de otro workspace o de otra cuenta.");
    return true;
  });
  const failed = setup({ cmp_vm: refusing("command_failed", "Por el relay, la llamada tiene que decir de qué workspace es.") });
  await failed.router.handle("list_workspaces");
  await assert.rejects(failed.router.handle("rename_session", { project: "p1", id: "cmp_vm~t1", title: "x" }, on("cmp_vm")), (e: { what: string }) => e.what === "Por el relay, la llamada tiene que decir de qué workspace es.");
  const scoped = setup({ cmp_vm: refusing("command_not_allowed", { command: "rename_session", scope: "machine" }) });
  await scoped.router.handle("list_workspaces");
  await assert.rejects(scoped.router.handle("rename_session", { project: "p1", id: "cmp_vm~t1", title: "x" }, on("cmp_vm")), (e: { what: { clave: string } }) => e.what.clave === "shell.service.command");
  // danil-labs/danil-engine#329: el rechazo del encargado conserva su frase y su motivo.
  const reason = { reason: "El motor todavía no tiene un adaptador certificado que aplique estos límites.", alternatives: [] };
  const handler = setup({ cmp_vm: refusing("handler_limit_unenforceable", reason) });
  await handler.router.handle("list_workspaces");
  await assert.rejects(handler.router.handle("send_message", { project: "p1", session: "cmp_vm~t1", prompt: "hola" }, on("cmp_vm")), (e: { what: { clave: string }; detail: unknown }) => {
    assert.equal(e.what.clave, "cli.error.handler_limit_unenforceable");
    assert.deepEqual(e.detail, { code: "handler_limit_unenforceable", detail: reason });
    return true;
  });
});

test("set_session_provider de una tarea de la VM llega a su motor con su workspace y no toca el de esta ventana", async () => {
  const vm = fakeLink({ set_session_provider: null });
  const { router, native } = setup({ cmp_vm: vm });
  await router.handle("list_workspaces");
  native.length = 0;
  const result = await router.handle(
    "set_session_provider",
    { project: "p1", session: "cmp_vm~t1", provider: "codex" },
    { headers: { "x-terminus-machine": "cmp_vm", "x-terminus-workspace": "w" } },
  );
  assert.equal(result, null);
  assert.deepEqual(vm.calls.map((c) => [c.command, c.args, c.workspace]), [
    ["set_session_provider", { project: "p1", session: "t1", provider: "codex" }, "w"],
  ]);
  assert.equal(native.filter((c) => c.command === "set_session_provider").length, 0, "this computer's engine never sees it");
});

test("CASE 3: a task created on the VM from this window's space lands in THAT space, shared first with the account", async () => {
  const vm = fakeLink({
    send_message: "t9",
    list_live_sessions: [{ ...row("t9", "vm"), space: "s1" }],
  });
  const { router, fleet, native } = setup(
    { cmp_vm: vm },
    {
      share_space: { id: "s1", name: "Trabajo", folders: [], created_at: 1, updated_at: 1, account: true },
      list_live_sessions: [],
    },
  );
  fleet.setRegistry([{ id: "w", name: "W", projects: [], computers: ["cmp_vm"] }]);
  await router.handle("list_workspaces");
  const task = await router.handle("send_message", { provider: "claude", project: "p1", session: null, prompt: "hola", space: "s1" }, on("cmp_vm"));
  assert.equal(task, "cmp_vm~t9");
  const shared = native.findIndex((c) => c.command === "share_space");
  assert.ok(shared >= 0, "this computer shares its space with the account before");
  assert.deepEqual(native[shared].args, { id: "s1" });
  const sent = vm.calls.find((c) => c.command === "send_message");
  assert.equal(sent?.args.space, "s1", "the VM gets the same space id");

  // The VM's row names that same space, bare: the window paints it in that space.
  await router.handle("list_live_sessions", { project: "p1" });
  await sleep(300);
  const rows = (await router.handle("list_live_sessions", { project: "p1" })) as { id: string; space: string }[];
  assert.deepEqual(rows.map((r) => [r.id, r.space]), [["cmp_vm~t9", "s1"]]);

  // Once shared, the next one does not ask again.
  await router.handle("send_message", { provider: "claude", project: "p1", session: null, prompt: "otra", space: "s1" }, on("cmp_vm"));
  assert.equal(native.filter((c) => c.command === "share_space").length, 1);
});

test("a space that cannot be shared (workspace without account, older engine) is not sent: the task is born as before", async () => {
  const vm = fakeLink({ send_message: "t9" });
  const { router, fleet } = setup({ cmp_vm: vm });
  fleet.setRegistry([{ id: "w", name: "W", projects: [], computers: ["cmp_vm"] }]);
  await router.handle("list_workspaces");
  await router.handle("send_message", { provider: "claude", project: "p1", session: null, prompt: "hola", space: "s1" }, on("cmp_vm"));
  assert.equal(vm.calls.find((c) => c.command === "send_message")?.args.space, null);
});

test("archiving or deleting a task of an off machine (Mac or VM) is queued by the relay: no error, no wake, and the list rereads", async () => {
  const mac = fakeLink({}, "offline");
  const vm = fakeLink({}, "stopped");
  const { router, changes } = setup({ cmp_mac: mac, cmp_vm: vm });
  assert.equal(await router.handle("set_task_archived", { project: "p1", id: "cmp_mac~t1", archived: true }, on("cmp_mac")), null);
  assert.equal(await router.handle("delete_session", { project: "p1", id: "cmp_vm~t2", force: false }, on("cmp_vm")), null);
  assert.deepEqual(mac.calls.map((c) => [c.command, c.args]), [["set_task_archived", { project: "p1", id: "t1", archived: true }]]);
  assert.deepEqual(vm.calls.map((c) => c.command), ["delete_session"], "the VM is not started first");
  await sleep(300);
  assert.ok(changes.flat().includes("sessions"), "the task list reads again");
  // Lo que corre un agente sigue diciendo que la Mac está apagada.
  await assert.rejects(router.handle("send_message", { project: "p1", session: "cmp_mac~t1", prompt: "hola" }, on("cmp_mac")), (e: { detail: string }) => e.detail === "machine_off");
});

/**
 * Una VM apagada que enciende de verdad: el plano de control (`wake`) la pone
 * `starting` y luego `online`; mientras, como el relay, una intención espera
 * guardada y se entrega una vez al conectar, y cualquier otra acción contesta `machine_off`.
 */
function bootingVm(answers: Record<string, unknown>, starts: (() => boolean) = () => true) {
  let state: "stopped" | "starting" | "online" = "stopped";
  const listeners = new Set<(s: string) => void>();
  const delivered: Call[] = [];
  const waiting: (() => void)[] = [];
  const set = (next: typeof state) => {
    state = next;
    for (const l of [...listeners]) l(next);
    if (next === "online") for (const deliver of waiting.splice(0)) deliver();
  };
  const woken: string[] = [];
  const link: Link = {
    state: () => state,
    call(id, command, workspace, _folder, args) {
      return new Promise((resolve, reject) => {
        const deliver = () => {
          delivered.push({ id, command, workspace, args: args as Args });
          resolve({ value: answers[command] ?? null, cached: null });
        };
        if (state === "online") return deliver();
        if (classOf(command) === "intent") {
          waiting.push(deliver);
          if (state === "stopped") {
            set("starting");
            setTimeout(() => set("online"), 20);
          }
          return;
        }
        reject({ code: "machine_off" });
      });
    },
    onState: (l) => {
      listeners.add(l as (s: string) => void);
      return () => listeners.delete(l as (s: string) => void);
    },
    onEvents: () => () => {},
    subscribe() {},
    start() {},
    close() {},
  };
  const wake = async (machine: string) => {
    woken.push(machine);
    if (!starts()) return false;
    set("starting");
    setTimeout(() => set("online"), 20);
    return true;
  };
  return { link, wake, woken, delivered };
}

function bootSetup(vm: ReturnType<typeof bootingVm>) {
  const fleet = new Fleet({ self: "cmp_home", connect: () => vm.link, wake: vm.wake, deadlines: { read: 40, action: 200, intent: 400 } });
  const router = createRouter({
    self: "cmp_home",
    fleet,
    native: async (command) => (command === "list_workspaces" ? { workspaces: [{ id: "w", name: "W" }], active: "w" } : null),
  });
  fleet.setMachines([VM]);
  return router;
}

test("a new task on an off VM: the carry key wakes it once through the control plane, and the first message is delivered exactly once there", async () => {
  const vm = bootingVm({ work_key: { publicKey: "k" }, send_message: "t9" });
  const router = bootSetup(vm);
  await router.handle("list_workspaces");
  // Antes del primer mensaje en otra máquina el escritorio pide la llave del destino: es una acción, no una intención.
  assert.deepEqual(await router.handle("work_key", {}, on("cmp_vm")), { publicKey: "k" });
  assert.deepEqual(vm.woken, ["cmp_vm"], "the control plane is asked to start it, once");
  const task = await router.handle("send_message", { provider: "claude", project: "p1", session: null, prompt: "hola" }, on("cmp_vm"));
  assert.equal(task, "cmp_vm~t9");
  assert.deepEqual(vm.delivered.map((c) => c.command), ["work_key", "send_message"], "each one reaches the engine once");
  assert.deepEqual(vm.woken, ["cmp_vm"], "an awake VM is not started again");
});

test("an off VM that is only sent a message is started by the relay: no control-plane call, delivered once when it connects", async () => {
  const vm = bootingVm({ send_message: "t9" });
  const router = bootSetup(vm);
  await router.handle("list_workspaces");
  assert.equal(await router.handle("send_message", { provider: "claude", project: "p1", session: null, prompt: "hola" }, on("cmp_vm")), "cmp_vm~t9");
  assert.deepEqual(vm.woken, []);
  assert.equal(vm.delivered.filter((c) => c.command === "send_message").length, 1);
});

test("when the control plane refuses to start the VM (the 401 of 2026-10-23) the window says it could not start, and nothing is sent", async () => {
  const vm = bootingVm({ work_key: { publicKey: "k" } }, () => false);
  const router = bootSetup(vm);
  await router.handle("list_workspaces");
  await assert.rejects(router.handle("work_key", {}, on("cmp_vm")), (e: { detail: string }) => e.detail === "start_failed");
  assert.deepEqual(vm.delivered, []);
});


test("a VM archive event refreshes its task list inside the read throttle", async () => {
  const answers: Record<string, unknown> = {
    list_workspaces: { workspaces: [{ id: "w", name: "W" }], active: "w" },
    list_live_sessions: [row("remote")],
  };
  const { router, changes } = setup({ cmp_vm: fakeLink(answers) });
  await router.handle("list_workspaces");
  const args = { project: "p1" };
  await router.handle("list_live_sessions", args);
  await sleep(250);
  assert.ok((await router.handle("list_live_sessions", args) as { id: string }[]).some(r => r.id === "cmp_vm~remote"));
  changes.length = 0;
  answers.list_live_sessions = [];
  router.events("cmp_vm", [{ name: "session", payload: { workspace: "w", project: "p1", session: "cmp_vm~remote" } }]);
  await router.handle("list_live_sessions", args);
  await sleep(250);
  assert.ok(changes.some(c => c.includes("sessions")));
  assert.deepEqual((await router.handle("list_live_sessions", args) as { id: string }[]).map(r => r.id), ["t1"]);
});


test("local composer mentions omit about with or without the machine router", async () => {
  const { router, native } = setup({});
  const mention = { target: { kind: "task", projectId: "p1", sessionId: "t1", about: { title: "Local task" } }, start: 0, end: 2, text: "@x" };
  const clean = { target: { kind: "task", projectId: "p1", sessionId: "t1" }, start: 0, end: 2, text: "@x" };
  try {
    for (const key of ["taskMentions", "task_mentions"]) {
      const args = { project: "p1", session: "t9", prompt: "@x", [key]: [mention] };
      assert.deepEqual(withoutAbout(args)?.[key], [clean], "direct native IPC");
      await router.handle("send_message", args);
      assert.deepEqual(native.at(-1)?.args[key], [clean], "native IPC with the account router");
      assert.equal(mention.target.about.title, "Local task", "the draft keeps its display metadata");
    }
  } finally {
    router.close();
  }
});

test("explicit local storage never falls back and its disk listing stays direct", async () => {
  const vm = fakeLink({ list_workspaces: { workspaces: [{ id: "remote", name: "Remote" }], active: "remote" }, reclaim_storage: { bytes: 999 } });
  const resources = { measured_at: 1, storage: [] };
  const { router, native, fleet } = setup({ cmp_vm: vm }, { list_workspaces: { workspaces: [{ id: "w", name: "W" }], active: "w", machine_resources: resources }, reclaim_storage: { bytes: 1 } });
  await router.handle("list_workspaces");
  fleet.setRegistry([{ id: "remote", name: "Remote", computers: ["cmp_vm"] }] as never);
  await router.handle("set_active_workspace", { id: "remote" });
  const target = { headers: { "x-terminus-machine": "cmp_home", "x-terminus-workspace": "remote" } };
  await assert.rejects(router.handle("reclaim_storage", {}, target), (error: { detail: string }) => error.detail === "workspace_missing");
  assert.equal(vm.calls.filter((call) => call.command === "reclaim_storage").length, 0);
  assert.equal(native.filter((call) => call.command === "reclaim_storage").length, 0);
  const result = await router.handle("list_workspaces", {}, target) as { machine_resources?: unknown };
  assert.deepEqual(result.machine_resources, resources);
  assert.equal(router.activeWorkspace(), "remote");
  assert.equal(new Headers((native.at(-1)?.options as { headers?: HeadersInit })?.headers).get("x-terminus-workspace"), null);
  router.close();
});


test("web source origins survive collisions and outdated owners without falling back to task routing", async () => {
  for (const replies of [["cmp_mac", "cmp_vm"], ["cmp_vm", "cmp_mac"]]) {
    const listing = (root: string | null, machine: string) => ({ workspaces: [{ id: "w", context_root: root, logo: `/${machine}/logo` }], active: "w" });
    const vmAnswers: Record<string, unknown> = { list_workspaces: listing(null, "vm"), list_sources: [{ id: "same" }], remove_source: "vm", list_mentions: "vm", set_source_branch: "vm" };
    const macAnswers: Record<string, unknown> = { list_workspaces: listing("root", "mac"), list_sources: [{ id: "same" }], remove_source: "mac" };
    const links = { cmp_vm: fakeLink(vmAnswers), cmp_mac: fakeLink(macAnswers) };
    const fleet = new Fleet({ self: null, connect: (info) => links[info.id as keyof typeof links], deadlines: { read: 40, action: 200, intent: 400 } });
    fleet.setMachines([VM, MAC]);
    const router = createRouter({ self: null, fleet, native: null });
    const first = await router.handle("list_workspaces") as { workspaces: { logo: string }[] };
    assert.equal(first.workspaces[0].logo, "cmp_mac~/mac/logo", "root and local metadata use the same envelope");
    for (const machine of replies) await router.handle("list_sources", {}, on(machine));
    await assert.rejects(router.handle("remove_source", { source: "same" }), (error: { detail: string }) => error.detail === "context_ambiguous");
    assert.equal(await router.handle("remove_source", { source: "same" }, on("cmp_mac")), "mac", "the explicit envelope resolves a collision");
    vmAnswers.list_workspaces = listing("another-root", "vm");
    fleet.setMachines([VM, { ...MAC, outdated: true }]);
    const partial = await router.handle("list_workspaces") as { workspaces: { context_root: string }[] };
    assert.equal(partial.workspaces[0].context_root, "root", "an outdated owner is not replaced by an unrelated catalog");
    assert.deepEqual(await router.handle("list_sources"), [{ id: "same" }], "the cached owner remains authoritative");
    assert.equal(await router.handle("list_mentions"), "vm");
    assert.equal(await router.handle("set_source_branch", { project: "p", source: "same" }), "vm", "project mutations retain their existing routing");
    macAnswers.list_workspaces = listing(null, "mac");
    fleet.setMachines([VM, MAC]);
    const refreshed = await router.handle("list_workspaces") as { workspaces: { context_root: string }[] };
    assert.equal(refreshed.workspaces[0].context_root, "another-root", "a confirmed absence releases the previous owner");
    macAnswers.list_sources = [];
    await router.handle("list_sources", {}, on("cmp_mac"));
    assert.equal(await router.handle("remove_source", { source: "same" }), "vm", "a refreshed catalog removes obsolete collisions");
    fleet.close();
  }
});

test("handler approvals never fall back from a remote destination to the native engine", async () => {
  const vm = fakeLink({});
  const { router, native } = setup({ cmp_vm: vm }, { handler_action: { released: true } });
  await router.handle("list_workspaces");
  native.length = 0;
  const args = { input: { workspace: "w", project: "p1", request: { action: "release", name: "reviewer" } } };
  await assert.rejects(router.handle("handler_action", args, on("cmp_vm")));
  assert.equal(native.length, 0);
  assert.equal(vm.calls.length, 0);
  assert.deepEqual(await router.handle("handler_action", args), { released: true });
  assert.equal(native[0].command, "handler_action");
  assert.equal((native[0].args.input as Args).workspace, "w");
});

test("an off machine's summary comes from its saved copy with its time, without waking it; with no copy it is machine_off", async () => {
  const copy = { workspaces: [{ id: "w", name: "W" }], active: "w", machine_resources: { measured_at: 1, storage: [] } };
  const vm = fakeLink({}, "offline");
  const call = vm.call;
  vm.call = (id, command, workspace, folder, args, timeout) => command === "list_workspaces"
    ? (vm.calls.push({ id, command, workspace, args: args as Args }), Promise.resolve({ value: copy, cached: { updated_at: "2026-10-29T10:00:00Z" } }))
    : call(id, command, workspace, folder, args, timeout);
  const mac = fakeLink({}, "offline");
  const { router } = setup({ cmp_vm: vm, cmp_mac: mac });
  const summary = await router.handle("list_workspaces", {}, on("cmp_vm")) as { cached_at: number; machine_resources: unknown };
  assert.equal(summary.cached_at, Date.parse("2026-10-29T10:00:00Z"), "the copy keeps its own time");
  assert.deepEqual(summary.machine_resources, copy.machine_resources);
  assert.deepEqual(vm.calls.map((c) => c.command), ["list_workspaces"], "a read, never a wake");
  await assert.rejects(router.handle("list_workspaces", {}, on("cmp_mac")), (e: { detail: string }) => e.detail === "machine_off");
  const list = await router.handle("machine_list") as { id: string; on: boolean; power?: string }[];
  assert.deepEqual(list.map((m) => [m.id, m.on, m.power]), [["cmp_home", true, "on"], ["cmp_vm", false, "off"], ["cmp_mac", false, "off"]]);
});

test("a machine-usage event from another machine says which machine it came from", async () => {
  const delivered: { name: string; payload: unknown }[] = [];
  const fleet = new Fleet({ self: "cmp_home", connect: () => fakeLink({}), deadlines: { read: 40, action: 200, intent: 400 } });
  const router = createRouter({ self: "cmp_home", fleet, native: async () => null, deliver: (list) => void delivered.push(...list) });
  router.events("cmp_vm", [{ name: "machine-usage", payload: { kind: "left_running", workspace: "w", tasks: [] } }, { name: "session", payload: { id: "t1" } }]);
  assert.deepEqual(delivered.map((e) => e.payload), [{ kind: "left_running", workspace: "w", tasks: [], machine: "cmp_vm" }, { id: "t1" }]);
});

test("the router does not judge an MCP block: a link that is not the relay (a WSL distro) receives it, and a relay refusal reads as its phrase", async () => {
  const plain = JSON.stringify({ mcpServers: { acme: { command: "npx", env: { ACME_TOKEN: "abc123" } } } });
  const distro = fakeLink({ add_mcp_servers: 1 });
  const { router } = setup({ cmp_vm: distro });
  await router.handle("list_workspaces");
  assert.equal(await router.handle("add_mcp_servers", { bloque: plain }, on("cmp_vm")), 1);
  assert.deepEqual(distro.calls.map((c) => c.args.bloque), [plain], "the block arrives as written");

  const relay = fakeLink({ add_mcp_servers: () => Promise.reject({ code: "mcp_values_over_relay" }) });
  const other = setup({ cmp_vm: relay });
  await other.router.handle("list_workspaces");
  await assert.rejects(other.router.handle("add_mcp_servers", { bloque: plain }, on("cmp_vm")), (e: { detail: string; what: string }) => {
    assert.equal(e.detail, "mcp_values_over_relay");
    assert.ok(e.what.includes("${secret:env/*/"), "the catalog phrase, with the marker");
    return true;
  });
});

/** Una miembro, no la dueña: el workspace de la organización no está en su registro ni en esta computadora. */
const ORG = { id: "fqgx1w8m", name: "Danil Workspace" };
const ENDPOINT: MachineInfo = { id: "cmp_vm", name: "Nube IA", wakes: true, linked: new Set([ORG.id]), organization: { id: "org_01", workspaces: [ORG] } };
const MEMBER_REGISTRY = [{ id: "w", name: "W", projects: [], computers: ["cmp_home", "cmp_mac"] }];
type Row = { id: string; hosts: boolean | null; materializes?: boolean; refuses?: boolean };
const pickable = async (router: ReturnType<typeof setup>["router"]) => ((await router.handle("machine_list")) as Row[]).filter(runsWorkspace).map((m) => m.id);

test("a member in another workspace does not get the organization's server in «Ejecutar en»; the workspace switcher lists its workspace", async () => {
  const { router, fleet } = setup({ cmp_vm: fakeLink({}), cmp_mac: fakeLink({}) });
  fleet.setMachines([ENDPOINT, MAC]);
  fleet.setRegistry(MEMBER_REGISTRY);
  const listed = (await router.handle("list_workspaces")) as { workspaces: { id: string; name: string; machines?: string[] }[]; active: string };
  assert.equal(listed.active, "w");
  assert.deepEqual(listed.workspaces.map((w) => [w.id, w.name]), [["w", "W"], [ORG.id, ORG.name]], "the organization's workspace is one the window can open");
  assert.deepEqual(listed.workspaces.find((w) => w.id === ORG.id)?.machines, ["cmp_vm"]);
  assert.deepEqual(await pickable(router), ["cmp_home", "cmp_mac"], "Nube IA has no permission in «W»: it is not offered");
});

test("a member in the organization's workspace gets its server in «Ejecutar en», and a task is created there", async () => {
  const vm = fakeLink({ send_message: "t9" });
  const { router, fleet, native } = setup({ cmp_vm: vm, cmp_mac: fakeLink({}) }, {}, "cmp_mac");
  fleet.setMachines([ENDPOINT, MAC]);
  fleet.setRegistry(MEMBER_REGISTRY);
  await router.handle("list_workspaces");
  await router.handle("set_active_workspace", { id: ORG.id });
  assert.ok(!native.some((c) => c.command === "set_active_workspace" && c.args.id === ORG.id), "this computer's engine does not have it");
  assert.equal(((await router.handle("list_workspaces")) as { active: string }).active, ORG.id);
  assert.deepEqual(await pickable(router), ["cmp_vm"], "only the server: neither this computer nor the member's Mac may make it theirs");
  assert.equal(router.createsOn(ORG.id)?.machine, "cmp_vm", "a pick of «W» that has no permission here does not count");
  await router.handle("send_message", { project: "p1", prompt: "hola" });
  assert.deepEqual(vm.calls.map((c) => [c.command, c.workspace]), [["send_message", ORG.id]], "it runs on the server, with nothing to make its own");
});

test("the owner keeps the organization's workspace from the registry, and the server stays out of her other workspaces", async () => {
  const { router, fleet } = setup({ cmp_vm: fakeLink({}), cmp_mac: fakeLink({}) }, { list_workspaces: { workspaces: [{ id: "w", name: "W" }, ORG], active: "w" } });
  fleet.setMachines([ENDPOINT, MAC]);
  fleet.setRegistry([...MEMBER_REGISTRY, { id: ORG.id, name: ORG.name, projects: [], computers: ["cmp_home"] }]);
  const listed = (await router.handle("list_workspaces")) as { workspaces: { id: string }[] };
  assert.deepEqual(listed.workspaces.map((w) => w.id), ["w", ORG.id], "once, from her own list");
  assert.deepEqual(await pickable(router), ["cmp_home", "cmp_mac"]);
  await router.handle("set_active_workspace", { id: ORG.id });
  assert.deepEqual(await pickable(router), ["cmp_home", "cmp_vm", "cmp_mac"], "in it, the server and her machines that may make it theirs");
});

test("a member of two organization workspaces gets both in the switcher, and the server in «Ejecutar en» only inside them", async () => {
  const FOUNDATION = { id: "fnd00001", name: "Danil Foundation" };
  const { router, fleet } = setup({ cmp_vm: fakeLink({}), cmp_mac: fakeLink({}) }, {}, "cmp_mac");
  fleet.setMachines([{ ...ENDPOINT, linked: new Set([ORG.id, FOUNDATION.id]), organization: { id: "org_01", workspaces: [ORG, FOUNDATION] } }, MAC]);
  fleet.setRegistry(MEMBER_REGISTRY);
  const listed = (await router.handle("list_workspaces")) as { workspaces: { id: string; name: string; machines?: string[] }[] };
  assert.deepEqual(listed.workspaces.map((w) => [w.id, w.name]), [["w", "W"], [ORG.id, ORG.name], [FOUNDATION.id, FOUNDATION.name]]);
  assert.deepEqual(listed.workspaces.slice(1).map((w) => w.machines), [["cmp_vm"], ["cmp_vm"]], "both served by the same endpoint");
  assert.deepEqual(await pickable(router), ["cmp_home", "cmp_mac"], "not in the member's own workspace");
  for (const ws of [ORG.id, FOUNDATION.id]) {
    await router.handle("set_active_workspace", { id: ws });
    assert.deepEqual(await pickable(router), ["cmp_vm"], `only the server in ${ws}`);
    assert.equal(router.createsOn(ws)?.machine, "cmp_vm");
  }
});

test("with the engine's view, an organization's workspace stays in the switcher while an unlinked local workspace is open, until the engine removes it", async () => {
  const FOUNDATION = { id: "fnd00001", name: "Danil Foundation" };
  let known: EngineWorkspace[] | null = [
    { id: "solo", name: "Solo", local: true, organization: false, machines: [] },
    { id: FOUNDATION.id, name: FOUNDATION.name, local: false, organization: true, machines: ["cmp_vm"] },
  ];
  const { router, fleet } = setup({ cmp_vm: fakeLink({}), cmp_mac: fakeLink({}) }, { list_workspaces: { workspaces: [{ id: "solo", name: "Solo" }], active: "solo" } }, null, undefined, undefined, () => known);
  // La cuenta de la ventana no trae a Nube IA: el workspace abierto no es de ninguna cuenta.
  fleet.setMachines([MAC]);
  fleet.setRegistry(MEMBER_REGISTRY);
  const ids = async () => ((await router.handle("list_workspaces")) as { workspaces: { id: string }[] }).workspaces.map((w) => w.id);
  const listed = (await router.handle("list_workspaces")) as { workspaces: { id: string; name: string; machines?: string[] }[]; active: string };
  assert.equal(listed.active, "solo");
  assert.deepEqual(listed.workspaces.map((w) => [w.id, w.name]), [["solo", "Solo"], ["w", "W"], [FOUNDATION.id, FOUNDATION.name]], "the account's own, from the default session's registry, and the organization's");
  assert.deepEqual(listed.workspaces[2].machines, ["cmp_vm"]);

  fleet.setMachines([ENDPOINT, MAC]);
  assert.deepEqual(await pickable(router), ["cmp_home", "cmp_mac"], "«Ejecutar en» is still the open workspace's: Nube IA does not work in «Solo»");
  known = [...known.slice(0, 1), { id: FOUNDATION.id, name: FOUNDATION.name, local: false, organization: true, machines: ["cmp_vm"] }];
  assert.deepEqual(await ids(), ["solo", "w", FOUNDATION.id], "the fleet's own organization workspace does not count while the engine speaks");

  known = known.slice(0, 1);
  assert.deepEqual(await ids(), ["solo", "w"], "gone once the engine removed it");

  known = null;
  assert.deepEqual(await ids(), ["solo", "w", ORG.id], "an engine without the feature falls back to the fleet");
});

test("without `organization` in the row, the directory names the workspace an organization's VM brings", async () => {
  const directory = () => [{ workspace_id: "w", name: "W", owner: true }, { workspace_id: ORG.id, name: ORG.name, owner: false }];
  const { router, fleet } = setup({ cmp_vm: fakeLink({}) }, {}, null, undefined, directory);
  fleet.setMachines([{ id: "cmp_vm", name: "Nube IA", wakes: true, linked: new Set([ORG.id]) }]);
  fleet.setRegistry(MEMBER_REGISTRY);
  const listed = (await router.handle("list_workspaces")) as { workspaces: { id: string }[] };
  assert.ok(listed.workspaces.some((w) => w.id === ORG.id));
  assert.deepEqual(await pickable(router), ["cmp_home"]);
  await router.handle("set_active_workspace", { id: ORG.id });
  assert.deepEqual(await pickable(router), ["cmp_vm"]);
});

test("one's own VM still makes the open workspace its own, and an engine that cannot yet is shown, not hidden", async () => {
  const { router, fleet } = setup({ cmp_vm: fakeLink({}) });
  fleet.setMachines([{ ...VM, linked: new Set(["w2"]) }]);
  fleet.setRegistry([{ id: "w", name: "W", projects: [], computers: ["cmp_home"] }, { id: "w2", name: "W2", projects: [], computers: ["cmp_vm"] }]);
  await router.handle("list_workspaces");
  const row = ((await router.handle("machine_list")) as Row[]).find((m) => m.id === "cmp_vm") as Row;
  assert.deepEqual([row.hosts, row.materializes, row.refuses], [false, true, false]);
  assert.ok(runsWorkspace(row));
  assert.ok(runsWorkspace({ hosts: false, materializes: false, refuses: false }), "an old engine is the person's machine: it stays, disabled with its reason");
});

test("creating on a machine whose relay refuses the workspace names the machine and the way out", async () => {
  const vm = fakeLink({ send_message: () => Promise.reject({ code: "workspace_not_linked" }) });
  const { router, fleet } = setup({ cmp_vm: vm });
  fleet.setMachines([{ id: "cmp_vm", name: "Nube IA", wakes: true, linked: new Set(["org"]) }]);
  await router.handle("list_workspaces");
  await assert.rejects(router.handle("send_message", { project: "p1", prompt: "hola" }, on("cmp_vm")), (e: { what: string; detail: string }) => {
    assert.equal(e.detail, "workspace_not_linked");
    assert.equal(e.what, "Nube IA no trabaja en este workspace. Elige otra máquina en «Ejecutar en» o cambia a un workspace que tenga.");
    return true;
  });
});
