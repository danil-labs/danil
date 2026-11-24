import assert from "node:assert/strict";
import { test } from "node:test";
import type { CallResult, EngineInfo, EventsPage, MachineState } from "@terminus/computers";
import { Fleet, type Link, type MachineInfo } from "@terminus/fleet";
import "../helpers/catalog.ts";
import {
  formatWslMachineName,
  GUEST_MACHINES_FEATURE,
  isAnyGuestMachine,
  isLocalGuestMachine,
  isRemoteGuestMachine,
  normalizeWslChildren,
  parseRemoteGuestMachineId,
  remoteGuestMachineId,
  type WslChild,
} from "../../../../packages/features/machines/src/model/wsl.ts";
import { createRemoteGuestManager } from "../../../../packages/features/machines/src/queries/remoteGuestLink.ts";
import { createRouter } from "../../../../packages/features/machines/src/queries/router.ts";

type FakeHost = {
  link: Link;
  calls: { command: string; workspace: string | null; args: unknown }[];
  setState(state: MachineState): void;
  emitEngine(engine: EngineInfo): void;
  emitEvents(page: EventsPage): void;
};

function fakeHost(
  initial: MachineState,
  handler: (command: string, workspace: string | null, args: unknown) => Promise<CallResult> | CallResult,
): FakeHost {
  let state = initial;
  const calls: { command: string; workspace: string | null; args: unknown }[] = [];
  const stateListeners = new Set<(s: MachineState) => void>();
  const eventListeners = new Set<(page: EventsPage) => void>();
  const engineListeners = new Set<(engine: EngineInfo) => void>();
  const link: Link = {
    state: () => state,
    async call(_id, command, workspace, _folder, args) {
      calls.push({ command, workspace, args });
      return handler(command, workspace, args);
    },
    onState(listener) {
      stateListeners.add(listener);
      return () => stateListeners.delete(listener);
    },
    onEvents(listener) {
      eventListeners.add(listener);
      return () => eventListeners.delete(listener);
    },
    onEngine(listener) {
      engineListeners.add(listener);
      return () => engineListeners.delete(listener);
    },
    subscribe() {},
    start() {},
    close() {
      stateListeners.clear();
      eventListeners.clear();
      engineListeners.clear();
    },
  };
  return {
    link,
    calls,
    setState(next) {
      if (next === state) return;
      state = next;
      for (const l of stateListeners) l(next);
    },
    emitEngine(engine) {
      for (const l of engineListeners) l(engine);
    },
    emitEvents(page) {
      for (const l of eventListeners) l(page);
    },
  };
}

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 25));

const child = (distro: string, overrides: Partial<WslChild> = {}): WslChild => ({
  id: `wsl:${distro}`,
  channel: "wsl",
  distro,
  name: distro,
  user: "dev",
  home: "/home/dev",
  online: true,
  features: ["task_lifecycle_v1"],
  contract: "c1",
  version: "0.3.5",
  ...overrides,
});

test("WSL naming and remote virtual ID helpers format single/multi distro and parse safely", () => {
  assert.equal(formatWslMachineName("Windows personal", child("Ubuntu"), 1), "Windows personal - WSL");
  assert.equal(formatWslMachineName("Windows personal", child("Ubuntu"), 2), "Windows personal - WSL (Ubuntu)");
  assert.equal(formatWslMachineName("Windows personal", child("Debian"), 2), "Windows personal - WSL (Debian)");
  // Idempotent when already formatted.
  assert.equal(formatWslMachineName("Windows personal", { name: "Windows personal - WSL", distro: "Ubuntu" }, 1), "Windows personal - WSL");

  const virtualId = remoteGuestMachineId("mch_win1", "wsl:Ubuntu");
  assert.equal(virtualId, "mch_win1:wsl:Ubuntu");
  assert.deepEqual(parseRemoteGuestMachineId(virtualId), { host: "mch_win1", guest: "wsl:Ubuntu", distro: "Ubuntu" });
  assert.equal(isRemoteGuestMachine(virtualId), true);
  assert.equal(isLocalGuestMachine(virtualId), false);
  assert.equal(isAnyGuestMachine(virtualId), true);

  assert.equal(isLocalGuestMachine("wsl:Ubuntu"), true);
  assert.equal(isRemoteGuestMachine("wsl:Ubuntu"), false);
  assert.equal(parseRemoteGuestMachineId("mch_win1"), null);
  assert.equal(parseRemoteGuestMachineId("mch_win1~task"), null);

  const normalized = normalizeWslChildren([
    child("Ubuntu"),
    { id: "cmp_bogus", distro: "x", name: "Not WSL", online: true },
    child("Ubuntu"),
  ]);
  assert.equal(normalized.length, 1);
  assert.equal(normalized[0]?.id, "wsl:Ubuntu");
});

