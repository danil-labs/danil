import type { Computer } from "../../../../platform-client/src/api.ts";
import { type ContextComputer, contextMachineKey } from "../queries/session-cloud.ts";

/** El puente conserva las capacidades del motor; el borde aporta la atribución y el estado actual. */
export function mergeBridgeInventory(bridge: readonly Computer[], edge: readonly ContextComputer[]): ContextComputer[] {
  const byMachine = new Map(bridge.map((row) => [row.computer_id, row]));
  const scoped = new Set(edge.filter((row) => row.context).map((row) => row.computer_id));
  const rows = new Map<string, ContextComputer>(bridge.filter((row) => !scoped.has(row.computer_id)).map((row) => [contextMachineKey(row.computer_id), row]));
  for (const row of edge) {
    const previous = byMachine.get(row.computer_id);
    rows.set(contextMachineKey(row.computer_id, row.context), previous ? {
      ...previous, state: row.state,
      ...(row.context ? { context: row.context } : {}),
      ...(row.kind !== undefined ? { kind: row.kind } : {}),
      ...(row.organization_id !== undefined ? { organization_id: row.organization_id } : {}),
    } : row);
  }
  return [...rows.values()];
}
