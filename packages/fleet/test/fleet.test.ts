/**
 * La flota con sesiones de relay falsas: la máquina sale solo del sobre, toda
 * espera tiene tope, una máquina que no contesta conserva su rebanada y nunca
 * se inventa una lista vacía.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { type CallResult, type DeferredFrame, type EventsPage, INTENT_COMMANDS, type MachineState, isDeferrable } from "../../computers/src/index.ts";
import { Fleet, type FleetError, type Link, type MachineInfo, PASSIVE, type Slice, SLICES_KEY, classOf } from "../src/index.ts";

type Answer = unknown | ((args: Record<string, unknown>) => unknown);
/**
 * `errors`: what the relay answers the next calls, in order, before answering normally.
 * `ticket`: the MVP data channel (`machine-session.v1`): an intent never starts the machine,
 * the call waits for a socket that cannot open until its deadline, like `RelaySession`.
 */
type FakeOptions = { state?: MachineState; answers?: Record<string, Answer>; delay?: number; cachedAt?: string | null; error?: string; errors?: string[]; ticket?: boolean };

/** Una sesión de relay en memoria: contesta de `answers`, tarda `delay` y vence como `RelaySession` (`io/timeout`). */
function fakeLink(options: FakeOptions = {}) {
  let state: MachineState = options.state ?? "online";
  const calls: { id: string; command: string; workspace: string | null; args: Record<string, unknown>; timeout?: number }[] = [];
  const stateListeners = new Set<(s: MachineState) => void>();
  const eventListeners = new Set<(p: EventsPage) => void>();
  const engineListeners = new Set<(e: { contract: string | null; host_version: string | null }) => void>();
  const blockedListeners = new Set<(b: "license_required" | null) => void>();
  let stopped: "license_required" | null = null;
  let retries = 0;
  let closed = false;
  const subscribed: (number | null)[] = [];
  const deferredListeners = new Set<(f: DeferredFrame) => void>();
  let queue: DeferredFrame = { actions: [], done: [] };
  const link: Link & { calls: typeof calls; setState(s: MachineState): void; push(p: EventsPage): void; hello(contract: string): void; block(b: "license_required" | null): void; retries(): number; closed(): boolean; subscribed: typeof subscribed; options: FakeOptions; queueFrame(f: DeferredFrame): void } = {
    calls,
    deferred: () => queue,
    onDeferred(l) {
      deferredListeners.add(l);
      return () => void deferredListeners.delete(l);
    },
    queueFrame(f) {
      queue = f;
      for (const l of deferredListeners) l(f);
    },
    subscribed,
    options,
    state: () => state,
    setState(s) {
      state = s;
      for (const l of stateListeners) l(s);
    },
    push(p) {
      for (const l of eventListeners) l(p);
    },
    hello(contract) {
      for (const l of engineListeners) l({ contract, host_version: null });
    },
    onEngine(l) {
      engineListeners.add(l);
      return () => void engineListeners.delete(l);
    },
    block(b) {
      stopped = b;
      for (const l of blockedListeners) l(b);
    },
    blocked: () => stopped,
    onBlocked(l) {
      blockedListeners.add(l);
      return () => void blockedListeners.delete(l);
    },
    retry() {
      retries += 1;
      link.block(null);
    },
    retries: () => retries,
    closed: () => closed,
    call(id, command, workspace, _folder, args, timeout) {
      calls.push({ id, command, workspace, args: args as Record<string, unknown>, timeout });
      return new Promise<CallResult>((resolve, reject) => {
        const answer = options.answers?.[command];
        const value = typeof answer === "function" ? (answer as (a: Record<string, unknown>) => unknown)(args as Record<string, unknown>) : answer;
        if (state !== "online") {
          // Como el relay: una acción ligera se guarda en la cola sin encender.
          if (isDeferrable(command)) {
            const queued_at = new Date().toISOString();
            link.queueFrame({ actions: [...queue.actions, { id, command, workspace, folder: null, args, queued_at }], done: [] });
            return resolve({ value: null, cached: null, deferred: { queued_at } });
          }
          if (options.ticket && !isDeferrable(command)) return void setTimeout(() => reject({ code: "io", detail: "timeout" }), timeout);
          // Como el relay: un intent enciende la VM y se entrega con su `hello`.
          if (INTENT_COMMANDS.has(command)) {
            link.setState("starting");
            return void setTimeout(() => {
              link.setState("online");
              resolve({ value: value ?? null, cached: null });
            }, 20);
          }
          if (options.cachedAt && answer !== undefined) return resolve({ value, cached: { updated_at: options.cachedAt } });
          return reject({ code: "machine_off" });
        }
        const once = options.errors?.shift();
        if (once) return reject({ code: once });
        if (options.error) return reject({ code: options.error });
        const delay = options.delay ?? 0;
        if (timeout !== undefined && delay > timeout) return void setTimeout(() => reject({ code: "io", detail: "timeout" }), timeout);
        setTimeout(() => resolve({ value: value ?? null, cached: null }), delay);
      });
    },
    onState(l) {
      stateListeners.add(l);
      return () => void stateListeners.delete(l);
    },
    onEvents(l) {
      eventListeners.add(l);
      return () => void eventListeners.delete(l);
    },
    subscribe(after) {
      subscribed.push(after);
    },
    start() {},
    close() {
      closed = true;
    },
  };
  return link;
}

type FakeLink = ReturnType<typeof fakeLink>;

const VM: MachineInfo = { id: "cmp_vm", name: "Danil VM", wakes: true };
const MAC: MachineInfo = { id: "cmp_mac", name: "Mac de Ana", wakes: false };
const row = (id: string, title = `Tarea ${id}`) => ({ id, title, updated_at: 0 });

function memoryStorage(seed: Record<string, string> = {}) {
  const items = new Map(Object.entries(seed));
  return { getItem: (k: string) => items.get(k) ?? null, setItem: (k: string, v: string) => void items.set(k, v), removeItem: (k: string) => void items.delete(k), items };
}

function setup(links: Record<string, FakeOptions>, machines: MachineInfo[] = [VM, MAC], extra: Partial<ConstructorParameters<typeof Fleet>[0]> = {}) {
  const made: Record<string, FakeLink[]> = {};
  const changes: string[] = [];
  const fleet = new Fleet({
    self: "cmp_home",
    connect: (info) => {
      const link = fakeLink(links[info.id] ?? {});
      (made[info.id] ??= []).push(link);
      return link;
    },
    deadlines: { read: 40, action: 200, intent: 400 },
    onChange: (m) => changes.push(m),
    ...extra,
  });
  fleet.setMachines(machines);
  const link = (id: string) => made[id]?.at(-1) as FakeLink;
  return { fleet, made, link, changes };
}

const local = (value: unknown): Slice => ({ machine: "cmp_home", status: "ok", has: true, value, at: Date.now() });

test("the machine comes only from the envelope: an id of another machine in the args is refused before sending", async () => {
  const { fleet, link } = setup({ cmp_vm: { answers: { load_session: ({ id }: Record<string, unknown>) => ({ id }) } }, cmp_mac: {} });
  await assert.rejects(fleet.call({ machine: "cmp_vm", workspace: "w", command: "load_session", args: { project: "p1", id: "cmp_mac~t1" } }), (e: FleetError) => {
    assert.equal(e.code, "cross_machine");
    assert.equal(e.machine, "cmp_mac");
    return true;
  });
  // A bare task id is the window's own: it never travels to the VM.
  await assert.rejects(fleet.call({ machine: "cmp_vm", workspace: "w", command: "send_message", args: { session: "t1", prompt: "hola" } }), (e: FleetError) => e.code === "cross_machine" && e.machine === "cmp_home");
  await assert.rejects(fleet.call({ machine: "cmp_vm", workspace: "w", command: "send_message", args: { project: "p1", session: null, space: "cmp_mac~s1" } }), (e: FleetError) => e.code === "cross_machine");
  assert.equal(link("cmp_vm").calls.length + link("cmp_mac").calls.length, 0, "nothing was sent anywhere");

  const own = await fleet.call({ machine: "cmp_vm", workspace: "w", command: "load_session", args: { project: "p1", id: "cmp_vm~t1" } });
  assert.deepEqual(own, { id: "cmp_vm~t1" }, "its own id goes bare and comes back with its prefix");
  assert.deepEqual(link("cmp_vm").calls.map((c) => [c.command, c.args.id, c.workspace]), [["load_session", "t1", "w"]]);
});

