import { type CheckState, type GitStatus, gitReviewSignals } from "./taskGit.ts";

export type HoverCardPull = {
  number: number;
  state: "open" | "draft" | "closed" | "merged" | "merged_other_head";
  checks: CheckState | null;
};

/** El PR que la tarjeta puede afirmar: solo uno confirmado, y su CI solo si es del HEAD actual. */
export function hoverCardPull(status?: GitStatus): HoverCardPull | null {
  const pull = status?.pull;
  if (!status || !pull || !status.pull_known) return null;
  const state = pull.state === "merged" && status.head !== pull.head_sha ? "merged_other_head" : pull.state;
  const checks = gitReviewSignals(status)?.checks ?? null;
  return { number: pull.number, state, checks: checks === "unknown" || checks === "none" ? null : checks };
}
