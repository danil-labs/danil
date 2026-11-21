// GENERADO por packages/engine-client/scripts/generate.mjs. No editar a mano.
export type CliTaskAdoptParams = Record<string, never>;
export type CliTaskAdoptOutput = null;

export type CliTaskAnswerParams = Record<string, never>;
export type CliTaskAnswerOutput = null;

export type CliTaskArchiveParams = Record<string, never>;
export type CliTaskArchiveOutput = null;

export type CliTaskAskParams = Record<string, never>;
export type CliTaskAskOutput = null;

export type CliTaskBudgetParams = Record<string, never>;
export type CliTaskBudgetOutput = null;

export type CliTaskBudgetCancelParams = Record<string, never>;
export type CliTaskBudgetCancelOutput = null;

export type CliTaskBudgetCreateParams = Record<string, never>;
export type CliTaskBudgetCreateOutput = null;

export type CliTaskBudgetExtendParams = Record<string, never>;
export type CliTaskBudgetExtendOutput = null;

export type CliTaskCheckpointParams = Record<string, never>;
export type CliTaskCheckpointOutput = null;

export type CliTaskCreateParams = Record<string, never>;
export type CliTaskCreateOutput = null;

export type CliTaskDeleteParams = Record<string, never>;
export type CliTaskDeleteOutput = null;

export type CliTaskExportSessionParams = Record<string, never>;
export type CliTaskExportSessionOutput = null;

export type CliTaskHandoffParams = Record<string, never>;
export type CliTaskHandoffOutput = null;

export type CliTaskListParams = Record<string, never>;
export type CliTaskListOutput = null;

export type CliTaskMoveParams = Record<string, never>;
export type CliTaskMoveOutput = null;

export type CliTaskNotifyParams = Record<string, never>;
export type CliTaskNotifyOutput = null;

export type CliTaskOpenParams = Record<string, never>;
export type CliTaskOpenOutput = null;

export type CliTaskPermissionParams = Record<string, never>;
export type CliTaskPermissionOutput = null;

export type CliTaskReadParams = Record<string, never>;
export type CliTaskReadOutput = null;

export type CliTaskReparentParams = Record<string, never>;
export type CliTaskReparentOutput = null;

export type CliTaskReplyParams = Record<string, never>;
export type CliTaskReplyOutput = null;

export const COMMANDS_TASK_1 = {
  "task adopt": { kind: "cli", scope: null, authority: "admin", channel: null, relay: false },
  "task answer": { kind: "cli", scope: null, authority: "task", channel: null, relay: false },
  "task archive": { kind: "cli", scope: null, authority: "task", channel: null, relay: false },
  "task ask": { kind: "cli", scope: null, authority: "task", channel: null, relay: false },
  "task budget": { kind: "cli", scope: null, authority: "read", channel: null, relay: false },
  "task budget-cancel": { kind: "cli", scope: null, authority: "task", channel: null, relay: false },
  "task budget-create": { kind: "cli", scope: null, authority: "admin", channel: null, relay: false },
  "task budget-extend": { kind: "cli", scope: null, authority: "admin", channel: null, relay: false },
  "task checkpoint": { kind: "cli", scope: null, authority: "read", channel: null, relay: false },
  "task create": { kind: "cli", scope: null, authority: "task", channel: null, relay: false },
  "task delete": { kind: "cli", scope: null, authority: "task", channel: null, relay: false },
  "task export-session": { kind: "cli", scope: null, authority: "admin", channel: null, relay: false },
  "task handoff": { kind: "cli", scope: null, authority: "task", channel: null, relay: false },
  "task list": { kind: "cli", scope: null, authority: "read", channel: null, relay: false },
  "task move": { kind: "cli", scope: null, authority: "task", channel: null, relay: false },
  "task notify": { kind: "cli", scope: null, authority: "task", channel: null, relay: false },
  "task open": { kind: "cli", scope: null, authority: "task", channel: null, relay: false },
  "task permission": { kind: "cli", scope: null, authority: "task", channel: null, relay: false },
  "task read": { kind: "cli", scope: null, authority: "read", channel: null, relay: false },
  "task reparent": { kind: "cli", scope: null, authority: "task", channel: null, relay: false },
  "task reply": { kind: "cli", scope: null, authority: "task", channel: null, relay: false },
} as const;
