import { buildTaskTree, type TaskBranch, type TaskTreeRow } from "../../../../tasks/src/tree.ts";

type Task = TaskTreeRow & {
  archived?: boolean | null;
  chat_de_agente?: boolean;
};

/** Chat persistente de un agente; la vista por agente puede incluirlo. */
export function esChatDeAgente(s: { chat_de_agente?: boolean }): boolean {
  return !!s.chat_de_agente;
}

/** Una tarea con sus encargos, cada uno con los suyos: los CLIs no topan en el segundo nivel. */
export type Rama<T> = TaskBranch<T>;

export function taskTree<T extends Task>(
  sessions: T[],
  archived: boolean | null,
  previas?: Rama<T>[],
  includeChats = false,
): Rama<T>[] {
  return buildTaskTree(sessions.filter(
    (session) =>
      (archived === null || (session.archived === true) === archived) && (includeChats || !esChatDeAgente(session)),
  ), previas);
}

/** Todas las tareas de una rama por debajo de su raíz, a cualquier profundidad. */
export function descendientes<T>(rama: Rama<T>): T[] {
  return rama.hijas.flatMap((h) => [h.tarea, ...descendientes(h)]);
}
