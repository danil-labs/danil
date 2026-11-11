/** Lo que «Ejecutar en» sabe de una máquina para decidir si correr ahí pide otro workspace (`machine_list`). */
export type WorkspaceHost = {
  hosts: boolean | null;
  materializes?: boolean;
  /** Los workspaces que la ventana ofrece y la máquina tiene; primero los de una organización. */
  workspaces?: readonly { id: string; name: string }[];
};

/**
 * El workspace al que cambiar para correr en `machine`: `null` si puede correr
 * `workspace` (lo tiene o lo hace suyo); `"none"` si no tiene ninguno que la
 * ventana ofrezca.
 */
export function workspaceToRun(machine: WorkspaceHost, workspace: string | null): { id: string; name: string } | "none" | null {
  if (!workspace || machine.hosts !== false || machine.materializes) return null;
  const own = machine.workspaces ?? [];
  if (own.some((w) => w.id === workspace)) return null;
  return own[0] ?? "none";
}
