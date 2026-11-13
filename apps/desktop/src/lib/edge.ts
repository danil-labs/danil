/**
 * Lo que Desk lee del borde `/v1` (contrato `mvp-v1`). El token nunca llega
 * aquí: `danil_edge_fetch` lo pone en Rust y solo admite una lista cerrada de
 * rutas. Un 404 o un 501 que Rust ya reintentó llega como `not_available_yet`
 * (con `retry_after_ms`), y aquí se vuelve a intentar solo, con backoff, hasta
 * que la ruta aparece: Desk compilado no se recompila por cambios del servidor.
 */
import { invoke } from "./invoke.ts";

export type Me = { id: string; name: string; state?: string; workspace: string | null; organizations: { id: string; name: string; type?: string; role?: string }[]; active_organization_id?: string | null };
export type Organization = { id: string; name: string; plan: string; role: string };
export type OrganizationList = { items: Organization[]; next_cursor: string | null; active_organization_id?: string | null };
export type Workspace = { id: string; org?: string; name: string; role?: string };
export type WorkspaceList = { items: Workspace[]; next_cursor: string | null; empty_reason?: string; active_workspace_id?: string | null };

export type Patience = {
  /** Corta la espera; la promesa rechaza con el último fallo. */
  signal?: AbortSignal;
  /** Primera espera entre intentos (por defecto 1 s). */
  minDelayMs?: number;
};

const CEILING_MS = 60_000;

/** La espera antes del reintento `attempt`: crece al doble, respeta la del servidor y no pasa de un minuto. */
export function nextDelay(attempt: number, hintMs: number | undefined, minDelayMs = 1000): number {
  const grown = minDelayMs * 2 ** Math.min(attempt, 16);
  return Math.min(CEILING_MS, Math.max(grown, hintMs ?? 0));
}

const detail = (e: unknown) => (e && typeof e === "object" ? (e as { detail?: unknown }).detail : undefined);
const hint = (e: unknown) => {
  const v = e && typeof e === "object" ? (e as { retry_after_ms?: unknown }).retry_after_ms : undefined;
  return typeof v === "number" && v >= 0 ? v : undefined;
};
const RETRIED = new Set(["not_available_yet", "unavailable"]);

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<boolean>((resolve) => {
    if (signal?.aborted) return resolve(false);
    const timer = setTimeout(() => resolve(true), ms);
    signal?.addEventListener("abort", () => (clearTimeout(timer), resolve(false)), { once: true });
  });

async function fetchEdge<T>(method: "GET" | "POST", path: string, body: unknown, patience: Patience = {}): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await invoke<T>("danil_edge_fetch", body === undefined ? { method, path } : { method, path, body });
    } catch (e) {
      // Sin sesión, sin organización o un rechazo del contrato: quien llama decide.
      if (!RETRIED.has(String(detail(e)))) throw e;
      // Con `hint` del servidor: un Retry-After corto no se infla con la escala del minDelay.
      const wait = nextDelay(attempt, hint(e), patience.minDelayMs);
      if (!(await sleep(wait, patience.signal))) throw e;
    }
  }
}

export const me = (p?: Patience) => fetchEdge<Me>("GET", "/v1/identity/me", undefined, p);
export const organizations = (p?: Patience) => fetchEdge<OrganizationList>("GET", "/v1/identity/organizations", undefined, p);
export const workspaces = (p?: Patience) => fetchEdge<WorkspaceList>("GET", "/v1/workspaces", undefined, p);
export const selectOrganization = (organizationId: string, p?: Patience) =>
  fetchEdge<{ organization: Organization; workspace: string | null }>("POST", "/v1/identity/organizations/select", { organization_id: organizationId }, p);
export const selectWorkspace = (workspaceId: string, p?: Patience) =>
  fetchEdge<{ workspace: Workspace }>("POST", "/v1/workspaces/select", { workspace: workspaceId }, p);
