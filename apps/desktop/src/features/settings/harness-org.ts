/**
 * La fuente de `/v1/org/*` para el panel de Harness.
 *
 * En el escritorio la petición la hace la ventana con la sesión de persona
 * guardada en Rust (`harness_org_fetch`); el JavaScript no ve el token. En la
 * web `/admin` se usa la sesión de Supabase del navegador. Las dos devuelven la
 * misma forma; el panel no sabe cuál está detrás.
 */
import { invoke } from "../../lib/invoke.ts";

export type HarnessOrgSource = {
  get<T>(path: string, query?: string): Promise<T>;
};

const failure = (clave: string, detail: string) => ({ what: { clave }, detail });

function statusFailure(status: number, detail: string) {
  if (status === 401) return failure("radiant.error.no_session", detail);
  if (status === 403) return failure("harness.admin.forbidden", detail);
  if (status === 404 || status === 501 || status === 503) return failure("harness.admin.unavailable", detail);
  return failure("harness.admin.failed", detail);
}

/** La ventana de escritorio: el JWT vive en Rust y la orden está en una lista cerrada. */
export function desktopHarnessOrg(): HarnessOrgSource {
  return {
    async get<T>(path: string, query = ""): Promise<T> {
      const answer = await invoke<{ status: number; body: T }>("harness_org_fetch", { path, query });
      if (answer.status >= 200 && answer.status < 300) return answer.body;
      throw statusFailure(answer.status, `${path} HTTP ${answer.status}`);
    },
  };
}

/** La web `/admin`: la sesión de Supabase de la página, contra Computers. */
export function webHarnessOrg(endpoint: string, getToken: () => string | Promise<string>): HarnessOrgSource {
  const base = endpoint.replace(/\/+$/, "");
  return {
    async get<T>(path: string, query = ""): Promise<T> {
      const token = await getToken();
      let response: Response;
      try {
        response = await fetch(`${base}${path}${query ? `?${query}` : ""}`, {
          headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        });
      } catch {
        throw failure("harness.admin.unavailable", `${path} unreachable`);
      }
      const body = (await response.json().catch(() => null)) as T | null;
      if (!response.ok) throw statusFailure(response.status, `${path} HTTP ${response.status}`);
      if (!body || typeof body !== "object") throw failure("harness.admin.failed", `${path} invalid_response`);
      return body;
    },
  };
}
