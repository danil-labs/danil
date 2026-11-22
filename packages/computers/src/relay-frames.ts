import { type RecoveryBoundary } from "./event-recovery.ts";

export type RelayConfig = {
  /** Origen del relay: `relay.example`, `https://relay.example` o `wss://relay.example`. */
  endpoint: string;
  computerId: string;
  /** El relay revocó la sesión (4003): el cliente vuelve a iniciar sesión. */
  onUnauthorized?: () => void;
  /** Antes de cada reconexión: un upgrade fallido no trae cuerpo, así que el cliente pregunta a la API por qué. False para. */
  beforeReconnect?: () => Promise<boolean>;
  /**
   * Los contratos de motor que este cliente habla (`?contracts=`): con otro, el
   * relay no reenvía ni contesta del espejo (`version_mismatch`).
   */
  contracts?: readonly string[];
  /**
   * El relay acepta renovar dentro del canal (`machines.session.renew` anunciada): con ticket, antes de
   * `session_expires_at` manda `{type:"auth", ticket}` por el mismo socket. Sin respuesta o con error,
   * se reabre con un ticket nuevo, como sin la capacidad.
   */
  renewInChannel?: () => boolean;
  /**
   * Por qué no abrió un upgrade fallido (sin cuerpo en el navegador):
   * `license_required` para la sesión hasta `retry()`; `null` reintenta como siempre.
   */
  probe?: () => Promise<Blocked | null>;
} & (
  | { getToken: () => string | Promise<string>; getAdmission?: never }
  | { getAdmission: () => Promise<{ url: string; ticket: string; protocol?: string; session_expires_at?: string | null }>; getToken?: never }
);

/** Lo que detiene la sesión sin reintentar sola: la persona no tiene Terminus de pago (computers#22). */
/** `license_required`: sin licencia. `machine_stopped`: la VM está apagada (409 del ticket); solo una acción de la persona la enciende y llama a `retry()`. */
export type Blocked = "license_required" | "machine_stopped";

/** Lo que el relay sabe del motor por su último `hello` (`{"type":"engine"}`). */
export type EngineInfo = { contract: string | null; host_version: string | null };

export type RelayFailure = { code?: string; message_key?: string; detail?: unknown; what?: unknown };

/** Una lectura que el relay contestó desde su copia con la computadora apagada. */
export type Cached = { updated_at: string | number };

/** `deferred`: la máquina estaba apagada y el relay guardó la acción para aplicarla al conectarse. */
export type CallResult = { value: unknown; cached: Cached | null; deferred?: { queued_at: string } | null };

/** Una acción aplazada en la cola del relay (`{"type":"deferred"}`). */
export type DeferredAction = { id: string; command: string; workspace: string | null; folder: string | null; args: unknown; queued_at: string };

/**
 * La cola de la máquina para esta persona, al abrir la sesión y cada vez que
 * cambia; `done`, las que acaban de salir (`applied`, `discarded`, `expired`).
 */
export type DeferredFrame = { actions: DeferredAction[]; done: { id: string; outcome: string }[] };

export type EventsPage = {
  cursor: number | null;
  gap?: boolean;
  replay?: boolean;
  /** Local subscription identity; never sent to the relay. */
  replayId?: string;
  runtime?: string;
  recovery?: RecoveryBoundary | { id: string; failed: true };
  /** `workspace`: el del evento, para que el relay lo filtre por los vínculos de cada cuenta; `null` si no es de uno. */
  events?: { name: string; payload: unknown; workspace?: string | null; seq?: number }[];
};

export type SocketLike = {
  readyState: number;
  protocol?: string;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onopen: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: ((ev: { code: number; reason?: string }) => void) | null;
  onerror: ((ev: unknown) => void) | null;
};

export type SocketFactory = (url: string, protocols?: string[]) => SocketLike;

export const SUBPROTOCOL = "danil.computers.v1";

export const MACHINE_SESSION_PROTOCOL = "danil.machine-session.v1";

export const OPEN = 1;

