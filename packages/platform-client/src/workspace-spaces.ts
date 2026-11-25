import { sessionWorkspaceCatalog, type Workspace } from "./workspaces.ts";

export type WorkspaceSpace = { id: string; name: string | null; folders: string[] };
export type WorkspaceSpaceCatalog = {
  version: number;
  spaces: WorkspaceSpace[];
  order: string[];
  task_spaces: Record<string, string>;
};
export type WorkspaceSpaceEdit =
  | { kind: "import"; spaces: WorkspaceSpace[]; task_spaces?: Record<string, string> }
  | { kind: "create"; id?: string; name: string | null; folders?: string[] }
  | { kind: "rename"; id: string; name: string }
  | { kind: "set_folders"; id: string; folders: string[] }
  | { kind: "reorder"; order: string[] }
  | { kind: "delete"; id: string }
  | { kind: "assign_task"; task: string; space: string | null };

type Send = (context: string, method: "GET" | "POST", path: string, body?: unknown)
  => Promise<{ status: number; body?: unknown }>;

const accountId = /^[1-9][0-9]{0,18}$/;
const engineId = /^[A-Za-z0-9_-]{1,128}$/;
const isId = (value: unknown): value is string => typeof value === "string" && engineId.test(value);

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

function readCatalog(value: unknown): WorkspaceSpaceCatalog {
  const row = value as Partial<WorkspaceSpaceCatalog> | null;
  if (!row || typeof row.version !== "number" || !Number.isSafeInteger(row.version) || row.version < 0 ||
    !Array.isArray(row.spaces) || !Array.isArray(row.order)) throw new Error("invalid_space_catalog");
  const ids = new Set<string>();
  for (const entry of row.spaces) {
    if (!entry || !isId(entry.id) || ids.has(entry.id) ||
      !(entry.name === null || typeof entry.name === "string") ||
      !Array.isArray(entry.folders) || !entry.folders.every(isId)) throw new Error("invalid_space_catalog");
    ids.add(entry.id);
  }
  if (row.order.length !== ids.size || !row.order.every(id => ids.delete(id))) throw new Error("invalid_space_catalog");
  return { version: row.version, spaces: row.spaces, order: row.order, task_spaces: readTaskSpaces(row.task_spaces) };
}

/** Captura el contexto y el ID de Workspaces; el id local del motor nunca entra en la ruta. */
export function workspaceSpacesClient(send: Send, context: string, workspace: string) {
  if (!context || !accountId.test(workspace)) throw new Error("invalid_workspace_scope");
  const path = `/v1/workspaces/${workspace}/spaces`;
  const call = async (method: "GET" | "POST", body?: unknown) => {
    const reply = await send(context, method, path, body);
    if (reply.status !== 200) {
      const code = (reply.body as { code?: unknown } | null)?.code;
      throw { status: reply.status, detail: typeof code === "string" ? code : "space_catalog_unavailable" };
    }
    return readCatalog(reply.body);
  };
  return {
    read: () => call("GET"),
    // Una respuesta de conflicto le dice al llamador que vuelva a leer. No se reintenta una intención vieja.
    update: (ifVersion: number, edit: WorkspaceSpaceEdit) => call("POST", { ...edit, if_version: ifVersion }),
    assignTask: (task: string, space: string | null, ifVersion?: number) =>
      call("POST", { kind: "assign_task", task, space, ...(ifVersion === undefined ? {} : { if_version: ifVersion }) }),
  };
}

/** Resuelve el id de cuenta dentro de la misma organización de la ventana. */
export async function workspaceSpacesForEngine(
  send: Send,
  context: string,
  organization: string,
  workspace: string,
) {
  const rows = await sessionWorkspaceCatalog(
    (ctx, _method, path) => send(ctx, "GET", path),
    context,
  );
  const matches = rows?.filter((item): item is Workspace => {
    const row = item as Partial<Workspace> | null;
    return row?.org === organization && row.engine_workspace_id === workspace &&
      typeof row.id === "string" && accountId.test(row.id);
  });
  return matches?.length === 1 ? workspaceSpacesClient(send, context, matches[0].id) : null;
}

export function readContextSpaces(invoke: (command: string, args: Record<string, unknown>) => Promise<unknown>) {
  const send: Send = async (context, method, path, body) =>
    await invoke("danil_edge_fetch", { context, method, path, ...(body === undefined ? {} : { body }) }) as Awaited<ReturnType<Send>>;
  return async (context: string, organization: string, workspace: string) => {
    const client = await workspaceSpacesForEngine(send, context, organization, workspace);
    if (!client) return null;
    try {
      return await client.read();
    } catch (error) {
      if ((error as { status?: number } | null)?.status === 404) return null;
      throw error;
    }
  };
}
