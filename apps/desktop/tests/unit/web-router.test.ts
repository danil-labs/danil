/**
 * La web sobre la flota compartida (`features/machines/router.ts` sin motor
 * propio, `@terminus/fleet`) con sesiones de relay falsas: abre con todo
 * apagado desde lo guardado, una máquina de otro contrato no tumba la lista,
 * actuar en la VM apagada la enciende, leer en ella sin copia la enciende y dice
 * «Encendiendo…», en la Mac apagada lo dice con su nombre
 * y los spaces de todas salen juntos.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { INTENT_COMMANDS, type MachineState, startedOf } from "@terminus/computers";
import { Fleet, type Link, type MachineInfo } from "@terminus/fleet";
import { delegatedOf, flattenTasks } from "@terminus/tasks";
import "../helpers/catalog.ts";
import { createRouter } from "../../src/features/machines/router.ts";

type Args = Record<string, unknown>;
type Call = { command: string; args: Args; workspace: string | null };

/** Una sesión de relay en memoria: una intención enciende la VM; `outdated`, otro contrato. */
function fakeLink(answers: Record<string, unknown>, initial: MachineState = "online", outdated = false) {
  let state = initial;
  const calls: Call[] = [];
  const listeners = new Set<(s: MachineState) => void>();
  const setState = (next: MachineState) => {
    state = next;
    for (const l of listeners) l(next);
  };
  const answer = (command: string, args: Args) => {
    const a = answers[command];
    return typeof a === "function" ? (a as (x: Args) => unknown)(args) : a;
  };
  const link: Link & { calls: Call[]; setState: typeof setState } = {
    calls,
    setState,
    state: () => state,
    call(_id, command, workspace, _folder, args) {
      calls.push({ command, workspace, args: args as Args });
      return new Promise((resolve, reject) => {
        if (outdated) return reject({ code: "version_mismatch" });
        if (state !== "online") {
          if (!INTENT_COMMANDS.has(command)) return reject({ code: "machine_off" });
          setState("starting");
          return void setTimeout(() => {
            setState("online");
            resolve({ value: answer(command, args as Args) ?? null, cached: null });
          }, 10);
        }
        if (answers[command] === undefined) return reject({ code: "command" });
        resolve({ value: answer(command, args as Args), cached: null });
      });
    },
    onState: (l) => {
      listeners.add(l);
      return () => void listeners.delete(l);
    },
    onEvents: () => () => {},
    subscribe() {},
    start() {},
    close() {},
  };
  return link;
}

const VM: MachineInfo = { id: "cmp_vm", name: "Danil VM", wakes: true };
const MAC: MachineInfo = { id: "cmp_mac", name: "Mac de Ana", wakes: false };
const REGISTRY = [{ id: "w", name: "Producto", computers: ["cmp_vm", "cmp_mac"], projects: [], settings: null, created_at: "2026-10-01T00:00:00Z" }];
const row = (id: string, title = id) => ({ id, title, updated_at: 0 });

function memoryStorage() {
  const items = new Map<string, string>();
  return { getItem: (k: string) => items.get(k) ?? null, setItem: (k: string, v: string) => void items.set(k, v), removeItem: (k: string) => void items.delete(k) };
}

function web(links: Record<string, ReturnType<typeof fakeLink>>, storage = memoryStorage(), wake?: (id: string) => Promise<boolean | "not_startable">, onSlices?: (changes: string[]) => void) {
  const fleet = new Fleet({ self: null, connect: (info) => links[info.id], storage, wake, deadlines: { read: 40, action: 200, intent: 400 } });
  const router = createRouter({ self: null, fleet, native: null, registry: async () => REGISTRY as never, onSlices });
  fleet.setMachines([VM, MAC].filter((m) => links[m.id]));
  return { router, fleet, storage };
}

const on = (machine: string) => ({ headers: { "x-terminus-machine": machine } });

