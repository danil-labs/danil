import { createMemo, createResource, type Accessor, type Resource } from "solid-js";
import { createStore, reconcile, type SetStoreFunction } from "solid-js/store";
import type { MachineConnection } from "@danil/engine-client";
import { useSession } from "@danil/session/solid";
import {
  type ProjectItem,
  type TaskRecord,
  type DeleteTaskTarget,
  type DeleteTaskPreview,
  type DeleteTaskResult,
  parseProjects,
  parseTasks,
  parseDeleteTaskPreview,
  parseDeleteTaskResult,
} from "./model.ts";

export interface ProjectsState {
  projects: ProjectItem[];
  tasksByProject: Record<string, TaskRecord[]>;
  projectErrors: Record<string, unknown>;
  lastDeletedIds: string[];
}

const storesCache = new Map<string, { store: ProjectsState; setStore: SetStoreFunction<ProjectsState> }>();

export function getStoreKey(sessionKey?: string, machineId?: string, workspaceId?: string): string {
  return `${sessionKey ?? "default"}::${machineId ?? "default"}::${workspaceId ?? "default"}`;
}

export function getOrCreateProjectsStore(
  sessionKey?: string,
  machineId?: string,
  workspaceId?: string
): { store: ProjectsState; setStore: SetStoreFunction<ProjectsState> } {
  const key = getStoreKey(sessionKey, machineId, workspaceId);
  let entry = storesCache.get(key);
  if (!entry) {
    const [store, setStore] = createStore<ProjectsState>({
      projects: [],
      tasksByProject: {},
      projectErrors: {},
      lastDeletedIds: [],
    });
    entry = { store, setStore };
    storesCache.set(key, entry);
  }
  return entry;
}

export function getProjectsStore(
  sessionKey?: string,
  machineId?: string,
  workspaceId?: string
): ProjectsState {
  return getOrCreateProjectsStore(sessionKey, machineId, workspaceId).store;
}

export function removeTasksFromStore(
  deleted: { project: string; id: string }[],
  storeKey?: string
): void {
  const idsToRemove = new Set(deleted.map((d) => d.id));
  const projectsAffected = new Set(deleted.map((d) => d.project));

  const targetStores = storeKey
    ? [storesCache.get(storeKey)].filter((s): s is NonNullable<typeof s> => Boolean(s))
    : Array.from(storesCache.values());

  for (const bundle of targetStores) {
    const { store, setStore } = bundle;
    setStore("lastDeletedIds", Array.from(idsToRemove));

    for (const projId of projectsAffected) {
      const currentTasks = store.tasksByProject[projId] ?? [];
      const remaining = currentTasks.filter((t) => !idsToRemove.has(t.id));
      setStore("tasksByProject", projId, reconcile(remaining));
    }

    for (const p of store.projects) {
      if (projectsAffected.has(p.id)) {
        const removedCount = deleted.filter((d) => d.project === p.id).length;
        setStore(
          "projects",
          (proj) => proj.id === p.id,
          "taskCount",
          Math.max(0, (p.taskCount ?? 0) - removedCount)
        );
      }
    }
  }
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
  workspaceId?: string,
  sessionKey?: string,
  machineId?: string
): Promise<{
  projects: ProjectItem[];
  tasksByProject: Record<string, TaskRecord[]>;
  projectErrors: Record<string, unknown>;
}> {
  const rawProjects = await conn.client.list_projects();
  const projects = parseProjects(rawProjects);

  const tasksByProject: Record<string, TaskRecord[]> = {};
  const projectErrors: Record<string, unknown> = {};

  const taskLists = await batchMap(projects, BATCH_CONCURRENCY, async (project) => {
    try {
      const rawTasks = await conn.client.list_live_sessions({ project: project.id });
      const tasks = parseTasks(rawTasks, project.id);
      return { projectId: project.id, tasks, error: null };
    } catch (err) {
      return { projectId: project.id, tasks: [], error: err };
    }
  });

  for (const entry of taskLists) {
    tasksByProject[entry.projectId] = entry.tasks;
    if (entry.error) {
      projectErrors[entry.projectId] = entry.error;
    }
  }

  for (const p of projects) {
    p.taskCount = (tasksByProject[p.id] ?? []).length;
  }

  const { setStore } = getOrCreateProjectsStore(sessionKey, machineId, workspaceId);
  setStore("projects", reconcile(projects));
  for (const [projId, tasks] of Object.entries(tasksByProject)) {
    setStore("tasksByProject", projId, reconcile(tasks));
  }
  setStore("projectErrors", reconcile(projectErrors));

  return { projects, tasksByProject, projectErrors };
}

