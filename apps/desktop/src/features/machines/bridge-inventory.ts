import type { Computer } from "@terminus/computers";
import type { ContextComputer } from "./session-cloud.ts";

/** El puente conserva las capacidades del motor; el borde aporta la atribución y el estado actual. */
export function mergeBridgeInventory(bridge: readonly Computer[], edge: readonly ContextComputer[]): ContextComputer[] {
  const rows = new Map<string, ContextComputer>(bridge.map((row) => [row.computer_id, row]));
  for (const row of edge) {
    const previous = rows.get(row.computer_id);
    rows.set(row.computer_id, previous ? {
      ...previous, state: row.state,
      ...(row.context ? { context: row.context } : {}),
      ...(row.kind !== undefined ? { kind: row.kind } : {}),
      ...(row.organization_id !== undefined ? { organization_id: row.organization_id } : {}),
    } : row);
  }
  return [...rows.values()];
}