test("a tab of another machine's task never moves a read: each machine gets only its own open ids", async () => {
  const { fleet, link } = setup({ cmp_vm: { answers: { list_live_sessions: [row("t1")] } }, cmp_mac: { answers: { list_live_sessions: [row("t1")] } } });
  const args = { project: "p1", open: ["t1", "cmp_vm~t1", "cmp_mac~t9"] };
  await fleet.read({ machine: "cmp_vm", workspace: "w", command: "list_live_sessions", args });
  await fleet.read({ machine: "cmp_mac", workspace: "w", command: "list_live_sessions", args });
  assert.deepEqual(link("cmp_vm").calls[0].args.open, ["t1"]);
  assert.deepEqual(link("cmp_mac").calls[0].args.open, ["t9"]);
  assert.deepEqual(fleet.argsFor("cmp_home", args).open, ["t1"], "the window's engine gets only its own");
});

test("a slow VM is cut at the read deadline, retried once and left as no answer with its previous slice", async () => {
  let slow = false;
  const { fleet, link } = setup({ cmp_vm: { answers: { list_live_sessions: () => [row("t1", slow ? "nueva" : "vieja")] } } });
  const envelope = { machine: "cmp_vm", workspace: "w", command: "list_live_sessions", args: { project: "p1" } };
  const first = await fleet.read(envelope);
  assert.equal(first.status, "ok");
  slow = true;
  link("cmp_vm").options.delay = 10_000;
  const started = Date.now();
  const second = await fleet.read(envelope);
  assert.ok(Date.now() - started < 1_000, "the wait is bounded");
  assert.equal(second.status, "no_answer");
  assert.equal(second.error, "machine_timeout");
  assert.deepEqual(second.value, [row("t1", "vieja")], "the previous slice stays");
  assert.equal(link("cmp_vm").calls.length, 3, "one read, then the slow one and a single retry");
  assert.deepEqual(link("cmp_vm").calls.map((c) => c.timeout), [40, 40, 40]);
});

test("a VM off with no copy adds nothing, and nobody answering is no answer, never an empty list", async () => {
  const { fleet } = setup({ cmp_vm: { state: "stopped" }, cmp_mac: { delay: 10_000, answers: { list_live_sessions: [row("t2")] } } });
  const read = (machine: string) => fleet.read({ machine, workspace: "w", command: "list_live_sessions", args: { project: "p1" } });
  const [vm, mac] = await Promise.all([read("cmp_vm"), read("cmp_mac")]);
  assert.deepEqual([vm.status, vm.has], ["off", false]);
  assert.deepEqual([mac.status, mac.has], ["no_answer", false]);
  assert.equal(fleet.merge("list_live_sessions", [vm, mac], "w"), undefined, "nothing to show is not []");
  assert.equal(fleet.merge("list_projects", [vm, mac], "w"), undefined);
  assert.deepEqual(fleet.merge("list_live_sessions", [local([row("t1")]), vm, mac], "w"), [row("t1")], "the window's own slice still paints");
});

test("a VM off answers from the relay's copy with its time; a copy kept here survives a restart as cached", async () => {
  const storage = memoryStorage();
  const { fleet } = setup({ cmp_vm: { state: "stopped", cachedAt: "2026-10-18T21:30:00Z", answers: { list_live_sessions: [row("t1")] } } }, [VM], { storage });
  const slice = await fleet.read({ machine: "cmp_vm", workspace: "w", command: "list_live_sessions", args: { project: "p1" } });
  assert.equal(slice.status, "cached");
  assert.equal(slice.at, Date.parse("2026-10-18T21:30:00Z"));
  fleet.flush();
  assert.ok(storage.items.get(SLICES_KEY));

  const later = setup({ cmp_vm: { state: "stopped" } }, [VM], { storage });
  const kept = later.fleet.peek({ machine: "cmp_vm", workspace: "w", command: "list_live_sessions", args: { project: "p1" } });
  assert.equal(kept?.status, "cached");
  assert.deepEqual(kept?.value, [row("t1")]);
  const again = await later.fleet.read({ machine: "cmp_vm", workspace: "w", command: "list_live_sessions", args: { project: "p1" } });
  assert.deepEqual([again.status, again.value], ["cached", [row("t1")]], "machine_off keeps the copy instead of emptying it");
  assert.equal(later.link("cmp_vm").calls.length, 0, "a machine off with a copy here is not asked: nothing to wait for");
});

test("a VM that turns off is asked once more for the relay's copy, newer than what was read while it ran", async () => {
  const answers: Record<string, Answer> = { load_session: { turns: ["pregunta"] } };
  const { fleet, link } = setup({ cmp_vm: { cachedAt: "2026-10-24T10:00:00Z", answers } }, [VM]);
  const read = () => fleet.read({ machine: "cmp_vm", workspace: "w", command: "load_session", args: { id: "t1" } });
  assert.equal((await read()).status, "ok");
  // La respuesta terminó sin que nadie la leyera y la VM dejó su copia al apagarse.
  answers.load_session = { turns: ["pregunta", "respuesta"] };
  link("cmp_vm").setState("stopped");
  const off = await read();
  assert.deepEqual([off.status, off.value], ["cached", { turns: ["pregunta", "respuesta"] }]);
  assert.equal(off.at, Date.parse("2026-10-24T10:00:00Z"));
  const calls = link("cmp_vm").calls.length;
  assert.equal((await read()).status, "cached");
  assert.equal(link("cmp_vm").calls.length, calls, "once asked, the copy here answers again without the network");
});

test("merged rows say their machine and the state of its slice;the window's rows stay as they are", async () => {
  const { fleet } = setup({ cmp_vm: { answers: { list_live_sessions: [{ ...row("t1"), updated_at: 5 }] } } }, [VM]);
  const vm = await fleet.read({ machine: "cmp_vm", workspace: "w", command: "list_live_sessions", args: { project: "p1" } });
  const merged = fleet.merge("list_live_sessions", [local([{ ...row("t1"), updated_at: 1 }]), vm], "w") as Record<string, unknown>[];
  assert.deepEqual(merged.map((r) => [r.id, r.machine ?? null, r.machine_status ?? null, r.machine_on ?? null]), [["cmp_vm~t1", "cmp_vm", "ok", true], ["t1", null, null, null]]);
});

test("a delegated task of another machine names its launcher with the same prefix as the ids, so the list hides it under it", async () => {
  const rows = [{ ...row("l"), updated_at: 2 }, { ...row("d"), updated_at: 1, launched_by: "l", launcher_available: true }, { ...row("s"), parent: "l" }];
  const { fleet } = setup({ cmp_vm: { answers: { list_live_sessions: rows } } }, [VM]);
  const vm = await fleet.read({ machine: "cmp_vm", workspace: "w", command: "list_live_sessions", args: { project: "p1" } });
  const merged = fleet.merge("list_live_sessions", [vm], "w") as Record<string, unknown>[];
  assert.deepEqual(merged.map((r) => [r.id, r.launched_by ?? null, r.parent ?? null]), [["cmp_vm~l", null, null], ["cmp_vm~d", "cmp_vm~l", null], ["cmp_vm~s", null, "cmp_vm~l"]]);
  const mine = fleet.merge("list_live_sessions", [local(rows)], "w") as Record<string, unknown>[];
  assert.equal(mine[1].launched_by, "l", "the window's own rows keep their ids");
});

test("workspace members come from the account registry, not from whoever answered last", () => {
  const { fleet } = setup({}, [VM, MAC]);
  fleet.setRegistry([{ id: "w", name: "W", projects: [], computers: ["cmp_home", "cmp_vm"] } as never]);
  assert.deepEqual(fleet.membersOf("w"), ["cmp_vm"]);
  assert.deepEqual(fleet.membersOf("w9"), [], "a workspace the account does not have has no remote members");
  fleet.setRegistry(null);
  fleet.setMachines([{ ...VM, linked: new Set(["w"]) }, { ...MAC, linked: new Set(["w2"]) }]);
  assert.deepEqual(fleet.membersOf("w"), ["cmp_vm"], "without a registry, the links say it");
  fleet.setRegistry([{ id: "w", name: "W", projects: [], computers: ["cmp_home"] } as never]);
  assert.deepEqual(fleet.membersOf("w2"), ["cmp_mac"], "a workspace outside the registry that a machine's row lists is still that machine's");
});