test("with every machine off the page opens at once from the registry and the saved slice of each machine", async () => {
  const answers = (who: string) => ({ list_live_sessions: [row("t1", `de ${who}`)] });
  // Una visita anterior, con las dos encendidas, dejó guardado lo de cada una.
  const before = web({ cmp_vm: fakeLink(answers("vm")), cmp_mac: fakeLink(answers("mac")) });
  await before.router.handle("list_workspaces");
  const args = { project: "", open: [] };
  for (const m of ["cmp_vm", "cmp_mac"]) await before.fleet.read({ machine: m, workspace: "w", command: "list_live_sessions", args });
  before.fleet.flush();

  const vm = fakeLink(answers("vm"), "offline");
  const mac = fakeLink(answers("mac"), "offline");
  const { router } = web({ cmp_vm: vm, cmp_mac: mac }, before.storage);
  const started = Date.now();
  const listed = (await router.handle("list_workspaces")) as { workspaces: { id: string; machines: string[] }[]; active: string };
  assert.deepEqual(listed.workspaces.map((w) => [w.id, w.machines]), [["w", ["cmp_vm", "cmp_mac"]]], "the account's workspace, with its machines");
  assert.equal(listed.active, "w");
  const rows = (await router.handle("list_live_sessions", args)) as { id: string; title: string; machine: string; machine_status: string }[];
  assert.ok(Date.now() - started < 2_000, "under two seconds");
  assert.deepEqual(rows.map((r) => [r.id, r.title, r.machine_status]).sort(), [["cmp_mac~t1", "de mac", "cached"], ["cmp_vm~t1", "de vm", "cached"]], "the saved tasks of each, marked saved");
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(vm.calls.filter((c) => c.command === "list_live_sessions").length + mac.calls.filter((c) => c.command === "list_live_sessions").length, 0, "an off machine with a copy is not asked");
});

test("the web hides a delegated task under its launcher like the desktop, also from an off machine's saved copy", async () => {
  type Row = { id: string; created_at: number; launched_by?: string | null; parent?: string | null; launcher_available?: boolean };
  const rows = (prefix: string) => [
    { ...row("lanzador"), created_at: 3 },
    { ...row("delegada"), created_at: 2, launched_by: "lanzador", launcher_available: true },
    { ...row("huerfana"), created_at: 1, launched_by: "borrado", launcher_available: false },
  ].map((r) => ({ ...r, title: `${prefix} ${r.title}` }));
  const args = { project: "", open: [] };
  const before = web({ cmp_vm: fakeLink({ list_live_sessions: rows("vm") }), cmp_mac: fakeLink({ list_live_sessions: rows("mac") }) });
  await before.router.handle("list_workspaces");
  await before.fleet.read({ machine: "cmp_mac", workspace: "w", command: "list_live_sessions", args });
  before.fleet.flush();

  // La Mac está apagada: sus filas salen de lo guardado y siguen colgando de su lanzador.
  const { router } = web({ cmp_vm: fakeLink({ list_live_sessions: rows("vm") }), cmp_mac: fakeLink({ list_live_sessions: rows("mac") }, "offline") }, before.storage);
  await router.handle("list_workspaces");
  const listed = (await router.handle("list_live_sessions", args)) as Row[];
  const shown = flattenTasks({ "": listed }).map((t) => t.row.id).sort();
  assert.deepEqual(shown, ["cmp_mac~lanzador", "cmp_vm~lanzador"], "only tasks the person opened: a delegated one stays out, even if its launcher is gone");
  assert.deepEqual(delegatedOf(listed, "cmp_mac~lanzador").map((r) => r.id), ["cmp_mac~delegada"], "and the launcher's panel finds its own");
});

test("a machine of another contract shows outdated in its slice and the page still answers with the others", async () => {
  const vm = fakeLink({ list_live_sessions: [row("t1")] });
  const mac = fakeLink({}, "online", true);
  const { router, fleet } = web({ cmp_vm: vm, cmp_mac: mac });
  await router.handle("list_workspaces");
  const rows = (await router.handle("list_live_sessions", { project: "", open: [] })) as { id: string }[];
  assert.deepEqual(rows.map((r) => r.id), ["cmp_vm~t1"]);
  assert.equal(fleet.sliceStatuses().cmp_mac.status, "outdated", "its slice says outdated");
  assert.equal(fleet.power("cmp_mac"), "outdated");
  await assert.rejects(router.handle("send_message", { project: "p1", session: "cmp_mac~t1", prompt: "hola" }, on("cmp_mac")), (e: { detail: string; what: string }) => e.detail === "version_mismatch" && e.what.includes("Mac de Ana"));
});

