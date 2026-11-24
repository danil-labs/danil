/**
 * Logo compartido por workspace servido desde `danil-workspaces` (`/v1/workspaces/:id/logo`,
 * respaldado por R2 + caché). El fondo de chats NO es compartido y sigue siendo personal: cualquier
 * operación para `kind !== "logo"` cae al flujo local sin tocar la cuenta.
 *
 * - Web (`webEdgeWorkspaceAssets`): lee los bytes de imagen con `EdgeTransport` (cookie +
 *   `X-Danil-Session` + caché HTTP del navegador en URLs versionadas `?v=N`) y escribe/borra con
 *   CSRF (`PUT`/`DELETE /v1/workspaces/:id/logo`).
 * - Desk (`deskEdgeWorkspaceAssets`): usa `danil_edge_fetch` (`Accept: application/json`), donde
 *   `workspaces` entrega el sobre JSON con `data_url` respaldado por la misma caché y R2.
 */
import { EdgeError, type EdgeTransport } from "../../platform-client/src/edge.ts";
import { workspaceAssetPath, workspacesPagePath } from "../../platform-client/src/workspaces.ts";
import type { WorkspaceAssetsSource } from "../../platform-client/src/workspace-assets.ts";
import { imagenInerte } from "../../ui/src/lib/chat/links.ts";
import { blobToDataUrl } from "../../ui/src/lib/shrink-image.ts";

const ALLOWED_LOGO_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_LOGO_BYTES = 1_048_576;

type CatalogEntry = {
  accountId: string;
  logoUrl: string | null;
  logoVersion: number;
};

type RawWorkspaceRow = {
  id?: unknown;
  engine_workspace_id?: unknown;
  logo_url?: unknown;
  logo_version?: unknown;
};

function parseCatalogRows(items: unknown): Map<string, CatalogEntry> {
  const map = new Map<string, CatalogEntry>();
  if (!Array.isArray(items)) return map;
  for (const raw of items as RawWorkspaceRow[]) {
    if (!raw || typeof raw.id !== "string" || !raw.id) continue;
    const logoUrl = typeof raw.logo_url === "string" && raw.logo_url.startsWith("/v1/workspaces/") ? raw.logo_url : null;
    const logoVersion = typeof raw.logo_version === "number" && Number.isInteger(raw.logo_version) ? raw.logo_version : 0;
    const entry: CatalogEntry = { accountId: raw.id, logoUrl, logoVersion };
    map.set(raw.id, entry);
    if (typeof raw.engine_workspace_id === "string" && raw.engine_workspace_id) {
      map.set(raw.engine_workspace_id, entry);
    }
  }
  return map;
}

function relativeV1Path(path: string): string {
  return path.startsWith("/v1/") ? path.slice(4) : path.replace(/^\/+/, "");
}

function versionedCacheKey(context: string, logoUrl: string): string {
  return `${context}:${logoUrl}`;
}

export function webEdgeWorkspaceAssets(
  transport: EdgeTransport,
  resolveContext: () => string | null,
): WorkspaceAssetsSource {
  const catalogs = new Map<string, Promise<Map<string, CatalogEntry> | null>>();
  const images = new Map<string, Promise<string | null>>();

  function listContext(context: string): Promise<Map<string, CatalogEntry> | null> {
    let pending = catalogs.get(context);
    if (!pending) {
      pending = (async () => {
        const merged = new Map<string, CatalogEntry>();
        const seen = new Set<string>();
        let cursor: string | null = null;
        do {
          const response = await transport.call(relativeV1Path(workspacesPagePath(cursor)), {
            headers: { "X-Danil-Session": context },
          });
          const body = (await response.json().catch(() => null)) as { items?: unknown; next_cursor?: unknown } | null;
          if (!Array.isArray(body?.items)) return null;
          for (const [k, v] of parseCatalogRows(body.items)) merged.set(k, v);
          cursor = typeof body.next_cursor === "string" && body.next_cursor ? body.next_cursor : null;
          if (cursor && seen.has(cursor)) break;
          if (cursor) seen.add(cursor);
        } while (cursor);
        return merged;
      })().catch(() => {
        catalogs.delete(context);
        return null;
      });
      catalogs.set(context, pending);
    }
    return pending;
  }

  function fetchLogoImage(context: string, logoUrl: string): Promise<string | null> {
    const key = versionedCacheKey(context, logoUrl);
    let pending = images.get(key);
    if (!pending) {
      const versioned = /[?&]v=[1-9][0-9]*/.test(logoUrl);
      pending = transport
        .call(relativeV1Path(logoUrl), {
          headers: {
            "X-Danil-Session": context,
            Accept: "image/png,image/jpeg,image/webp",
          },
          cache: versioned ? "default" : "no-store",
        })
        .then(async (response) => {
          const blob = await response.blob();
          const mime = (blob.type || response.headers.get("content-type") || "").split(";")[0]?.trim().toLowerCase() ?? "";
          if (!ALLOWED_LOGO_TYPES.has(mime) || blob.size <= 0 || blob.size > MAX_LOGO_BYTES) return null;
          const typed = blob.type === mime ? blob : new Blob([blob], { type: mime });
          return imagenInerte(await blobToDataUrl(typed));
        })
        .catch((error) => {
          if (error instanceof EdgeError && error.status === 404) return null;
          images.delete(key);
          return null;
        });
      images.set(key, pending);
    }
    return pending;
  }

  return {
    async read(workspace, kind, context) {
      if (kind !== "logo") return undefined;
      const ctx = context ?? resolveContext();
      if (!ctx) return undefined;
      const map = await listContext(ctx);
      if (!map) return undefined;
      const entry = map.get(workspace);
      if (!entry) return undefined;
      if (!entry.logoUrl) return null;
      return fetchLogoImage(ctx, entry.logoUrl);
    },
    setting() {
      return Promise.resolve(null);
    },
    async put(workspace, kind, image, context) {
      if (kind !== "logo") return false;
      const ctx = context ?? resolveContext();
      if (!ctx) return false;
      const map = await listContext(ctx);
      const entry = map?.get(workspace);
      if (!entry) return false;
      const mime = image.type.split(";")[0]?.trim().toLowerCase() ?? "";
      if (!ALLOWED_LOGO_TYPES.has(mime) || image.size <= 0 || image.size > MAX_LOGO_BYTES) {
        throw new Error("invalid_logo_image");
      }
      const response = await transport.mutation(relativeV1Path(workspaceAssetPath(entry.accountId, "logo")), {
        method: "PUT",
        headers: {
          "X-Danil-Session": ctx,
          "Content-Type": mime,
        },
        body: image,
      });
      const body = (await response.json().catch(() => null)) as { logo_url?: unknown; logo_version?: unknown } | null;
      const nextUrl = typeof body?.logo_url === "string" ? body.logo_url : null;
      const nextVersion = typeof body?.logo_version === "number" ? body.logo_version : entry.logoVersion + 1;
      const updated: CatalogEntry = { accountId: entry.accountId, logoUrl: nextUrl, logoVersion: nextVersion };
      if (map) {
        map.set(entry.accountId, updated);
        map.set(workspace, updated);
      }
      return true;
    },
    async remove(workspace, kind, context) {
      if (kind !== "logo") return false;
      const ctx = context ?? resolveContext();
      if (!ctx) return false;
      const map = await listContext(ctx);
      const entry = map?.get(workspace);
      if (!entry) return false;
      await transport.mutation(relativeV1Path(workspaceAssetPath(entry.accountId, "logo")), {
        method: "DELETE",
        headers: { "X-Danil-Session": ctx },
      });
      const updated: CatalogEntry = { accountId: entry.accountId, logoUrl: null, logoVersion: entry.logoVersion + 1 };
      if (map) {
        map.set(entry.accountId, updated);
        map.set(workspace, updated);
      }
      return true;
    },
    forget(context) {
      if (context) catalogs.delete(context);
      else catalogs.clear();
    },
  };
}