test("a member's endpoint on an organization's server serves its workspace, though the member's registry does not have it", () => {
  const { fleet, changes } = setup({}, [VM, MAC]);
  const org = { id: "fqgx1w8m", name: "Danil Workspace" };
  fleet.setRegistry([{ id: "w", name: "W", projects: [], computers: ["cmp_home", "cmp_mac"] } as never]);
  const endpoint = { ...VM, name: "Nube IA", linked: new Set<string>(), organization: { id: "org_01", workspaces: [org] } };
  fleet.setMachines([endpoint, MAC]);
  assert.deepEqual(fleet.membersOf(org.id), ["cmp_vm"], "the row's organization says it, even with no link listed");
  assert.deepEqual(fleet.membersOf("w"), ["cmp_mac"]);
  assert.deepEqual(fleet.organizationWorkspaces(), [{ ...org, machines: ["cmp_vm"] }]);
  assert.equal(fleet.inRegistry(org.id), false, "it stays out of the account's own workspaces");
  changes.length = 0;
  fleet.setMachines([{ ...endpoint, name: "Nube IA", organization: { id: "org_01", workspaces: [{ ...org, name: "Danil" }] } }, MAC]);
  assert.deepEqual(changes, ["cmp_vm"], "a renamed organization workspace is a change of that machine");
  fleet.setMachines([VM, MAC]);
  assert.deepEqual(fleet.organizationWorkspaces(), [], "without the field (an older control plane) the fleet knows none");
});

test("one endpoint serves every organization workspace of the member, and no other", () => {
  const { fleet, changes } = setup({}, [VM, MAC]);
  const primary = { id: "fqgx1w8m", name: "Danil Workspace" };
  const foundation = { id: "fnd00001", name: "Danil Foundation" };
  fleet.setRegistry([{ id: "w", name: "W", projects: [], computers: ["cmp_home", "cmp_mac"] } as never]);
  const endpoint = { ...VM, name: "Nube IA", linked: new Set<string>(), organization: { id: "org_01", workspaces: [primary, foundation] } };
  fleet.setMachines([endpoint, MAC]);
  assert.deepEqual(fleet.membersOf(primary.id), ["cmp_vm"]);
  assert.deepEqual(fleet.membersOf(foundation.id), ["cmp_vm"], "the second workspace is served by the same endpoint");
  assert.deepEqual(fleet.membersOf("w"), ["cmp_mac"], "not the member's own workspace");
  assert.deepEqual(fleet.organizationWorkspaces(), [{ ...primary, machines: ["cmp_vm"] }, { ...foundation, machines: ["cmp_vm"] }], "primary first");
  changes.length = 0;
  fleet.setMachines([{ ...endpoint, organization: { id: "org_01", workspaces: [primary] } }, MAC]);
  assert.deepEqual(changes, ["cmp_vm"], "losing a workspace is a change of that machine");
  assert.deepEqual(fleet.membersOf(foundation.id), []);
});

test("machines are added, removed and renamed live without reconnecting the others", async () => {
  const { fleet, made, changes } = setup({ cmp_vm: { answers: { list_live_sessions: [row("t1")] } } }, [VM, MAC]);
  await fleet.read({ machine: "cmp_vm", workspace: "w", command: "list_live_sessions", args: { project: "p1" } });
  fleet.setMachines([{ ...VM, name: "VM renombrada" }, MAC]);
  assert.equal(fleet.name("cmp_vm"), "VM renombrada");
  assert.equal(made.cmp_vm.length, 1, "a rename does not reconnect");
  assert.equal(made.cmp_vm[0].closed(), false);
  assert.ok(fleet.peek({ machine: "cmp_vm", workspace: "w", command: "list_live_sessions", args: { project: "p1" } })?.has, "its slice stays");
  fleet.setMachines([{ ...VM, name: "VM renombrada" }, { id: "cmp_vm2", name: "VM 2", wakes: true }]);
  assert.equal(made.cmp_mac[0].closed(), true, "a machine that left is closed");
  assert.equal(fleet.has("cmp_mac"), false);
  assert.equal(made.cmp_vm2.length, 1, "a new one connects");
  assert.equal(made.cmp_vm.length, 1, "the others are untouched");
  assert.ok(changes.includes("cmp_vm") && changes.includes("cmp_mac") && changes.includes("cmp_vm2"));
});

test("an action to an own machine that is off fails at once with machine_off; to a VM it wakes it first", async () => {
  const woken: string[] = [];
  const { fleet, link } = setup({ cmp_vm: { state: "stopped", answers: { set_session_stage: null, send_message: "t1" } }, cmp_mac: { state: "offline" } }, [VM, MAC], {
    wake: async (machine) => {
      woken.push(machine);
      setTimeout(() => link(machine).setState("online"), 20);
      return true;
    },
  });
  await assert.rejects(fleet.call({ machine: "cmp_mac", workspace: "w", command: "send_message", args: { project: "p1" } }), (e: FleetError) => e.code === "machine_off" && !e.canWake);
  assert.equal(link("cmp_mac").calls.length, 0, "nothing tries to start the person's own machine");

  await fleet.call({ machine: "cmp_vm", workspace: "w", command: "set_session_stage", args: { project: "p1", id: "cmp_vm~t1", stage: null } });
  assert.deepEqual(woken, ["cmp_vm"], "a non-intent action starts the VM through the control plane first");
  assert.equal(link("cmp_vm").calls.at(-1)?.timeout, 200);
});

test("an intent to an off VM goes to the relay, which starts it, with the intent deadline", async () => {
  const { fleet, link } = setup({ cmp_vm: { state: "stopped", answers: { send_message: "r7" } } }, [VM]);
  assert.equal(await fleet.call({ machine: "cmp_vm", workspace: "w", command: "send_message", args: { project: "p1", session: null } }), "cmp_vm~r7");
  assert.equal(link("cmp_vm").calls.length, 1, "sent once");
  assert.equal(link("cmp_vm").calls[0].timeout, 400);
  assert.equal(fleet.power("cmp_vm"), "on");
});

for (const command of ["send_message", "add_account", "login_account"]) {
  test(`${command} to an off machine its control plane starts (MVP ticket channel) starts it first, then delivers it once`, async () => {
    const woken: string[] = [];
    const CLOUD: MachineInfo = { ...VM, starts: "control_plane" };
    const { fleet, link } = setup({ cmp_vm: { state: "stopped", ticket: true, answers: { [command]: "a1" } } }, [CLOUD], {
      wake: async (machine) => {
        woken.push(machine);
        setTimeout(() => link(machine).setState("online"), 20);
        return true;
      },
    });
    await fleet.call({ machine: "cmp_vm", workspace: "w", command, args: { provider: "claude" } });
    assert.deepEqual(woken, ["cmp_vm"], "the ticket channel does not start it: the control plane does, before the call");
    assert.equal(link("cmp_vm").calls.length, 1, "delivered once, after it came online");
    assert.equal(fleet.power("cmp_vm"), "on");
  });
}

test("two intents while a control-plane machine is starting share one start and are each delivered once", async () => {
  let starts = 0;
  const CLOUD: MachineInfo = { ...VM, starts: "control_plane" };
  const { fleet, link } = setup({ cmp_vm: { state: "stopped", ticket: true, answers: { add_account: "a1", send_message: "t1" } } }, [CLOUD], {
    wake: async (machine) => {
      starts += 1;
      // Como `POST /start` mientras otro sigue en curso: `409 operation_in_progress`.
      if (starts > 1) return false;
      await new Promise((done) => setTimeout(done, 30));
      setTimeout(() => link(machine).setState("online"), 10);
      return true;
    },
  });
  const [a, b] = await Promise.all([
    fleet.call({ machine: "cmp_vm", workspace: "w", command: "add_account", args: {} }),
    fleet.call({ machine: "cmp_vm", workspace: "w", command: "send_message", args: { project: "p1", session: null } }),
  ]);
  assert.deepEqual([a, b], ["a1", "cmp_vm~t1"]);
  assert.equal(starts, 1, "one start per machine while one is in flight");
  assert.deepEqual(link("cmp_vm").calls.map((c) => c.command).sort(), ["add_account", "send_message"], "each intent once");
});

test("an intent to an off control-plane machine that cannot be started fails at once with machine_off, never waits its deadline", async () => {
  const CLOUD: MachineInfo = { ...VM, starts: "control_plane" };
  const { fleet, link } = setup({ cmp_vm: { state: "stopped", ticket: true } }, [CLOUD], { wake: async () => "not_startable" });
  const started = Date.now();
  await assert.rejects(fleet.call({ machine: "cmp_vm", workspace: "w", command: "add_account", args: {} }), (e: FleetError) => e.code === "machine_off" && !e.canWake);
  assert.ok(Date.now() - started < 200, "named failure before the intent deadline");
  assert.equal(link("cmp_vm").calls.length, 0);
});

