/**
 * Hijas remotas: una tarea que otra máquina mandó crear aquí (delegación entre
 * máquinas) trae `remote_parent`, el coordinador que vive allá. Un motor viejo
 * no lo manda y nada cambia. El cliente solo lo usa si la máquina de la hija
 * anuncia `remote_child_v1` en `status.service_features`; sin eso, la fila se
 * lee como siempre y la máquina no se marca desactualizada.
 *
 * Aquí no se calcula profundidad, terminación ni cascada: eso es del motor.
 */

export const REMOTE_CHILD_FEATURE = "remote_child_v1";

/** El coordinador de una hija remota, como lo dice el motor de la hija. */
export type RemoteParent = { machine: string; workspace?: string | null; task: string; request_id?: string | null };

export type RemoteRow = { machine?: string | null; remote_parent?: unknown; remote_launcher?: string | null };

/**
 * Cómo lee las hijas remotas un cliente. `machine` es la de la fila (`null`, la
 * de la ventana); `idOf` da el id con que la lista conoce la tarea `task` de
 * `machine` (en el panel, `máquina~id`; la de la ventana, sin prefijo).
 */
export type RemoteScope = {
  announces(machine: string | null): boolean;
  idOf(machine: string, task: string): string;
};

const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** `remote_parent` si la fila trae uno que se entiende; si no, `null`. */
export function remoteParentOf(row: RemoteRow): RemoteParent | null {
  const p = row.remote_parent;
  if (!p || typeof p !== "object" || Array.isArray(p)) return null;
  const { machine, workspace, task, request_id } = p as Record<string, unknown>;
  if (!text(machine) || !text(task)) return null;
  return { machine: text(machine), workspace: text(workspace) || null, task: text(task), request_id: text(request_id) || null };
}

/** El id del coordinador de una hija remota, o `null` si no lo es o su máquina no anuncia la función. */
export function remoteLauncherOf(row: RemoteRow, scope: RemoteScope): string | null {
  const parent = remoteParentOf(row);
  if (!parent || !scope.announces(row.machine ?? null)) return null;
  return scope.idOf(parent.machine, parent.task) || null;
}

/**
 * Las filas con `remote_launcher` puesto donde toca: a partir de ahí la lista
 * plana, el árbol de subtareas y la actividad del coordinador la tratan como a
 * una delegada más. Una fila sin hija remota sale igual (la misma referencia).
 */
export function withRemoteLaunchers<R extends RemoteRow>(rows: readonly R[], scope: RemoteScope): R[] {
  return rows.map((row) => {
    const launcher = remoteLauncherOf(row, scope);
    if ((row.remote_launcher ?? null) === launcher) return row;
    if (launcher === null) {
      const { remote_launcher: _, ...rest } = row;
      return rest as R;
    }
    return { ...row, remote_launcher: launcher };
  });
}
