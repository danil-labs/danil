/**
 * Los workspaces que la persona puede entrar (`GET /v1/me/workspaces`). La clave es
 * `a:<cuenta>` si hay cuenta de Danil Agents y `w:<workspace>` si solo existe en
 * Terminus. El acceso lo decide el plano de control: aquí solo se agrupa.
 */
import { apiUrl, globalFetch, request, type Answer, type Fetch } from "./api.ts";

export type DirectoryEntry = {
  key: string;
  /** Solo si la persona es la dueña del registro. */
  workspace_id: string | null;
  danil_workspace_id: number | null;
  name: string;
  kind: "personal" | "organization" | "terminus_only";
  organization: { id: number; name: string } | null;
  role: string | null;
  owner: boolean;
  support: { level: "read" | "write"; expires_at: string } | null;
  capabilities: { agents: boolean; terminus: boolean };
  /** Lugar en la barra; null si no está fijado. */
  pin: number | null;
};

export type Directory = { workspaces: DirectoryEntry[]; truncated: boolean };

export type DirectoryGroup =
  | { kind: "personal" | "terminus_only" | "support"; entries: DirectoryEntry[] }
  | { kind: "organization"; name: string; entries: DirectoryEntry[] };

export function listDirectory(endpoint: string, token: string, f: Fetch = globalFetch): Promise<Answer<Directory>> {
  return request(
    apiUrl(endpoint, "/v1/me/workspaces"),
    token,
    "GET",
    (body) => {
      const value = body as { workspaces?: unknown; truncated?: unknown } | null;
      if (!Array.isArray(value?.workspaces)) throw new Error("bad_directory");
      return { workspaces: value.workspaces as DirectoryEntry[], truncated: value.truncated === true };
    },
    f,
  );
}

/** Reemplaza los fijados de la barra. Fijar no da acceso; el plano de control rechaza lo que no se puede entrar. */
export function setDirectoryPins(endpoint: string, token: string, keys: string[], f: Fetch = globalFetch): Promise<Answer<string[]>> {
  return request(
    apiUrl(endpoint, "/v1/me/workspaces/pins"),
    token,
    "PUT",
    (body) => {
      const list = (body as { keys?: unknown } | null)?.keys;
      if (!Array.isArray(list)) throw new Error("bad_pins");
      return list as string[];
    },
    f,
    { keys },
  );
}

/**
 * Enlaza un workspace de Terminus de la persona con su cuenta de Danil Agents
 * (`POST /v1/workspaces/:id/danil-workspace`). Solo con el JWT de la persona, que debe
 * ser owner o admin de la cuenta. El workspace adopta el nombre de la cuenta.
 */
export function linkDanilWorkspace(
  endpoint: string,
  token: string,
  workspaceId: string,
  danilWorkspaceId: number,
  f: Fetch = globalFetch,
): Promise<Answer<number>> {
  return request(
    apiUrl(endpoint, `/v1/workspaces/${encodeURIComponent(workspaceId)}/danil-workspace`),
    token,
    "POST",
    (body) => {
      const id = (body as { danil_workspace_id?: unknown } | null)?.danil_workspace_id;
      if (typeof id !== "number") throw new Error("bad_link");
      return id;
    },
    f,
    { danil_workspace_id: danilWorkspaceId },
  );
}

/** Personal, cada organización, sin enlazar y acceso de soporte, en ese orden. Sin grupos vacíos. */
export function groupDirectory(entries: readonly DirectoryEntry[]): DirectoryGroup[] {
  const support = entries.filter((e) => e.support);
  const own = entries.filter((e) => !e.support);
  const organizations = new Map<number, { name: string; entries: DirectoryEntry[] }>();
  for (const entry of own) {
    if (entry.kind !== "organization" || !entry.organization) continue;
    const group = organizations.get(entry.organization.id) ?? { name: entry.organization.name, entries: [] };
    group.entries.push(entry);
    organizations.set(entry.organization.id, group);
  }
  const groups: DirectoryGroup[] = [
    { kind: "personal", entries: own.filter((e) => e.kind === "personal") },
    ...[...organizations.values()].map((g) => ({ kind: "organization" as const, ...g })),
    { kind: "terminus_only", entries: own.filter((e) => e.kind === "terminus_only") },
    { kind: "support", entries: support },
  ];
  return groups.filter((g) => g.entries.length > 0);
}

/** Lo que muestra la barra: `null` sin fijados (se queda como estaba); con fijados, esos y el abierto. */
export function barWorkspaceIds(entries: readonly DirectoryEntry[], active: string | null): Set<string> | null {
  const pinned = entries.filter((e) => e.pin !== null && e.workspace_id);
  if (pinned.length === 0) return null;
  const ids = new Set(pinned.map((e) => e.workspace_id as string));
  if (active) ids.add(active);
  return ids;
}