test("a machine whose engine speaks another contract is marked outdated and cleared by its next compatible hello", async () => {
  const { fleet, link } = setup({ cmp_vm: { error: "version_mismatch" } }, [VM], { compatible: (c) => (c ? c === "mine" : null) });
  const slice = await fleet.read({ machine: "cmp_vm", workspace: "w", command: "list_projects", args: {} });
  assert.equal(slice.status, "outdated");
  assert.equal(fleet.power("cmp_vm"), "outdated");
  await assert.rejects(fleet.call({ machine: "cmp_vm", workspace: "w", command: "send_message", args: {} }), (e: FleetError) => e.code === "version_mismatch");
  link("cmp_vm").setState("online");
  assert.equal(fleet.power("cmp_vm"), "outdated", "coming online alone says nothing about its contract");
  link("cmp_vm").hello("theirs");
  assert.equal(fleet.power("cmp_vm"), "outdated");
  link("cmp_vm").hello("mine");
  assert.equal(fleet.power("cmp_vm"), "on", "the engine caught up");
});

test("a contract the control plane listed as old is cleared by the engine's hello, and a new hello can mark it again", () => {
  const { fleet, link } = setup({}, [{ ...VM, outdated: true }], { compatible: (c) => (c ? c === "mine" : null) });
  assert.equal(fleet.power("cmp_vm"), "outdated");
  link("cmp_vm").hello("mine");
  assert.equal(fleet.power("cmp_vm"), "on");
  link("cmp_vm").hello("theirs");
  assert.equal(fleet.power("cmp_vm"), "outdated");
});

test("the relay's machine_timeout and machine_lost are named states, retried once and never waited past", async () => {
  const { fleet, link } = setup({ cmp_vm: { answers: { list_projects: [{ id: "p1" }], send_message: "r1" } } }, [VM]);
  const envelope = { machine: "cmp_vm", workspace: "w", command: "list_projects", args: {} };
  await fleet.read(envelope);
  link("cmp_vm").options.errors = ["machine_timeout", "machine_timeout"];
  const late = await fleet.read(envelope);
  assert.deepEqual([late.status, late.error, late.value], ["no_answer", "machine_timeout", [{ id: "p1" }]], "a read the relay cut keeps the previous slice");
  link("cmp_vm").options.errors = ["machine_lost"];
  const again = await fleet.read(envelope);
  assert.equal(again.status, "ok", "a lost connector is retried once");

  link("cmp_vm").options.errors = ["machine_lost"];
  const before = link("cmp_vm").calls.length;
  assert.equal(await fleet.call({ machine: "cmp_vm", workspace: "w", command: "send_message", args: { project: "p1", session: null } }), "cmp_vm~r1");
  const sent = link("cmp_vm").calls.slice(before);
  assert.equal(sent.length, 2);
  assert.equal(sent[0].id, sent[1].id, "an intent retried keeps its id: the relay never delivers it twice");
  link("cmp_vm").options.errors = ["machine_timeout"];
  await assert.rejects(fleet.call({ machine: "cmp_vm", workspace: "w", command: "send_message", args: { project: "p1", session: null } }), (e: FleetError) => e.code === "machine_timeout", "an intent the relay timed out is not resent");
});

test("events of another machine arrive with the panel's ids; a machine that comes on asks for a reread", () => {
  const seen: [string, unknown[], boolean][] = [];
  const { fleet, link } = setup({ cmp_vm: { state: "offline" } }, [VM], { onEvents: (m, events, gap) => seen.push([m, events, gap]) });
  fleet.subscribeEvents();
  assert.deepEqual(link("cmp_vm").subscribed, [null]);
  link("cmp_vm").push({ cursor: 1, events: [{ name: "turn", payload: { session: "t1" } }] });
  link("cmp_vm").setState("online");
  assert.deepEqual(seen, [["cmp_vm", [{ name: "turn", payload: { session: "cmp_vm~t1" } }], false], ["cmp_vm", [], true]]);
});

test("events of a workspace no machine has linked say the links are stale; one linked on another machine does not", () => {
  const unlinked: [string, string[]][] = [];
  const seen: unknown[] = [];
  const { fleet, link } = setup({ cmp_vm: {}, cmp_mac: {} }, [{ ...VM, linked: new Set(["w1"]) }, { ...MAC, linked: new Set(["w2"]) }], {
    onEvents: (_machine, events) => seen.push(...events),
    onUnlinked: (machine, workspaces) => unlinked.push([machine, workspaces]),
  });
  fleet.subscribeEvents();
  link("cmp_vm").push({ cursor: 1, events: [{ name: "workspace.changed", workspace: "w3", payload: { workspace: "w3", settings_version: 1 } }] });
  link("cmp_vm").push({ cursor: 2, events: [{ name: "chat", payload: { workspace: "w2", session: "t1" } }] });
  assert.deepEqual(unlinked, [["cmp_vm", ["w3"]]]);
  // The stale row still filters them until the list is read again.
  assert.deepEqual(seen, []);
  fleet.setMachines([{ ...VM, linked: new Set(["w1", "w3"]) }, { ...MAC, linked: new Set(["w2"]) }]);
  link("cmp_vm").push({ cursor: 3, events: [{ name: "chat", payload: { workspace: "w3", session: "t2" } }] });
  assert.deepEqual(unlinked.length, 1);
  assert.equal(seen.length, 1);
});

test("activity notices retain the originating machine without turning log ids into task ids", () => {
  const seen: unknown[] = [];
  const { fleet, link } = setup({ cmp_vm: {} }, [VM], { onEvents: (_machine, events) => seen.push(...events) });
  fleet.subscribeEvents();
  link("cmp_vm").push({ cursor: 1, events: [{ name: "activity", payload: { workspace: "w", id: "operation-1", title: "Actualizar herramientas", state: "success" } }] });
  assert.deepEqual(seen, [{ name: "activity", payload: { workspace: "w", id: "operation-1", title: "Actualizar herramientas", state: "success", machine: "cmp_vm" } }]);
});

test("projects keep one row per id with the machines that have them, and the registry fills the rest", async () => {
  const { fleet } = setup({ cmp_vm: { answers: { list_projects: [{ id: "p1", name: "P1" }, { id: "p2", name: "P2", materialized: false, remote_url: "https://x/p2" }] } } }, [VM]);
  fleet.setRegistry([{ id: "w", name: "W", computers: ["cmp_vm"], projects: [{ id: "p3", name: "P3", remote_url: null, home_computer_id: "cmp_vm" }] } as never]);
  const vm = await fleet.read({ machine: "cmp_vm", workspace: "w", command: "list_projects", args: {} });
  const merged = fleet.merge("list_projects", [local([{ id: "p1", name: "P1" }]), vm], "w") as Record<string, unknown>[];
  assert.deepEqual(merged.map((p) => [p.id, p.machines]), [["p1", ["cmp_home", "cmp_vm"]], ["p2", []], ["p3", ["cmp_vm"]]]);
});

test("carry: a bare task id never travels to another machine, work_export wakes like an intent, and the fleet can wake a VM on request", async () => {
  const woken: string[] = [];
  const { fleet, link } = setup({ cmp_vm: { state: "stopped", answers: { work_status: { ahead: 0 } } }, cmp_mac: { state: "offline" } }, [VM, MAC], {
    wake: async (machine) => {
      woken.push(machine);
      setTimeout(() => link(machine).setState("online"), 20);
      return true;
    },
  });
  assert.equal(classOf("work_export"), "intent");
  await assert.rejects(fleet.call({ machine: "cmp_vm", workspace: "w", command: "work_status", args: { project: "p1", task: "t1" } }), (e: FleetError) => e.code === "cross_machine");
  assert.deepEqual(fleet.argsFor("cmp_vm", { task: "cmp_vm~t1", transfer: "tx-1" }), { task: "t1", transfer: "tx-1" }, "its own task goes bare; the client's transfer id is never touched");
  await assert.rejects(fleet.wake("cmp_mac"), (e: FleetError) => e.code === "machine_off" && !e.canWake, "the person's own machine is not started");
  await fleet.wake("cmp_vm");
  assert.deepEqual(woken, ["cmp_vm"]);
  assert.equal(fleet.power("cmp_vm"), "on");
  await fleet.wake("cmp_vm");
  assert.deepEqual(woken, ["cmp_vm"], "an awake machine is not started again");
});

