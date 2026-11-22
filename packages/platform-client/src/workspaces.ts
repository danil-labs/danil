/**
 * Dominio workspaces: las rutas `/v1/workspaces*` (lista, select, adopt, promo,
 * preferences, transfers, free-router, logo/background) y sus tipos. Usa el
 * transporte de `client.ts`; los sitios con su propio `send` toman de aquí la ruta.
 */
import { cancelEdgeWrites, edgeUntil, type EdgeMethod, type EdgeReply, type Patience } from "./client.ts";

import type { SelectWorkspaceResponse, WorkspaceList } from "./generated/types.ts";

/**
 * Las respuestas del dominio salen del OpenAPI vendorizado (`contract/openapi.json`, R2 y R7). `next_cursor`,
 * `empty_reason` y `active_workspace_id` de la lista y `engine_workspace_id` de la fila no están en el contrato
 * (hallazgo para danil-contracts): llegan como campos aditivos y quien los lee los comprueba.
 */
export type { SelectWorkspaceResponse, Workspace, WorkspaceList } from "./generated/types.ts";

export const WORKSPACES_PATH = "/v1/workspaces";
const WORKSPACES_SELECT_PATH = "/v1/workspaces/select";
export const WORKSPACES_ADOPT_PATH = "/v1/workspaces/adopt";
export const WORKSPACES_ADOPT_CHALLENGE_PATH = "/v1/workspaces/adopt/challenge";
export const WORKSPACES_PROMO_REDEEM_PATH = "/v1/workspaces/promo/redeem";

/** Las altas que llevan clave de idempotencia propia (`POST /v1/workspaces` y `/adopt`). */
export const isWorkspaceCreationPath = (path: string) => path === WORKSPACES_PATH || path === WORKSPACES_ADOPT_PATH;

/** Una página de `GET /v1/workspaces`. */
export const workspacesPagePath = (cursor?: string | null) => `/v1/workspaces${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`;

/** El `send` de quien lee con su propio contexto (sesión de grupo). */
type CatalogSend = (context: string, method: string, path: string) => Promise<{ status: number; body?: unknown }>;

/** Las filas del catálogo de una organización, página a página. Un error corta y devuelve lo leído. */
export async function workspaceCatalog(send: CatalogSend, context: string): Promise<unknown[]> {
  return (await readCatalogPages((path) => send(context, "GET", path))).items;
}

/** Catálogo completo de una sesión nativa. Conserva la última lectura si falla una página. */
export async function sessionWorkspaceCatalog(send: CatalogSend, context: string) {
  const { items, complete } = await readCatalogPages((path) => edgeUntil("GET", path, undefined, { retryBudgetMs: 8000 }, {
    send: async <T>(method: EdgeMethod, path: string) => await send(context, method, path) as EdgeReply<T>,
  }));
  return complete ? items : null;
}

async function readCatalogPages(read: (path: string) => ReturnType<CatalogSend>) {
  const items: unknown[] = [];
  const seen = new Set<string>();
  let cursor: string | null = null;
  do {
    const reply = await read(workspacesPagePath(cursor)).catch(() => null);
    const body = reply?.body as WorkspaceList | undefined;
    if (reply?.status !== 200 || !Array.isArray(body?.items)) return { items, complete: false };
    items.push(...body.items);
    cursor = typeof body.next_cursor === "string" ? body.next_cursor : null;
    if (cursor && seen.has(cursor)) return { items, complete: false };
    if (cursor) seen.add(cursor);
  } while (cursor);
  return { items, complete: true };
}

export const workspaceTransfersPath = (accountId: string) => `/v1/workspaces/${encodeURIComponent(accountId)}/transfers`;

export const workspaceTransferAcceptPath = (transfer: string) => `/v1/workspaces/transfers/${transfer}/accept`;

export const workspaceFreeRouterPath = (account: string) => `/v1/workspaces/${account}/free-router`;

export const workspaceAssetPath = (workspace: string, kind: string) => `/v1/workspaces/${encodeURIComponent(workspace)}/${kind}`;

const bodyOf = <T>(method: EdgeMethod, path: string, body: unknown, p?: Patience) => edgeUntil<T>(method, path, body, p).then((r) => r.body);

export const workspaces = (p?: Patience) => bodyOf<WorkspaceList>("GET", WORKSPACES_PATH, undefined, p);
export const selectWorkspace = (workspaceId: string, p?: Patience) => {
  cancelEdgeWrites();
  return bodyOf<SelectWorkspaceResponse>("POST", WORKSPACES_SELECT_PATH, { workspace: workspaceId }, p);
};

/** `GET /v1/workspaces` con la respuesta entera y el transporte que pase el sitio. */
export const getWorkspaces = (p?: Patience, transport?: Parameters<typeof edgeUntil>[4]) =>
  edgeUntil<WorkspaceList>("GET", WORKSPACES_PATH, undefined, p, transport);
