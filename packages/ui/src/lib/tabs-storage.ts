import { borrarPref, escribirPref, hayPref, leerPref, prefsQueEmpiezan } from "../../../session/src/prefs.ts";
import { tabViewKey as key, workspaceViewKey } from "../../../session/src/workspace-view-scope.ts";
import type { Tab, TaskTab } from "./tabs-types.ts";

// Las temporales vuelven temporales: el siguiente clic las sigue sustituyendo.
export type StoredTabs = { abiertas: TaskTab[]; activa: string | null; temporales?: string[] };

// El índice es el de la tira al cerrar; reinsertar en orden ascendente la reconstruye.
export type ClosedBlock = { tabs: { tab: Tab; index: number }[]; active: string | null };

export const MAX_CLOSED_BLOCKS = 20;

export const readStoredTabs = (k: string): StoredTabs => {
  const g = leerPref<StoredTabs | null>(k, null);
  const openTabs = Array.isArray(g?.abiertas)
    ? g.abiertas.map(asTask).filter((p): p is TaskTab => p !== null)
    : [];
  const temporales = Array.isArray(g?.temporales)
    ? g.temporales.filter((id) => openTabs.some((p) => p.id === id))
    : [];
  return { abiertas: openTabs, activa: g && openTabs.some((p) => p.id === g.activa) ? g.activa : null, temporales };
};

// La clave anterior se conserva para que un build anterior pueda restaurar su tira.
export function migrateLegacyStrip(ws: string, firstSpace: string) {
  if (hayPref(key(ws, null)) && !hayPref(key(ws, firstSpace))) {
    escribirPref(key(ws, firstSpace), readStoredTabs(key(ws, null)));
  }
}

export const storedStrip = (ws: string, space: string) =>
  readStoredTabs(key(ws, space)).abiertas;

export const deleteStoredStrip = (ws: string, space: string) => borrarPref(key(ws, space));

export const spacesWithStoredStrip = (ws: string) =>
  prefsQueEmpiezan(`pestanas.${workspaceViewKey(ws)}.`).map((k) => k.slice(`pestanas.${workspaceViewKey(ws)}.`.length));

export function appendToStoredStrip(ws: string, space: string, p: { id: string; project: string; titulo: string }) {
  const g = readStoredTabs(key(ws, space));
  if (g.abiertas.some((x) => x.id === p.id)) return;
  g.abiertas.push({ ...p, clase: "tarea", session: p.id });
  escribirPref(key(ws, space), g);
}

// Las tiras antiguas no tienen clase ni session; descartarlas borraría las pestañas al actualizar.
function asTask(p: unknown): TaskTab | null {
  if (!p || typeof p !== "object") return null;
  const x = p as Record<string, unknown>;
  if (typeof x.id !== "string" || typeof x.project !== "string") return null;
  if (x.clase !== undefined && x.clase !== "tarea") return null;
  return {
    clase: "tarea",
    id: x.id,
    project: x.project,
    session: x.id,
    titulo: typeof x.titulo === "string" ? x.titulo : "",
  };
}
