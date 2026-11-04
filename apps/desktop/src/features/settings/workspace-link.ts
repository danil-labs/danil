/**
 * Qué workspace de Danil se puede enlazar con uno local. El enlace es 1 a 1: el
 * que ya tiene otro workspace local no se ofrece.
 */
import type { DirectoryEntry } from "@terminus/computers";

export const isTakenByAnother = (entry: DirectoryEntry, current: string) =>
  entry.workspace_id !== null && entry.workspace_id !== current;

/** Los workspaces de Danil que todavía no están en otro workspace local. */
export function linkCandidates(entries: readonly DirectoryEntry[], current: string): DirectoryEntry[] {
  return entries.filter((entry) => !entry.support && entry.danil_workspace_id !== null && entry.workspace_id !== current);
}

/**
 * Subir lo puede pedir quien tenga sesión, con un workspace suyo que aún no está en la
 * nube. Crea solo su workspace personal; si ya lo tiene, el plano de control lo dice.
 */
export function canCreateWorkspace(entries: readonly DirectoryEntry[], workspace: string | null): boolean {
  return entries.some((entry) => entry.workspace_id === workspace && entry.owner && !entry.support && entry.danil_workspace_id === null);
}

/** El código del plano de control, agrupado para el texto que se pinta. */
export function linkProblem(code: string | null | undefined): string {
  if (code === "danil_workspace_taken" || code === "workspace_already_linked") return "taken";
  if (code === "not_account_admin") return "not_admin";
  if (code === "account_not_enabled") return "not_enabled";
  return code || "failed";
}