test("without a Terminus license a machine keeps its slice with a named state, asks nothing more, and «Reintentar» reopens it", async () => {
  const { fleet, link, changes } = setup({ cmp_vm: { answers: { list_live_sessions: [row("t1")] } } }, [VM]);
  const envelope = { machine: "cmp_vm", workspace: "w", command: "list_live_sessions", args: { project: "p1" } };
  await fleet.read(envelope);
  link("cmp_vm").block("license_required");
  assert.ok(changes.filter((c) => c === "cmp_vm").length >= 2, "the UI hears it");
  const before = link("cmp_vm").calls.length;
  const slice = await fleet.read(envelope);
  assert.deepEqual([slice.status, slice.value], ["license_required", [row("t1")]], "the slice stays, with its name");
  await assert.rejects(fleet.call({ machine: "cmp_vm", workspace: "w", command: "send_message", args: { project: "p1" } }), (e: FleetError) => e.code === "license_required");
  assert.equal(link("cmp_vm").calls.length, before, "nothing is sent, nothing loops");
  assert.equal(fleet.license(), "license_required");
  assert.equal(fleet.sliceStatuses().cmp_vm.status, "license_required");
  fleet.retry();
  assert.equal(link("cmp_vm").retries(), 1);
  assert.equal(fleet.license(), null);
  assert.equal((await fleet.read(envelope)).status, "ok");
});

test("a space shared with the account keeps its id on every machine; one of a single machine keeps its prefix", async () => {
  const { fleet, link } = setup({
    cmp_vm: {
      answers: {
        list_spaces: [
          { id: "s1", name: "Trabajo", folders: [], updated_at: 5, account: true },
          { id: "v1", name: null, folders: [], updated_at: 1 },
        ],
        list_live_sessions: [{ ...row("t9"), space: "s1" }, { ...row("t8"), space: "v1" }],
      },
    },
  });
  const spaces = await fleet.read({ machine: "cmp_vm", workspace: "w", command: "list_spaces", args: {} });
  const merged = fleet.merge("list_spaces", [local([{ id: "s1", name: "Viejo", folders: [], updated_at: 2, account: true }, { id: "h1", name: null, folders: [], updated_at: 1 }]), spaces], "w") as { id: string; name: string | null }[];
  assert.deepEqual(merged.map((s) => [s.id, s.name]), [["s1", "Trabajo"], ["h1", null], ["cmp_vm~v1", null]], "one per id, the newest copy wins");
  const rows = await fleet.read({ machine: "cmp_vm", workspace: "w", command: "list_live_sessions", args: { project: "p1" } });
  const tagged = fleet.merge("list_live_sessions", [rows], "w") as { id: string; space: string }[];
  assert.deepEqual(tagged.map((r) => [r.id, r.space]), [["cmp_vm~t9", "s1"], ["cmp_vm~t8", "cmp_vm~v1"]], "a task in a shared space names it bare");
  // The window's shared space travels bare to another machine; its own unshared one does not.
  await fleet.call({ machine: "cmp_vm", workspace: "w", command: "send_message", args: { project: "p1", session: null, space: "s1" } }).catch(() => {});
  assert.equal(link("cmp_vm").calls.at(-1)?.args.space, "s1");
  await assert.rejects(fleet.call({ machine: "cmp_vm", workspace: "w", command: "send_message", args: { project: "p1", session: null, space: "h1" } }), (e: FleetError) => e.code === "cross_machine");
  fleet.markShared("h1");
  await fleet.call({ machine: "cmp_vm", workspace: "w", command: "send_message", args: { project: "p1", session: null, space: "h1" } }).catch(() => {});
  assert.equal(link("cmp_vm").calls.at(-1)?.args.space, "h1", "once shared it travels bare");
});

test("migrated spaces: each keeps its id, two with the same name stay apart and the tasks name them bare", async () => {
  const { fleet } = setup({
    cmp_vm: {
      answers: {
        // The VM's own «Space 1» and «General», already moved to the account with their ids.
        list_spaces: [
          { id: "vmone001", name: null, folders: [], updated_at: 3, account: true },
          { id: "general2", name: "General", folders: [], updated_at: 4, account: true },
          { id: "general1", name: "General", folders: [], updated_at: 2, account: true },
        ],
        list_live_sessions: [{ ...row("t1"), space: "general2" }, { ...row("t2"), space: "vmone001" }],
      },
    },
  });
  const before = fleet.sharedCount();
  const spaces = await fleet.read({ machine: "cmp_vm", workspace: "w", command: "list_spaces", args: {} });
  const merged = fleet.merge("list_spaces", [local([{ id: "general1", name: "General", folders: [], updated_at: 2, account: true }]), spaces], "w") as { id: string; name: string | null }[];
  assert.deepEqual(merged.map((s) => [s.id, s.name]), [["general1", "General"], ["vmone001", null], ["general2", "General"]], "never merged by name");
  assert.ok(fleet.sharedCount() > before, "the fleet learned them: the window rereads the tasks");
  const rows = await fleet.read({ machine: "cmp_vm", workspace: "w", command: "list_live_sessions", args: { project: "p1" } });
  const tagged = fleet.merge("list_live_sessions", [rows], "w") as { id: string; space: string }[];
  assert.deepEqual(tagged.map((r) => [r.id, r.space]), [["cmp_vm~t1", "general2"], ["cmp_vm~t2", "vmone001"]]);
});

test("a machine that leaves the account takes only its tasks: the space stays with its id", async () => {
  const shared = { id: "trabajo1", name: "Trabajo", folders: [], updated_at: 5, account: true };
  const { fleet } = setup({ cmp_vm: { answers: { list_spaces: [shared], list_live_sessions: [{ ...row("t9"), space: "trabajo1" }] } } });
  const registry = (computers: string[]) => [{ id: "w", name: "W", projects: [], computers, spaces: [{ id: "trabajo1", name: "Trabajo", folders: [], position: 0, changed_at: 5 }] }];
  fleet.setRegistry(registry(["cmp_vm", "cmp_mac"]));
  assert.ok(fleet.membersOf("w").includes("cmp_vm"));
  await fleet.read({ machine: "cmp_vm", workspace: "w", command: "list_live_sessions", args: { project: "p1" } });
  // The VM leaves (its workspace is unlinked or its session closed): the registry no longer lists it.
  fleet.setRegistry(registry(["cmp_mac"]));
  assert.deepEqual(fleet.membersOf("w"), ["cmp_mac"], "its tasks are no longer read");
  assert.ok(fleet.isShared("trabajo1"), "the space is still the account's");
  const merged = fleet.merge("list_spaces", [local([{ ...shared, updated_at: 4 }])], "w") as { id: string }[];
  assert.deepEqual(merged.map((s) => s.id), ["trabajo1"], "same id, not deleted");
});

test("without a window (the web) the registry's shared spaces show even when no machine answers", () => {
  const fleet = new Fleet({ self: null, connect: () => fakeLink({}), deadlines: { read: 40, action: 200, intent: 400 } });
  fleet.setRegistry([{ id: "w", name: "W", projects: [], computers: [], spaces: [{ id: "s1", name: "Trabajo", folders: ["p1"], position: 0, changed_at: 7 }] }]);
  assert.deepEqual(fleet.merge("list_spaces", [], "w"), [{ id: "s1", name: "Trabajo", folders: ["p1"], created_at: 0, updated_at: 7, account: true }]);
  assert.equal(fleet.merge("list_spaces", [], "otro"), undefined, "nothing known is no answer, never []");
});

test("archive, delete, rename, pin or move to an off machine (VM or own) is queued by the relay: no wake, no machine_off", async () => {
  const woken: string[] = [];
  const deferredOf: string[] = [];
  const { fleet, link } = setup({ cmp_vm: { state: "stopped" }, cmp_mac: { state: "offline" } }, [VM, MAC], {
    wake: async (machine) => {
      woken.push(machine);
      return true;
    },
    onDeferred: (machine) => deferredOf.push(machine),
  });
  for (const machine of ["cmp_vm", "cmp_mac"]) {
    const id = `${machine}~t1`;
    assert.equal(await fleet.call({ machine, workspace: "w", command: "set_task_archived", args: { project: "p1", id, archived: true, space: null } }), null);
    assert.equal(await fleet.call({ machine, workspace: "w", command: "delete_session", args: { project: "p1", id: `${machine}~t2`, force: false } }), null);
    const [archive, remove] = link(machine).calls;
    assert.deepEqual(archive.args, { project: "p1", id: "t1", archived: true, space: null }, "the machine gets its own ids");
    assert.equal(remove.command, "delete_session");
  }
  assert.deepEqual(woken, [], "a light action never starts a machine");
  assert.deepEqual(fleet.deferred("cmp_vm").map((a) => a.command), ["set_task_archived", "delete_session"]);
  assert.deepEqual(deferredOf, ["cmp_vm", "cmp_vm", "cmp_mac", "cmp_mac"], "every change of the queue asks for a reread");
});

