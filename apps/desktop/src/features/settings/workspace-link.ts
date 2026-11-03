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
 * Crear solo lo puede pedir un owner o admin de una organización. Una cuenta
 * personal tiene un solo workspace y no crea otro.
 */
export function canCreateWorkspace(entries: readonly DirectoryEntry[]): boolean {
  return entries.some(
    (entry) => !entry.support && entry.kind === "organization" && (entry.role === "owner" || entry.role === "admin"),
  );
}

/** El código del plano de control, agrupado para el texto que se pinta. */
export function linkProblem(code: string | null | undefined): string {
  if (code === "danil_workspace_taken" || code === "workspace_already_linked") return "taken";
  if (code === "not_account_admin") return "not_admin";
  return code || "failed";
}
