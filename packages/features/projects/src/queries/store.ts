import { createMemo, createSignal, untrack } from "solid-js";
import { createResource } from "../model/resource.ts";
import { conservar } from "../../../../session/src/sessionRefresh.ts";
import type { Project } from "../../../../ui/src/lib/model.ts";
import { callEngine } from "../../../../engine-client/src/client.ts";

export { callEngine as invoke };

/** Por encima del presupuesto real de transporte (espera de contexto 10 s + lectura y reintento de flota 30 s). */
export const PROJECTS_READ_TIMEOUT = 45_000;

export type ProjectsScope = { workspace: string | null; machine: string | null };
type ReadyScope = ProjectsScope & { revision: number };
type Invoke = <T>(command: string, args?: Record<string, unknown>, options?: { headers: Record<string, string> }) => Promise<T>;
const scopeKey = (scope: ProjectsScope) => JSON.stringify([scope.workspace, scope.machine]);
const route = (scope: ProjectsScope) => ({ headers: {
  ...(scope.workspace !== null ? { "x-terminus-workspace": scope.workspace } : {}),
  ...(scope.machine ? { "x-terminus-machine": scope.machine } : {}),
} });

/** Project rows have one writer; selection and task workflow remain with their own owners. */
export function createProjectsStore(deps: { scope: () => ProjectsScope; invoke: Invoke; timeoutMs?: number }) {
  const rpc = deps.invoke;
  let disposed = false;
  let generation = 0;
  const [readyScope, setReadyScope] = createSignal<ReadyScope | null>(null);
  const currentScope = () => untrack(deps.scope);
  const resource = createResource<string, Project[]>({
    read: (key, signal) => {
      signal.throwIfAborted();
      const scope = currentScope();
      if (scopeKey(scope) !== key) return Promise.reject(new DOMException("Project scope changed", "AbortError"));
      return rpc<Project[]>("list_projects", {}, route(scope));
    },
    timeoutMs: deps.timeoutMs ?? PROJECTS_READ_TIMEOUT,
    reconcile: (previous, incoming) => conservar(previous, incoming, row => row.id),
  });
  const empty: Project[] = [];
  const snapshotRows = () => { const current = resource.state(); return "value" in current ? current.value : empty; };
  const rows = createMemo(() => {
    const current = resource.state();
    const found = current.status !== "idle" && current.key === scopeKey(deps.scope()) ? snapshotRows() : empty;
    return found.length === 0 ? empty : found;
  });
  const routed = new Map<string, ReturnType<typeof createResource<string, Project[]>>>();
  const refresh = () => {
    const scope = currentScope(), key = scopeKey(scope), revision = generation;
    const reading = resource.read(key);
    void reading.then(() => {
      if (disposed || revision !== generation || key !== scopeKey(currentScope())) return;
      const previous = untrack(readyScope);
      // Row identity is independent of confirmation: an empty catalog still completes startup.
      if (!previous || previous.revision !== revision || scopeKey(previous) !== key) setReadyScope({ ...scope, revision });
    }, () => { /* The resource and caller retain the read error; it never confirms this scope. */ });
    return reading;
  };
  const invalidate = () => { resource.invalidate(); for (const reader of routed.values()) reader.invalidate(); };
  const changed = () => { invalidate(); return refresh(); };
  async function mutate(write: (scope: ProjectsScope) => Promise<unknown>, reread = true) {
    if (disposed) throw new DOMException("Projects store disposed", "AbortError");
    const scope = currentScope();
    const key = scopeKey(scope);
    const started = generation;
    await write(scope);
    if (disposed || started !== generation || key !== scopeKey(currentScope())) return;
    invalidate();
    if (reread) {
      try { await refresh(); }
      catch (error) { if (!disposed && started === generation && key === scopeKey(currentScope())) throw error; }
    }
  }
  return {
    rows,
    readyScope,
    state: resource.state,
    refresh,
    changed,
    fromCache(projects: Project[]) { resource.seed(scopeKey(currentScope()), projects); },
    workspaceChanged(preserveCached = false) {
      generation++;
      setReadyScope(null);
      const previous = untrack(resource.state);
      const key = scopeKey(currentScope());
      const kept = preserveCached || (previous.status !== "idle" && previous.key === key) ? untrack(snapshotRows) : [];
      for (const [routeKey, reader] of routed) if ((JSON.parse(routeKey) as [string | null, string | null])[0] !== currentScope().workspace) { reader.dispose(); routed.delete(routeKey); }
      resource.seed(key, kept);
    },
    discardUnconfirmedCache() { if (untrack(resource.state).status !== "ready") resource.seed(scopeKey(currentScope()), []); },
    readForMachine(machine: string) {
      if (disposed) return Promise.reject(new DOMException("Projects store disposed", "AbortError"));
      const scope = { workspace: currentScope().workspace, machine };
      const key = scopeKey(scope);
      let reader = routed.get(key);
      if (!reader) {
        reader = createResource<string, Project[]>({ read: (_key, signal) => {
          signal.throwIfAborted();
          if (currentScope().workspace !== scope.workspace) return Promise.reject(new DOMException("Project scope changed", "AbortError"));
          return rpc<Project[]>("list_projects", {}, route(scope));
        }, timeoutMs: deps.timeoutMs ?? PROJECTS_READ_TIMEOUT, reconcile: (previous, incoming) => conservar(previous, incoming, row => row.id) });
        routed.set(key, reader);
      }
      return reader.read(key);
    },
    rename: (id: string, name: string) => mutate(scope => rpc("rename_project", { id, name }, route(scope))),
    attach: (id: string, source: string) => mutate(scope => rpc("attach_known_source", { project: id, source }, route(scope))),
    detach: (id: string, source: string) => mutate(scope => rpc("detach_source", { project: id, source }, route(scope))),
    workTree: (id: string, dir: string | null) => mutate(scope => rpc("set_project_work_tree", { id, dir }, route(scope))),
    remove: (id: string) => mutate(scope => rpc("delete_project", { id }, route(scope)), false),
    dispose() { disposed = true; setReadyScope(null); resource.dispose(); for (const reader of routed.values()) reader.dispose(); routed.clear(); },
  };
}