test("Desk scoped Free and Paid contexts include local WSL, route commands, and wake stopped WSL on send_message", async () => {
  let wslState: MachineState = "offline";
  const wslListeners = new Set<(s: MachineState) => void>();
  const wslCalls: { command: string; workspace: string | null; args: unknown }[] = [];
  const cloudCalls: { command: string; workspace: string | null }[] = [];
  const wakeCalls: string[] = [];

  const fleet = new Fleet({
    self: "local",
    selfName: () => "Windows personal",
    connect(info) {
      if (info.id === "wsl:Ubuntu") {
        return {
          state: () => wslState,
          onState: (l) => {
            wslListeners.add(l);
            return () => wslListeners.delete(l);
          },
          onEvents: () => () => {},
          subscribe() {},
          start() {},
          close() {
            wslListeners.clear();
          },
          async call(_id, command, workspace, _folder, args) {
            wslCalls.push({ command, workspace, args });
            if (command === "send_message") return { value: "wsl-t1", cached: null };
            if (command === "list_live_sessions") return { value: [{ id: "wsl-existing" }], cached: null };
            return { value: [], cached: null };
          },
        } satisfies Link;
      }
      return {
        state: () => "online",
        onState: () => () => {},
        onEvents: () => () => {},
        subscribe() {},
        start() {},
        close() {},
        async call(_id, command, workspace) {
          cloudCalls.push({ command, workspace });
          return { value: command === "list_live_sessions" ? [{ id: "cloud-t1" }] : "cloud-sent", cached: null };
        },
      } satisfies Link;
    },
    wake: async (id) => {
      wakeCalls.push(id);
      if (id === "wsl:Ubuntu") {
        wslState = "online";
        for (const l of wslListeners) l("online");
        return true;
      }
      return false;
    },
  });

  fleet.setMachines([
    { id: "vm", name: "Org VM", wakes: true, kind: "organization", organizationId: "org_paid", context: "paid", linked: new Set(["ws_shared", "ws_remote"]) },
    { id: "wsl:Ubuntu", name: "Windows personal - WSL", wakes: true, child: true, os: "linux", linked: null },
  ]);
  fleet.setListing("vm", [{ id: "ws_shared", name: "Shared" }, { id: "ws_remote", name: "Remote Only" }], "paid");

  const router = createRouter({
    self: "local",
    fleet,
    contextInfo: (ctx) =>
      ctx === "free"
        ? { org: "org_free", plan: "free" }
        : ctx === "paid"
          ? { org: "org_paid", plan: "teams" }
          : null,
    native: async (command) => {
      if (command === "list_workspaces") {
        return {
          workspaces: [
            { id: "ws_free", name: "Free WS", account: { org: "org_free" } },
            { id: "ws_shared", name: "Shared", account: { org: "org_paid" } },
          ],
          active: "ws_free",
        };
      }
      if (command === "list_live_sessions") return [{ id: "win-t1" }];
      return "win-sent";
    },
  });

  // 1. Free context: local WSL is listed, runnable, wakes on send_message, and does not hijack default lead.
  await router.handle("set_active_workspace", { id: "ws_free" }, { headers: { "x-danil-context": "free" } });
  const freeMachines = (await router.handle("machine_list")) as { id: string; active: boolean; hosts: boolean | null; materializes: boolean; refuses: boolean }[];
  assert.deepEqual(freeMachines.map((m) => m.id).sort(), ["local", "wsl:Ubuntu"]);
  assert.equal(freeMachines.find((m) => m.id === "local")?.active, true);
  assert.equal(freeMachines.find((m) => m.id === "wsl:Ubuntu")?.materializes, true);
  assert.equal(freeMachines.find((m) => m.id === "wsl:Ubuntu")?.refuses, false);

  const taskId = await router.handle(
    "send_message",
    { text: "run on wsl" },
    { headers: { "x-danil-context": "free", "x-terminus-machine": "wsl:Ubuntu" } },
  );
  assert.equal(taskId, "wsl:Ubuntu~wsl-t1");
  assert.deepEqual(wakeCalls, ["wsl:Ubuntu"]);
  assert.equal(wslCalls.at(-1)?.command, "send_message");
  assert.equal(wslCalls.at(-1)?.workspace, "ws_free");

  // 2. Paid org workspace hosted on this Windows PC: local, org VM, and local WSL are all offered.
  await router.handle("set_active_workspace", { id: "ws_shared" }, { headers: { "x-danil-context": "paid" } });
  const sharedMachines = (await router.handle("machine_list")) as { id: string; hosts: boolean | null; materializes: boolean; refuses: boolean }[];
  assert.equal(sharedMachines.find((m) => m.id === "wsl:Ubuntu")?.hosts, true);
  assert.equal(sharedMachines.find((m) => m.id === "wsl:Ubuntu")?.materializes, true);
  assert.equal(sharedMachines.find((m) => m.id === "wsl:Ubuntu")?.refuses, false);

  // 3. Paid org workspace NOT hosted on this Windows PC: local WSL does not leak into it.
  await router.handle("set_active_workspace", { id: "ws_remote" }, { headers: { "x-danil-context": "paid" } });
  const remoteOnlyMachines = (await router.handle("machine_list")) as { id: string; hosts: boolean | null; materializes: boolean; refuses: boolean }[];
  assert.equal(remoteOnlyMachines.find((m) => m.id === "wsl:Ubuntu")?.hosts, false);
  assert.equal(remoteOnlyMachines.find((m) => m.id === "wsl:Ubuntu")?.materializes, false);
  assert.equal(remoteOnlyMachines.find((m) => m.id === "wsl:Ubuntu")?.refuses, true);
  assert.equal(cloudCalls.length, 0);

  router.close();
});

