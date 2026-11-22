/**
 * Lo que anuncia el motor de esta ventana (`status.service_features`), por el IPC nativo.
 * El `invoke` de la ventana pasa por la flota, y su fila propia toma los rasgos del
 * inventario de computers, que puede no traerlos.
 */
import { invoke } from "@tauri-apps/api/core";

export async function engineFeatures(): Promise<string[] | null> {
  try {
    const self = (await invoke<{ local?: boolean; features?: unknown }[]>("machine_list")).find((m) => m.local);
    return Array.isArray(self?.features) ? self.features.filter((f): f is string => typeof f === "string") : null;
  } catch {
    return null;
  }
}