export interface UseProjectsResult {
  data: Resource<
    | {
        projects: ProjectItem[];
        tasksByProject: Record<string, TaskRecord[]>;
        projectErrors: Record<string, unknown>;
      }
    | undefined
  >;
  projects: () => ProjectItem[];
  tasksByProject: () => Record<string, TaskRecord[]>;
  projectErrors: () => Record<string, unknown>;
  loading: () => boolean;
  error: () => unknown;
  refetch: () => void;
  refetchProject: (project: ProjectItem | string) => Promise<void>;
  mutate: (
    val:
      | {
          projects: ProjectItem[];
          tasksByProject: Record<string, TaskRecord[]>;
          projectErrors: Record<string, unknown>;
        }
      | undefined
  ) => void;
}

export function useProjects(
  conn: MachineConnection | Accessor<MachineConnection | undefined>,
  workspaceId?: string | Accessor<string | undefined>
): UseProjectsResult {
  const getConn = typeof conn === "function" ? conn : () => conn;
  const getWorkspaceId = typeof workspaceId === "function" ? workspaceId : () => workspaceId;

  let sessionKey: string | undefined;
  try {
    const session = useSession();
    sessionKey = session.active() ?? session.sessions()[0]?.key;
  } catch {
    sessionKey = undefined;
  }

  const getMachineId = () => {
    const c = getConn();
    if (!c) return undefined;
    return (
      (c as unknown as { machine_id?: string; machineId?: string; machine?: { machine_id?: string } }).machine_id ??
      (c as unknown as { machineId?: string }).machineId ??
      (c as unknown as { machine?: { machine_id?: string } }).machine?.machine_id
    );
  };

  const currentStore = createMemo(() => {
    return getOrCreateProjectsStore(sessionKey, getMachineId(), getWorkspaceId());
  });

  const [resource, { refetch, mutate }] = createResource(
    () => {
      const c = getConn();
      if (!c) return null;
      return {
        conn: c,
        workspaceId: getWorkspaceId(),
        machineId: getMachineId(),
      };
    },
    async (source) => {
      return fetchProjectsAndTasks(source.conn, source.workspaceId, sessionKey, source.machineId);
    }
  );

  const refetchProject = async (project: ProjectItem | string) => {
    const c = getConn();
    if (!c) return;
    const projId = typeof project === "string" ? project : project.id;
    const { setStore } = currentStore();
    try {
      const rawTasks = await c.client.list_live_sessions({ project: projId });
      const tasks = parseTasks(rawTasks, projId);
      setStore("tasksByProject", projId, reconcile(tasks));
      setStore("projectErrors", projId, undefined);
      setStore(
        "projects",
        (p) => p.id === projId,
        "taskCount",
        tasks.length
      );
    } catch (err) {
      setStore("projectErrors", projId, err);
    }
  };

  return {
    data: resource,
    projects: () => currentStore().store.projects,
    tasksByProject: () => currentStore().store.tasksByProject,
    projectErrors: () => currentStore().store.projectErrors,
    loading: () => resource.loading,
    error: () => resource.error,
    refetch,
    refetchProject,
    mutate,
  };
}

export async function inspectTaskDeletion(
  conn: MachineConnection,
  target: DeleteTaskTarget
): Promise<DeleteTaskPreview> {
  const raw = await conn.client.task_lifecycle_preview({
    project: target.project,
    id: target.id,
    action: "delete",
  });

  return parseDeleteTaskPreview(raw, target);
}

export async function applyTaskDeletion(
  conn: MachineConnection,
  target: DeleteTaskTarget,
  preview: DeleteTaskPreview,
  options?: { discard?: boolean }
): Promise<DeleteTaskResult> {
  const discard = options?.discard ?? false;
  const args = {
    project: target.project,
    id: target.id,
    action: "delete",
    consent: preview.consent,
    discard,
  };

  let raw: unknown;
  try {
    raw = await conn.client.task_lifecycle_apply(args);
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

  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
  if (
    obj?.code === "task_family_consent_changed" ||
    obj?.error === "task_family_consent_changed" ||
    obj?.status === "task_family_consent_changed"
  ) {
    const consentErr = new Error("task_family_consent_changed");
    (consentErr as unknown as { code: string }).code = "task_family_consent_changed";
    throw consentErr;
  }

  const result = parseDeleteTaskResult(raw, preview);

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