test("a message to a task of the VM that is off wakes it and is delivered; to the Mac that is off it says so by name, showing the last", async () => {
  const vm = fakeLink({ send_message: "t9" }, "offline");
  const mac = fakeLink({ load_session: ({ id }: Args) => ({ id, turns: [{ id: "u1" }] }) }, "online");
  const { router } = web({ cmp_vm: vm, cmp_mac: mac });
  await router.handle("list_workspaces");
  const sent = await router.handle("send_message", { project: "p1", session: "cmp_vm~t1", prompt: "hola" }, on("cmp_vm"));
  assert.equal(sent, "cmp_vm~t9");
  assert.deepEqual(vm.calls.filter((c) => c.command === "send_message").map((c) => [c.args.session, c.workspace]), [["t1", "w"]], "delivered with its own id and the envelope's workspace");

  // La Mac se leyó encendida y después se apagó: su tarea sigue a la vista.
  await router.handle("load_session", { project: "p1", id: "cmp_mac~t2" }, on("cmp_mac"));
  mac.setState("offline");
  const seen = (await router.handle("load_session", { project: "p1", id: "cmp_mac~t2" }, on("cmp_mac"))) as { id: string };
  assert.equal(seen.id, "cmp_mac~t2", "the last it said is still visible");
  await assert.rejects(router.handle("send_message", { project: "p1", session: "cmp_mac~t2", prompt: "hola" }, on("cmp_mac")), (e: { detail: string; what: string }) => {
    assert.equal(e.detail, "machine_off");
    assert.match(e.what, /Mac de Ana está sin conexión/);
    return true;
  });
  assert.equal(mac.calls.filter((c) => c.command === "send_message").length, 0, "nothing was sent to it");
});

test("the spaces of the Mac and of the VM come out together, each with its machine", async () => {
  const vm = fakeLink({ list_spaces: [{ id: "s1", name: "VM", folders: [] }] });
  const mac = fakeLink({ list_spaces: [{ id: "s1", name: "Mac", folders: [] }] });
  const { router } = web({ cmp_vm: vm, cmp_mac: mac });
  await router.handle("list_workspaces");
  const first = (await router.handle("list_spaces")) as { id: string; name: string }[];
  assert.deepEqual(first.map((s) => [s.id, s.name]), [["cmp_vm~s1", "VM"], ["cmp_mac~s1", "Mac"]]);
  await router.handle("rename_space", { id: "cmp_mac~s1", name: "Mac nueva" }, on("cmp_mac")).catch(() => null);
  assert.deepEqual(mac.calls.filter((c) => c.command === "rename_space").map((c) => c.args.id), ["s1"], "renaming goes only to its machine");
});

test("nobody answering is a named error, never an empty list", async () => {
  const mac = fakeLink({}, "offline");
  const { router } = web({ cmp_mac: mac });
  await router.handle("list_workspaces");
  await assert.rejects(router.handle("list_live_sessions", { project: "", open: [] }), (e: { detail: string; what: string }) => e.detail === "machine_off" && /Mac de Ana está sin conexión/.test(e.what));
});

test("an off VM with nothing saved is started once by the first read and says it is starting, not that Danil is closed", async () => {
  const vm = fakeLink({ list_live_sessions: [row("t1")] }, "offline");
  const starts: string[] = [];
  const reread: string[][] = [];
  const { router } = web({ cmp_vm: vm }, memoryStorage(), async (id) => {
    starts.push(id);
    setTimeout(() => vm.setState("starting"), 1);
    setTimeout(() => vm.setState("online"), 15);
    return true;
  }, (changes) => reread.push(changes));
  await router.handle("list_workspaces");
  const args = { project: "", open: [] };
  for (let i = 0; i < 2; i++) {
    await assert.rejects(router.handle("list_live_sessions", args), (e: { detail: string; what: string }) => {
      assert.equal(e.detail, "machine_starting");
      assert.equal(e.what, "Encendiendo Danil VM…");
      return true;
    });
  }
  assert.deepEqual(starts, ["cmp_vm"], "two reads while it starts ask the control plane once");
  await new Promise((r) => setTimeout(r, 40));
  assert.ok(reread.some((c) => c.includes("sessions") && c.includes("projects")), "once online the window is told to read again");
  const rows = (await router.handle("list_live_sessions", args)) as { id: string }[];
  assert.deepEqual(rows.map((r) => r.id), ["cmp_vm~t1"], "once online, the same read answers");
});