test("send_message to an off VM still starts it: it is not deferred", async () => {
  const { fleet, link } = setup({ cmp_vm: { state: "stopped", answers: { send_message: "r1" } } }, [VM]);
  await fleet.call({ machine: "cmp_vm", workspace: "w", command: "send_message", args: { project: "p1" } });
  assert.equal(link("cmp_vm").state(), "online");
  assert.deepEqual(fleet.deferred("cmp_vm"), []);
});

test("after the queue changes, a read of an off machine asks the relay again (its copy reflects the queue) once per read", async () => {
  const rows = [row("t1"), row("t2")];
  const { fleet, link } = setup({ cmp_vm: { state: "stopped", cachedAt: "2026-10-23T10:00:00Z", answers: { list_live_sessions: () => rows } } }, [VM]);
  const read = () => fleet.read({ machine: "cmp_vm", workspace: "w", command: "list_live_sessions", args: { project: "p1" } });
  await read();
  await read();
  assert.equal(link("cmp_vm").calls.length, 1, "with nothing queued, an off machine with a copy here is asked once");
  await fleet.call({ machine: "cmp_vm", workspace: "w", command: "set_task_archived", args: { project: "p1", id: "cmp_vm~t1", archived: true } });
  rows.shift();
  const after = await read();
  assert.deepEqual((after.value as { id: string }[]).map((r) => r.id), ["t2"], "the relay's copy with the queue applied");
  await read();
  assert.equal(link("cmp_vm").calls.filter((c) => c.command === "list_live_sessions").length, 2, "and then it is settled again");
});

test("moving a task to a space of the account is not deferred: it follows the path of any action", async () => {
  const woken: string[] = [];
  const { fleet, link } = setup({ cmp_vm: { state: "stopped", answers: { move_task_to_space: { id: "s1", name: "Trabajo" } } }, cmp_mac: { state: "offline" } }, [VM, MAC], {
    wake: async (machine) => {
      woken.push(machine);
      setTimeout(() => link(machine).setState("online"), 20);
      return true;
    },
  });
  fleet.markShared("s1");
  await fleet.call({ machine: "cmp_vm", workspace: "w", command: "move_task_to_space", args: { project: "p1", id: "cmp_vm~t1", space: "s1" } });
  assert.deepEqual(woken, ["cmp_vm"]);
  assert.deepEqual(fleet.deferred("cmp_vm"), []);
  await assert.rejects(fleet.call({ machine: "cmp_mac", workspace: "w", command: "move_task_to_space", args: { project: "p1", id: "cmp_mac~t1", space: "s1" } }), (e: FleetError) => e.code === "machine_off");
  // A space only that machine has is still deferred.
  await fleet.call({ machine: "cmp_mac", workspace: "w", command: "move_task_to_space", args: { project: "p1", id: "cmp_mac~t1", space: "cmp_mac~v1" } });
  assert.deepEqual(fleet.deferred("cmp_mac").map((a) => a.args), [{ project: "p1", id: "t1", space: "v1" }]);
});

test("raw answers with the machine's own ids and the relay copy's time, for a client that names the machine apart", async () => {
  const { fleet } = setup({ cmp_vm: { state: "offline", cachedAt: "2026-10-22T10:00:00Z", answers: { load_session: ({ id }: Record<string, unknown>) => ({ id, session: id }) } } }, [VM], { self: null });
  const { value, at } = await fleet.raw({ machine: "cmp_vm", workspace: "w", command: "load_session", args: { project: "p1", id: "t1" } });
  assert.deepEqual(value, { id: "t1", session: "t1" }, "no prefix");
  assert.equal(at, Date.parse("2026-10-22T10:00:00Z"));
});

test("with panelIds false the events keep the ids of their machine", async () => {
  const seen: unknown[] = [];
  const { fleet, link } = setup({ cmp_vm: {} }, [VM], { self: null, panelIds: false, onEvents: (_m, events) => seen.push(...events) });
  fleet.subscribeEvents();
  link("cmp_vm").push({ cursor: 1, events: [{ name: "session", payload: { session: "t1", project: "p1" } }] });
  assert.deepEqual(seen, [{ name: "session", payload: { session: "t1", project: "p1" } }]);
});

test("AI credentials keep their machine even when their email matches", () => {
  const { fleet } = setup({ cmp_vm: { state: "online" }, cmp_mac: { state: "offline" } }, [VM, MAC], { self: null });
  const slice = (machine: string, value: unknown): Slice => ({ machine, status: "ok", has: true, value, at: 0 });
  const merged = fleet.merge("list_accounts", [
    slice("cmp_vm", { active: "a1", accounts: [{ id: "a1", identity: "Ana@Example.com" }, { id: "a2", label: "Sin correo" }] }),
    slice("cmp_mac", { active: null, accounts: [{ id: "b1", identity: "ana@example.com" }] }),
  ]) as { active: string; accounts: { id: string; label?: string; machines: { machine: string; id: string; on: boolean }[] }[] };
  assert.equal(merged.accounts.length, 3);
  assert.deepEqual(merged.accounts[0].machines, [
    { machine: "cmp_vm", id: "cmp_vm~a1", on: true },
  ]);
  assert.equal(merged.accounts[0].id, "cmp_vm~a1", "the id is the one of a machine that is on");
  assert.equal(merged.active, "cmp_vm~a1");
  assert.equal(merged.accounts[1].label, "Sin correo · Danil VM", "without an email it is named with its machine");
  assert.deepEqual(merged.accounts[2].machines, [{ machine: "cmp_mac", id: "cmp_mac~b1", on: false }]);
});

test("Claude Team and Personal with the same email keep their ids and active selection", () => {
  const { fleet } = setup({ cmp_vm: { state: "online" }, cmp_mac: { state: "online" } }, [VM, MAC], { self: null });
  const slice = (machine: string, value: unknown): Slice => ({ machine, status: "ok", has: true, value, at: 0 });
  const merged = fleet.merge("list_accounts", [
    slice("cmp_vm", { provider: "claude", active: "team", accounts: [{ id: "personal", identity: "ana@example.com", label: "Personal" }, { id: "team", identity: "ana@example.com", label: "Team" }] }),
    slice("cmp_mac", { provider: "claude", active: "personal", accounts: [{ id: "personal", identity: "ana@example.com", label: "Otra sesión" }] }),
  ]) as { active: string; accounts: { id: string; label: string; machines: { id: string; machine: string }[] }[] };
  assert.equal(merged.active, "cmp_vm~team");
  assert.deepEqual(merged.accounts.map((a) => [a.id, a.label]), [["cmp_vm~personal", "Personal"], ["cmp_vm~team", "Team"], ["cmp_mac~personal", "Otra sesión"]]);
  assert.deepEqual(merged.accounts.map((a) => a.machines.map((m) => m.id)), [["cmp_vm~personal"], ["cmp_vm~team"], ["cmp_mac~personal"]]);
});

test("the git of the tasks of a folder: each machine gets only its own priority ids and the answers join by task", async () => {
  const { fleet, link } = setup({ cmp_vm: { answers: { list_session_git: { t1: { branch: "vm" } } } }, cmp_mac: { answers: { list_session_git: { t1: { branch: "mac" } } } } }, [VM, MAC], { self: null });
  const args = { project: "p1", priority: ["cmp_vm~t1", "cmp_mac~t1"] };
  const slices = await Promise.all(["cmp_vm", "cmp_mac"].map((machine) => fleet.read({ machine, workspace: "w", command: "list_session_git", args })));
  assert.deepEqual(link("cmp_vm").calls[0].args.priority, ["t1"]);
  assert.deepEqual(link("cmp_mac").calls[0].args.priority, ["t1"]);
  assert.deepEqual(fleet.merge("list_session_git", slices), { "cmp_vm~t1": { branch: "vm" }, "cmp_mac~t1": { branch: "mac" } });
});

