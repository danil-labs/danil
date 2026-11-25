import type { Space } from "../../../../apps/desktop/src/lib/spaces.ts";
import type { WorkspaceSpace, WorkspaceSpaceCatalog, WorkspaceSpaceEdit } from "../../../platform-client/src/workspace-spaces.ts";

export type SessionLike = {
  id: string;
  space?: string | null;
  parent?: string | null;
  workspace?: string | null;
  updated_at?: number;
};

export const MAX_TASK_SPACES = 5000;

const ENGINE_ID = /^[A-Za-z0-9_-]{1,128}$/;

export function canonicalRef(id: string | null | undefined): string | null {
  if (!id) return null;
  const index = id.indexOf("~");
  const bare = index >= 0 ? id.slice(index + 1) : id;
  return ENGINE_ID.test(bare) ? bare : null;
}

export function cleanFolders(folders: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const folder of folders) {
    const bare = canonicalRef(folder);
    if (!bare || seen.has(bare)) continue;
    seen.add(bare);
    result.push(bare);
    if (result.length >= 500) break;
  }
  return result;
}

function toCatalogSpace(row: Space): WorkspaceSpace | null {
  const id = canonicalRef(row.id);
  if (!id) return null;
  const name = typeof row.name === "string" && row.name.trim() ? row.name.trim().slice(0, 100) : null;
  return { id, name, folders: cleanFolders(row.folders) };
}

export function statusOf(error: unknown): number | undefined {
  return (error as { status?: number } | null)?.status;
}

/** Proyecta la lista de spaces cuando `workspaces` es la fuente única de verdad. */
export function projectCatalogSpaces(catalog: WorkspaceSpaceCatalog | undefined, rows: readonly Space[]): Space[] {
  if (!catalog || catalog.spaces.length === 0) return [...rows];
  return catalog.spaces.map(space => ({
    id: space.id,
    name: space.name,
    folders: [...space.folders],
    created_at: 0,
    updated_at: 0,
    account: true,
  }));
}

/** Proyecta `row.space` desde `task_spaces` del usuario (y asignaciones optimistas en vuelo). */
export function projectCatalogSessions<T extends SessionLike>(
  catalog: WorkspaceSpaceCatalog | undefined,
  pending: Readonly<Record<string, string | null>>,
  sesiones: Record<string, T[]>,
): Record<string, T[]> {
  if (!catalog || catalog.spaces.length === 0) return sesiones;
  const validIds = new Set(catalog.spaces.map(space => space.id));
  const defaultSpace = catalog.order.find(id => validIds.has(id)) ?? catalog.spaces[0].id;
  const lookup = (ref: string | null): string | undefined => {
    if (!ref) return undefined;
    if (Object.hasOwn(pending, ref)) {
      const value = pending[ref];
      return value && validIds.has(value) ? value : defaultSpace;
    }
    const saved = catalog.task_spaces[ref];
    return saved && validIds.has(saved) ? saved : undefined;
  };
  const validEngineSpace = (space: string | null | undefined): string | undefined => {
    const bare = canonicalRef(space);
    return bare && validIds.has(bare) ? bare : undefined;
  };
  let anyChanged = false;
  const next: Record<string, T[]> = {};
  for (const [folder, rows] of Object.entries(sesiones)) {
    let folderChanged = false;
    const mapped = rows.map(row => {
      const target =
        lookup(canonicalRef(row.id)) ??
        lookup(canonicalRef(row.parent)) ??
        validEngineSpace(row.space) ??
        defaultSpace;
      if (row.space === target) return row;
      folderChanged = true;
      return { ...row, space: target };
    });
    next[folder] = folderChanged ? mapped : rows;
    if (folderChanged) anyChanged = true;
  }
  return anyChanged ? next : sesiones;
}

/** Construye la siembra inicial (una sola vez en version 0) desde los spaces y filas locales existentes. */
export function buildInitialSeed(
  rows: readonly Space[],
  sesiones: Record<string, readonly SessionLike[]>,
): { spaces: WorkspaceSpace[]; task_spaces: Record<string, string> } | null {
  const spaces: WorkspaceSpace[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const entry = toCatalogSpace(row);
    if (!entry || seen.has(entry.id)) continue;
    seen.add(entry.id);
    spaces.push(entry);
  }
  if (spaces.length === 0) return null;
  const task_spaces: Record<string, string> = {};
  for (const list of Object.values(sesiones)) {
    for (const row of list) {
      const taskRef = canonicalRef(row.id);
      const spaceId = canonicalRef(row.space);
      if (taskRef && spaceId && seen.has(spaceId) && !(taskRef in task_spaces)) {
        task_spaces[taskRef] = spaceId;
      }
    }
  }
  return { spaces, task_spaces };
}

