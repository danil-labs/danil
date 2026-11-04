/**
 * Las dos fuentes de `/v1/usage/me`: la web con la sesión de Supabase de la
 * página y la ventana con el JWT que guarda Rust (`harness_org_fetch`). El panel
 * no sabe cuál está detrás.
 */
import { invoke } from "../../lib/invoke.ts";
import { readUsageMe, type UsageDays, type UsageMeSource } from "./usage-me";

const failure = (clave: string, detail: string) => ({ what: { clave }, detail });

function statusFailure(status: number, detail: string) {
  if (status === 401) return failure("settings.usage.no_session", detail);
  if (status === 403) return failure("settings.usage.forbidden", detail);
  if (status === 400) return failure("settings.usage.no_account", detail);
  if (status === 404 || status === 501 || status === 503) return failure("settings.usage.unavailable", detail);
  return failure("settings.usage.failed", detail);
}

/** La web de alfa: la sesión de la página contra Computers. */
export function webUsageMe(endpoint: string, getToken: () => string | Promise<string>): UsageMeSource {
  const base = endpoint.replace(/\/+$/, "");
  return {
    async get(days: UsageDays) {
      const token = await getToken();
      let response: Response;
      try {
        response = await fetch(`${base}/v1/usage/me?days=${days}`, {
          cache: "no-store",
          headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        });
      } catch {
        throw failure("settings.usage.unavailable", "usage_me unreachable");
      }
      const body = await response.json().catch(() => null);
      if (!response.ok) throw statusFailure(response.status, `usage_me HTTP ${response.status}`);
      return readUsageMe(body);
    },
  };
}

/** La ventana: el JWT vive en Rust y la orden está en una lista cerrada. */
export function desktopUsageMe(): UsageMeSource {
  return {
    async get(days: UsageDays) {
      const answer = await invoke<{ status: number; body: unknown }>("harness_org_fetch", { path: "/v1/usage/me", query: `days=${days}` });
      if (answer.status < 200 || answer.status >= 300) throw statusFailure(answer.status, `usage_me HTTP ${answer.status}`);
      return readUsageMe(answer.body);
    },
  };
}
