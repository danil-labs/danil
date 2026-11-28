import type { Computer } from "../../../../platform-client/src/api.ts";
import { confirmedWorkspaceSelection } from "../../../../session/src/workspace-context.ts";
import { createAutoWaker } from "./auto-wake.ts";
import type { Fleet, MachineInfo } from "./fleet/index.ts";
import type { Router } from "../queries/router.ts";

export type DeskCloudTarget = {
  readonly key: string;
  applyMachines: (rows: Computer[]) => void;
  activeContext: () => string | null;
  wakeActive: () => void;
};

/**
 * Conecta el autoencendido real de Desk con el router de contextos:
 * 1. Si la ventana ya confirmó `(workspace, context)` antes de instalar el router, la restaura
 *    y dispara el encendido en cuanto existe el inventario de ese contexto.
 * 2. Si el inventario llega antes que la selección, el `set_active_workspace` posterior en `route`
 *    dispara el encendido al instante sin esperar organizaciones inactivas.
 */
export function createDeskAutoWakeController(options: {
  fleet: () => Fleet;
  router: Pick<Router, "handle" | "activeContext" | "activeWorkspace" | "restoreSelection">;
  hasContextInfo: (context: string) => boolean;
  isCloudMachine: (id: string) => boolean;
  onAwake?: (machine: MachineInfo) => void;
  onSettled?: () => void;
}) {
  const { fleet, router, hasContextInfo, isCloudMachine, onAwake, onSettled } = options;

  const restoreIfConfirmed = () => {
    if (router.activeContext()) return router.activeContext();
    const saved = confirmedWorkspaceSelection();
    if (saved.context && hasContextInfo(saved.context)) {
      router.restoreSelection(saved.context, saved.workspace);
    }
    return router.activeContext();
  };

  const autoWaker = createAutoWaker({
    fleet,
    activeTarget: () => ({ context: restoreIfConfirmed(), workspace: router.activeWorkspace() }),
    onAwake,
    onSettled,
  });

  const wakeActive = () => {
    const ctx = restoreIfConfirmed();
    if (!ctx || !hasContextInfo(ctx)) return;
    autoWaker.wake(ctx, router.activeWorkspace(), {
      auto: true,
      filter: (machine) => isCloudMachine(machine.id) && machine.kind === "organization",
    });
  };

  const route = async (command: string, args?: unknown, init?: { headers?: HeadersInit }) => {
    const result = await router.handle(command, (args ?? {}) as Record<string, unknown>, init);
    if (command === "set_active_workspace") wakeActive();
    return result;
  };

  return {
    wakeActive,
    route,
    onPowerChange: (id: string, context: string | undefined, power: string) => autoWaker.onPowerChange(id, context, power),
    pruneContexts: (contexts: readonly string[]) => autoWaker.pruneContexts(contexts),
    close: () => autoWaker.close(),
  };
}

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
  if (installed.activeContext() === contextId || confirmedWorkspaceSelection().context === contextId) {
    installed.wakeActive();
  }
  onUpdated(contextId);
  return "updated";
}
