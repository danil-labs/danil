import assert from "node:assert/strict";
import { test } from "node:test";
import { Fleet, type Link, type MachineInfo, type MachineState } from "@terminus/fleet";
import "../helpers/catalog.ts";
import { createRouter } from "../../../../packages/features/machines/src/queries/router.ts";

type Args = Record<string, unknown>;

const VM: MachineInfo = { id: "cmp_vm", name: "Danil VM", wakes: true };
const REGISTRY = [
  { id: "w", name: "Cloud", computers: ["cmp_vm"], projects: [], settings: null, created_at: "2026-11-24T00:00:00Z" },
];
const row = (id: string, title = id) => ({ id, title, updated_at: 100 });

function fakeLink(handlers: Record<string, (args: Args) => unknown>, initial: MachineState = "online") {
  let state = initial;
  const calls: { command: string; args: Args; workspace: string | null }[] = [];
  const link: Link & { calls: typeof calls } = {
    calls,
    state: () => state,
    call(_id, command, workspace, _folder, args) {
      calls.push({ command, workspace, args: args as Args });
      return new Promise((resolve, reject) => {
        const fn = handlers[command];
        if (!fn) return reject({ code: "command" });
        const run = () => Promise.resolve(fn(args as Args)).then(value => resolve({ value, cached: null }), reject);
        // Simulate async relay round-trip on session reads so gatherAvailable's previousSlice race is exercised.
        if (command === "list_live_sessions") setTimeout(run, 15);
        else run();
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

function memoryStorage() {
  const items = new Map<string, string>();
  return {
    getItem: (k: string) => items.get(k) ?? null,
    setItem: (k: string, v: string) => void items.set(k, v),
    removeItem: (k: string) => void items.delete(k),
  };
}

test("web router: creating and deleting a cloud folderless task returns fresh list_live_sessions without stale residue", async () => {
  let tasks: ReturnType<typeof row>[] = [];
  const vm = fakeLink({
    list_workspaces: () => ({ workspaces: [{ id: "w", name: "Cloud" }], active: "w" }),
    list_live_sessions: () => structuredClone(tasks),
    list_projects: () => [],
    send_message: (args) => {
      assert.equal(args.project, "");
      tasks = [row("t1", "Sin carpeta")];
      return "t1";
    },
    task_lifecycle_apply: (args) => {
      assert.equal(args.project, "");
      tasks = tasks.filter((item) => item.id !== args.id);
      return { status: "complete", applied: [{ project: "", id: args.id }], failures: [] };
    },
  });
  const fleet = new Fleet({ self: null, connect: () => vm, storage: memoryStorage(), deadlines: { read: 200, action: 200, intent: 400 } });
  const router = createRouter({ self: null, fleet, native: null, registry: async () => REGISTRY as never });
  fleet.setMachines([VM]);

  try {
    await router.handle("list_workspaces");
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.deepEqual(await router.handle("list_projects", {}), []);
    const initial = (await router.handle("list_live_sessions", { project: "", open: [] })) as { id: string }[];
    assert.deepEqual(initial, []);

    // Create a folderless task on cloud machine with zero projects registered.
    const created = await router.handle(
      "send_message",
      { project: "", session: null, prompt: "hola nube" },
      { headers: { "x-terminus-machine": "cmp_vm", "x-terminus-workspace": "w" } },
    );
    assert.equal(created, "cmp_vm~t1");

    const afterCreate = (await router.handle("list_live_sessions", { project: "", open: [] })) as { id: string }[];
    assert.deepEqual(afterCreate.map((r) => r.id), ["cmp_vm~t1"]);
    assert.deepEqual(await router.handle("list_projects", {}), [], "folderless task must not create a phantom project");

    await router.handle(
      "task_lifecycle_apply",
      { project: "", id: "cmp_vm~t1", action: "delete", consent: "ok", discard: false },
      { headers: { "x-terminus-machine": "cmp_vm", "x-terminus-workspace": "w" } },
    );

    // Immediately after deletion, list_live_sessions must NOT hand back the stale cached slice with cmp_vm~t1.
    const afterDelete = (await router.handle("list_live_sessions", { project: "", open: [] })) as { id: string }[];
    assert.deepEqual(afterDelete.map((r) => r.id), []);
  } finally {
    router.close();
  }
});

test("desktop router: deleting a cloud folderless task bypasses REFRESH_GAP and stale state_copy index", async () => {
  let remoteTasks = [row("t1", "Nube sin carpeta")];
  const vm = fakeLink({
    list_workspaces: () => ({ workspaces: [{ id: "w", name: "W" }], active: "w" }),
    list_live_sessions: () => structuredClone(remoteTasks),
    task_lifecycle_apply: (args) => {
      remoteTasks = remoteTasks.filter((item) => item.id !== args.id);
      return { status: "complete", applied: [{ project: "", id: args.id }], failures: [] };
    },
  });
  const changes: string[][] = [];
  const fleet = new Fleet({ self: "cmp_home", connect: () => vm, storage: memoryStorage(), deadlines: { read: 200, action: 200, intent: 400 } });
  const router = createRouter({
    self: "cmp_home",
    fleet,
    registry: async () => REGISTRY as never,
    engineFeatures: () => ["light_state_machines_v1"],
    native: async (command) => {
      if (command === "list_workspaces") return { workspaces: [{ id: "w", name: "W" }], active: "w" };
      if (command === "list_live_sessions") return [];
      // Stale state_copy still has t1 until synced.
      if (command === "state_copy") return { version: "v1", data: [{ id: "t1", folder: "", title: "Nube sin carpeta", updated_at: 100 }] };
      return null;
    },
    onSlices: (c) => changes.push(c),
  });
  fleet.setMachines([VM]);

  try {
    await router.handle("list_workspaces");
    const first = (await router.handle("list_live_sessions", { project: "", open: [] })) as { id: string }[];
    assert.deepEqual(first.map((r) => r.id), ["cmp_vm~t1"]);

    await router.handle(
      "task_lifecycle_apply",
      { project: "", id: "cmp_vm~t1", action: "delete", consent: "ok", discard: false },
      { headers: { "x-terminus-machine": "cmp_vm", "x-terminus-workspace": "w" } },
    );

    const vmReadsBefore = vm.calls.filter((c) => c.command === "list_live_sessions").length;
    await router.handle("list_live_sessions", { project: "", open: [] });
    await new Promise((resolve) => setTimeout(resolve, 260));
    const vmReadsAfter = vm.calls.filter((c) => c.command === "list_live_sessions").length;

    assert.ok(vmReadsAfter > vmReadsBefore, "must query the cloud machine instead of serving stale state_copy or throttling");
    assert.ok(changes.flat().includes("sessions"), "must notify the sessions slice after remote deletion");
  } finally {
    router.close();
  }
});
