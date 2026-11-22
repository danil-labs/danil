/**
 * Dominio workspaces: las rutas `/v1/workspaces*` (lista, select, adopt, promo,
 * preferences, transfers, free-router, logo/background) y sus tipos. Usa el
 * transporte de `client.ts`; los sitios con su propio `send` toman de aquí la ruta.
 */
import { cancelEdgeWrites, edgeUntil, type EdgeMethod, type Patience } from "./client.ts";

type Workspace = { id: string; org?: string; name: string; role?: string; engine_workspace_id?: string };
export type WorkspaceList = { items: Workspace[]; next_cursor: string | null; empty_reason?: string; active_workspace_id?: string | null };

export const WORKSPACES_PATH = "/v1/workspaces";
const WORKSPACES_SELECT_PATH = "/v1/workspaces/select";
export const WORKSPACES_ADOPT_PATH = "/v1/workspaces/adopt";
export const WORKSPACES_ADOPT_CHALLENGE_PATH = "/v1/workspaces/adopt/challenge";
export const WORKSPACES_PROMO_REDEEM_PATH = "/v1/workspaces/promo/redeem";

/** Las altas que llevan clave de idempotencia propia (`POST /v1/workspaces` y `/adopt`). */
export const isWorkspaceCreationPath = (path: string) => path === WORKSPACES_PATH || path === WORKSPACES_ADOPT_PATH;

/** Una página de `GET /v1/workspaces`. */
export const workspacesPagePath = (cursor?: string | null) => `/v1/workspaces${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`;

export const workspaceTransfersPath = (accountId: string) => `/v1/workspaces/${encodeURIComponent(accountId)}/transfers`;

export const workspaceTransferAcceptPath = (transfer: string) => `/v1/workspaces/transfers/${transfer}/accept`;

export const workspaceFreeRouterPath = (account: string) => `/v1/workspaces/${account}/free-router`;

export const workspaceAssetPath = (workspace: string, kind: string) => `/v1/workspaces/${encodeURIComponent(workspace)}/${kind}`;

const bodyOf = <T>(method: EdgeMethod, path: string, body: unknown, p?: Patience) => edgeUntil<T>(method, path, body, p).then((r) => r.body);

export const workspaces = (p?: Patience) => bodyOf<WorkspaceList>("GET", WORKSPACES_PATH, undefined, p);
export const selectWorkspace = (workspaceId: string, p?: Patience) => {
  cancelEdgeWrites();
  return bodyOf<{ workspace: Workspace }>("POST", WORKSPACES_SELECT_PATH, { workspace: workspaceId }, p);
};

/** `GET /v1/workspaces` con la respuesta entera y el transporte que pase el sitio. */
export const getWorkspaces = (p?: Patience, transport?: Parameters<typeof edgeUntil>[4]) =>
  edgeUntil<WorkspaceList>("GET", WORKSPACES_PATH, undefined, p, transport);