test("Web discovers remote WSL through personal Windows host, tunnels guest_call/guest_start, and isolates host disconnect", async () => {
  let hostChildren: WslChild[] = [child("Ubuntu", { online: false })];
  const winHost = fakeHost("online", (command, workspace, args) => {
    if (command === "guest_children") return { value: hostChildren, cached: null };
    if (command === "guest_start") {
      hostChildren = hostChildren.map((c) => (c.id === (args as { machine: string }).machine ? { ...c, online: true } : c));
      return { value: true, cached: null };
    }
    if (command === "guest_events") return { value: { cursor: 1, events: [] }, cached: null };
    if (command === "guest_call") {
      const payload = args as { machine: string; command: string; workspace: string | null; args: Record<string, unknown> };
      assert.equal(payload.machine, "wsl:Ubuntu");
      if (payload.command === "materialize_workspace") return { value: null, cached: null };
      if (payload.command === "send_message") return { value: "wsl-task-1", cached: null };
      if (payload.command === "load_session") return { value: { id: payload.args.id, turns: [] }, cached: null };
      if (payload.command === "list_live_sessions") return { value: [{ id: "wsl-task-1", title: "En WSL" }], cached: null };
      return { value: [], cached: null };
    }
    if (command === "list_live_sessions") return { value: [{ id: "win-task-1", title: "En Windows" }], cached: null };
    if (command === "send_message") return { value: "win-task-2", cached: null };
    if (command === "list_workspaces") return { value: { workspaces: [{ id: "ws1", name: "Principal" }], active: "ws1" }, cached: null };
    return { value: [], cached: null };
  });

  const cloudHost = fakeHost("online", (command) => {
    if (command === "list_live_sessions") return { value: [{ id: "cloud-task-1", title: "En nube" }], cached: null };
    if (command === "send_message") return { value: "cloud-task-2", cached: null };
    if (command === "list_workspaces") return { value: { workspaces: [{ id: "ws1", name: "Principal" }], active: "ws1" }, cached: null };
    return { value: [], cached: null };
  });

  let baseRows: MachineInfo[] = [
    { id: "mch_win1", name: "Windows personal", wakes: false, kind: "organization", hosted: false, organizationId: "org1", context: "ctx1", os: "windows" },
    { id: "mch_cloud", name: "VM Nube", wakes: true, kind: "organization", hosted: true, organizationId: "org1", context: "ctx1", os: "linux" },
  ];

  const manager = createRemoteGuestManager({
    pollEveryMs: 60_000,
    pollIdleMs: 60_000,
    onChange: () => {
      fleet.setMachines(manager.syncHosts(baseRows));
    },
  });

  const fleet = new Fleet({
    self: null,
    connect: (info) => {
      if (isRemoteGuestMachine(info.id)) return manager.connect(info);
      if (info.id === "mch_win1") return manager.attachHost(info, winHost.link);
      if (info.id === "mch_cloud") return manager.attachHost(info, cloudHost.link);
      throw new Error(`unexpected ${info.id}`);
    },
    wake: async (id, context) => {
      if (isRemoteGuestMachine(id)) return manager.wake(id, context);
      return false;
    },
  });

  fleet.setMachines(manager.syncHosts(baseRows));
  winHost.emitEngine({ contract: "c1", host_version: "0.3.5", service_features: [GUEST_MACHINES_FEATURE] });
  await flush();

  // Discovered virtual WSL route with expected name; hosted cloud VM was never probed.
  const virtualId = "mch_win1:wsl:Ubuntu";
  assert.equal(fleet.info(virtualId, "ctx1")?.name, "Windows personal - WSL");
  assert.equal(fleet.power(virtualId, "ctx1"), "off");
  assert.equal(cloudHost.calls.some((c) => c.command === "guest_children"), false);

  fleet.setListing("mch_win1", [{ id: "ws1", name: "Principal" }], "ctx1");
  fleet.setListing("mch_cloud", [{ id: "ws1", name: "Principal" }], "ctx1");

  const router = createRouter({
    self: null,
    native: null,
    fleet,
    contextInfo: (ctx) => (ctx === "ctx1" ? { org: "org1", plan: "teams" } : null),
  });

  await router.handle("set_active_workspace", { id: "ws1" }, { headers: { "x-danil-context": "ctx1" } });

  const machineRows = (await router.handle("machine_list")) as { id: string; active: boolean; on: boolean; hosts: boolean | null; materializes: boolean; refuses: boolean }[];
  const wslRow = machineRows.find((r) => r.id === virtualId);
  assert.ok(wslRow, "WSL route appears in Web machine_list");
  assert.equal(wslRow.hosts, true);
  assert.equal(wslRow.materializes, true);
  assert.equal(wslRow.refuses, false);
  assert.equal(wslRow.active, false, "WSL never hijacks primary machine as default lead");

  // Sending a message to sleeping remote WSL wakes it via guest_start over mch_win1 and tunnels guest_call with outer workspace.
  const sent = await router.handle(
    "send_message",
    { text: "hola wsl desde web" },
    { headers: { "x-danil-context": "ctx1", "x-terminus-machine": virtualId } },
  );
  assert.equal(sent, `${virtualId}~wsl-task-1`);
  assert.equal(fleet.power(virtualId, "ctx1"), "on");
  assert.ok(winHost.calls.some((c) => c.command === "guest_start"));
  const tunneledSend = winHost.calls.find(
    (c) => c.command === "guest_call" && (c.args as { command?: string }).command === "send_message",
  );
  assert.equal(tunneledSend?.workspace, "ws1", "outer relay envelope preserves workspace for tenancy");

  // Routing by prefixed task ID goes directly to virtual WSL route with bare inner ID.
  const loaded = (await router.handle(
    "load_session",
    { id: `${virtualId}~wsl-task-1`, project: "p1" },
    { headers: { "x-danil-context": "ctx1" } },
  )) as { id: string };
  assert.equal(loaded.id, `${virtualId}~wsl-task-1`);
  const tunneledLoad = winHost.calls.find(
    (c) => c.command === "guest_call" && (c.args as { command?: string }).command === "load_session",
  );
  assert.equal((tunneledLoad?.args as { args?: { id?: string } })?.args?.id, "wsl-task-1");

  // Live guest-state-changed adds a second distro and updates names to include distro labels.
  hostChildren = [child("Ubuntu", { online: true }), child("Debian", { online: true })];
  winHost.emitEvents({ cursor: 2, events: [{ name: "guest-state-changed", payload: {} }] });
  await flush();
  assert.equal(fleet.info("mch_win1:wsl:Ubuntu", "ctx1")?.name, "Windows personal - WSL (Ubuntu)");
  assert.equal(fleet.info("mch_win1:wsl:Debian", "ctx1")?.name, "Windows personal - WSL (Debian)");

  // Renaming the Windows host propagates immediately to virtual WSL route names.
  baseRows = baseRows.map((row) => (row.id === "mch_win1" ? { ...row, name: "PC Oficina" } : row));
  fleet.setMachines(manager.syncHosts(baseRows));
  assert.equal(fleet.info("mch_win1:wsl:Ubuntu", "ctx1")?.name, "PC Oficina - WSL (Ubuntu)");

  // Disconnecting the personal Windows host immediately marks WSL offline without harming the cloud VM.
  winHost.setState("offline");
  assert.equal(fleet.power("mch_win1:wsl:Ubuntu", "ctx1"), "off");
  assert.equal(fleet.power("mch_win1:wsl:Debian", "ctx1"), "off");
  await assert.rejects(
    router.handle(
      "send_message",
      { text: "offline check" },
      { headers: { "x-danil-context": "ctx1", "x-terminus-machine": virtualId } },
    ),
    (err: { detail?: string }) => err.detail === "machine_off",
  );
  // Rest of the fleet keeps working normally.
  assert.equal(
    await router.handle(
      "send_message",
      { text: "cloud works" },
      { headers: { "x-danil-context": "ctx1", "x-terminus-machine": "mch_cloud" } },
    ),
    "mch_cloud~cloud-task-2",
  );

  // Reconnecting the personal Windows host restores WSL automatically.
  winHost.setState("online");
  await flush();
  assert.equal(fleet.power("mch_win1:wsl:Ubuntu", "ctx1"), "on");

  manager.close();
  router.close();
});

