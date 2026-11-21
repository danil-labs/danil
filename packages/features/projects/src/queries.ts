import { createResource, type Accessor, type Resource } from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import type { MachineConnection } from "@danil/engine-client";
import type {
  ProjectItem,
  TaskRecord,
  DeleteTaskTarget,
  DeleteTaskPreview,
  DeleteTaskResult,
  DeleteTaskMemberItem,
  TaskIntegrationStatus,
} from "./model.ts";

export interface ProjectsState {
  projects: ProjectItem[];
  tasksByProject: Record<string, TaskRecord[]>;
  lastDeletedIds: string[];
}

const [store, setStore] = createStore<ProjectsState>({
  projects: [],
  tasksByProject: {},
  lastDeletedIds: [],
});

export function getProjectsStore(): ProjectsState {
  return store;
}

export function removeTasksFromStore(deleted: { project: string; id: string }[]): void {
  const idsToRemove = new Set(deleted.map((d) => d.id));
  const projectsAffected = new Set(deleted.map((d) => d.project));

  setStore("lastDeletedIds", Array.from(idsToRemove));

  for (const projId of projectsAffected) {
    const currentTasks = store.tasksByProject[projId] ?? [];
    const remaining = currentTasks.filter((t) => !idsToRemove.has(t.id));
    setStore("tasksByProject", projId, reconcile(remaining));
  }

  setStore(
    "projects",
    (p) => projectsAffected.has(p.id),
    "taskCount",
    (count) => {
      const removedCount = deleted.filter((d) => d.project).length;
      return Math.max(0, (count ?? 0) - removedCount);
    }
  );
}

const BATCH_CONCURRENCY = 4;

async function batchMap<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += limit) {
    const chunk = items.slice(i, i + limit);
    const chunkResults = await Promise.all(chunk.map(fn));
    results.push(...chunkResults);
  }
  return results;
}

export async function fetchProjectsAndTasks(
  conn: MachineConnection,
  workspaceId?: string
): Promise<{ projects: ProjectItem[]; tasksByProject: Record<string, TaskRecord[]> }> {
  const rawProjects = (await conn.client.list_projects()) as unknown[];
  const projects: ProjectItem[] = (Array.isArray(rawProjects) ? rawProjects : []).map((p) => {
    if (typeof p === "string") {
      return { id: p, name: p, taskCount: 0 };
    }
    const obj = p as Record<string, unknown>;
    const id = String(obj.id ?? obj.name ?? obj.path ?? "");
    const name = String(obj.name ?? id);
    return {
      id,
      name,
      directory: typeof obj.directory === "string" ? obj.directory : undefined,
      space: typeof obj.space === "string" ? obj.space : null,
      taskCount: 0,
    };
  });

  const clientAny = conn.client as Record<string, unknown>;
  let tasksByProject: Record<string, TaskRecord[]> = {};

  if (typeof clientAny.list_workspace_tasks === "function") {
    const batchRes = (await (
      clientAny.list_workspace_tasks as (args: { workspace?: string }) => Promise<unknown>
    )({ workspace: workspaceId })) as Record<string, TaskRecord[]>;
    if (batchRes && typeof batchRes === "object") {
      tasksByProject = batchRes;
    }
  } else {
    const taskLists = await batchMap(projects, BATCH_CONCURRENCY, async (project) => {
      try {
        let rawTasks: unknown[] = [];
        if (typeof conn.client.list_live_sessions === "function") {
          rawTasks = (await conn.client.list_live_sessions({ project: project.id })) ?? [];
        }
        const tasks: TaskRecord[] = (Array.isArray(rawTasks) ? rawTasks : []).map((t) => {
          const item = t as Record<string, unknown>;
          return {
            id: String(item.id ?? item.session ?? ""),
            project: project.id,
            title: String(item.title ?? item.name ?? item.id ?? "Tarea"),
            status: String(item.status ?? "idle"),
            updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : undefined,
            members: Array.isArray(item.members) ? (item.members as string[]) : undefined,
          };
        });
        return { projectId: project.id, tasks };
      } catch {
        return { projectId: project.id, tasks: [] };
      }
    });

    for (const entry of taskLists) {
      tasksByProject[entry.projectId] = entry.tasks;
    }
  }

  for (const p of projects) {
    p.taskCount = (tasksByProject[p.id] ?? []).length;
  }

  setStore("projects", reconcile(projects));
  for (const [projId, tasks] of Object.entries(tasksByProject)) {
    setStore("tasksByProject", projId, reconcile(tasks));
  }

  return { projects, tasksByProject };
}

export interface UseProjectsResult {
  data: Resource<{ projects: ProjectItem[]; tasksByProject: Record<string, TaskRecord[]> } | undefined>;
  projects: () => ProjectItem[];
  tasksByProject: () => Record<string, TaskRecord[]>;
  loading: () => boolean;
  error: () => unknown;
  refetch: () => void;
  mutate: (val: { projects: ProjectItem[]; tasksByProject: Record<string, TaskRecord[]> } | undefined) => void;
  [Symbol.iterator](): Generator<unknown, void, unknown>;
}

