import { buildTaskTree, taskDescendants, taskIdentity } from "@terminus/tasks";
import type { SessionRow } from "./Sessions";

export type FiltroDeTareas = "all" | "running" | "waiting" | "done";

export function filtrarTareas(rows: SessionRow[], filtro: FiltroDeTareas, vivas: string[], aprobando: string[]): SessionRow[] {
  if (filtro === "running") return rows.filter(row => vivas.includes(row.id));
  if (filtro === "waiting") return rows.filter(row => row.esperando || aprobando.includes(row.id));
  if (filtro === "done") return rows.filter(row => row.stage === "done");
  return rows;
}

/** Las `n` raíces más nuevas con todas sus descendientes: cortar por fila dejaría hijas sin su padre. */
export function primerasRaices(rows: SessionRow[], n: number): { rows: SessionRow[]; quedan: boolean } {
  const roots = buildTaskTree(rows).sort((a, b) => b.tarea.created_at - a.tarea.created_at);
  const included = new Set<string>();
  const visit = (branches: typeof roots) => {
    for (const branch of branches) {
      included.add(taskIdentity(branch.tarea));
      visit(branch.hijas);
    }
  };
  visit(roots.slice(0, n));
  return { rows: rows.filter(row => included.has(taskIdentity(row))), quedan: roots.length > n };
}

export function createdTasks(rows: SessionRow[], agent: string, thread: string | null, folder?: string): SessionRow[] {
  const scoped = folder === undefined ? rows : rows.filter(row => (row.folder ?? "") === folder);
  const conversations = scoped.filter(row => row.chat_de_agente && row.agent === agent && (!thread || row.id === thread));
  const launchers = new Set(conversations.map(taskIdentity));
  const seeds = rows.filter(row => {
    if (row.chat_de_agente || !row.launched_by) return false;
    const linked = launchers.has(taskIdentity({ ...row, id: row.launched_by }));
    if (thread) return conversations.length ? linked : row.launched_by === thread && (folder === undefined || row.folder === folder);
    return linked || row.launcher_name === agent && (folder === undefined || (row.folder ?? "") === folder);
  });
  const ids = new Set([...seeds, ...taskDescendants(rows, seeds)].map(taskIdentity));
  return rows.filter(row => ids.has(taskIdentity(row)));
}