test("Remote guest manager backs off cleanly when danil-engine does not support guest_machines_v1", async () => {
  let probeCount = 0;
  let supported = false;
  const legacyWin = fakeHost("online", (command) => {
    if (command === "guest_children") {
      probeCount++;
      if (!supported) throw { code: "command", detail: "unknown command: guest_children" };
      return { value: [child("Ubuntu", { online: true })], cached: null };
    }
    return { value: [], cached: null };
  });
  const macHost = fakeHost("online", (command) => {
    if (command === "guest_children") throw new Error("mac host without feature must never be probed");
    return { value: [], cached: null };
  });

  const baseRows: MachineInfo[] = [
    { id: "mch_legacy_win", name: "Windows vieja", wakes: false, kind: "organization", hosted: false, organizationId: "org1", context: "ctx1", os: "windows" },
    { id: "mch_mac", name: "Mac personal", wakes: false, kind: "organization", hosted: false, organizationId: "org1", context: "ctx1", os: "macos", features: ["light_state_v1"] },
  ];

  const manager = createRemoteGuestManager({
    onChange: () => fleet.setMachines(manager.syncHosts(baseRows)),
  });
  const fleet = new Fleet({
    self: null,
    connect: (info) => {
      if (isRemoteGuestMachine(info.id)) return manager.connect(info);
      if (info.id === "mch_legacy_win") return manager.attachHost(info, legacyWin.link);
      return manager.attachHost(info, macHost.link);
    },
  });

  fleet.setMachines(manager.syncHosts(baseRows));
  await flush();
  assert.equal(probeCount, 1, "legacy Windows host without service_features is probed once");
  assert.equal(fleet.machines("ctx1").length, 2, "no bogus WSL routes added");

  // Reconnecting still does not re-probe once marked unsupported.
  legacyWin.setState("offline");
  legacyWin.setState("online");
  await flush();
  assert.equal(probeCount, 1);

  // Upgrading danil-engine to announce guest_machines_v1 immediately enables discovery.
  supported = true;
  legacyWin.emitEngine({ contract: "c1", host_version: "0.4.0", service_features: [GUEST_MACHINES_FEATURE] });
  await flush();
  assert.equal(probeCount, 2);
  assert.equal(fleet.info("mch_legacy_win:wsl:Ubuntu", "ctx1")?.name, "Windows vieja - WSL");

  manager.close();
  fleet.close();
});
