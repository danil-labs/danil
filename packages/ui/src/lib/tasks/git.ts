import type { TaskGit } from "./pull.ts";

export type ReviewState = "unknown" | "unreviewed" | "approved" | "changes_requested";
export type KnState = "clean" | "draft" | "saved";

export type TaskGitStatus = Omit<TaskGit, "pull"> & {
  kind: "none" | "unknown" | "branch" | "detached" | "kn";
  kn: KnState | null;
  branch: string | null;
  alias: string | null;
  repository: string;
  pull: (NonNullable<TaskGit["pull"]> & { git_host?: string; review?: ReviewState }) | null;
  checked_at: number | null;
  has_remote: boolean;
  merged_locally: boolean;
};

export const UNKNOWN_TASK_GIT: TaskGitStatus = {
  kind: "unknown", kn: null, branch: null, alias: null, head: null, repository: "", shared_with: null,
  pull: null, pull_known: false, checked_at: null, stale: false, has_remote: false, merged_locally: false,
};

export const sameGit = (a: TaskGitStatus, b: TaskGitStatus) => a === b || JSON.stringify(a) === JSON.stringify(b);

/** Lo remoto solo cuenta si habla de la misma rama y cabeza, y no es más viejo que lo que hay. */
export function mergeRemoteGit(previous: Record<string, TaskGitStatus>, incoming: Record<string, TaskGitStatus>) {
  return Object.fromEntries(Object.entries(previous).map(([id, row]) => {
    const remote = incoming[id];
    if (!remote || remote.repository !== row.repository || remote.kind !== row.kind || remote.branch !== row.branch || remote.head !== row.head
      || (remote.checked_at ?? 0) < (row.checked_at ?? 0)) return [id, row];
    return [id, { ...row, pull: remote.pull, pull_known: remote.pull_known, checked_at: remote.checked_at, stale: remote.stale }];
  }));
}

/** Una fila `unknown` deja vieja la anterior, una más antigua no pisa su `pull`, y lo que no cambió conserva su objeto para no repintar. */
export function retainGitObservation(previous: Record<string, TaskGitStatus>, incoming: Record<string, TaskGitStatus>) {
  return Object.fromEntries(Object.entries(incoming).map(([id, row]) => {
    const next = row.kind === "unknown" && previous[id] ? { ...previous[id], stale: true }
      : (previous[id]?.checked_at ?? 0) > (row.checked_at ?? 0) ? mergeRemoteGit({ [id]: row }, previous)[id] : row;
    return [id, previous[id] && sameGit(previous[id], next) ? previous[id] : next];
  }));
}

/** `remote` actualiza las ramas observadas: por sí solo no descubre los árboles de las tareas. */
export async function readTaskGit<T>(
  read: (remote: boolean) => Promise<T>,
  options: { phase?: "local" | "remote" | "both"; onLocal?: (rows: T) => void; current?: () => boolean } = {},
): Promise<T> {
  const phase = options.phase ?? "both";
  if (phase === "remote") return read(true);
  const local = await read(false);
  options.onLocal?.(local);
  if (phase === "local" || options.current?.() === false) return local;
  return read(true);
}

/** La UI ofrece la acción; `finish_task` vuelve a validar y ejecuta el cierre en el motor. */
export function canFinishTask(
  session: { archived?: boolean | null; subagent?: string | null },
  status: TaskGit | null | undefined,
  busy: boolean,
): boolean {
  if (!status || session.archived || busy || status.stale) return false;
  if (status.kind === "kn") return status.kn === "saved";
  if (status.kind !== "branch" || !status.head) return false;
  if (status.pull) return status.pull_known && status.pull.state === "merged" && status.pull.head_sha === status.head;
  return status.merged_locally === true && (status.pull_known || status.has_remote === false);
}
