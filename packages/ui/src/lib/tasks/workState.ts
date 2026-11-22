import { canFinishTask } from "./git.ts";
import type { TaskGit } from "./pull.ts";

export const WORK_STATES = ["draft", "review", "ready", "closed", "unknown"] as const;
export type WorkState = typeof WORK_STATES[number];

/** El estado del trabajo requiere evidencia vigente, independientemente de su actividad. */
export function workStateOf(git: TaskGit | null | undefined): WorkState {
  if (!git || git.stale || !git.kind || git.kind === "none" || git.kind === "unknown") return "unknown";
  if (canFinishTask({}, git, false)) return "ready";
  if (git.kind === "kn") return git.kn === "clean" || git.kn === "draft" ? "draft" : "unknown";
  if (git.pull) {
    if (!git.pull_known) return "unknown";
    switch (git.pull.state) {
      case "open": return "review";
      case "draft": return "draft";
      case "closed": return "closed";
      case "merged": return git.head && git.pull.head_sha && git.head !== git.pull.head_sha ? "draft" : "unknown";
    }
  }
  return git.kind === "branch" && git.head && (git.pull_known || git.has_remote === false) ? "draft" : "unknown";
}
