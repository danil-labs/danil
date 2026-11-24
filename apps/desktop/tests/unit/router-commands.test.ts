import assert from "node:assert/strict";
import { test } from "node:test";
import { Fleet, type Link, type MachineInfo } from "@terminus/fleet";
import "../helpers/catalog.ts";
import { CONTEXT } from "../../../../packages/features/machines/src/model/router-commands.ts";
import { createRouter } from "../../../../packages/features/machines/src/queries/router.ts";

type Args = Record<string, unknown>;
type Call = { command: string; args: Args; workspace: string | null; id: string };

function fakeLink(answers: Record<string, unknown>) {
  const calls: Call[] = [];
  const link: Link & { calls: Call[] } = {
    calls,
    state: () => "online",
    call(id, command, workspace, _folder, args) {
      calls.push({ id, command, workspace, args: args as Args });
      if (!(command in answers)) return Promise.reject({ code: "command" });
      return Promise.resolve({ value: answers[command], cached: null });
    },
    onState: () => () => {},
    onEvents: () => () => {},
    subscribe() {},
    start() {},
    close() {},
  };
  return link;
}

const VM: MachineInfo = { id: "cmp_vm", name: "Danil VM", wakes: true };
const MAC: MachineInfo = { id: "cmp_mac", name: "Mac de Ana", wakes: false };

test("router-commands includes sync_workspace_context in CONTEXT and routes it to the context owner", async () => {
  assert.equal(CONTEXT.has("sync_workspace_context"), true);
  const vm = fakeLink({
    list_workspaces: { workspaces: [{ id: "w", context_root: null }], active: "w" },
    sync_workspace_context: "vm",
  });
  const mac = fakeLink({
    list_workspaces: { workspaces: [{ id: "w", context_root: "root" }], active: "w" },
    sync_workspace_context: "mac",
  });
  const links = { cmp_vm: vm, cmp_mac: mac };
  const fleet = new Fleet({
    self: null,
    connect: (info) => links[info.id as keyof typeof links],
    deadlines: { read: 40, action: 200, intent: 400 },
  });
  fleet.setMachines([VM, MAC]);
  const router = createRouter({ self: null, fleet, native: null });
  try {
    await router.handle("list_workspaces");
    assert.equal(await router.handle("sync_workspace_context", { force: false }), "mac");
    assert.equal(mac.calls.filter((c) => c.command === "sync_workspace_context").length, 1);
    assert.deepEqual(mac.calls.find((c) => c.command === "sync_workspace_context")?.args, { force: false });
    assert.equal(vm.calls.filter((c) => c.command === "sync_workspace_context").length, 0);
  } finally {
    fleet.close();
  }
});
