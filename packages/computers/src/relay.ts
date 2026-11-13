/**
 * El cliente del socket de sesión de Danil Machines (protocolo v1,
 * «Navegador/escritorio ↔ relay»): call/result, subscribe/events, state y
 * ping/pong sobre un WebSocket que se reconecta con un token fresco.
 *
 * Sin APIs del DOM: el WebSocket se inyecta (el global de React Native o del
 * navegador sirve tal cual).
 */
import type { MachineState } from "./machine.ts";
import { relayArgs } from "./mcp-block.ts";

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
   * Por qué no abrió un upgrade fallido (sin cuerpo en el navegador):
   * `license_required` para la sesión hasta `retry()`; `null` reintenta como siempre.
   */
  probe?: () => Promise<Blocked | null>;
} & (
  | { getToken: () => string | Promise<string>; getAdmission?: never }
  | { getAdmission: () => Promise<{ url: string; ticket: string }>; getToken?: never }
);

/** Lo que detiene la sesión sin reintentar sola: la persona no tiene Terminus de pago (computers#22). */
export type Blocked = "license_required";

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
  runtime?: string;
  /** `workspace`: el del evento, para que el relay lo filtre por los vínculos de cada cuenta; `null` si no es de uno. */
  events?: { name: string; payload: unknown; workspace?: string | null }[];
};

export type SocketLike = {
  readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onopen: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: ((ev: { code: number; reason?: string }) => void) | null;
  onerror: ((ev: unknown) => void) | null;
};

export type SocketFactory = (url: string, protocols?: string[]) => SocketLike;

export const SUBPROTOCOL = "danil.computers.v1";
const OPEN = 1;
const BACKOFF = [500, 1000, 2000, 5000, 10000];
const PING_EVERY = 20_000;
const MISSED_PINGS = 3;
/** Una lectura o una acción con la máquina encendida. */
export const CALL_TIMEOUT = 180_000;
/** Una acción que enciende la VM: el relay espera el `hello` hasta 5 min (`start_timeout`). */
export const WAKE_TIMEOUT = 330_000;
const REPLACED = 4001;
const REVOKED = 4003;
const TICKET_CONTEXT_REVOKED = 4008;
/** El token con que se abrió la sesión venció sin renovarse: se reabre con uno nuevo. */
export const TOKEN_EXPIRED = 4005;
/** Cuánto antes de vencer se manda el token nuevo (`auth`), y cada cuánto se reintenta si aún no hay otro. */
const RENEW_BEFORE = 45_000;
const RENEW_RETRY = 10_000;
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

