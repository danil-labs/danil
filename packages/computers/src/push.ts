/**
 * Avisos push de tareas (protocolo de computers, «Avisos push»): la llave
 * pública VAPID y la suscripción de este dispositivo. Sin APIs del DOM: el
 * registro del service worker lo hace cada cliente.
 */
import { type Answer, type Fetch, apiUrl, globalFetch, request } from "./api.ts";

/** Lo que guarda el plano de control de un `PushSubscription`. */
export type PushDevice = { endpoint: string; p256dh: string; auth: string; user_agent?: string | null };

/** La llave pública VAPID, o `null` si el push está apagado en ese plano de control. */
export async function pushPublicKey(endpoint: string, f: Fetch = globalFetch): Promise<string | null> {
  try {
    const response = await f(apiUrl(endpoint, "/v1/push/config"), { method: "GET" });
    if (!response.ok) return null;
    const key = ((await response.json()) as { public_key?: unknown } | null)?.public_key;
    return typeof key === "string" && key ? key : null;
  } catch {
    return null;
  }
}

/** Guarda (o renueva) este dispositivo para la persona del token. */
export function savePushDevice(endpoint: string, token: string, device: PushDevice, f: Fetch = globalFetch): Promise<Answer<null>> {
  return request(apiUrl(endpoint, "/v1/push/subscriptions"), token, "POST", () => null, f, device);
}

/** Deja de avisar a este dispositivo. */
export function forgetPushDevice(endpoint: string, token: string, device: Pick<PushDevice, "endpoint">, f: Fetch = globalFetch): Promise<Answer<null>> {
  return request(apiUrl(endpoint, "/v1/push/subscriptions"), token, "DELETE", () => null, f, { endpoint: device.endpoint });
}

/** Qué avisa la persona: todo, solo lo que pide una decisión, o nada. */
export type PushMode = "all" | "needs_you" | "off";

/** Horas de silencio en la hora local del dispositivo. */
export type PushQuiet = { from: number; to: number; offset: number };
export type PushPreferences = { mode: PushMode; quiet: PushQuiet | null };

/** La preferencia guardada en el relay de sus computadoras. */
export function pushPreferences(endpoint: string, token: string, f: Fetch = globalFetch): Promise<Answer<PushPreferences>> {
  return request(apiUrl(endpoint, "/v1/push/preferences"), token, "GET", (body) => body as PushPreferences, f);
}

export function savePushPreferences(endpoint: string, token: string, prefs: PushPreferences, f: Fetch = globalFetch): Promise<Answer<PushPreferences>> {
  return request(apiUrl(endpoint, "/v1/push/preferences"), token, "PUT", (body) => body as PushPreferences, f, prefs);
}

/** Solo en staging: un aviso de prueba a los dispositivos de quien lo pide. */
export function testPush(endpoint: string, token: string, f: Fetch = globalFetch): Promise<Answer<{ sent: number; devices: number }>> {
  return request(apiUrl(endpoint, "/v1/push/test"), token, "POST", (body) => body as { sent: number; devices: number }, f);
}

/** base64url → bytes, para `applicationServerKey`. */
export function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64url.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (base64url.length % 4)) % 4));
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
