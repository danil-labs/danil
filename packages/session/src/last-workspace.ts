import { capabilities } from "../../host/src/platform.ts";

/**
 * Último workspace abierto en este cliente (plan web varias sesiones § 6 P4): guarda solo
 * `{ workspace, org, account }` y nunca `context_id`, que vence y se resuelve de nuevo contra
 * las sesiones vivas al arrancar. En la web vive bajo `danil.web.` para borrarse en `clearWebCaches`.
 */
export type LastWorkspace = { workspace: string; org: string; account: string };

export const WEB_LAST_WORKSPACE_KEY = "danil.web.last-workspace";
export const DESK_LAST_WORKSPACE_KEY = "harness.layout.workspaces.last_active";

const text = (value: unknown): string | null => (typeof value === "string" && value.length > 0 ? value : null);

export function parseLastWorkspace(raw: unknown): LastWorkspace | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Record<string, unknown>;
  const workspace = text(item.workspace);
  const org = text(item.org);
  const account = text(item.account);
  return workspace && org && account ? { workspace, org, account } : null;
}

export function requestedWorkspaceFromSearch(search: string): LastWorkspace | null {
  if (!search) return null;
  const params = new URLSearchParams(search);
  const workspace = text(params.get("workspace"));
  const org = text(params.get("org"));
  const account = text(params.get("account"));
  return workspace && org && account ? { workspace, org, account } : null;
}

function defaultKey() {
  return capabilities().nativeWindow ? DESK_LAST_WORKSPACE_KEY : WEB_LAST_WORKSPACE_KEY;
}

function defaultStorage(): Storage | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

export function readLastWorkspace(storage: Pick<Storage, "getItem"> | null = defaultStorage(), key = defaultKey()): LastWorkspace | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(key);
    return raw ? parseLastWorkspace(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function writeLastWorkspace(
  value: LastWorkspace | null,
  storage: Pick<Storage, "setItem" | "removeItem"> | null = defaultStorage(),
  key = defaultKey(),
): void {
  if (!storage) return;
  try {
    if (value) storage.setItem(key, JSON.stringify(value));
    else storage.removeItem(key);
  } catch {
    // Sin almacenamiento la app sigue: se pierde la preferencia, no el trabajo.
  }
}