export function useProjects(
  conn: MachineConnection | Accessor<MachineConnection | undefined>,
  workspaceId?: string | Accessor<string | undefined>
): UseProjectsResult {
  const getConn = typeof conn === "function" ? conn : () => conn;
  const getWorkspaceId = typeof workspaceId === "function" ? workspaceId : () => workspaceId;

  const [resource, { refetch, mutate }] = createResource(
    () => {
      const c = getConn();
      if (!c) return null;
      return { conn: c, workspaceId: getWorkspaceId() };
    },
    async (source) => {
      return fetchProjectsAndTasks(source.conn, source.workspaceId);
    }
  );

  return {
    data: resource,
    projects: () => store.projects,
    tasksByProject: () => store.tasksByProject,
    loading: () => resource.loading,
    error: () => resource.error,
    refetch,
    mutate,
    [Symbol.iterator]: function* () {
      yield resource;
      yield { refetch, mutate };
    },
  };
}

export async function inspectTaskDeletion(
  conn: MachineConnection,
  target: DeleteTaskTarget
): Promise<DeleteTaskPreview> {
  const clientAny = conn.client as Record<string, unknown>;
  const args = { project: target.project, id: target.id, action: "delete" };

  if (typeof clientAny.task_lifecycle_preview === "function") {
    const raw = (await (
      clientAny.task_lifecycle_preview as (a: unknown) => Promise<unknown>
    )(args)) as Record<string, unknown>;
    const rawMembers = Array.isArray(raw?.members) ? raw.members : [];
    const members: DeleteTaskMemberItem[] = rawMembers.map((m: unknown) => {
      const item = (m && typeof m === "object" ? m : {}) as Record<string, unknown>;
      const insp = (item.inspection && typeof item.inspection === "object"
        ? item.inspection
        : {}) as Record<string, unknown>;
      const integ = typeof item.integration === "string" ? (item.integration as TaskIntegrationStatus) : "unconfirmed";
      return {
        id: String(item.id ?? target.id),
        project: String(item.project ?? target.project),
        title: typeof item.title === "string" ? item.title : undefined,
        files: Array.isArray(item.files) ? (item.files as string[]) : [],
        inspection: {
          status: String(insp.status ?? "complete"),
          error: typeof insp.error === "string" ? insp.error : undefined,
        },
        integration: integ,
      };
    });

    return {
      consent: typeof raw?.consent === "string" ? raw.consent : "consent-" + Date.now(),
      members:
        members.length > 0
          ? members
          : [
              {
                id: target.id,
                project: target.project,
                files: [],
                inspection: { status: "complete" },
                integration: "merged",
              },
            ],
    };
  }

  return {
    consent: "consent-fallback-" + Date.now(),
    members: [
      {
        id: target.id,
        project: target.project,
        files: [],
        inspection: { status: "complete" },
        integration: "merged",
      },
    ],
  };
}

export async function applyTaskDeletion(
  conn: MachineConnection,
  target: DeleteTaskTarget,
  preview: DeleteTaskPreview
): Promise<DeleteTaskResult> {
  const clientAny = conn.client as Record<string, unknown>;
  const discard = preview.members.some((m) => m.files.length > 0);
  const args = {
    project: target.project,
    id: target.id,
    consent: preview.consent,
    discard,
  };

  let result: DeleteTaskResult;

  if (typeof clientAny.task_lifecycle_apply === "function") {
    let raw: Record<string, unknown>;
    try {
      raw = (await (
        clientAny.task_lifecycle_apply as (a: unknown) => Promise<unknown>
      )(args)) as Record<string, unknown>;
    } catch (err: unknown) {
      const code = err && typeof err === "object" && "code" in err ? String((err as { code: unknown }).code) : "";
      const msg = err instanceof Error ? err.message : String(err);
      if (code === "task_family_consent_changed" || msg.includes("task_family_consent_changed") || msg.includes("consent")) {
        const consentErr = new Error("task_family_consent_changed");
        (consentErr as unknown as { code: string }).code = "task_family_consent_changed";
        throw consentErr;
      }
      throw err;
    }

    if (
      raw?.code === "task_family_consent_changed" ||
      raw?.error === "task_family_consent_changed" ||
      raw?.status === "task_family_consent_changed"
    ) {
      const consentErr = new Error("task_family_consent_changed");
      (consentErr as unknown as { code: string }).code = "task_family_consent_changed";
      throw consentErr;
    }

    const applied = Array.isArray(raw?.applied)
      ? (raw.applied as { project: string; id: string }[])
      : preview.members.map((m) => ({ project: m.project, id: m.id }));
    const failures = Array.isArray(raw?.failures)
      ? (raw.failures as { project: string; id: string; error: unknown }[])
      : [];
    result = {
      status: String(raw?.status ?? (failures.length === 0 ? "complete" : "partial")),
      applied,
      failures,
    };
  } else {
    await conn.client.delete_session({ project: target.project, id: target.id, force: true });
    result = {
      status: "complete",
      applied: preview.members.map((m) => ({ project: m.project, id: m.id })),
      failures: [],
    };
  }

  if (result.applied.length > 0) {
    removeTasksFromStore(result.applied);
  }

  return result;
}

export function createDebouncedInspection(
  conn: MachineConnection,
  target: () => DeleteTaskTarget | null,
  onInspected: (preview: DeleteTaskPreview) => void,
  onError: (error: string) => void,
  delayMs = 300
): { trigger: (reason?: string) => void; cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const trigger = (reason?: string) => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const currentTarget = target();
      if (!currentTarget) return;
      try {
        const preview = await inspectTaskDeletion(conn, currentTarget);
        onInspected(preview);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        onError(reason ? `${reason}: ${message}` : message);
      }
    }, delayMs);
  };

  const cancel = () => {
    clearTimeout(timer);
  };

  return { trigger, cancel };
}
