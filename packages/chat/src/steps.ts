/**
 * How a tool name reads in every client: Claude's names and Codex's item types
 * share one table because they name the same act. A name that is not here is
 * `other` and keeps its raw name on screen.
 */
export type StepKind = "read" | "search" | "edit" | "run" | "web" | "plan" | "other";

export function classify(name: string): StepKind {
  switch (name) {
    case "Read":
    case "NotebookRead":
      return "read";
    case "Write":
    case "Edit":
    case "MultiEdit":
    case "NotebookEdit":
    case "file_change":
      return "edit";
    case "Bash":
    case "BashOutput":
    case "KillShell":
    case "command_execution":
      return "run";
    case "Glob":
    case "Grep":
      return "search";
    case "WebFetch":
    case "WebSearch":
    case "web_search":
      return "web";
    case "TodoWrite":
    case "todo_list":
      return "plan";
    default:
      return "other";
  }
}

/** The command without its shell wrapper (Codex sends `zsh -lc "…"`) or a leading `cd … &&`; a bare `cd` stays. */
/** El comando sin su envoltorio de shell (Codex manda `zsh -lc "…"`) y sin un `cd … &&` de preparación; un `cd` solo se queda. */
export { bareCommand } from "./command.ts";

/** The last part of a path, with either slash. */
export const fileName = (path: string) => path.split(/[\\/]/).filter(Boolean).pop() || path;

/** The question the agent leaves in a file is not a step to show. */
export const isQuestionFile = (target: string | null | undefined) => target?.includes(".preguntas.json") ?? false;

/** Several in a row read as one act. A command never joins: each one is its own act. */
const JOINABLE: ReadonlySet<string> = new Set<StepKind>(["read", "search", "edit", "web", "plan", "other"]);
export const joinableKind = (kind: string) => JOINABLE.has(kind);

/** Steps in a row of the same kind become one row, while `canJoin` allows it. */
export function joinSteps<T, K extends string>(
  steps: readonly T[],
  kindOf: (step: T) => K,
  canJoin: (kind: K, step: T, row: readonly T[]) => boolean = joinableKind,
): { kind: K; steps: T[] }[] {
  const rows: { kind: K; steps: T[] }[] = [];
  for (const step of steps) {
    const kind = kindOf(step);
    const last = rows.at(-1);
    if (last && last.kind === kind && canJoin(kind, step, last.steps)) last.steps.push(step);
    else rows.push({ kind, steps: [step] });
  }
  return rows;
}

/** What a stretch of work counts. `permission` is the only kind that is not a tool. */
export type CountedStep = { kind: StepKind | "permission"; target: string | null; allowed?: boolean };
export type StepCount = { kind: StepKind | "allowed" | "denied"; count: number };

/** How many acts of each kind, in reading order and without the empty ones. Three edits to one file are one file. */
export function stepCounts(steps: readonly CountedStep[]): StepCount[] {
  const of = (kind: CountedStep["kind"]) => steps.filter((step) => step.kind === kind);
  const permissions = of("permission");
  const counts: StepCount[] = [
    { kind: "read", count: of("read").length },
    { kind: "search", count: of("search").length },
    { kind: "edit", count: new Set(of("edit").map((step, i) => step.target ?? `#${i}`)).size },
    { kind: "run", count: of("run").length },
    { kind: "web", count: of("web").length },
    { kind: "plan", count: of("plan").length },
    { kind: "other", count: of("other").length },
    { kind: "allowed", count: permissions.filter((step) => step.allowed).length },
    { kind: "denied", count: permissions.filter((step) => !step.allowed).length },
  ];
  return counts.filter(({ count }) => count > 0);
}
