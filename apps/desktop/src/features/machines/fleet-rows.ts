import type { MachineInfo } from "@terminus/fleet";
import { createRoot, createSignal } from "solid-js";
import { rememberMachineNames } from "./known-names.ts";

/**
 * Las filas de la flota instalada en la ventana, tal como las recibió `Fleet.setMachines`.
 * Con `organization`, cada una dice qué workspaces sirve el servidor de esa organización:
 * los ocultos del riel que viajan con la cuenta salen de aquí (`shell/workspace-hidden-wiring.ts`).
 */
const [rows, setRows] = createRoot(() => createSignal<readonly MachineInfo[]>([]));

export const fleetRows = rows;

/** La flota recibió su inventario: se recuerdan los nombres y se publican las filas. */
export function fleetRowsChanged(list: readonly MachineInfo[]) {
  rememberMachineNames(list);
  setRows(list);
}
