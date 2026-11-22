/**
 * El PR de una tarea en su tarjeta: el último chip de la línea 2, después de la
 * cara del agente. Sale de git por tarea (`list_session_git`), no de la fila de
 * la tarea, así que cada cliente lo lee aparte y le pasa aquí lo que trajo.
 *
 * Las reglas son las del riel del escritorio (`hoverCardPull` y `colorDelPr` en
 * `apps/desktop/src/features/projects/`): solo un PR confirmado; su CI solo si
 * es del HEAD de ahora; el número en rojo si el CI falló; y si lo de git es
 * viejo (`stale`), todo en gris, sin afirmar ni el rojo ni el color del estado.
 */

export type CheckState = "unknown" | "none" | "pending" | "success" | "failure";

/** Lo que la tarjeta lee de una fila de `list_session_git` (es parte de su `GitStatus`). */
export type TaskGit = {
  kind?: "none" | "unknown" | "branch" | "detached" | "kn";
  kn?: "clean" | "draft" | "saved" | null;
  branch?: string | null;
  has_remote?: boolean;
  merged_locally?: boolean;
  head: string | null;
  /** La tarea comparte el árbol de otra: su PR se dice en la fila de esa. */
  shared_with: string | null;
  pull: { number: number; state: "open" | "draft" | "merged" | "closed"; head_sha: string; checks?: CheckState; review?: "unknown" | "unreviewed" | "approved" | "changes_requested" } | null;
  pull_known: boolean;
  stale: boolean;
};

/** El color, por lo que significa: cada cliente lo pinta con su tema. */
export type PullTone = "open" | "closed" | "merged" | "muted" | "failure";

export type CardPull = {
  number: number;
  /** `merged_other_head`: se integró, pero la rama siguió; no es este HEAD. */
  state: "open" | "draft" | "closed" | "merged" | "merged_other_head";
  /** El color del icono. */
  tone: PullTone;
  /** El color del número: rojo si el CI de este HEAD falló. */
  numberTone: PullTone;
};

export function cardPull(git: TaskGit | null | undefined): CardPull | null {
  const pull = git?.pull;
  if (!git || !pull || !git.pull_known || git.shared_with) return null;
  const state = pull.state === "merged" && git.head !== pull.head_sha ? "merged_other_head" : pull.state;
  const current = !!git.head && git.head === pull.head_sha && (pull.state === "open" || pull.state === "draft");
  const failing = current && pull.checks === "failure";
  const tone: PullTone = git.stale
    ? "muted"
    : state === "open"
      ? "open"
      : state === "closed"
        ? "closed"
        : state === "merged"
          ? "merged"
          : "muted";
  return { number: pull.number, state, tone, numberTone: failing && !git.stale ? "failure" : tone };
}

export type TaskGitSession = { id: string; parent?: string | null; subagent?: string | null };

export function resolveTaskGit<T extends TaskGit>(
  session: TaskGitSession,
  rows: Record<string, T>,
  sessions: TaskGitSession[],
  fallback: T,
): { status: T; owner: string | null } {
  const origin = rows[session.id] ?? fallback;
  const withOrigin = (status: T) =>
    origin.shared_with && status.shared_with !== origin.shared_with
      ? { ...status, shared_with: origin.shared_with }
      : status;
  const visited = new Set<string>();
  let current = session;
  while (!visited.has(current.id)) {
    visited.add(current.id);
    const status = rows[current.id] ?? fallback;
    const shared = status.shared_with ?? (current.subagent ? current.parent : null);
    const own = { status: withOrigin(status), owner: current.id };
    // Guardado propio gana; un borrador de una hija no tapa al padre integrado.
    if (status.kind === "kn" && status.kn === "saved") return own;
    if (status.kind === "kn" && status.kn === "draft" && !shared) return own;
    if (!shared) return own;
    const parent = sessions.find(row => row.id === shared);
    // Sin la dueña en la lista nadie más enseña esta rama: la fila se queda con ella.
    if (!parent) return own;
    current = parent;
  }
  return { status: fallback, owner: null };
}
