/** Lo que el historial necesita de una tarea para agruparla por su autor. */
export type AuthorRow = {
  launched_by?: string | null;
  launcher_name?: string | null;
  parent?: string | null;
  subagent?: string | null;
  agent?: string | null;
  parent_agent?: string | null;
};

/**
 * El grupo de una tarea. Con `groupByHandler` el grupo sale del encargado y el
 * que no tiene ninguno es `unassigned`, que se lee «Mis tareas». Sin él, `agent`
 * es un encargo cuyo lanzador no se pudo resolver y `unknown` una fila sin
 * `launched_by`: separarlos de `user` evita atribuirle a una persona trabajo que
 * no lanzó.
 */
export function authorKey(session: AuthorRow, groupByHandler = false): string {
  if (groupByHandler) return session.agent ? `agent:${session.agent}` : "unassigned";
  if (session.launched_by || session.parent || session.subagent) {
    const name = session.launcher_name ?? session.parent_agent;
    return name ? `agent:${name}` : "agent";
  }
  return session.launched_by === null ? "user" : "unknown";
}

const rango = (key: string) =>
  key === "user" || key === "unassigned" ? 0 : key.startsWith("agent:") ? 1 : 2;
const nombre = (key: string) =>
  (key.startsWith("agent:") ? key.slice(6) : key).toLowerCase();
const antes = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Los grupos en orden fijo: «Mis tareas» arriba y los agentes por nombre. Si el
 * orden saliera de la lista —que va de la más nueva a la más vieja—, crear una
 * tarea subiría su grupo al tope y los demás saltarían de sitio. Dentro de cada
 * grupo el orden de entrada se conserva, y ya viene por `created_at`.
 */
export function authorKeys(rows: AuthorRow[], groupByHandler = false): string[] {
  const keys = new Set(rows.map((row) => authorKey(row, groupByHandler)));
  return [...keys].sort(
    (a, b) => rango(a) - rango(b) || antes(nombre(a), nombre(b)),
  );
}

// Si la tarea es subtarea de otra y no va en el riel: la misma regla en el teléfono (`@terminus/tasks`).
export { isSubtask } from "@terminus/tasks";
