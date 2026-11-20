import test from "node:test";
import assert from "node:assert/strict";
import { webMachineCall, selectEngineWorkspace } from "../../src/web/workspace-runtime.ts";

test("only the machine for an existing task may receive its continuation", async () => {
  let live = "vm";
  const deliveries: string[] = [];
  const wakes: string[] = [];
  const fleet = { canContinue: (machine: string) => machine === live, wake: async (machine: string) => wakes.push(machine) };
  const send = (machine: string) => webMachineCall({ call: async () => deliveries.push(machine) } as never, fleet as never, machine)(
    "qa", "send_message", "engine-workspace", null, {session: "task"}, 1000);
  await assert.rejects(send("mac"), {code: "machine_off"});
  await send("vm");
  live = "mac";
  await assert.rejects(send("vm"), {code: "machine_off"});
  await send("mac");
  assert.deepEqual(deliveries, ["vm", "mac"]);
  assert.deepEqual(wakes, deliveries);
});

test("an active account workspace never becomes an engine ID", async () => {
  const selections: unknown[] = [];
  const router = {activeContext: () => "c", activeWorkspace: () => "old",
    handle: async (_cmd: string, args: {id: string | null}) => selections.push(args.id)};
  const row = {id: "17", org: "org_A", engine_workspace_id: null as string | null};
  const directory = {active: () => "17", rows: () => [row]};
  const sync = (org: string) => selectEngineWorkspace(router as never, directory as never, {context: "c", org});
  await sync("org_A");
  row.engine_workspace_id = "engine";
  await sync("org_A");
  await sync("org_B");
  assert.deepEqual(selections, [null, "engine", null]);
});
