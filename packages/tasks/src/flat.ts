/**
 * Todas las tareas vivas de todas las carpetas en una sola lista: la lista
 * plana del sidebar (#151) y la del teléfono.
 */

/** Lo que hace falta de una fila para saber si su lanzador ya la enseña. */
export type LauncherRow = {
  launched_by?: string | null;
  parent?: string | null;
  launcher_available?: boolean;
  /** La ejecutora viva de la que continúa por handoff: familia, no destino de respuestas. */
  handoff_parent?: string | null;
  /** El coordinador en otra máquina, ya con el id de la lista (`withRemoteLaunchers`). */
  remote_launcher?: string | null;
};

/**
 * La tarea que lanzó a esta (`parent` de un subagente, `launched_by` de una
 * delegada, `handoff_parent` de un receptor, `remote_launcher` de una hija
 * remota), o `null`.
 */
export function launcherOf(session: LauncherRow): string | null {
  return session.parent ?? session.launched_by ?? session.handoff_parent ?? session.remote_launcher ?? null;
}

/**
 * Si la tarea es subtarea de otra: el riel solo enseña las que abrió la persona.
 * No depende de que el lanzador esté en la lista: archivado, en otra carpeta o
 * sin cargar todavía, la subtarea sigue siendo suya y no sube al riel.
 */
export function isSubtask(session: LauncherRow): boolean {
  return launcherOf(session) !== null;
}

/** Lo mínimo de una tarea para juntarla con las de las demás carpetas. */
export type FlatRow = LauncherRow & {
  id: string;
  created_at: number;
  archived?: boolean | null;
  pinned?: boolean | null;
  subagent?: string | null;
  launcher_name?: string | null;
  parent_agent?: string | null;
  agent?: string | null;
};

/** Una tarea con la carpeta de la que viene; `""` es «sin carpeta», como en el backend. */
export type FlatTask<R extends FlatRow = FlatRow> = { project: string; row: R };

/**
 * Todas las tareas vivas de todas las carpetas en una sola lista, de la más
 * nueva a la más vieja. Una subtarea no sale, salvo fijada o buscando: es la
 * misma regla que la lista por carpeta.
 */
export function flattenTasks<R extends FlatRow>(
  byProject: Record<string, R[]>,
  searching = false,
): FlatTask<R>[] {
  const out: FlatTask<R>[] = [];
  const vistas = new Set<string>();
  // «Sin carpeta» al final: si una fila llegara repetida, gana la carpeta.
  const entradas = Object.entries(byProject).sort(([a], [b]) => Number(a === "") - Number(b === ""));
  for (const [project, rows] of entradas) {
    for (const row of rows) {
      if (row.archived || vistas.has(row.id)) continue;
      vistas.add(row.id);
      if (!searching && !row.pinned && isSubtask(row)) continue;
      out.push({ project, row });
    }
  }
  return out.sort((a, b) => b.row.created_at - a.row.created_at);
}

/**
 * Las tareas vivas que `launcher` lanzó, de la más nueva a la más vieja: las que
 * la lista esconde bajo él (el panel «N tareas delegadas» del escritorio).
 */
export function delegatedOf<R extends FlatRow>(rows: readonly R[], launcher: string): R[] {
  return rows.filter((row) => !row.archived && row.id !== launcher && launcherOf(row) === launcher)
    .sort((a, b) => b.created_at - a.created_at);
}

/** Cuántas tareas tiene cada carpeta, antes de filtrar: el filtro solo ofrece carpetas con tareas. */
export function folderCounts(tasks: readonly FlatTask[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const task of tasks) counts.set(task.project, (counts.get(task.project) ?? 0) + 1);
  return counts;
}