test("a task of another machine can be mentioned: listed with its panel id and sent where it does not live as elsewhere", async () => {
  const candidate = (id: string, title: string) => ({ target: { kind: "task", projectId: "p1", sessionId: id }, title, projectName: "Terminus", alias: "", branch: "feat/x", available: true, archived: false, updatedAt: 1 });
  const { fleet, link } = setup({ cmp_vm: { answers: { list_task_mentions: [candidate("t1", "En la VM")] } } }, [VM]);
  const vm = await fleet.read({ machine: "cmp_vm", workspace: "w", command: "list_task_mentions", args: {} });
  const merged = fleet.merge("list_task_mentions", [local([candidate("t1", "Aquí")]), vm], "w") as { target: { sessionId: string }; machine?: string }[];
  assert.deepEqual(merged.map((c) => [c.target.sessionId, c.machine ?? null]), [["t1", null], ["cmp_vm~t1", "cmp_vm"]]);

  const about = { machine_name: "vm-principal", title: "En la VM", branch: "feat/x" };
  const vmTask = { target: { kind: "task", projectId: "p1", sessionId: "cmp_vm~t1", about }, start: 0, end: 2, text: "@x" };
  const homeTask = { target: { kind: "task", projectId: "p1", sessionId: "t2", about: { machine_name: "Mac", title: "Aquí" } }, start: 3, end: 5, text: "@y" };
  const here = fleet.argsFor("cmp_home", { prompt: "@x @y", task_mentions: [vmTask, homeTask] }).task_mentions as Record<string, unknown>[];
  assert.deepEqual(here[0], { target: { kind: "task", projectId: "p1", sessionId: "t1" }, start: 0, end: 2, text: "@x", elsewhere: { machine: "cmp_vm", ...about } });
  assert.deepEqual(here[1], { target: { kind: "task", projectId: "p1", sessionId: "t2" }, start: 3, end: 5, text: "@y" }, "its own task goes bare, without what the window saw");

  await fleet.call({ machine: "cmp_vm", workspace: "w", command: "inject_message", args: { project: "p1", session: "cmp_vm~t9", prompt: "@x @y", task_mentions: [vmTask, homeTask] } });
  const sent = link("cmp_vm").calls.at(-1)?.args.task_mentions as Record<string, unknown>[];
  assert.deepEqual(sent[0], { target: { kind: "task", projectId: "p1", sessionId: "t1" }, start: 0, end: 2, text: "@x" });
  assert.deepEqual(sent[1].elsewhere, { machine: "cmp_home", machine_name: "Mac", title: "Aquí" });

  const stored = { turns: [{ task_mentions: [{ target: { kind: "task", projectId: "p1", sessionId: "t1" } }, { target: { kind: "task", projectId: "p1", sessionId: "t2" }, elsewhere: { machine: "cmp_home" } }] }] };
  const read = fleet.encode("cmp_vm", stored, "load_session") as typeof stored;
  assert.deepEqual(read.turns[0].task_mentions.map((m) => m.target.sessionId), ["cmp_vm~t1", "t2"], "a mention saved there opens the task where it lives");
  assert.deepEqual(fleet.argsFor("cmp_home", { task_mentions: read.turns[0].task_mentions }).task_mentions, [
    { target: { kind: "task", projectId: "p1", sessionId: "t1" }, elsewhere: { machine: "cmp_vm" } },
    { target: { kind: "task", projectId: "p1", sessionId: "t2" } },
  ], "sent again from the queue, each one still says where it lives");
});


test("composer taskMentions reach the receiving engine with its own ids and no UI metadata", async () => {
  const { fleet, link } = setup({ cmp_vm: { answers: { send_message: "t9" } } }, [VM]);
  const remote = { target: { kind: "task", projectId: "p1", sessionId: "cmp_vm~t1", about: { title: "VM task" } }, start: 0, end: 2, text: "@x" };
  const home = { target: { kind: "task", projectId: "p1", sessionId: "t2", about: { title: "Home task" } }, start: 3, end: 5, text: "@y" };
  await fleet.call({ machine: "cmp_vm", workspace: "w", command: "send_message", args: { project: "p1", session: "cmp_vm~t9", prompt: "@x @y", taskMentions: [remote, home] } });
  assert.deepEqual(link("cmp_vm").calls.at(-1)?.args.taskMentions, [
    { target: { kind: "task", projectId: "p1", sessionId: "t1" }, start: 0, end: 2, text: "@x" },
    { target: { kind: "task", projectId: "p1", sessionId: "t2" }, start: 3, end: 5, text: "@y", elsewhere: { machine: "cmp_home", title: "Home task" } },
  ]);
});

test("workspace context survives when only a later machine has a primary source", () => {
  const { fleet } = setup({ cmp_vm: {}, cmp_mac: {} });
  const first = { id: "w", context_root: null };
  const slices: Slice[] = [
    { ...local({ active: "w", workspaces: [first] }), machine: "cmp_vm" },
    { ...local({ active: "w", workspaces: [{ id: "w", context_root: "/lab/context", context_machine: "cmp_vm" }] }), machine: "cmp_mac" },
  ];
  for (const command of ["list_workspaces", "workspaces_startup"]) {
    const result = fleet.merge(command, slices) as { workspaces: { context_root: string | null; context_machine: string }[] };
    assert.equal(result.workspaces[0].context_root, "/lab/context");
    assert.equal(result.workspaces[0].context_machine, "cmp_mac", "the envelope owns the source, regardless of row metadata");
    assert.equal(first.context_root, null, "merging does not change a machine's saved slice");
  }
});

test("shared spaces order wins over machine slice order in desktop and web", () => {
  for (const self of [null, "cmp_mac"]) {
    const { fleet } = setup({}, [VM, MAC], { self });
    const spaces = [
      { id: "a", name: "A", folders: [], position: 0, changed_at: 1 },
      { id: "b", name: "B", folders: [], position: 1, changed_at: 1 },
    ];
    fleet.setRegistry([{ id: "w", name: "Workspace", projects: [], computers: ["cmp_mac"], spaces, settings: { space_order: '["b","a"]' } }]);
    const value = fleet.merge("list_spaces", [{ ...local(spaces.map(s => ({ ...s, account: true }))), machine: "cmp_mac" }], "w") as { id: string }[];
    assert.deepEqual(value.map(space => space.id), ["b", "a"]);
    fleet.close();
  }
});

test("storage never wakes a machine and a slow scan is not retried", async () => {
  const off = setup({ cmp_vm: { state: "stopped" } }, [VM]);
  for (const command of ["list_storage", "reclaim_storage", "empty_build_cache", "collect_orphans"]) {
    await assert.rejects(off.fleet.call({ machine: "cmp_vm", workspace: "w", command }), (error: FleetError) => error.code === "machine_off");
  }
  assert.equal(off.link("cmp_vm").calls.length, 0);
  const slow = setup({ cmp_vm: { error: "io" } }, [VM]);
  await assert.rejects(slow.fleet.call({ machine: "cmp_vm", workspace: "w", command: "list_storage", args: { refrescar: true } }));
  assert.equal(slow.link("cmp_vm").calls.length, 1, "the scan may still be running after the transport fails");
});

test("disk resources remain live but are excluded from persisted listings", async () => {
  const storage = memoryStorage();
  const resources = { measured_at: 123, storage: [] };
  const { fleet } = setup({ cmp_vm: { answers: { list_workspaces: { workspaces: [], machine_resources: resources } } } }, [VM], { storage });
  const envelope = { machine: "cmp_vm", workspace: null, command: "list_workspaces" };
  const slice = await fleet.read(envelope);
  assert.deepEqual((slice.value as Record<string, unknown>).machine_resources, resources);
  fleet.flush();
  const persisted = storage.items.get(SLICES_KEY);
  assert.ok(persisted);
  assert.ok(!persisted.includes("machine_resources"));
  assert.ok(persisted.includes("workspaces"));
});

test("branches and usage reopen from their saved slices without waking an off VM", async () => {
  for (const command of ["project_base_branches", "account_limits"]) {
    const storage = memoryStorage();
    const value = command === "project_base_branches" ? { branches: [], selected: "refs/heads/dev" } : { mode: "read", windows: [], fetched_at: 10 };
    const args = command === "project_base_branches" ? { project: "p1" } : { provider: "claude", id: "a1", force: false };
    const envelope = { machine: VM.id, workspace: "w", command, args };
    const first = setup({ cmp_vm: { answers: { [command]: value } } }, [VM], { storage });
    await first.fleet.read(envelope);
    first.fleet.close();
    let wakes = 0;
    const reopened = setup({ cmp_vm: { state: "stopped" } }, [VM], { storage, wake: async () => { wakes++; return true; } });
    try {
      const kept = await reopened.fleet.read(envelope);
      assert.equal(kept.status, "cached");
      assert.deepEqual(kept.value, value);
      assert.equal(wakes, 0);
      assert.equal(reopened.link(VM.id).calls.length, 0);
    } finally { reopened.fleet.close(); }
  }
});

