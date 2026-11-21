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

// Parseos de respuestas unknown como funciones puras (R12, RV1 #33, RV2 #18)
export function parseProjectItem(raw: unknown): ProjectItem | null {
  if (!raw) return null;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    return { id: trimmed, name: trimmed, taskCount: 0 };
  }
  if (typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    const id = String(obj.id ?? obj.name ?? obj.path ?? "").trim();
    if (!id) return null;
    const name = String(obj.name ?? id).trim() || id;
    const directory = typeof obj.directory === "string" ? obj.directory : undefined;
    const space = typeof obj.space === "string" ? obj.space : null;
    return {
      id,
      name,
      directory,
      space,
      taskCount: 0,
    };
  }
  return null;
}

export function parseProjects(raw: unknown): ProjectItem[] {
  if (!Array.isArray(raw)) return [];
  const items: ProjectItem[] = [];
  for (const item of raw) {
    const parsed = parseProjectItem(item);
    if (parsed) items.push(parsed);
  }
  return items;
}

export function parseTaskRecord(raw: unknown, projectId: string): TaskRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Record<string, unknown>;
  const id = String(item.id ?? item.session ?? "").trim();
  if (!id) return null;
  const title = String(item.title ?? item.name ?? item.id ?? id).trim() || id;
  const status = typeof item.status === "string" ? item.status : "idle";
  const updatedAt = typeof item.updatedAt === "string" ? item.updatedAt : undefined;
  const members = Array.isArray(item.members)
    ? item.members.filter((m): m is string => typeof m === "string")
    : undefined;
  const files = Array.isArray(item.files)
    ? item.files.filter((f): f is string => typeof f === "string")
    : undefined;

  return {
    id,
    project: projectId,
    title,
    status,
    updatedAt,
    members,
    files,
  };
}

export function parseTasks(raw: unknown, projectId: string): TaskRecord[] {
  if (!Array.isArray(raw)) return [];
  const tasks: TaskRecord[] = [];
  for (const item of raw) {
    const parsed = parseTaskRecord(item, projectId);
    if (parsed) tasks.push(parsed);
  }
  return tasks;
}

export function parseDeleteTaskMemberItem(
  raw: unknown,
  defaultTarget: DeleteTaskTarget
): DeleteTaskMemberItem {
  const item = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const insp = (item.inspection && typeof item.inspection === "object"
    ? item.inspection
    : {}) as Record<string, unknown>;
  const integ = typeof item.integration === "string"
    ? (item.integration as TaskIntegrationStatus)
    : "unconfirmed";

  return {
    id: String(item.id ?? defaultTarget.id),
    project: String(item.project ?? defaultTarget.project),
    title: typeof item.title === "string" ? item.title : undefined,
    files: Array.isArray(item.files) ? item.files.filter((f): f is string => typeof f === "string") : [],
    inspection: {
      status: String(insp.status ?? "complete"),
      error: typeof insp.error === "string" ? insp.error : undefined,
    },
    integration: integ,
  };
}

export function parseDeleteTaskPreview(raw: unknown, target: DeleteTaskTarget): DeleteTaskPreview {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const consent = typeof obj.consent === "string" && obj.consent.trim().length > 0 ? obj.consent : null;
  if (!consent) {
    throw new Error("No se pudo obtener la vista previa de eliminación: el motor no proporcionó consentimiento");
  }

  const rawMembers = Array.isArray(obj.members) ? obj.members : [];
  const members = rawMembers.map((m) => parseDeleteTaskMemberItem(m, target));

  return {
    consent,
    members,
  };
}

export function parseDeleteTaskResult(raw: unknown, preview: DeleteTaskPreview): DeleteTaskResult {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const applied = Array.isArray(obj.applied)
    ? (obj.applied as { project: string; id: string }[]).filter(
        (a) => a && typeof a.project === "string" && typeof a.id === "string"
      )
    : preview.members.map((m) => ({ project: m.project, id: m.id }));

  const failures = Array.isArray(obj.failures)
    ? (obj.failures as { project: string; id: string; error: unknown }[]).filter(
        (f) => f && typeof f.project === "string" && typeof f.id === "string"
      )
    : [];

  const status = String(obj.status ?? (failures.length === 0 ? "complete" : "partial"));

  return {
    status,
    applied,
    failures,
  };
}
