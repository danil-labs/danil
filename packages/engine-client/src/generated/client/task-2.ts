// GENERADO por packages/engine-client/scripts/generate.mjs. No editar a mano.
import type { EngineTransport } from "../transport.ts";
import type { CliTaskRequestHandoffParams, CliTaskRequestHandoffOutput, CliTaskRequestsParams, CliTaskRequestsOutput, CliTaskResolveParams, CliTaskResolveOutput, CliTaskResultParams, CliTaskResultOutput, CliTaskSaveParams, CliTaskSaveOutput, CliTaskSendParams, CliTaskSendOutput, CliTaskShowParams, CliTaskShowOutput, CliTaskStatusParams, CliTaskStatusOutput, CliTaskStopParams, CliTaskStopOutput, TaskBlockersParams, TaskBlockersOutput, TaskCoordinatorParams, TaskCoordinatorOutput, TaskHistoryParams, TaskHistoryOutput, TaskLifecycleApplyParams, TaskLifecycleApplyOutput, TaskLifecyclePreviewParams, TaskLifecyclePreviewOutput } from "../commands/task-2.ts";

export function bind_task_2(t: EngineTransport) {
  return {
    "task request-handoff": () => t.call("task request-handoff", {}) as Promise<CliTaskRequestHandoffOutput>,
    "task requests": () => t.call("task requests", {}) as Promise<CliTaskRequestsOutput>,
    "task resolve": () => t.call("task resolve", {}) as Promise<CliTaskResolveOutput>,
    "task result": () => t.call("task result", {}) as Promise<CliTaskResultOutput>,
    "task save": () => t.call("task save", {}) as Promise<CliTaskSaveOutput>,
    "task send": () => t.call("task send", {}) as Promise<CliTaskSendOutput>,
    "task show": () => t.call("task show", {}) as Promise<CliTaskShowOutput>,
    "task status": () => t.call("task status", {}) as Promise<CliTaskStatusOutput>,
    "task stop": () => t.call("task stop", {}) as Promise<CliTaskStopOutput>,
    task_blockers: (params: TaskBlockersParams) => t.call("task_blockers", params) as Promise<TaskBlockersOutput>,
    task_coordinator: (params: TaskCoordinatorParams) => t.call("task_coordinator", params) as Promise<TaskCoordinatorOutput>,
    task_history: (params: TaskHistoryParams) => t.call("task_history", params) as Promise<TaskHistoryOutput>,
    task_lifecycle_apply: (params: TaskLifecycleApplyParams) => t.call("task_lifecycle_apply", params) as Promise<TaskLifecycleApplyOutput>,
    task_lifecycle_preview: (params: TaskLifecyclePreviewParams) => t.call("task_lifecycle_preview", params) as Promise<TaskLifecyclePreviewOutput>,
  };
}
