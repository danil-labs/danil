// GENERADO por packages/engine-client/scripts/generate.mjs. No editar a mano.
import type { EngineTransport } from "../transport.ts";
import type { CliTaskAdoptParams, CliTaskAdoptOutput, CliTaskAnswerParams, CliTaskAnswerOutput, CliTaskArchiveParams, CliTaskArchiveOutput, CliTaskAskParams, CliTaskAskOutput, CliTaskBudgetParams, CliTaskBudgetOutput, CliTaskBudgetCancelParams, CliTaskBudgetCancelOutput, CliTaskBudgetCreateParams, CliTaskBudgetCreateOutput, CliTaskBudgetExtendParams, CliTaskBudgetExtendOutput, CliTaskCheckpointParams, CliTaskCheckpointOutput, CliTaskCreateParams, CliTaskCreateOutput, CliTaskDeleteParams, CliTaskDeleteOutput, CliTaskExportSessionParams, CliTaskExportSessionOutput, CliTaskHandoffParams, CliTaskHandoffOutput, CliTaskListParams, CliTaskListOutput, CliTaskMoveParams, CliTaskMoveOutput, CliTaskNotifyParams, CliTaskNotifyOutput, CliTaskOpenParams, CliTaskOpenOutput, CliTaskPermissionParams, CliTaskPermissionOutput, CliTaskReadParams, CliTaskReadOutput, CliTaskReparentParams, CliTaskReparentOutput, CliTaskReplyParams, CliTaskReplyOutput } from "../commands/task-1.ts";

export function bind_task_1(t: EngineTransport) {
  return {
    "task adopt": () => t.call("task adopt", {}) as Promise<CliTaskAdoptOutput>,
    "task answer": () => t.call("task answer", {}) as Promise<CliTaskAnswerOutput>,
    "task archive": () => t.call("task archive", {}) as Promise<CliTaskArchiveOutput>,
    "task ask": () => t.call("task ask", {}) as Promise<CliTaskAskOutput>,
    "task budget": () => t.call("task budget", {}) as Promise<CliTaskBudgetOutput>,
    "task budget-cancel": () => t.call("task budget-cancel", {}) as Promise<CliTaskBudgetCancelOutput>,
    "task budget-create": () => t.call("task budget-create", {}) as Promise<CliTaskBudgetCreateOutput>,
    "task budget-extend": () => t.call("task budget-extend", {}) as Promise<CliTaskBudgetExtendOutput>,
    "task checkpoint": () => t.call("task checkpoint", {}) as Promise<CliTaskCheckpointOutput>,
    "task create": () => t.call("task create", {}) as Promise<CliTaskCreateOutput>,
    "task delete": () => t.call("task delete", {}) as Promise<CliTaskDeleteOutput>,
    "task export-session": () => t.call("task export-session", {}) as Promise<CliTaskExportSessionOutput>,
    "task handoff": () => t.call("task handoff", {}) as Promise<CliTaskHandoffOutput>,
    "task list": () => t.call("task list", {}) as Promise<CliTaskListOutput>,
    "task move": () => t.call("task move", {}) as Promise<CliTaskMoveOutput>,
    "task notify": () => t.call("task notify", {}) as Promise<CliTaskNotifyOutput>,
    "task open": () => t.call("task open", {}) as Promise<CliTaskOpenOutput>,
    "task permission": () => t.call("task permission", {}) as Promise<CliTaskPermissionOutput>,
    "task read": () => t.call("task read", {}) as Promise<CliTaskReadOutput>,
    "task reparent": () => t.call("task reparent", {}) as Promise<CliTaskReparentOutput>,
    "task reply": () => t.call("task reply", {}) as Promise<CliTaskReplyOutput>,
  };
}