test("a VM the control plane could not start says so by name, and is asked again only after a while", async () => {
  const vm = fakeLink({}, "offline");
  const starts: string[] = [];
  const { router } = web({ cmp_vm: vm }, memoryStorage(), async (id) => {
    starts.push(id);
    return false;
  });
  await router.handle("list_workspaces");
  const args = { project: "", open: [] };
  await assert.rejects(router.handle("list_live_sessions", args), (e: { detail: string }) => e.detail === "machine_starting");
  await new Promise((r) => setTimeout(r, 10));
  await assert.rejects(router.handle("list_live_sessions", args), (e: { detail: string; what: string }) => {
    assert.equal(e.detail, "start_failed");
    assert.match(e.what, /^No pudimos encender Danil VM\. .*hola@danil\.ai/);
    return true;
  });
  assert.deepEqual(starts, ["cmp_vm"], "a failed start is not retried on every read");
});

test("an own computer listed as startable stays «sin conexión» once the control plane says it does not start it", async () => {
  const vm = fakeLink({}, "offline");
  let starts = 0;
  const { router } = web({ cmp_vm: vm }, memoryStorage(), async () => {
    starts++;
    return "not_startable";
  });
  await router.handle("list_workspaces");
  const args = { project: "", open: [] };
  await assert.rejects(router.handle("list_live_sessions", args), (e: { detail: string }) => e.detail === "machine_starting");
  await new Promise((r) => setTimeout(r, 10));
  await assert.rejects(router.handle("list_live_sessions", args), (e: { detail: string; what: string }) => e.detail === "machine_off" && /Danil VM está sin conexión/.test(e.what));
  assert.equal(starts, 1);
});

test("the start answer of the control plane reads as started, failed or not startable", () => {
  assert.equal(startedOf({ kind: "ok", value: { state: "starting" } }), true);
  assert.equal(startedOf({ kind: "error", status: 409, code: "not_remotely_startable" }), "not_startable");
  assert.equal(startedOf({ kind: "error", status: 409, code: "start_failed" }), false);
  assert.equal(startedOf({ kind: "license" }), false);
});

test("web account creation, listing and login carry the selected workspace", async () => {
  const vm = fakeLink({
    add_account: { id: "a1" },
    list_accounts: { accounts: [{ id: "a1" }], active: "a1" },
    login_account: null,
  });
  const { router } = web({ cmp_vm: vm });
  try {
    await router.handle("list_workspaces");
    const created = await router.handle("add_account", { provider: "codex", label: "" }) as { id: string };
    await router.handle("list_accounts", { provider: "codex" });
    await router.handle("login_account", { provider: "codex", id: created.id, mode: "tuberia" }, on("cmp_vm"));
    const calls = vm.calls.filter((c) => /account/.test(c.command));
    assert.deepEqual(calls.map((c) => [c.command, c.workspace]), [["add_account", "w"], ["list_accounts", "w"], ["login_account", "w"]]);
    assert.equal(calls[2].args.id, "a1");
  } finally {
    router.close();
  }
});

test("on the web a prefixed task id goes to that machine when the call has no machine header", async () => {
  const vm = fakeLink({ task_history: { branch: "vm" } });
  const mac = fakeLink({ task_history: { branch: "mac" } });
  const { router } = web({ cmp_vm: vm, cmp_mac: mac });
  try {
    await router.handle("list_workspaces");
    const seen = await router.handle("task_history", { project: "p1", id: "cmp_mac~t2" }) as { branch: string };
    assert.equal(seen.branch, "mac");
    assert.deepEqual(mac.calls.filter((c) => c.command === "task_history").map((c) => c.args.id), ["t2"]);
    assert.equal(vm.calls.filter((c) => c.command === "task_history").length, 0);
  } finally {
    router.close();
  }
});

test("on the web a login follows the account id's machine, not the workspace lead", async () => {
  const account = (id: string, plan: string) => ({ id, identity: "ana", plan, authenticated_at: 1 });
  const vm = fakeLink({
    list_accounts: { accounts: [account("a1", "personal")], active: null },
    login_account: null,
  });
  const mac = fakeLink({
    list_accounts: { accounts: [account("a2", "team")], active: null },
    login_account: null,
  });
  const { router } = web({ cmp_vm: vm, cmp_mac: mac });
  try {
    await router.handle("list_workspaces");
    const list = await router.handle("list_accounts", { provider: "claude" }) as { accounts: { id: string }[] };
    const team = list.accounts.find((a) => a.id.startsWith("cmp_mac~"));
    assert.ok(team, "the Team card keeps the Mac's id");
    await router.handle("login_account", { provider: "claude", id: team.id, mode: "tuberia" });
    assert.deepEqual(mac.calls.filter((c) => c.command === "login_account").map((c) => c.args.id), ["a2"]);
    assert.equal(vm.calls.filter((c) => c.command === "login_account").length, 0);
  } finally {
    router.close();
  }
});

