import test from "node:test";
import assert from "node:assert/strict";
import { webMachineCall } from "../../src/web/workspace-runtime.ts";

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

test("continuation to a wakeable cloud VM wakes and delivers while an offline personal machine still refuses", async () => {
  const deliveries: string[] = [];
  const wakes: string[] = [];
  const fleet = {
    canContinue: () => false,
    info: (machine: string) => ({ wakes: machine === "cloud_vm" }),
    power: () => "starting",
    wake: async (machine: string) => wakes.push(machine),
  };
  const send = (machine: string) => webMachineCall({ call: async () => deliveries.push(machine) } as never, fleet as never, machine)(
    "qa", "send_message", "engine-workspace", null, { session: "task" }, 1000);
  await assert.rejects(send("personal_mac"), { code: "machine_off" });
  await send("cloud_vm");
  assert.deepEqual(wakes, ["cloud_vm"]);
  assert.deepEqual(deliveries, ["cloud_vm"]);
});
