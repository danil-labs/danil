/**
 * La tarjeta de dos líneas de una tarea (sidebar del escritorio, #151).
 *
 * Línea 1: el título y la marca de estado. Línea 2: metadatos de la tarea
 * —proveedor, carpeta, máquina (solo si no es la de la ventana) y la cara del
 * agente—, nunca el mensaje que la tarea pide: la pregunta o la aprobación se
 * leen al abrirla.
 *
 * Cada cliente pinta esto a su manera; qué entra y en qué orden sale de aquí.
 * Lo que solo el escritorio sabe (git, PR, worktree) lo añade él.
 */
import { type TaskActivity, type TaskState, taskPriority } from "../../design/src/index.ts";
import { type SidebarContext, type SidebarGroup, type SidebarTask, activityOf, isPinned, needsYou } from "./view.ts";

export type CardTask = SidebarTask & {
  title: string;
  last_message?: string | null;
  /** Con qué proveedor de IA corre (`claude`, `codex`…). */
  provider?: string | null;
  /** La máquina que la corre, si se enseña; `machine_on: false` es apagada. */
  machine?: string | null;
  machine_on?: boolean;
};

export type TaskCard = {
  activity: TaskActivity;
  state: TaskState | null;
  /** Sin estado y entregada: la marca de entregada en vez del círculo vacío. */
  delivered: boolean;
  pinned: boolean;
  needsYou: boolean;
  /** El proveedor de IA, va primero en la línea 2. */
  provider: string | null;
  /** La carpeta de la fila, si se enseña (`""` es sin carpeta y no se enseña). */
  folder: string | null;
  /** La cara del agente; no en su propio chat, que ya es suyo. */
  agent: string | null;
  machine: { id: string; on: boolean } | null;
};

export type CardOptions<T extends CardTask> = Pick<SidebarContext<T>, "live" | "approving" | "folderOf"> & {
  /** Bajo la cabecera de su carpeta, la fila no repite la carpeta. */
  hideFolder?: boolean;
  hideMachine?: boolean;
};

export function taskCard<T extends CardTask>(task: T, options: CardOptions<T>): TaskCard {
  const activity = activityOf(task, options);
  const state = taskPriority(activity);
  const folder = options.hideFolder ? null : ((options.folderOf ? options.folderOf(task) : task.folder) || null);
  return {
    activity,
    state,
    delivered: !state && activity.outcome === "delivered",
    pinned: isPinned(task),
    needsYou: needsYou(state),
    provider: task.provider || null,
    folder,
    agent: task.agent && !task.chat_de_agente ? task.agent : null,
    machine: !options.hideMachine && task.machine ? { id: task.machine, on: task.machine_on !== false } : null,
  };
}

/** Omite sólo los datos que la cabecera de este grupo ya nombra. */
export function groupCardOptions(group: Pick<SidebarGroup<unknown>, "kind" | "key" | "machine">): { hideFolder: boolean; hideMachine: boolean } {
  return {
    hideFolder: group.kind === "folder" && !!group.key,
    hideMachine: group.kind === "machine" || (group.kind === "folder" && !!group.key && group.machine !== undefined),
  };
}
