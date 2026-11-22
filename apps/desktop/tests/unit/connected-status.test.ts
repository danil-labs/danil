/**
 * Las máquinas personales en la lista de Desk (plan «máquinas por organización», v3, T6, con
 * la decisión «la sesión vive en el motor»):
 * Desk no inscribe nada; lee lo que el motor reporta (`danil_connected_status`) y la lista
 * muestra las otras personales con su nombre y sin despertar, sin repetir esta computadora.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { machineToComputer } from "../../../../packages/platform-client/src/machines.ts";
import { CONNECTED_MACHINES_FEATURE, createConnectedStatus } from "../../src/features/machines/connected-status.ts";
import { infoOf } from "../../src/features/machines/machine-info.ts";
import { mergeContextMachines } from "../../src/features/machines/session-cloud.ts";

const DANIL = { context_id: "ctx-danil", org: "org_danil" };
const STATUS = {
  install_id: "inst_01", hostname: "MacBook-de-Ana", platform: "macos",
  organizations: [
    { organization_id: "org_danil", machine_id: "cmp_mac_danil", state: "connected", online: true },
    { organization_id: "org_personal", machine_id: "cmp_mac_personal", state: "error", online: false, error: "owner_not_authorized" },
  ],
};

function engine(opts: { features?: string[][]; local?: boolean; status?: unknown; fails?: boolean } = {}) {
  const calls: string[] = [];
  let reads = 0;
  const invoke = async <T>(command: string): Promise<T> => {
    calls.push(command);
    if (command === "machine_list") {
      const features = opts.features?.[Math.min(reads++, opts.features.length - 1)] ?? [CONNECTED_MACHINES_FEATURE];
      return [{ id: "local", local: opts.local ?? true, features }] as T;
    }
    if (command === "danil_connected_status") {
      if (opts.fails) throw { detail: "unavailable" };
      return (opts.status ?? STATUS) as T;
    }
    throw new Error(`unexpected ${command}`);
  };
  return { invoke, calls };
}

test("reads the machines this engine enrolled, per organization, and never asks the engine to enroll", async () => {
  const e = engine();
  const status = createConnectedStatus(e.invoke);
  await status.read();
  assert.deepEqual([...status.own()].sort(), ["cmp_mac_danil", "cmp_mac_personal"]);
  assert.deepEqual(status.of("org_danil"), { organization_id: "org_danil", machine_id: "cmp_mac_danil", state: "connected", online: true });
  assert.equal(status.of("org_personal")?.error, "owner_not_authorized");
  assert.equal(status.of("org_other"), null);
  assert.deepEqual(e.calls, ["machine_list", "danil_connected_status"]);
});

test("an engine without the feature, or a remote engine, is not asked and nothing fails", async () => {
  for (const e of [engine({ features: [["account_workspace_v1"]] }), engine({ local: false })]) {
    const status = createConnectedStatus(e.invoke);
    await status.read();
    assert.deepEqual([...status.own()], []);
    assert.equal(e.calls.includes("danil_connected_status"), false);
  }
});

test("the feature seen in this run is kept when the fleet's own row comes back without features", async () => {
  const e = engine({ features: [[CONNECTED_MACHINES_FEATURE], []] });
  const status = createConnectedStatus(e.invoke);
  await status.read();
  await status.read();
  assert.equal(e.calls.filter((c) => c === "danil_connected_status").length, 2);
});

test("a failed or malformed read keeps the last known machines; rows without ids are dropped", async () => {
  let reply: () => unknown = () => STATUS;
  const status = createConnectedStatus(async <T>(command: string): Promise<T> => {
    if (command === "machine_list") return [{ id: "local", local: true, features: [CONNECTED_MACHINES_FEATURE] }] as T;
    return reply() as T;
  });
  await status.read();
  reply = () => { throw { detail: "unavailable" }; };
  await status.read();
  reply = () => ({ hostname: "x" });
  await status.read();
  assert.deepEqual([...status.own()].sort(), ["cmp_mac_danil", "cmp_mac_personal"]);
  reply = () => ({ organizations: [{ organization_id: 7 }, null, { organization_id: "org_x", machine_id: "" }, { organization_id: "org_y", machine_id: "cmp_y" }] });
  await status.read();
  assert.deepEqual([...status.own()], ["cmp_y"]);
});

test("the list shows another personal computer by its name and without wake; this computer's row is not repeated", () => {
  const rows = [
    { machine_id: "cmp_vm", name: "Nube", state: "stopped", connection: "disconnected", kind: "organization", organization_id: "org_danil" },
    { machine_id: "cmp_pc", name: "PC-de-Ana", state: "running", connection: "disconnected", kind: "personal", person_id: "user_01A", organization_id: "org_danil" },
    { machine_id: "cmp_mac_danil", name: "MacBook-de-Ana", state: "running", connection: "connected", kind: "personal", person_id: "user_01A", organization_id: "org_danil" },
  ].map(machineToComputer);
  const merged = mergeContextMachines([{ context: DANIL, computers: rows }], new Set(["cmp_mac_danil"]));
  assert.deepEqual(merged.map(infoOf).map((m) => [m.id, m.name, m.wakes, m.kind]), [
    ["cmp_vm", "Nube", true, "organization"],
    ["cmp_pc", "PC-de-Ana", false, "personal"],
  ]);
  // Sin su motor, la personal se pinta sin conexión, no apagada (D-D).
  assert.equal(machineToComputer({ machine_id: "cmp_pc", state: "running", connection: "disconnected", kind: "personal" }).state, "offline");
});