type BackfillCandidate = {
  taskRef: string;
  spaceId: string;
  parentRef: string | null;
  updatedAt: number;
};

/**
 * Recolecta asignaciones `task -> space` válidas del motor que aún no existen en `catalog.task_spaces`.
 * Respeta el tope de `workspaces` priorizando tareas raíz y las más recientes, y omite subtareas
 * que ya heredan el mismo espacio desde su padre.
 */
export function buildTaskSpacesBackfill(
  catalog: WorkspaceSpaceCatalog | undefined,
  pending: Readonly<Record<string, string | null>>,
  sesiones: Record<string, readonly SessionLike[]>,
  attempted?: ReadonlySet<string>,
  workspaceId?: string | null,
  limit = MAX_TASK_SPACES,
): Record<string, string> | null {
  if (!catalog || catalog.spaces.length === 0) return null;
  const remaining = limit - Object.keys(catalog.task_spaces).length;
  if (remaining <= 0) return null;

  const validIds = new Set(catalog.spaces.map(space => space.id));
  const expectedWorkspace = canonicalRef(workspaceId);
  const candidates = new Map<string, BackfillCandidate>();

  for (const list of Object.values(sesiones)) {
    for (const row of list) {
      if (expectedWorkspace && row.workspace) {
        const rowWorkspace = canonicalRef(row.workspace);
        if (rowWorkspace && rowWorkspace !== expectedWorkspace) continue;
      }
      const taskRef = canonicalRef(row.id);
      const spaceId = canonicalRef(row.space);
      if (!taskRef || !spaceId || !validIds.has(spaceId)) continue;
      if (Object.hasOwn(catalog.task_spaces, taskRef)) continue;
      if (Object.hasOwn(pending, taskRef)) continue;
      if (attempted?.has(taskRef)) continue;
      const updatedAt = typeof row.updated_at === "number" ? row.updated_at : 0;
      const existing = candidates.get(taskRef);
      if (!existing || updatedAt > existing.updatedAt) {
        candidates.set(taskRef, {
          taskRef,
          spaceId,
          parentRef: canonicalRef(row.parent),
          updatedAt,
        });
      }
    }
  }

  if (candidates.size === 0) return null;

  const roots: BackfillCandidate[] = [];
  const children: BackfillCandidate[] = [];
  for (const candidate of candidates.values()) {
    if (candidate.parentRef === null) roots.push(candidate);
    else children.push(candidate);
  }
  const byRecency = (a: BackfillCandidate, b: BackfillCandidate) => b.updatedAt - a.updatedAt;
  roots.sort(byRecency);
  children.sort(byRecency);

  const result: Record<string, string> = {};
  let count = 0;

  for (const candidate of roots) {
    if (count >= remaining) break;
    result[candidate.taskRef] = candidate.spaceId;
    count++;
  }

  const parentSpace = (parentRef: string): string | undefined => {
    if (Object.hasOwn(pending, parentRef)) {
      const value = pending[parentRef];
      return value && validIds.has(value) ? value : undefined;
    }
    if (Object.hasOwn(catalog.task_spaces, parentRef)) {
      const value = catalog.task_spaces[parentRef];
      return value && validIds.has(value) ? value : undefined;
    }
    return result[parentRef];
  };

  for (const candidate of children) {
    if (count >= remaining) break;
    if (candidate.parentRef && parentSpace(candidate.parentRef) === candidate.spaceId) continue;
    result[candidate.taskRef] = candidate.spaceId;
    count++;
  }

  return count > 0 ? result : null;
}

/** Construye una operación `import` idempotente que solo añade `task_spaces` faltantes sin tocar la lista de spaces. */
export function buildTaskSpacesBackfillEdit(
  catalog: WorkspaceSpaceCatalog | undefined,
  pending: Readonly<Record<string, string | null>>,
  sesiones: Record<string, readonly SessionLike[]>,
  attempted?: ReadonlySet<string>,
  workspaceId?: string | null,
  limit = MAX_TASK_SPACES,
): WorkspaceSpaceEdit | null {
  if (!catalog || catalog.spaces.length === 0) return null;
  const task_spaces = buildTaskSpacesBackfill(catalog, pending, sesiones, attempted, workspaceId, limit);
  if (!task_spaces) return null;
  return {
    kind: "import",
    spaces: [catalog.spaces[0]],
    task_spaces,
  };
}
