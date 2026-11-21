import assert from "node:assert/strict";
import { test } from "node:test";
import { mergeByMachineId } from "../../src/features/machines/merge-by-machine.ts";

// La forma real de `/v1/machines` (machine-provisioning): la Mac conectada, una fila por organización.
const mac = (id: string, org: string) => ({ machine_id: id, name: "Mac de Alberto", state: "running", kind: "connected", person_id: "per_alberto", organization_id: org });
const personal = { id: "org_personal", name: "Cuenta de Alberto" };
const danil = { id: "org_danil", name: "Danil" };

test("la misma Mac en dos organizaciones es una fila con las dos organizaciones", () => {
  const rows = mergeByMachineId([
    { machine: mac("mch_1", personal.id), organization: personal, status: "offline", at: null },
    { machine: mac("mch_1", danil.id), organization: danil, status: "online", at: 5 },
  ]);
  assert.deepEqual(rows, [{ id: "mch_1", name: "Mac de Alberto", status: "online", at: 5, organizations: [personal, danil] }]);
});

test("dos id distintos siguen siendo dos filas, distinguidas por su organización", () => {
  const rows = mergeByMachineId([
    { machine: mac("mch_1", personal.id), organization: personal, status: "online", at: null },
    { machine: mac("mch_2", danil.id), organization: danil, status: "online", at: null },
  ]);
  assert.deepEqual(rows.map((r) => [r.id, r.name, r.organizations]), [
    ["mch_1", "Mac de Alberto · Cuenta de Alberto", [personal]],
    ["mch_2", "Mac de Alberto · Danil", [danil]],
  ]);
});
