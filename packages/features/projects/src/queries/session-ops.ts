import type { InvokeOptions } from "@tauri-apps/api/core";
import { invoke } from "../../../../engine-client/src/client.ts";
import { machineOf } from "../../../machines/src/queries/store";

export type Blockers = {
  not_finished: boolean;
  unsaved: { project?: string; session: string; title: string; files: string[] }[];
  conflicts?: unknown[];
};

export type TaskWork = {
  history: {
    archived: boolean;
    events: { kind: string; when: number; commit: string | null }[];
    recovery: { commit: string; when: number } | null;
  };
  branch: string | null;
  alias: string | null;
  path: string;
  available: boolean;
  owned: boolean;
  restorable: boolean;
  recreatable: boolean;
  incomplete: boolean;
};

export const finishTask = (
  project: string,
  id: string,
  options?: InvokeOptions,
): Promise<void> =>
  invoke("finish_task", { project, id }, options);

export const setTaskArchived = (
  project: string,
  id: string,
  archived: boolean,
  options?: InvokeOptions,
): Promise<void> =>
  invoke("set_task_archived", { project, id, archived }, options);

export const getTaskBlockers = (
  project: string,
  id: string,
  finish: boolean,
  options?: InvokeOptions,
): Promise<(Blockers)> =>
  invoke<(Blockers)>("task_blockers", { project, id, finish }, options);

export const discardTaskChanges = (
  project: string,
  id: string,
  files: string[],
  options?: InvokeOptions,
): Promise<void> =>
  invoke("discard_task_changes", { project, id, files }, options);

export const getTaskHistory = (
  target: { project: string; id: string },
): Promise<(TaskWork | undefined)> =>
  invoke<(TaskWork)>("task_history", target, machineOf(target.id) as InvokeOptions).then(
    (work) => (work && typeof work === "object" && "history" in work ? work : undefined),
  );

export const recreateTaskWork = (
  project: string,
  id: string,
): Promise<void> =>
  invoke("recreate_task_work", { project, id }, machineOf(id) as InvokeOptions);
