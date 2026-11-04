/**
 * El git de las tarjetas que se ven (`list_session_git`), para el PR de la
 * línea 2. Va por máquina, workspace y carpeta, y `priority` dice qué tareas
 * refrescar primero: una llamada por carpeta con sus tareas visibles, nunca una
 * por fila. Las tareas sin carpeta no tienen git.
 *
 * Lo leído se guarda por máquina, workspace, carpeta e id. Lo que no se
 * pudo releer (la máquina no contesta, o está apagada) se conserva con
 * `stale`: la tarjeta lo enseña en gris, sin afirmar ni el rojo del CI.
 */
import { resolveTaskGit, retainGitObservation, UNKNOWN_TASK_GIT, type TaskGitStatus, type TaskGitSession } from "@terminus/tasks";

export type GitAsk = { host: string; workspace: string; project: string; priority: string[] };

export function gitAsks(visible: readonly { host: string; workspace: string; folder: string; id: string }[]): GitAsk[] {
  const asks = new Map<string, GitAsk>();
  for (const task of visible) {
    if (!task.folder) continue;
    const key = `${task.host}\u0000${task.workspace}\u0000${task.folder}`;
    const ask = asks.get(key) ?? { host: task.host, workspace: task.workspace, project: task.folder, priority: [] };
    if (!ask.priority.includes(task.id)) ask.priority.push(task.id);
    asks.set(key, ask);
  }
  return [...asks.values()];
}

/** Una firma estable de lo pedido: si no cambia, no se vuelve a preguntar. */
export const gitAsksKey = (asks: readonly GitAsk[]) =>
  asks.map((a) => `${a.host}/${a.workspace}/${a.project}:${[...a.priority].sort().join(",")}`).sort().join("|");

export type GitScope = { host: string; workspace: string; folder: string };
export const gitBookKey = (scope: GitScope, id: string) => JSON.stringify([scope.host, scope.workspace, scope.folder, id]);

export type GitBook = Readonly<Record<string, TaskGitStatus>>;

const UNKNOWN_GIT: TaskGitStatus = { ...UNKNOWN_TASK_GIT, stale: true };

const isRow = (v: unknown): v is TaskGitStatus => !!v && typeof v === "object" && "pull_known" in v;

/**
 * La respuesta de una carpeta en el libro. Una fila que el motor no pudo leer
 * (`kind: "unknown"`) no borra lo que ya se sabía: queda vieja. Una más antigua
 * tampoco pisa lo más nuevo.
 */
export function withGitAnswer(book: GitBook, scope: GitScope, answer: unknown): GitBook {
  if (!answer || typeof answer !== "object") return book;
  let next: Record<string, TaskGitStatus> | null = null;
  for (const [id, row] of Object.entries(answer as Record<string, unknown>)) {
    if (!isRow(row)) continue;
    const key = gitBookKey(scope, id);
    const before = book[key];
    const value = retainGitObservation(before ? { [id]: before } : {}, { [id]: row })[id];
    if (value === before) continue;
    next ??= { ...book };
    next[key] = value;
  }
  return next ?? book;
}

/** Lo que ya se sabía de esas tareas, ahora viejo: no se pudo releer. */
export function staleGit(book: GitBook, scope: GitScope, ids: readonly string[]): GitBook {
  let next: Record<string, TaskGitStatus> | null = null;
  for (const id of ids) {
    const key = gitBookKey(scope, id);
    const before = book[key];
    if (!before || before.stale) continue;
    next ??= { ...book };
    next[key] = { ...before, stale: true };
  }
  return next ?? book;
}

/** Resuelve la rama compartida dentro de la misma máquina, workspace y carpeta. */
type ScopedGitSession = TaskGitSession & GitScope;

export function effectiveGit(book: GitBook, task: ScopedGitSession, tasks: readonly ScopedGitSession[]): TaskGitStatus {
  const scope = task;
  const candidates = tasks.filter(row => row.host === task.host && row.workspace === task.workspace && row.folder === task.folder);
  const rows = Object.fromEntries([task, ...candidates].map(row => [row.id, book[gitBookKey(scope, row.id)]]).filter((entry): entry is [string, TaskGitStatus] => !!entry[1]));
  return resolveTaskGit(task, rows, candidates, UNKNOWN_GIT).status;
}
