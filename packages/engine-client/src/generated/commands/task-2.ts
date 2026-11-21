// GENERADO por packages/engine-client/scripts/generate.mjs. No editar a mano.
export type CliTaskRequestHandoffParams = Record<string, never>;
export type CliTaskRequestHandoffOutput = null;

export type CliTaskRequestsParams = Record<string, never>;
export type CliTaskRequestsOutput = null;

export type CliTaskResolveParams = Record<string, never>;
export type CliTaskResolveOutput = null;

export type CliTaskResultParams = Record<string, never>;
export type CliTaskResultOutput = null;

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

export interface TaskLifecycleApplyParams {
  project: string;
  id: string;
  action: string;
  consent: string;
  discard: boolean;
}
export type TaskLifecycleApplyOutput = unknown;

export interface TaskLifecyclePreviewParams {
  project: string;
  id: string;
  action: string;
}
export type TaskLifecyclePreviewOutput = unknown;

export const COMMANDS_TASK_2 = {
  "task request-handoff": { kind: "cli", scope: null, authority: "task", channel: null, relay: false },
  "task requests": { kind: "cli", scope: null, authority: "read", channel: null, relay: false },
  "task resolve": { kind: "cli", scope: null, authority: "task", channel: null, relay: false },
  "task result": { kind: "cli", scope: null, authority: "read", channel: null, relay: false },
  "task save": { kind: "cli", scope: null, authority: "task", channel: null, relay: false },
  "task send": { kind: "cli", scope: null, authority: "task", channel: null, relay: false },
  "task show": { kind: "cli", scope: null, authority: "read", channel: null, relay: false },
  "task status": { kind: "cli", scope: null, authority: "read", channel: null, relay: false },
  "task stop": { kind: "cli", scope: null, authority: "task", channel: null, relay: false },
  task_blockers: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
  task_coordinator: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
  task_history: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
  task_lifecycle_apply: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
  task_lifecycle_preview: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
} as const;
