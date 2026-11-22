import { invoke } from "@tauri-apps/api/core";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import { wslState } from "../model/wsl";

export const MB = 1024 * 1024;
export const mb = (bytes: number | null | undefined) => Math.max(0, Math.round((bytes ?? 0) / MB));

export function stateLabel(state: string): string {
  const found = wslState(state);
  switch (found.state) {
    case "running":
      return t("danil.wsl.state.running");
    case "stopped":
      return t("danil.wsl.state.stopped");
    case "installing":
      return t("danil.wsl.state.installing");
    case "other":
      return t("danil.wsl.state.other", { state });
    default:
      return t("danil.wsl.state.unknown");
  }
}

/** La flota (Ejecutar en) vuelve a leer las distribuciones conectadas. */
export const fleetChanged = () => window.dispatchEvent(new CustomEvent("danil:guests-changed"));

type Workspaces = { workspaces?: { id: string; name?: string }[]; active?: string | null };

/** El workspace de la ventana: la distribución lo crea con el mismo id. */
export async function activeWorkspace(): Promise<{ id: string; name: string } | null> {
  try {
    const list = await invoke<Workspaces>("list_workspaces");
    const id = list?.active ?? null;
    if (!id) return null;
    return { id, name: list.workspaces?.find((w) => w.id === id)?.name ?? id };
  } catch {
    return null;
  }
}