const timeOf = (v: unknown): number | null => {
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

type Pending = {
  history: boolean;
  message: string;
  resolve: (result: CallResult) => void;
  reject: (error: RelayFailure) => void;
  timer: ReturnType<typeof setTimeout>;
};

const defaultFactory: SocketFactory = (url, protocols) => {
  const Socket = (globalThis as unknown as { WebSocket?: new (url: string, protocols?: string[]) => SocketLike }).WebSocket;
  if (!Socket) throw new Error("WebSocket is not available: pass a SocketFactory");
  return new Socket(url, protocols);
};

export class RelaySession {
  private socket: SocketLike | null = null;
  private pending = new Map<string, Pending>();
  private subscribed = false;
  private after: number | null = null;
  private attempt = 0;
  private missed = 0;
  private pinger: ReturnType<typeof setInterval> | undefined;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private closed = false;
  private machine: MachineState = "unknown";
  private engineInfo: EngineInfo | null = null;
  private stopped: Blocked | null = null;
  private blockedListeners = new Set<(blocked: Blocked | null) => void>();
  /** El token de la sesión abierta y cuándo vence, para renovarlo con `auth` antes. */
  private token: string | null = null;
  private renew: ReturnType<typeof setTimeout> | undefined;
  private engineListeners = new Set<(engine: EngineInfo) => void>();
  private stateListeners = new Set<(state: MachineState) => void>();
  private eventListeners = new Set<(page: EventsPage) => void>();
  private linkListeners = new Set<(open: boolean) => void>();
  private deferredListeners = new Set<(frame: DeferredFrame) => void>();
  private queue: DeferredFrame = { actions: [], done: [] };

  private readonly config: RelayConfig;
  private readonly factory: SocketFactory;

  constructor(config: RelayConfig, factory: SocketFactory = defaultFactory) {
    this.config = config;
    this.factory = factory;
  }

  start() {
    void this.connect();
  }

  state(): MachineState {
    return this.machine;
  }

  connected(): boolean {
    return this.socket?.readyState === OPEN;
  }

  onState(listener: (state: MachineState) => void): () => void {
    this.stateListeners.add(listener);
    return () => void this.stateListeners.delete(listener);
  }

  onEvents(listener: (page: EventsPage) => void): () => void {
    this.eventListeners.add(listener);
    return () => void this.eventListeners.delete(listener);
  }

  /** Por qué la sesión está detenida (`license_required`), o `null`. */
  blocked(): Blocked | null {
    return this.stopped;
  }

  onBlocked(listener: (blocked: Blocked | null) => void): () => void {
    this.blockedListeners.add(listener);
    return () => void this.blockedListeners.delete(listener);
  }

  /** «Reintentar»: vuelve a abrir una sesión detenida (por ejemplo, tras activar la licencia). */
  retry() {
    if (this.closed || !this.stopped) return;
    this.setBlocked(null);
    this.attempt = 0;
    void this.connect();
  }

  /** El motor de la computadora según su último `hello`; `null` si el relay aún no lo dijo. */
  engine(): EngineInfo | null {
    return this.engineInfo;
  }

  /** Cada `hello` nuevo del motor: el cliente vuelve a comparar su contrato. */
  onEngine(listener: (engine: EngineInfo) => void): () => void {
    this.engineListeners.add(listener);
    return () => void this.engineListeners.delete(listener);
  }

  /** Las acciones aplazadas de esta máquina según el último frame del relay. */
  deferred(): DeferredFrame {
    return this.queue;
  }

  onDeferred(listener: (frame: DeferredFrame) => void): () => void {
    this.deferredListeners.add(listener);
    return () => void this.deferredListeners.delete(listener);
  }

  onLink(listener: (open: boolean) => void): () => void {
    this.linkListeners.add(listener);
    return () => void this.linkListeners.delete(listener);
  }

  /**
   * Resuelve con `value` (y `cached` si el relay contestó desde su copia) o
   * rechaza con `error`. Se reenvía con el mismo id tras una reconexión.
   */
  call(id: string, command: string, workspace: string | null, folder: string | null, args: unknown, timeoutMs = CALL_TIMEOUT): Promise<CallResult> {
    const checked = relayArgs(command, args);
    if ("code" in checked) return Promise.reject({ code: checked.code });
    args = checked.args;
    const request = (args as { history_request?: { kind?: string } } | null)?.history_request;
    const history = command === "load_session" && !!request && request.kind !== "state";
    if (history && [...this.pending.values()].filter(call => call.history).length >= 4) return Promise.reject({ code: "service_busy" });
    const message = JSON.stringify({ type: "call", id, command, workspace, folder, args: args ?? {} });
    if (this.stopped) return Promise.reject({ code: this.stopped });
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject({ code: "io", detail: "timeout" });
      }, timeoutMs);
      this.pending.set(id, { message, resolve, reject, timer, history });
      if (this.connected()) this.socket?.send(message);
    });
  }

  subscribe(after: number | null) {
    this.subscribed = true;
    this.after = after;
    if (this.connected()) this.send({ type: "subscribe", after });
  }

  close() {
    this.closed = true;
    clearTimeout(this.retryTimer);
    clearTimeout(this.renew);
    clearInterval(this.pinger);
    this.socket?.close(1000);
    for (const [id, call] of this.pending) {
      clearTimeout(call.timer);
      call.reject({ code: "app_unavailable" });
      this.pending.delete(id);
    }
  }

  private send(message: object) {
    this.socket?.send(JSON.stringify(message));
  }

  private async connect() {
    if (this.closed || this.stopped) return;
    if (this.attempt > 0 && this.config.beforeReconnect) {
      const go = await this.config.beforeReconnect().catch(() => true);
      if (!go) return this.close();
      if (this.closed) return;
    }
    let token: string;
    let target = sessionUrl(this.config.endpoint, this.config.computerId, this.config.contracts);
    try {
      if (this.config.getAdmission) {
        const admission = await this.config.getAdmission();
        token = admission.ticket;
        target = admission.url;
      } else if (this.config.getToken) token = await this.config.getToken();
      else throw new Error("relay_admission_required");
    } catch {
      return this.reconnectLater();
    }
    if (this.closed) return;
    // Un WebSocket de navegador no puede poner Authorization; el relay rechaza el token en la query.
    const protocols = [SUBPROTOCOL, `${this.config.getAdmission ? "ticket" : "bearer"}.${token}`];
    let socket: SocketLike;
    try {
      socket = this.factory(target, protocols);
    } catch {
      return this.reconnectLater();
    }
    this.socket = socket;
    let opened = false;
    socket.onopen = () => {
      if (this.socket !== socket) return;
      opened = true;
      this.attempt = 0;
      this.missed = 0;
      this.token = token;
      if (!this.config.getAdmission) this.scheduleRenew(tokenExpiry(token));
      clearInterval(this.pinger);
      this.pinger = setInterval(() => this.ping(), PING_EVERY);
      if (this.subscribed) this.send({ type: "subscribe", after: this.after });
      for (const call of this.pending.values()) socket.send(call.message);
      for (const listener of this.linkListeners) listener(true);
    };
    socket.onmessage = (event) => {
      if (this.socket === socket) this.receive(event.data);
    };
    socket.onerror = () => {};
    socket.onclose = (event) => {
      if (this.socket !== socket) return;
      this.socket = null;
      clearInterval(this.pinger);
      clearTimeout(this.renew);
      for (const listener of this.linkListeners) listener(false);
      // Sin licencia no se reintenta en bucle: la sesión espera a `retry()`.
      if (event.code === REVOKED && event.reason === "license_required") return this.setBlocked("license_required");
      if (this.config.getAdmission && (event.code === TICKET_CONTEXT_REVOKED || event.code === REVOKED)) {
        this.config.onUnauthorized?.();
        return this.close();
      }
      if (event.code === REVOKED) this.config.onUnauthorized?.();
      if (!opened && this.config.probe) return void this.afterFailedUpgrade();
      // 4005: el token venció sin renovarse; la reconexión pide uno nuevo.
      // Otra sesión ocupó el lugar de esta computadora: reconectar la echaría a su vez.
      // Con ticket, `4001 session_expired` es el fin de la sesión del puente: se pide otro ticket y se reconecta.
      if (this.config.getAdmission && event.code === REPLACED && event.reason === "session_expired") return this.reconnectLater();
      if (event.code === REPLACED) return this.close();
      this.reconnectLater();
    };
  }

  /**
   * Antes de que venza el token de la sesión manda uno nuevo por `auth`, sin
   * reconectar: el token de cliente del escritorio dura 10 min.
   */
  private scheduleRenew(expires: number | null) {
    clearTimeout(this.renew);
    if (expires === null || this.closed) return;
    const wait = Math.max(1_000, expires - Date.now() - RENEW_BEFORE);
    this.renew = setTimeout(() => void this.renewNow(expires), wait);
  }

  private async renewNow(expires: number) {
    if (this.closed || !this.connected()) return;
    let next: string;
    try {
      next = this.config.getToken ? await this.config.getToken() : "";
    } catch {
      next = this.token ?? "";
    }
    if (this.closed || !this.connected()) return;
    // Quien da el token aún tiene el mismo: se vuelve a pedir en un rato, mientras no venza.
    if (!next || next === this.token) {
      if (Date.now() + RENEW_RETRY < expires) this.renew = setTimeout(() => void this.renewNow(expires), RENEW_RETRY);
      return;
    }
    this.token = next;
    this.send({ type: "auth", token: next });
    // Hasta que el relay confirme, el plazo es el del token nuevo.
    this.scheduleRenew(tokenExpiry(next));
  }

  private async afterFailedUpgrade() {
    const why = await this.config.probe?.().catch(() => null);
    if (this.closed) return;
    if (why) return this.setBlocked(why);
    this.reconnectLater();
  }

  private setBlocked(blocked: Blocked | null) {
    if (this.stopped === blocked) return;
    this.stopped = blocked;
    if (blocked) {
      clearTimeout(this.retryTimer);
      for (const [id, call] of this.pending) {
        clearTimeout(call.timer);
        call.reject({ code: blocked });
        this.pending.delete(id);
      }
    }
    for (const listener of this.blockedListeners) listener(blocked);
  }

  private reconnectLater() {
    if (this.closed) return;
    const wait = BACKOFF[Math.min(this.attempt, BACKOFF.length - 1)];
    this.attempt += 1;
    clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => void this.connect(), wait);
  }

  private ping() {
    if (this.missed >= MISSED_PINGS) {
      const socket = this.socket;
      this.socket = null;
      clearInterval(this.pinger);
      socket?.close(4000, "ping");
      for (const listener of this.linkListeners) listener(false);
      return this.reconnectLater();
    }
    this.missed += 1;
    this.send({ type: "ping", t: Date.now() });
  }

  private receive(data: unknown) {
    this.missed = 0;
    let message: Record<string, unknown>;
    try {
      message = JSON.parse(String(data));
    } catch {
      return;
    }
    switch (message.type) {
      case "result": {
        const id = String(message.id);
        const call = this.pending.get(id);
        if (!call) return;
        this.pending.delete(id);
        clearTimeout(call.timer);
        if (message.error !== undefined && message.error !== null) call.reject(message.error as RelayFailure);
        else {
          const cached = message.cached as Cached | undefined;
          const deferred = message.deferred as { queued_at: string } | undefined;
          call.resolve({
            value: message.value ?? null,
            cached: cached && typeof cached === "object" ? cached : null,
            deferred: deferred && typeof deferred === "object" ? deferred : null,
          });
        }
        return;
      }
      case "events": {
        const page = message as unknown as EventsPage;
        if (typeof page.cursor === "number") this.after = page.cursor;
        for (const listener of this.eventListeners) listener(page);
        return;
      }
      case "state": {
        this.machine = String(message.state) as MachineState;
        for (const listener of this.stateListeners) listener(this.machine);
        return;
      }
      case "deferred": {
        const actions = Array.isArray(message.actions) ? (message.actions as DeferredAction[]) : [];
        const done = Array.isArray(message.done) ? (message.done as DeferredFrame["done"]) : [];
        this.queue = { actions, done };
        for (const listener of this.deferredListeners) listener(this.queue);
        return;
      }
      case "engine": {
        const text = (v: unknown) => (typeof v === "string" && v ? v : typeof v === "number" ? String(v) : null);
        this.engineInfo = { contract: text(message.contract), host_version: text(message.host_version) };
        for (const listener of this.engineListeners) listener(this.engineInfo);
        return;
      }
      case "auth":
        if (this.config.getAdmission) return;
        this.scheduleRenew(timeOf(message.expires_at) ?? (this.token ? tokenExpiry(this.token) : null));
        return;
      case "ping":
        this.send({ type: "pong", t: message.t });
        return;
    }
  }
}

/** `cached.updated_at` en ms de época, o null si no se entiende. */
export function cachedAt(cached: Cached | null): number | null {
  if (!cached) return null;
  const at = typeof cached.updated_at === "number" ? cached.updated_at : Date.parse(cached.updated_at);
  if (!Number.isFinite(at)) return null;
  return at < 1e12 ? at * 1000 : at;
}
