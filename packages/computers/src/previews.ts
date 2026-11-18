import type { EdgeTransport } from "./edge.ts";
import { requestId } from "./relay.ts";

export type PreviewDomain = { prefix: string; suffix: string };
/** Sitio aislado de Danil, dedicado a vistas sin sesión de plataforma. */
export const DEFAULT_PREVIEW_DOMAIN: PreviewDomain = { prefix: "prv-", suffix: "daizero.com" };
export type PreviewScope = { machine: string; workspace: string; session: string };
export type PreviewLease = { id: string; url: string; deadline: number; renewAfterMs: number };
export type PreviewClient = {
  open(scope: PreviewScope, port: number, signal: AbortSignal): Promise<PreviewLease>;
  renew(scope: PreviewScope, id: string, signal: AbortSignal): Promise<number>;
  close(scope: PreviewScope, id: string): Promise<void>;
};

/** El destino es configuración del despliegue; el servidor solo entrega la capacidad. */
export function previewUrl(token: string, domain: PreviewDomain): string {
  if (!/^[a-z2-7]{52}$/.test(token) || !/^[a-z][a-z0-9-]{0,10}$/.test(domain.prefix)
    || !/^[a-z0-9]+(?:-[a-z0-9]+)*(?:\.[a-z0-9]+(?:-[a-z0-9]+)*)+$/.test(domain.suffix)) {
    throw new Error("invalid_preview_response");
  }
  return `https://${domain.prefix}${token}.${domain.suffix}/`;
}

export function localPreviewTarget(value: string): { port: number; path: string } | null {
  let url: URL;
  try { url = new URL(value); } catch { return null; }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password
    || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) return null;
  return { port: Number(url.port || (url.protocol === "https:" ? 443 : 80)), path: url.pathname + url.search + url.hash };
}

function leaseTtl(body: Record<string, unknown>, response: Response): number {
  const ttl = body.lease_ttl_ms;
  if (ttl !== undefined) {
    if (!Number.isInteger(ttl) || (ttl as number) < 0 || (ttl as number) > 60_000) throw new Error("invalid_preview_response");
    return ttl as number;
  }
  const expires = typeof body.lease_expires_at === "string" ? Date.parse(body.lease_expires_at) : NaN;
  if (!Number.isFinite(expires)) throw new Error("invalid_preview_response");
  const serverNow = Date.parse(response.headers.get("Date") ?? "");
  return Number.isFinite(serverNow) ? Math.max(0, Math.min(60_000, expires - serverNow)) : 30_000;
}

const idPart = (value: string) => {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(value)) throw new Error("invalid_preview_scope");
  return encodeURIComponent(value);
};

/** Cookie y CSRF pertenecen al transporte del borde, nunca a la página de la tarea. */
export function previewClient(transport: EdgeTransport, domain: PreviewDomain, options: { workspace?: string; now?: () => number } = {}): PreviewClient {
  const now = options.now ?? (() => performance.now());
  const scopeHeaders: Record<string, string> = options.workspace ? { "X-Danil-Workspace": options.workspace } : {};
  const route = (scope: PreviewScope, id?: string) => `machines/${idPart(scope.machine)}/previews${id ? `/${idPart(id)}` : ""}`;
  async function body(response: Response): Promise<Record<string, unknown>> {
    const value: unknown = await response.json();
    if (!response.ok) throw new Error(typeof (value as { code?: unknown })?.code === "string" ? (value as { code: string }).code : "preview_failed");
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid_preview_response");
    return value as Record<string, unknown>;
  }
  const write = (path: string, method: string, value: unknown, signal?: AbortSignal) => transport.mutation(path, {
    method, signal, headers: { ...scopeHeaders, "Content-Type": "application/json", "Idempotency-Key": requestId() },
    ...(method === "DELETE" ? { keepalive: true } : { body: JSON.stringify(value) }),
  });
  return {
    async open(scope, port, signal) {
      if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("port_reserved");
      idPart(scope.workspace);
      idPart(scope.session);
      const machine = await body(await transport.call(`machines/${idPart(scope.machine)}`, { signal, headers: scopeHeaders }));
      if ((machine.preview as { available?: unknown } | undefined)?.available !== true) throw new Error("capability_missing");
      const started = now();
      const response = await write(route(scope), "POST", { engine_workspace_id: scope.workspace, session_id: scope.session, port }, signal);
      const answer = await body(response);
      if (typeof answer.preview_id !== "string" || typeof answer.host_token !== "string" || answer.port !== port
        || typeof answer.renew_after_s !== "number" || answer.renew_after_s <= 0 || answer.renew_after_s > 30) {
        throw new Error("invalid_preview_response");
      }
      idPart(answer.preview_id);
      return { id: answer.preview_id, url: previewUrl(answer.host_token, domain), deadline: started + leaseTtl(answer, response), renewAfterMs: answer.renew_after_s * 1000 };
    },
    async renew(scope, id, signal) {
      const started = now();
      const response = await write(`${route(scope, id)}/renew`, "POST", {}, signal);
      return started + leaseTtl(await body(response), response);
    },
    async close(scope, id) {
      const response = await write(route(scope, id), "DELETE", undefined);
      if (!response.ok && response.status !== 404 && response.status !== 410) throw new Error("preview_close_failed");
    },
  };
}
