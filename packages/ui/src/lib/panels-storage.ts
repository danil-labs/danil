import { borrarPref, escribirPref, leerPref, prefsQueEmpiezan } from "../../../../apps/desktop/src/lib/prefs.ts";
import { panelViewKey as layoutKey, workspaceViewKey } from "../../../../apps/desktop/src/lib/workspace-view-scope.ts";
import type { Layout } from "./panels-types.ts";

export function saveLayout(workspace: string, space: string, r: Layout) {
  escribirPref(layoutKey(workspace, space), r);
}

export function readLayout(workspace: string, space: string): Layout | null {
  const raw = leerPref<unknown>(layoutKey(workspace, space), null);
  return raw && typeof raw === "object" && Array.isArray((raw as Layout).columnas)
    ? (raw as Layout)
    : null;
}

export const deleteLayout = (workspace: string, space: string) =>
  borrarPref(layoutKey(workspace, space));

export const spacesWithLayout = (workspace: string) => {
  const prefix = `panels.${workspaceViewKey(workspace)}.`;
  return prefsQueEmpiezan(prefix).map((k) => k.slice(prefix.length));
};
