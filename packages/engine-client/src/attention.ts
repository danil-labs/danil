/**
 * El evento `attention` llega de dos formas: la lista entera de la máquina (un
 * evento, cada entrada con su `workspace`) o, en un motor de transición, una
 * entrada por evento (`[entrada]`). La lista entera reemplaza, y así se van los
 * workspaces borrados; una sola entrada cambia solo su workspace. Una entrada sin
 * tareas deja ese workspace sin nada que esperar.
 */
export function mergeAttention<E extends { workspace: string }>(current: readonly E[], update: readonly E[]): E[] {
  if (!isSingle(update)) return [...update];
  const [entry] = update;
  const known = current.some((c) => c.workspace === entry.workspace);
  return known ? current.map((c) => (c.workspace === entry.workspace ? entry : c)) : [...current, entry];
}

/** Si `update` es una entrada suelta (la forma partida) y no la lista entera. */
export function isSingle<E>(update: readonly E[]): boolean {
  return update.length === 1;
}
