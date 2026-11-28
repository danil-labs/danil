import type { Computer } from "../../../../platform-client/src/api.ts";

export type DeskCloudTarget = {
  readonly key: string;
  applyMachines: (rows: Computer[]) => void;
  activeContext: () => string | null;
  wakeActive: () => void;
};

/**
 * Aplica la llegada temprana de un contexto de `/v1/machines` en Desk (tanto en arranque
 * en frío con cuenta vinculada o local como en refresco vivo) sin esperar organizaciones inactivas.
 */
export function applyDeskCloudContextReady(options: {
  contextId: string;
  expectedKey: string;
  rows: Computer[];
  hasGuests: boolean;
  installed: DeskCloudTarget | null;
  install: (rows: Computer[]) => void;
  onUpdated: (contextId: string) => void;
}): "installed" | "updated" | "skipped" {
  const { contextId, expectedKey, rows, hasGuests, installed, install, onUpdated } = options;
  if (!installed || installed.key !== expectedKey) {
    if (!rows.length && !hasGuests) return "skipped";
    install(rows);
    return "installed";
  }
  installed.applyMachines(rows);
  if (installed.activeContext() === contextId) installed.wakeActive();
  onUpdated(contextId);
  return "updated";
}