test("on the web arguments that name two machines are still refused", async () => {
  const vm = fakeLink({ send_message: "x" });
  const mac = fakeLink({ send_message: "x" });
  const { router } = web({ cmp_vm: vm, cmp_mac: mac });
  try {
    await router.handle("list_workspaces");
    await assert.rejects(
      router.handle("send_message", { project: "p1", session: "cmp_mac~t2", space: "cmp_vm~s1", prompt: "hola" }),
      (e: { detail: string }) => e.detail === "cross_machine",
    );
    assert.equal(vm.calls.filter((c) => c.command === "send_message").length, 0);
    assert.equal(mac.calls.filter((c) => c.command === "send_message").length, 0);
  } finally {
    router.close();
  }
});

test("web Git observes the machine before refreshing its PR after cached empty results", async () => {
  let observed = false;
  let restarted = false;
  const merged = { kind: "branch", branch: "feature", head: "head", repository: "repo", pull_known: true, stale: false, has_remote: true, merged_locally: false, pull: { number: 371, state: "merged", head_sha: "head" } };
  const mac = fakeLink({ list_session_git: async (args: Args) => {
    if (!restarted) return {};
    if (!args.remote) {
      await new Promise(resolve => setTimeout(resolve, 15));
      observed = true;
      return { task: { ...merged, pull: null, pull_known: false } };
    }
    return observed ? { task: merged } : {};
  } });
  const call = mac.call.bind(mac);
  mac.call = async (...args) => {
    const result = await call(...args);
    return { ...result, value: await result.value };
  };
  const { router } = web({ cmp_mac: mac });
  await router.handle("list_workspaces");
  const args = { project: "p", priority: ["cmp_mac~task"] };
  await router.handle("list_session_git", { ...args, remote: false });
  await router.handle("list_session_git", { ...args, remote: true });
  restarted = true;
  try {
    await router.handle("list_session_git", { ...args, remote: false });
    assert.equal(observed, true, "the local phase must reach the engine before the remote phase");
    const rows = await router.handle("list_session_git", { ...args, remote: true }) as Record<string, typeof merged>;
    assert.equal(rows["cmp_mac~task"].pull?.state, "merged");
  } finally { router.close(); }
});

test("web Git from an offline machine stays stale for fan and scoped reads", async () => {
  const mac = fakeLink({ list_session_git: { task: { kind: "branch", branch: "feature", head: "head", stale: false, pull_known: true, pull: { number: 371, state: "merged", head_sha: "head" } } } });
  const { router } = web({ cmp_mac: mac });
  await router.handle("list_workspaces");
  const args = { project: "p", remote: false, priority: ["cmp_mac~task"] };
  await router.handle("list_session_git", args);
  mac.setState("offline");
  try {
    for (const options of [undefined, on("cmp_mac")]) {
      const rows = await router.handle("list_session_git", args, options) as Record<string, { stale: boolean }>;
      assert.equal(rows["cmp_mac~task"].stale, true);
    }
  } finally { router.close(); }
});

test("desktop keeps a machine's known task rows while a new open list is pending, then accepts an empty answer", async () => {
  const vm = fakeLink({ list_live_sessions: [row("t1", "Remote B")] });
  const fleet = new Fleet({ self: "cmp_home", connect: () => vm, deadlines: { read: 200, action: 200, intent: 400 } });
  fleet.setMachines([VM]);
  const router = createRouter({ self: "cmp_home", fleet, native: async (command) =>
    command === "list_workspaces" ? { workspaces: [{ id: "w" }], active: "w" } : [row("local")] });
  await router.handle("list_workspaces");
  const envelope = { machine: "cmp_vm", workspace: "w", command: "list_live_sessions", args: { project: "p1", open: [] } };
  await fleet.read(envelope);
  const ids = (rows: unknown) => (rows as { id: string }[]).map((r) => r.id);
  assert.deepEqual(ids(await router.handle("list_live_sessions", envelope.args)), ["local", "cmp_vm~t1"]);

  const pending = new Map<string, (value: { value: unknown; cached: null }) => void>();
  vm.call = (_id, _command, workspace, _folder, args) => new Promise((resolve) => {
    pending.set(JSON.stringify([workspace, (args as Args).project]), resolve);
  });
  const opened = { project: "p1", open: ["cmp_vm~t1"] };
  const listed = (await router.handle("list_live_sessions", opened)) as { id: string; machine_status?: string }[];
  assert.deepEqual(ids(listed), ["local", "cmp_vm~t1"], "a missing slice is not an empty task list");
  assert.equal(listed[1].machine_status, "cached", "the previous observation is marked saved");
  assert.deepEqual(ids(await router.handle("list_live_sessions", { ...opened, project: "p2" })), ["local"], "another folder cannot inherit these rows");
  assert.deepEqual(ids(await router.handle("list_live_sessions", opened, { headers: { "x-terminus-workspace": "w2" } })), ["local"], "another workspace cannot inherit these rows");
  const completed = fleet.read({ ...envelope, args: opened });
  pending.get(JSON.stringify(["w", "p1"]))!({ value: [], cached: null });
  await completed;
  assert.deepEqual(ids(await router.handle("list_live_sessions", opened)), ["local"], "a successful empty response removes the old rows");
  for (const finish of pending.values()) finish({ value: [], cached: null });
  router.close();
});

