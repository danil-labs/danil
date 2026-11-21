/**
 * El arranque en dos tiempos: la lista ligera abre la ventana y
 * `workspaces_startup` la confirma.
 *
 * `workspaces_startup` corre las migraciones dentro y puede tardar minutos;
 * `list_workspaces` contesta en segundos (es lo que usa cambiar de workspace).
 * La ventana aplica la lista en cuanto llega y, cuando llega el arranque,
 * decide aquí si lo que pintó sigue valiendo.
 *
 * Lo que no se negocia: `bloqueo` (`workspaces::base_decidida`) solo lo trae el
 * arranque. Llegue cuando llegue, tapa la app aunque la lista ya se haya
 * aplicado; eso lo hace quien llama, antes de mirar `reconciliar`.
 */

type Forma = {
  workspaces: { id: string }[];
  active: string | null;
  migrations?: unknown[];
  bloqueo?: unknown;
};

/**
 * Si la lista ligera basta para abrir la ventana antes del arranque: con un
 * activo que esté en la lista. Sin activo, `aplicar` abriría el alta, y puede
 * ser una instalación que el arranque va a rechazar (`bloqueo`).
 */
export function listaBasta(lista: Forma): boolean {
  if (lista.bloqueo) return false;
  if (lista.active === null) return false;
  return lista.workspaces.some((w) => w.id === lista.active);
}

/**
 * Al llegar `workspaces_startup` con `previa` ya aplicada: se reaplica si cambió
 * el activo, los workspaces o corrió una migración; si no, nada, y la tarea que
 * la persona ya abrió sigue abierta.
 */
export function reconciliar(previa: Forma | null, arranque: Forma): "aplicar" | "nada" {
  if (!previa) return "aplicar";
  if (previa.active !== arranque.active) return "aplicar";
  const antes = previa.workspaces.map((w) => w.id).sort().join("\n");
  const ahora = arranque.workspaces.map((w) => w.id).sort().join("\n");
  if (antes !== ahora) return "aplicar";
  if ((previa.migrations?.length ?? 0) !== (arranque.migrations?.length ?? 0)) return "aplicar";
  return "nada";
}
