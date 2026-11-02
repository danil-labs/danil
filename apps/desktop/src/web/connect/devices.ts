/** The device flow on the control plane: what a code is asking for, and approving it. */
import { apiUrl } from "../computers.ts";

export type DeviceRequest = { hostname: string; platform: string; name: string | null; expires_at: string | number | null };

export type DeviceAnswer<T> =
  | { kind: "ok"; value: T }
  | { kind: "unauthorized" }
  | { kind: "license" }
  | { kind: "no_account" }
  | { kind: "expired" }
  | { kind: "invalid" }
  | { kind: "used" }
  | { kind: "ambiguous" }
  | { kind: "error"; status: number | null };

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

const EXPIRED = /expired/i;

/** Danil Machines answers `{ error: { code, detail? } }`; a bare string is still read. */
function errorCode(body: { error?: unknown } | null): string {
  const e = body?.error;
  if (typeof e === "string") return e;
  const code = e && typeof e === "object" ? (e as { code?: unknown }).code : null;
  return typeof code === "string" ? code : "";
}

async function send<T>(url: string, token: string, init: RequestInit, read: (body: unknown) => T | undefined, f: Fetch): Promise<DeviceAnswer<T>> {
  let response: Response;
  try {
    response = await f(url, { ...init, headers: { ...init.headers, authorization: `Bearer ${token}` } });
  } catch {
    return { kind: "error", status: null };
  }
  const body = (await response.json().catch(() => null)) as { error?: unknown } | null;
  const error = errorCode(body);
  if (response.status === 401) return { kind: "unauthorized" };
  if (response.status === 403) return { kind: error === "unknown_user" ? "no_account" : "license" };
  if (response.status === 409) return { kind: error === "ambiguous_danil_account" ? "ambiguous" : "used" };
  if (response.status === 410 || EXPIRED.test(error)) return { kind: "expired" };
  if (response.status === 404 || response.status === 400) return { kind: "invalid" };
  if (!response.ok) return { kind: "error", status: response.status };
  const value = read(body);
  return value === undefined ? { kind: "error", status: response.status } : { kind: "ok", value };
}

/** The code as the person typed or the link carried it: `abcd-efgh` → `ABCD-EFGH`. */
export const normalizeCode = (code: string | null | undefined): string => (code ?? "").trim().toUpperCase().replace(/\s+/g, "");

export function lookupDevice(endpoint: string, token: string, code: string, f: Fetch = fetch): Promise<DeviceAnswer<DeviceRequest>> {
  const url = `${apiUrl(endpoint, "/v1/devices/lookup")}?user_code=${encodeURIComponent(code)}`;
  return send(url, token, { method: "GET" }, (body) => {
    const b = body as { hostname?: unknown; platform?: unknown; name?: unknown; expires_at?: unknown } | null;
    if (typeof b?.hostname !== "string") return undefined;
    return {
      hostname: b.hostname,
      platform: typeof b.platform === "string" ? b.platform : "",
      name: typeof b.name === "string" ? b.name : null,
      expires_at: typeof b.expires_at === "string" || typeof b.expires_at === "number" ? b.expires_at : null,
    };
  }, f);
}

export function approveDevice(endpoint: string, token: string, code: string, name: string, f: Fetch = fetch): Promise<DeviceAnswer<null>> {
  return send(apiUrl(endpoint, "/v1/devices/approve"), token, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ user_code: code, name }),
  }, () => null, f);
}

/** The engine's next poll answers `access_denied`. */
export function denyDevice(endpoint: string, token: string, code: string, f: Fetch = fetch): Promise<DeviceAnswer<null>> {
  return send(apiUrl(endpoint, "/v1/devices/deny"), token, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ user_code: code }),
  }, () => null, f);
}
