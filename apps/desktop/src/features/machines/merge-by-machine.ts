import type { Machine } from "@terminus/computers";
import type { MachineStatus } from "../../web/SyncNote";

/** Una organización donde está inscrita la máquina, con el nombre que ve la persona. */
export type MachineOrganization = { id: string; name: string };

/** La fila que llega de una sesión: la máquina como la lista `GET /v1/machines` en esa organización. */
export type SessionMachineRow = {
  machine: Pick<Machine, "machine_id" | "name"> & Partial<Pick<Machine, "kind" | "person_id" | "organization_id">>;
  organization: MachineOrganization;
  status: MachineStatus;
  at: number | null;
};

/** Una máquina una sola vez en la lista, con todas sus organizaciones. */
export type MergedMachineRow = { id: string; name: string; status: MachineStatus; at: number | null; organizations?: MachineOrganization[] };

// La que más dice gana: encendida en un contexto es encendida.
const RANK: Record<MachineStatus, number> = { online: 3, starting: 2, offline: 1, outdated: 0 };

/**
 * Solo para la vista de lista (plan 2026-11-21 § 2.4): la web tiene una sesión por organización y cada
 * una lista la misma Mac. Se juntan por `machine_id`; dos `mch_` distintos siguen siendo dos filas y,
 * si se llaman igual, se distinguen por su organización como antes. La flota, el router y la
 * colocación de workspaces no pasan por aquí.
 */
export function mergeByMachineId(rows: readonly SessionMachineRow[]): (MergedMachineRow & { organizations: MachineOrganization[] })[] {
  const byId = new Map<string, MergedMachineRow & { organizations: MachineOrganization[] }>();
  for (const { machine, organization, status, at } of rows) {
    const found = byId.get(machine.machine_id);
    if (!found) {
      byId.set(machine.machine_id, { id: machine.machine_id, name: machine.name?.trim() || machine.machine_id, status, at, organizations: [organization] });
      continue;
    }
    if (!found.organizations.some((o) => o.id === organization.id)) found.organizations.push(organization);
    if (RANK[status] > RANK[found.status]) found.status = status;
    found.at ??= at;
  }
  const merged = [...byId.values()];
  return merged.map((row) =>
    merged.some((other) => other !== row && other.name === row.name) ? { ...row, name: `${row.name} · ${row.organizations.map((o) => o.name).join(", ")}` } : row,
  );
}