test("web publishes available slices while a cold machine is still pending, then announces late data", async () => {
  const slow = fakeLink({});
  const pending: { command: string; resolve: (answer: { value: unknown; cached: null }) => void }[] = [];
  slow.call = (_id, command) => new Promise(resolve => { pending.push({ command, resolve }); });
  const fast = fakeLink({ list_workspaces: { workspaces: [{ id: "w" }], active: "w" }, list_live_sessions: [row("fast")], list_projects: [] });
  const fleet = new Fleet({ self: null, connect: info => info.id === VM.id ? slow : fast, deadlines: { read: 2000 } });
  fleet.setMachines([VM, MAC]);
  const changes: string[] = [];
  const router = createRouter({ self: null, fleet, native: null, registry: async () => REGISTRY as never, onSlices: batch => changes.push(...batch) });
  try {
    const started = Date.now();
    await router.handle("list_workspaces");
    const initial = await router.handle("list_live_sessions", { project: "p1", open: [] }) as { id: string }[];
    assert.ok(Date.now() - started < 800, "the slow machine's deadline is outside the initial render");
    assert.deepEqual(initial.map(r => r.id), ["cmp_mac~fast"]);
    const listing = pending.find(read => read.command === "list_workspaces")!;
    const tasks = pending.find(read => read.command === "list_live_sessions")!;
    listing.resolve({ value: { workspaces: [{ id: "w" }], active: "w" }, cached: null });
    tasks.resolve({ value: [row("late")], cached: null });
    await new Promise(resolve => setTimeout(resolve, 250));
    assert.ok(changes.includes("workspaces"));
    assert.ok(changes.includes("sessions"));
    const retained = await router.handle("list_live_sessions", { project: "p1", open: ["cmp_vm~late"] }) as { id: string }[];
    assert.ok(retained.some(r => r.id === "cmp_vm~late"), "a pending open slice retains the machine's last rows");
    const latest = pending.filter(read => read.command === "list_live_sessions").at(-1)!;
    latest.resolve({ value: [], cached: null });
    await new Promise(resolve => setTimeout(resolve, 0));
    const empty = await router.handle("list_live_sessions", { project: "p1", open: ["cmp_vm~late"] }) as { id: string }[];
    assert.ok(!empty.some(r => r.id === "cmp_vm~late"), "a confirmed empty response clears the old slice");
  } finally {
    for (const read of pending) read.resolve({ value: [], cached: null });
    router.close();
  }
});

test("web history forwards its cursor to the host and preserves its bounded page", async () => {
  const mac = fakeLink({ load_session: ({ history_request }: Args) => ({
    id: "t1", turns: [{ id: "a", text: "last" }],
    history: { version: 1, revision: "r1", start: 5, end: 6, total: 7, has_more: true },
    requested: history_request,
  }) });
  const { router } = web({ cmp_mac: mac });
  try {
    const page = await router.handle("load_history", { project: "p1", id: "cmp_mac~t1", before: 6 }, on("cmp_mac")) as { history: { start: number }; requested: unknown };
    assert.equal(page.history.start, 5);
    assert.deepEqual(mac.calls[0].args.history_request, { version: 1, before: 6, revision: null });
    assert.equal(mac.calls[0].command, "load_session");
    assert.equal(mac.calls[0].args.id, "t1");
  } finally { router.close(); }
});
