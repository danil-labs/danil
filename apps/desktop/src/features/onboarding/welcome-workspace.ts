/**
 * Qué workspace de Danil toma «Conecta tu cuenta de Danil» y cómo queda el
 * workspace local enlazado. Solo lo carga esa pantalla. Sin Solid: las pruebas
 * de Node lo importan.
 */
import type { DirectoryEntry } from "@terminus/computers";

/**
 * Los workspaces de Danil que se pueden tomar. Uno con registro (`workspace_id`)
 * ya vive en otra máquina: se enseña, pero no se toma.
 */
export function welcomeOptions(entries: readonly DirectoryEntry[]): DirectoryEntry[] {
  return entries.filter((entry) => !entry.support && entry.danil_workspace_id !== null);
}

export const isTaken = (entry: DirectoryEntry) => entry.workspace_id !== null;

export type WelcomePick =
  | { kind: "none" }
  | { kind: "taken"; entries: DirectoryEntry[] }
  | { kind: "one"; entry: DirectoryEntry }
  | { kind: "many"; entries: DirectoryEntry[] };

/** Con uno libre se toma directo; con varios se elige; sin ninguno libre se sigue sin enlace. */
export function pickWelcomeWorkspace(entries: readonly DirectoryEntry[]): WelcomePick {
  const options = welcomeOptions(entries);
  const free = options.filter((entry) => !isTaken(entry));
  if (free.length === 1) return { kind: "one", entry: free[0] };
  if (free.length > 1) return { kind: "many", entries: options };
  return options.length ? { kind: "taken", entries: options } : { kind: "none" };
}

export type AdoptDeps = {
  createWorkspace: (name: string) => Promise<{ id: string }>;
  link: (workspaceId: string, danilWorkspaceId: number, account: string) => Promise<void>;
  setAccount: (workspaceId: string, account: string) => Promise<{ error?: string | null }>;
};

/**
 * Crea el workspace local con el nombre del de Danil, lo enlaza y le pone la
 * cuenta. Si el enlace falla, el workspace local queda y el error sube.
 */
export async function adoptDanilWorkspace(
  entry: DirectoryEntry,
  account: string,
  fallbackName: string,
  deps: AdoptDeps,
): Promise<{ id: string; nombre: string }> {
  if (entry.danil_workspace_id === null) throw Object.assign(new Error("link_failed"), { detail: "link_failed" });
  const nombre = entry.name.trim() || fallbackName;
  const local = await deps.createWorkspace(nombre);
  const workspace = { id: local.id, nombre };
  try {
    await deps.link(local.id, entry.danil_workspace_id, account);
    const result = await deps.setAccount(local.id, account);
    if (result.error) throw Object.assign(new Error(result.error), { detail: result.error, workspace });
  } catch (e) {
    throw e && typeof e === "object" ? Object.assign(e, { workspace }) : e;
  }
  return workspace;
}
