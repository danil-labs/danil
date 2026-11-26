/**
 * El catálogo de espacios de un workspace en el borde (`GET/POST /v1/workspaces/{id}/spaces`),
 * fuente única de verdad compartida con el escritorio (`platform-client/src/workspace-spaces.ts`).
 * El parámetro de la ruta es el `id` de cuenta en Workspaces, nunca `engine_workspace_id`.
 * Sin React Native ni dependencias de escritorio: se prueba en Node.
 */
export type WorkspaceSpace = {
  id: string;
  name: string | null;
  folders: string[];
};

export type WorkspaceSpaceCatalog = {
  version: number;
  spaces: WorkspaceSpace[];
  order: string[];
  task_spaces: Record<string, string>;
};

const ACCOUNT_ID = /^[1-9][0-9]{0,18}$/;
const ENGINE_ID = /^[A-Za-z0-9_-]{1,128}$/;

const isId = (value: unknown): value is string => typeof value === "string" && ENGINE_ID.test(value);

/** Ruta relativa al borde `/v1` para leer o asignar espacios de un workspace por su `account_id`. */
export function workspaceSpacesPath(accountWorkspaceId: string): string | null {
  return ACCOUNT_ID.test(accountWorkspaceId) ? `workspaces/${accountWorkspaceId}/spaces` : null;
}

function readTaskSpaces(value: unknown): Record<string, string> {
  if (value === undefined) return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid_space_catalog");
  const out: Record<string, string> = {};
  for (const [taskRef, spaceId] of Object.entries(value as Record<string, unknown>)) {
    if (!isId(taskRef) || !isId(spaceId)) throw new Error("invalid_space_catalog");
    out[taskRef] = spaceId;
  }
  return out;
}

/** Valida la respuesta JSON de `/v1/workspaces/{id}/spaces` antes de proyectar el snapshot. */
export function parseSpaceCatalog(value: unknown): WorkspaceSpaceCatalog {
  const row = value && typeof value === "object" && !Array.isArray(value) ? (value as Partial<WorkspaceSpaceCatalog>) : null;
  if (
    !row ||
    typeof row.version !== "number" ||
    !Number.isSafeInteger(row.version) ||
    row.version < 0 ||
    !Array.isArray(row.spaces) ||
    !Array.isArray(row.order)
  ) {
    throw new Error("invalid_space_catalog");
  }
  const ids = new Set<string>();
  const spaces: WorkspaceSpace[] = [];
  for (const entry of row.spaces) {
    if (
      !entry ||
      typeof entry !== "object" ||
      !isId(entry.id) ||
      ids.has(entry.id) ||
      !(entry.name === null || typeof entry.name === "string") ||
      !Array.isArray(entry.folders) ||
      !entry.folders.every(isId)
    ) {
      throw new Error("invalid_space_catalog");
    }
    ids.add(entry.id);
    spaces.push({ id: entry.id, name: entry.name, folders: [...entry.folders] });
  }
  if (row.order.length !== ids.size || !row.order.every((id) => typeof id === "string" && ids.delete(id))) {
    throw new Error("invalid_space_catalog");
  }
  return {
    version: row.version,
    spaces,
    order: [...row.order],
    task_spaces: readTaskSpaces(row.task_spaces),
  };
}
