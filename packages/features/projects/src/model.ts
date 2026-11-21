import type { EngineClient } from "@danil/engine-client";
import type { Workspace as PlatformWorkspace } from "@danil/platform-client";

// Derivaciones de tipos de clientes generados (R2)
export type RawProjectsOutput = Awaited<ReturnType<EngineClient["list_projects"]>>;
export type RawLiveSessionsOutput = Awaited<ReturnType<EngineClient["list_live_sessions"]>>;
export type RawSessionParams = Parameters<EngineClient["list_live_sessions"]>[0];
export type RawDeleteParams = Parameters<EngineClient["delete_session"]>[0];
export type RawFinishParams = Parameters<EngineClient["finish_task"]>[0];
export type Workspace = PlatformWorkspace;

// Modelos de vista de proyectos y tareas
export interface ProjectItem {
  id: string;
  name: string;
  directory?: string;
  space?: string | null;
  taskCount: number;
}

export interface TaskRecord {
  id: string;
  project: string;
  title: string;
  status: "idle" | "running" | "completed" | "failed" | "archived" | string;
  updatedAt?: string;
  members?: string[];
  files?: string[];
}

export interface WorkspaceProjectsCatalog {
  workspaceId: string;
  projects: ProjectItem[];
  tasksByProject: Record<string, TaskRecord[]>;
  loading: boolean;
  error: Error | null;
}

// Modelos de vista para borrado de tareas (task_lifecycle)
export type TaskIntegrationStatus = "merged" | "unmerged" | "none" | "unconfirmed";

export interface DeleteMemberInspection {
  status: "complete" | "pending" | "error" | string;
  error?: string;
}

export interface DeleteTaskMemberItem {
  id: string;
  project: string;
  title?: string;
  files: string[];
  inspection: DeleteMemberInspection;
  integration: TaskIntegrationStatus;
}

export interface DeleteTaskPreview {
  consent: string;
  members: DeleteTaskMemberItem[];
}

export interface DeleteTaskFailureItem {
  project: string;
  id: string;
  error: unknown;
}

export interface DeleteTaskResult {
  status: "complete" | "partial" | "error" | string;
  applied: { project: string; id: string }[];
  failures: DeleteTaskFailureItem[];
}

export interface DeleteTaskTarget {
  project: string;
  id: string;
  machineName?: string;
  folderName?: (folder: string) => string;
  workspace?: string;
  members?: number;
  options?: unknown;
  panelId?: (task: string) => string;
}