test("opening a task of an off VM reads its tree, changes and previews without waking it", async () => {
  const panel = ["tree_summary", "tree_changes", "tree_files", "tree_folder", "tree_show", "tree_diff", "tree_office_preview", "tree_typst_target", "session_worktree", "artifact_history", "attachment_preview", "office_preview"];
  for (const command of panel) assert.equal(classOf(command), "read", command);
  let wakes = 0;
  const off = setup({ cmp_vm: { state: "stopped" } }, [VM], { wake: async () => { wakes++; return true; } });
  try {
    for (const command of panel) {
      const slice = await off.fleet.read({ machine: VM.id, workspace: "w", command, args: { project: "p1" } });
      assert.equal(slice.has, false, command);
    }
    assert.equal(wakes, 0, "only a message or an action starts the VM");
  } finally { off.fleet.close(); }
  for (const action of ["tree_write", "tree_delete", "tree_rename", "tree_patch", "tree_create_file"]) assert.equal(classOf(action), "action", action);
});

test("what the window asks on its own (mark seen, watch the tree, probes) never wakes an off VM; a gesture still does", async () => {
  for (const command of PASSIVE) {
    assert.ok(!INTENT_COMMANDS.has(command), `${command} is not an intent`);
    assert.ok(!isDeferrable(command), `${command} is not queued by the relay`);
  }
  let wakes = 0;
  const off = setup({ cmp_vm: { state: "stopped", answers: { set_session_stage: null } } }, [VM], {
    wake: async () => {
      wakes++;
      setTimeout(() => off.link(VM.id).setState("online"), 10);
      return true;
    },
  });
  try {
    for (const command of ["mark_task_seen", "watch_task_tree", "unwatch_task_tree", "kn_pending", "source_freshness", "tree_read_part", "list_storage"]) {
      await assert.rejects(off.fleet.call({ machine: VM.id, workspace: "w", command, args: { project: "p1" } }), (e: FleetError) => e.code === "machine_off", command);
    }
    assert.equal(wakes, 0, "opening or focusing the web does not start the VM");
    assert.equal(off.link(VM.id).calls.length, 0);
    await off.fleet.call({ machine: VM.id, workspace: "w", command: "set_session_stage", args: { project: "p1", id: "cmp_vm~t1", stage: null } });
    assert.equal(wakes, 1, "an action the person asked for still starts it");
  } finally { off.fleet.close(); }
});

test("the in-memory slice cache evicts old pages and keeps the recently used one", async () => {
  const { SliceBook } = await import("../src/slices.ts");
  const book = new SliceBook();
  for (let i = 0; i < 40; i++) {
    book.put({ machine: "mac", status: "ok", has: true, at: i, value: "x".repeat(300_000) }, String(i));
    if (i > 0) book.get("mac", "0");
  }
  assert.ok(book.get("mac", "0"));
  assert.equal(book.get("mac", "1"), null);
  assert.ok(book.get("mac", "39"));
  book.forget("mac");
  assert.equal(book.get("mac", "0"), null);
  assert.equal(book.get("mac", "39"), null);
});

test("the new phone UI commands: archived_tasks and keep_awake_status are reads; spaces and keep-awake changes are actions", () => {
  for (const read of ["archived_tasks", "keep_awake_status", "list_ports", "list_spaces"]) assert.equal(classOf(read), "read", read);
  for (const action of ["create_space", "rename_space", "space_delete_preview", "delete_space", "set_keep_awake"]) assert.equal(classOf(action), "action", action);
});

test("the account reads do not wake an off machine; the account changes are actions", () => {
  for (const read of ["danil_sessions", "danil_workspace_account", "danil_connect_options", "account_relay_token", "account_credentials_list", "account_exists"]) assert.equal(classOf(read), "read", read);
  for (const action of ["danil_account_refresh", "danil_sign_in", "danil_workspace_set_account", "account_credentials_upload"]) assert.equal(classOf(action), "action", action);
});

test("delegated rows keep the panel ids, handoff parent included", () => {
  const { fleet } = setup({ cmp_vm: {} });
  const [encoded] = fleet.encode("cmp_vm", [{ ...row("b"), handoff_parent: "a" }], "list_delegated_sessions") as Row[];
  assert.deepEqual([encoded.id, encoded.handoff_parent], ["cmp_vm~b", "cmp_vm~a"]);
});

/** Un relay que ya contesta en vivo aunque el último `state` de la sesión no lo dijo (2026-11-12, «Nube IA»). */
function answeringLink(state: MachineState, answers: Record<string, unknown>) {
  const link = fakeLink({ state, answers });
  link.call = (id, command, workspace, _folder, args) => {
    link.calls.push({ id, command, workspace, args: args as Record<string, unknown> });
    return Promise.resolve({ value: answers[command] ?? null, cached: null });
  };
  return link;
}

test("regression: a machine whose session last said offline or starting is on once it answers live, and the next state frame wins again", async () => {
  for (const stale of ["offline", "starting", "unknown"] as const) {
    const link = answeringLink(stale, { list_live_sessions: [row("t1")], rename_session: { ok: true } });
    const changes: string[] = [];
    let wakes = 0;
    const fleet = new Fleet({ self: "cmp_home", connect: () => link, wake: async () => { wakes++; return true; }, deadlines: { read: 40, action: 200, intent: 400 }, onChange: (m) => changes.push(m) });
    fleet.setMachines([VM]);
    assert.notEqual(fleet.power("cmp_vm"), "on", `${stale}: before any answer, the session's state`);
    const slice = await fleet.read({ machine: "cmp_vm", workspace: "w", command: "list_live_sessions", args: { project: "p1" } });
    assert.equal(slice.status, "ok");
    assert.equal(fleet.power("cmp_vm"), "on", `${stale}: a live answer corrects the power`);
    assert.ok(changes.includes("cmp_vm"), "the window repaints it");
    await fleet.call({ machine: "cmp_vm", workspace: "w", command: "rename_session", args: { id: "cmp_vm~t1", title: "x" } });
    await fleet.wake("cmp_vm");
    assert.equal(wakes, 0, `${stale}: a machine that answers is never woken`);
    link.setState("offline");
    assert.equal(fleet.power("cmp_vm"), "off", "a newer frame from the relay wins");
    link.setState("online");
    assert.equal(fleet.power("cmp_vm"), "on");
  }
});

test("regression: an organization endpoint is always on: no «Encender», no wake, and a stale starting never blocks it", async () => {
  const org = { id: "ws_org", name: "Danil Foundation" };
  // La fila de un endpoint dice `wakeable: true` (el plano de control enciende su servidor).
  const endpoint: MachineInfo = { id: "cmp_nube", name: "Nube IA", wakes: true, organization: { id: "org_01", workspaces: [org] } };
  const link = answeringLink("starting", { send_message: { ok: true }, create_empty_session: { id: "t9" } });
  let wakes = 0;
  const fleet = new Fleet({ self: "cmp_home", connect: () => link, wake: async () => { wakes++; return true; }, deadlines: { read: 40, action: 200, intent: 400 } });
  fleet.setMachines([endpoint]);
  assert.equal(fleet.info("cmp_nube")?.wakes, false, "never offered to be turned on");
  assert.equal(fleet.power("cmp_nube"), "on", "a stale starting is not «Encendiendo…»");
  await fleet.untilOnline("cmp_nube");
  link.setState("offline");
  assert.equal(fleet.power("cmp_nube"), "off", "only its relay saying offline turns it off");
  await assert.rejects(fleet.wake("cmp_nube"), (e: FleetError) => e.code === "machine_off" && e.canWake === false);
  await fleet.call({ machine: "cmp_nube", workspace: org.id, command: "create_empty_session", args: { project: "p1" } });
  assert.equal(wakes, 0, "no wake intent ever reaches the control plane");
  assert.deepEqual(link.calls.map((c) => c.command), ["create_empty_session"], "the action went to its relay instead of being refused as off");
  assert.equal(fleet.power("cmp_nube"), "on", "and its live answer corrected the power");
});

test("the engine's view of a machine counts only until its session says something", () => {
  const { fleet, link } = setup({ cmp_vm: { state: "unknown" } }, [VM]);
  assert.equal(fleet.power("cmp_vm"), "off");
  fleet.observe("cmp_vm", "online");
  assert.equal(fleet.power("cmp_vm"), "on");
  link("cmp_vm").setState("offline");
  assert.equal(fleet.power("cmp_vm"), "off", "the relay wins");
});
