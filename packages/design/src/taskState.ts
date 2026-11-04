/** What the sidebar knows about a task to pick its mark. */
export type TaskActivity = {
  aprobando: boolean;
  esperando: boolean;
  viva: boolean;
  /** `interrupted`: la persona detuvo el turno; no es un fallo. */
  outcome?: "delivered" | "failed" | "interrupted" | null;
  /** Un turno cerró después de la última vez que se abrió (`workspace/attention.rs`). */
  sinVer?: boolean;
};

export type TaskState = "approving" | "asked" | "working" | "failed" | "interrupted" | "unseen";

/** The order is the priority: a folded row shows the first one any task has. */
export const TASK_STATES: readonly TaskState[] = ["approving", "asked", "working", "failed", "interrupted", "unseen"];

export function taskPriority(s: TaskActivity): TaskState | null {
  if (s.aprobando) return "approving";
  if (s.esperando) return "asked";
  if (s.viva) return "working";
  if (s.outcome === "failed") return "failed";
  if (s.outcome === "interrupted") return "interrupted";
  if (s.sinVer) return "unseen";
  return null;
}

/**
 * El estado que marca la tarjeta. Lo visto no lleva nada, ni gris: una tarea
 * detenida por ti sólo se marca mientras no la abras, y en verde como
 * cualquier turno sin ver.
 */
export function markedState(s: TaskActivity): TaskState | null {
  const state = taskPriority(s);
  return state === "interrupted" ? (s.sinVer ? "unseen" : null) : state;
}

/** El resultado que resume a un grupo: un fallo pesa más que una interrupción. */
export function rolledOutcome(rows: readonly { outcome?: TaskActivity["outcome"] }[]): "failed" | "interrupted" | null {
  if (rows.some((row) => row.outcome === "failed")) return "failed";
  if (rows.some((row) => row.outcome === "interrupted")) return "interrupted";
  return null;
}

/** The most urgent state of a group, like a folded row of the sidebar. */
export function topState(states: readonly (TaskState | null)[]): TaskState | null {
  return TASK_STATES.find((state) => states.includes(state)) ?? null;
}

/** The only signal of the app: one dot, one size, a closed list of tones. */
export const SIGNAL_DOT_SIZE = 7;
export type SignalTone = "success" | "error" | "warning" | "neutral" | "off" | "working";

/** The tone of a task state; `null` is a task with nothing to say (delivered and seen, archived). */
export function taskSignalTone(state: TaskState | null | undefined): SignalTone {
  switch (state) {
    case "unseen": return "success";
    case "failed": return "error";
    case "approving":
    case "asked": return "warning";
    case "working": return "working";
    default: return "neutral";
  }
}
