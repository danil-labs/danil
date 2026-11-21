// GENERADO por packages/engine-client/scripts/generate.mjs. No editar a mano.
export type CliTaskRequestsParams = Record<string, never>;
export type CliTaskRequestsOutput = null;

export type CliTaskResolveParams = Record<string, never>;
export type CliTaskResolveOutput = null;

export type CliTaskSaveParams = Record<string, never>;
export type CliTaskSaveOutput = null;

export type CliTaskSendParams = Record<string, never>;
export type CliTaskSendOutput = null;

export type CliTaskShowParams = Record<string, never>;
export type CliTaskShowOutput = null;

export type CliTaskStatusParams = Record<string, never>;
export type CliTaskStatusOutput = null;

export type CliTaskStopParams = Record<string, never>;
export type CliTaskStopOutput = null;

export interface TaskBlockersParams {
  project: string;
  id: string;
  finish: boolean;
}
export type TaskBlockersOutput = unknown;

export interface TaskCoordinatorParams {
  project: string;
  id: string;
}
export type TaskCoordinatorOutput = unknown | null;

export interface TaskHistoryParams {
  project: string;
  id: string;
}
export type TaskHistoryOutput = unknown;

export const COMMANDS_TASK_2 = {
  "task requests": { kind: "cli", scope: null, authority: "read", channel: null },
  "task resolve": { kind: "cli", scope: null, authority: "task", channel: null },
  "task save": { kind: "cli", scope: null, authority: "task", channel: null },
  "task send": { kind: "cli", scope: null, authority: "task", channel: null },
  "task show": { kind: "cli", scope: null, authority: "read", channel: null },
  "task status": { kind: "cli", scope: null, authority: "read", channel: null },
  "task stop": { kind: "cli", scope: null, authority: "task", channel: null },
  task_blockers: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  task_coordinator: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  task_history: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
} as const;