type DeskSend = (context: string, method: string, path: string, body?: unknown) => Promise<{ status: number; body?: unknown }>;

/**
 * En Desk, `danil_edge_fetch` lleva `desk_bearer` y `Accept: application/json` en Rust.
 * `GET /v1/workspaces/:id/logo?v=N` responde `{ data_url, logo_version, ... }` desde la misma
 * caché y bucket R2 que usa la web.
 */
export function deskEdgeWorkspaceAssets(
  send: DeskSend,
  resolveContext?: () => string | null,
): WorkspaceAssetsSource {
  const catalogs = new Map<string, Promise<Map<string, CatalogEntry> | null>>();
  const images = new Map<string, Promise<string | null>>();

  function listContext(context: string): Promise<Map<string, CatalogEntry> | null> {
    let pending = catalogs.get(context);
    if (!pending) {
      pending = (async () => {
        const merged = new Map<string, CatalogEntry>();
        const seen = new Set<string>();
        let cursor: string | null = null;
        do {
          const reply = await send(context, "GET", workspacesPagePath(cursor));
          const body = reply.body as { items?: unknown; next_cursor?: unknown } | null | undefined;
          if (reply.status !== 200 || !Array.isArray(body?.items)) return null;
          for (const [k, v] of parseCatalogRows(body.items)) merged.set(k, v);
          cursor = typeof body.next_cursor === "string" && body.next_cursor ? body.next_cursor : null;
          if (cursor && seen.has(cursor)) break;
          if (cursor) seen.add(cursor);
        } while (cursor);
        return merged;
      })().catch(() => {
        catalogs.delete(context);
        return null;
      });
      catalogs.set(context, pending);
    }
    return pending;
  }

  function fetchLogoDataUrl(context: string, logoUrl: string): Promise<string | null> {
    const key = versionedCacheKey(context, logoUrl);
    let pending = images.get(key);
    if (!pending) {
      pending = send(context, "GET", logoUrl)
        .then((reply) => {
          if (reply.status === 404) return null;
          if (reply.status !== 200) {
            images.delete(key);
            return null;
          }
          const body = reply.body as { data_url?: unknown } | null | undefined;
          const url = typeof body?.data_url === "string" ? imagenInerte(body.data_url) : null;
          if (!url) images.delete(key);
          return url;
        })
        .catch(() => {
          images.delete(key);
          return null;
        });
      images.set(key, pending);
    }
    return pending;
  }

  return {
    async read(workspace, kind, context) {
      if (kind !== "logo") return undefined;
      const ctx = context ?? resolveContext?.() ?? null;
      if (!ctx) return undefined;
      const map = await listContext(ctx);
      if (!map) return undefined;
      const entry = map.get(workspace);
      if (!entry) return undefined;
      if (!entry.logoUrl) return null;
      return fetchLogoDataUrl(ctx, entry.logoUrl);
    },
    setting() {
      return Promise.resolve(null);
    },
    put() {
      return Promise.resolve(false);
    },
    remove() {
      return Promise.resolve(false);
    },
    forget(context) {
      if (context) catalogs.delete(context);
      else catalogs.clear();
    },
  };
}
