/**
 * Lo que la tarjeta compartida (`taskCard` de `@terminus/tasks`) necesita de
 * una tarea del teléfono. Entre máquinas el id puede repetirse: la tarjeta
 * trabaja con `host/id`.
 */
import type { AttentionState, WorkspaceAttention } from "@terminus/protocol";
import { type CardTask, delegatedAttention, type TaskCard, taskCard, withFamilyActivity } from "@terminus/tasks";
import { type Task, taskKey } from "./engine";

export type Marks = {
  /** `host/id` → estado de atención del motor. */
  attention: Map<string, AttentionState>;
  /** `host/id` con un turno en marcha. */
  live: Set<string>;
};

/** `members`: el id local del workspace en cada máquina; sin él, todos. */
export function marksOf(attention: Record<string, WorkspaceAttention[]>, members: Map<string, string> | null | undefined, live: Set<string>): Marks {
  const map = new Map<string, AttentionState>();
  for (const [host, list] of Object.entries(attention)) {
    const local = members?.get(host);
    if (members && local === undefined) continue;
    for (const w of list) if (local === undefined || w.workspace === local) for (const task of w.tasks) map.set(`${host}/${task.session}`, task.state);
  }
  return { attention: map, live };
}

/** La fila con el id de máquina y lo que dice la atención del motor. */
export function cardTask(task: Task, marks: Marks): CardTask & { key: string } {
  const key = taskKey(task);
  const state = marks.attention.get(key);
  return {
    ...task,
    id: key,
    key,
    folder: task.folderKey,
    esperando: task.esperando || state === "asked",
    outcome: state === "failed" ? "failed" : task.outcome,
    sin_ver: state === "unseen",
  };
}

/** La entrada carga la atención de su familia: la receptora escondida no se ve aquí. */
export function familyTasks(tasks: readonly Task[], delegated: readonly Task[], marks: Marks): Task[] {
  const approving = [...marks.attention].filter(([, s]) => s === "approving").map(([k]) => k);
  return withFamilyActivity(tasks, delegated, (task) => task.host, (rows) =>
    delegatedAttention(rows.map((row) => cardTask(row, marks)), [...marks.live], approving));
}

export function cardOf(task: Task, marks: Marks, hideFolder = false, hideMachine = false): TaskCard {
  const approving = [...marks.attention].filter(([, s]) => s === "approving").map(([k]) => k);
  return taskCard(cardTask(task, marks), { live: marks.live, approving, hideFolder, hideMachine });
}