export const BACKOFF = [500, 1000, 2000, 5000, 10000];

export const PING_EVERY = 20_000;

export const MISSED_PINGS = 3;

/** Una lectura o una acción con la máquina encendida. */
export const CALL_TIMEOUT = 180_000;

/** Una acción que enciende la VM: el relay espera el `hello` hasta 5 min (`start_timeout`). */
export const WAKE_TIMEOUT = 330_000;

export const REPLACED = 4001;

export const REVOKED = 4003;

/** Cuánto antes de `session_expires_at` se cambia de ticket. */
export const ADMISSION_RENEW_BEFORE = 10_000;

/** Cuánto se espera la respuesta `auth` del relay a una renovación en el canal antes de reabrir. */
export const ADMISSION_RENEW_WAIT = 4_000;

export const TICKET_CONTEXT_REVOKED = 4008;

/** El token con que se abrió la sesión venció sin renovarse: se reabre con uno nuevo. */
export const TOKEN_EXPIRED = 4005;

/** Cuánto antes de vencer se manda el token nuevo (`auth`), y cada cuánto se reintenta si aún no hay otro. */
export const RENEW_BEFORE = 45_000;

export const RENEW_RETRY = 10_000;

const CONTRACT = /^[A-Za-z0-9._-]{1,64}$/;

export function sessionUrl(endpoint: string, computerId: string, contracts: readonly string[] = []): string {
  const base = /^[a-z]+:\/\//i.test(endpoint) ? endpoint : `wss://${endpoint}`;
  const url = new URL(base.replace(/^http/i, "ws"));
  // Hasta 16 y con la forma que acepta el relay: una lista mal formada la ignoraría entera.
  const known = [...new Set(contracts.map((c) => c.trim()).filter((c) => CONTRACT.test(c)))].slice(0, 16);
  const query = known.length ? `?contracts=${known.map(encodeURIComponent).join(",")}` : "";
  // `origin` de whatwg-url no da `ws:`/`wss:` en todos los entornos: se arma a mano.
  return `${url.protocol}//${url.host}${url.pathname.replace(/\/+$/, "")}/v1/computers/${encodeURIComponent(computerId)}/session${query}`;
}

/** El `exp` de un JWT en ms de época, o `null` si no se lee (el relay solo lo usa para cerrar con 4005). */
export function tokenExpiry(token: string): number | null {
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    const json = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "=")));
    return typeof json?.exp === "number" ? json.exp * 1000 : null;
  } catch {
    return null;
  }
}

export const timeOf = (v: unknown): number | null => {
  const at = typeof v === "number" ? (v < 1e12 ? v * 1000 : v) : typeof v === "string" ? Date.parse(v) : Number.NaN;
  return Number.isFinite(at) ? at : null;
};

/** Un UUID v4 para el `id` de un `call`: reintentar con el mismo no repite la acción. */
export function requestId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string; getRandomValues?: (a: Uint8Array) => Uint8Array } }).crypto;
  if (typeof c?.randomUUID === "function") return c.randomUUID();
  const b = new Uint8Array(16);
  if (typeof c?.getRandomValues === "function") c.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export type Pending = {
  history: boolean;
  message: string;
  resolve: (result: CallResult) => void;
  reject: (error: RelayFailure) => void;
  timer: ReturnType<typeof setTimeout>;
};

export const defaultFactory: SocketFactory = (url, protocols) => {
  const Socket = (globalThis as unknown as { WebSocket?: new (url: string, protocols?: string[]) => SocketLike }).WebSocket;
  if (!Socket) throw new Error("WebSocket is not available: pass a SocketFactory");
  return new Socket(url, protocols);
};

/** `cached.updated_at` en ms de época, o null si no se entiende. */
export function cachedAt(cached: Cached | null): number | null {
  if (!cached) return null;
  const at = typeof cached.updated_at === "number" ? cached.updated_at : Date.parse(cached.updated_at);
  if (!Number.isFinite(at)) return null;
  return at < 1e12 ? at * 1000 : at;
}
