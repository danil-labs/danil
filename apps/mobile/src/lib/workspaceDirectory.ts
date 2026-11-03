/**
 * El directorio de la cuenta (`GET /v1/me/workspaces`) cruzado con lo que el
 * teléfono ya conoce de sus máquinas. El plano de control decide quién puede
 * entrar; aquí solo se dice si hay una máquina de la cuenta donde abrirlo.
 * Sin React Native ni el catálogo: se prueba en Node.
 */
import type { DirectoryEntry } from "@terminus/computers";

/** Lo mínimo de un workspace del teléfono para saber si el directorio se puede abrir aquí. */
export type LocalWorkspace = { id: string; hosts: readonly string[] };

/** Una máquina de la cuenta: `linked` es lo que el plano de control dice que tiene vinculado; `null`, que no lo dice. */
export type LocalMachine = { id: string; linked: ReadonlySet<string> | null };

export type DirectoryRow = {
  entry: DirectoryEntry;
  /** Las máquinas del teléfono que tienen el workspace; vacío es que necesita una. */
  machines: string[];
  /** Si una de sus máquinas está en este teléfono: sin ella no se puede abrir. */
  openable: boolean;
};

export type DirectoryRole = "owner" | "admin" | "member" | "support";

/**
 * Cruza cada entrada con los workspaces que el teléfono ya lista y con lo que
 * cada máquina dice tener vinculado (eso se sabe aunque esté apagada). Un
 * workspace que el registro de la cuenta menciona pero que ninguna máquina del
 * teléfono tiene ni publica como vinculado tampoco se puede abrir.
 */
export function directoryRows(
  entries: readonly DirectoryEntry[],
  local: readonly LocalWorkspace[],
  machines: readonly LocalMachine[] = [],
): DirectoryRow[] {
  const byId = new Map(local.map((workspace) => [workspace.id, workspace]));
  return entries.map((entry) => {
    const known = entry.workspace_id ? byId.get(entry.workspace_id) : undefined;
    const ids = [...(known?.hosts ?? [])];
    if (entry.workspace_id) {
      for (const machine of machines) if (machine.linked?.has(entry.workspace_id) && !ids.includes(machine.id)) ids.push(machine.id);
    }
    return { entry, machines: ids, openable: ids.length > 0 };
  });
}

/** El rol que se pinta: el acceso de soporte manda sobre el rol de la cuenta. */
export function directoryRole(entry: DirectoryEntry): DirectoryRole | null {
  if (entry.support) return "support";
  const role = entry.role?.trim().toLocaleLowerCase();
  return role === "owner" || role === "admin" || role === "member" ? role : null;
}

/** Las claves de los fijados tras fijar o quitar `entry`, en el orden de la barra. */
export function pinKeys(entries: readonly DirectoryEntry[], entry: DirectoryEntry): string[] {
  const pinned = entries
    .filter((other) => other.pin !== null)
    .sort((a, b) => (a.pin ?? 0) - (b.pin ?? 0))
    .map((other) => other.key);
  return entry.pin === null ? [...pinned, entry.key] : pinned.filter((key) => key !== entry.key);
}

/** Las entradas con los fijados que se mandaron; el lugar lo da el orden de `keys`. */
export function withPins(entries: readonly DirectoryEntry[], keys: readonly string[]): DirectoryEntry[] {
  return entries.map((entry) => ({ ...entry, pin: keys.includes(entry.key) ? keys.indexOf(entry.key) : null }));
}

/** Los fijados primero, en el orden de la barra; lo demás conserva su orden. */
export function pinnedFirst<T extends { pin: number | null }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => Number(a.pin === null) - Number(b.pin === null) || (a.pin ?? 0) - (b.pin ?? 0));
}
