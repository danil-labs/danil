import { LOCAL_ONLY } from "../generated/commands.ts";
import type { ConnectionStatus, StatefulTransport } from "./types.ts";

export interface Ticket {
  ticket: string;
  /** URL de admisión devuelta por el borde; nunca se escribe a mano. */
  url: string;
  expires_at?: string;
}

export type TicketResult =
  | { kind: "ok"; ticket: Ticket }
  | { kind: "machine_unreachable" }
  | { kind: "stopped" | "starting" }
  | { kind: "error"; code?: string; message?: string };

export interface RelayOptions {
  sessionKey: string;
  machineId: string;
  /** Cableada por quien llama con platform-client. */
  /** `wake` true solo con permiso de la persona: el borde enciende la VM solo con `{"wake": true}` (relay#18). */
  requestTicket(sessionKey: string, machineId: string, wake: boolean): Promise<TicketResult>;
  /** Inyectable para pruebas; por defecto el WebSocket global. */
  webSocket?: (url: string, protocols: string[]) => WebSocket;
  random?: () => number;
  backoff?: { baseMs?: number; maxMs?: number };
  /** Espera entre reintentos mientras la máquina despierta (M6b). */
  wakeRetryMs?: number;
  /**
   * true SOLO cuando la persona pidió conectar o encender esta máquina. Sin eso, una VM
   * apagada queda en `stopped` sin un solo reintento: cargar o refrescar nunca la despierta.
   */
  wake?: boolean;
  callTimeoutMs?: number;
}

interface Pending {
  resolve(v: unknown): void;
  reject(e: unknown): void;
  timer: ReturnType<typeof setTimeout> | undefined;
}

export class RelayError extends Error {
  code: string;
  constructor(code: string, message?: string) {
    super(message ?? code);
    this.code = code;
  }
}

const SUBPROTOCOL = "danil.machine-session.v1";

/** Backoff exponencial con jitter (B-033): la misma fórmula que el borde (`@danil/platform-client`). */
export function backoffDelay(attempt: number, baseMs: number, maxMs: number, random: () => number): number {
  const cap = Math.min(maxMs, baseMs * 2 ** attempt);
  return Math.floor(cap * (0.5 + random() * 0.5));
}

/** Cuánto se insiste en despertar una VM antes de mostrar error con reintento (M6b). */
const WAKE_WINDOW_MS = 2 * 60_000;
/** Intentos de ticket mientras despierta, con backoff 2 s, 4 s, 8 s, 15 s… */
const MAX_WAKE_ATTEMPTS = 6;
/** Intentos seguidos sin una sesión sana antes de rendirse: cada ticket despierta la VM (SR1, 4). */
const MAX_FAILED_ATTEMPTS = 8;
/** Una conexión cuenta como sana si dura esto abierta; solo entonces se reinicia el backoff. */
const HEALTHY_MS = 10_000;

/** Hosts del relay (contrato relay-v1): lista cerrada, no cualquier *.danil.ai (SR2, N5). */
const RELAY_HOSTS = new Set(["connect.danil.ai"]);

/** El ticket solo viaja a un relay de Danil por wss (SR1, 3). */
export function trustedRelayUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === "wss:" && RELAY_HOSTS.has(u.hostname) && (u.port === "" || u.port === "443");
  } catch {
    return false;
  }
}

export function createRelayTransport(opts: RelayOptions): StatefulTransport {
  const base = opts.backoff?.baseMs ?? 500;
  const max = opts.backoff?.maxMs ?? 30_000;
  const random = opts.random ?? Math.random;
  const wakeMs = opts.wakeRetryMs ?? 2_000;
  const timeoutMs = opts.callTimeoutMs ?? 60_000;
  const open = opts.webSocket ?? ((u, p) => new WebSocket(u, p));

  let status: ConnectionStatus = "connecting";
  const statusSubs = new Set<(s: ConnectionStatus) => void>();
  const listeners = new Map<string, Set<(p: unknown) => void>>();
  const pending = new Map<number, Pending>();
  // Frames que esperan socket, con su id: uno que vence se saca antes de reconectar.
  const queue: Array<{ id: number; frame: string }> = [];
  let wakingSince: number | null = null;
  let wakeAttempts = 0;
  // El permiso de despertar se gasta al conectar: una reconexión posterior nunca despierta (RV-FOCO1 #2).
  let mayWake = opts.wake === true;
  let nextId = 1;
  let socket: WebSocket | null = null;
  let cursor: string | number | undefined; // último cursor de evento visto (B-014)
  let attempt = 0;
  let closed = false;
  let everConnected = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const setStatus = (s: ConnectionStatus) => {
    if (status === s) return;
    status = s;
    for (const cb of [...statusSubs]) cb(s);
  };

  const rejectAll = (e: RelayError) => {
    for (const [id, p] of pending) {
      clearTimeout(p.timer);
      p.reject(e);
      pending.delete(id);
    }
  };

  const schedule = (ms: number) => {
    if (closed) return;
    clearTimeout(timer);
    timer = setTimeout(() => void connect(), ms);
  };

  const reconnectLater = () => {
    if (attempt >= MAX_FAILED_ATTEMPTS) {
      // Sin tope, una pestaña olvidada mantiene la VM despierta: error con reintento manual.
      setStatus("error");
      rejectAll(new RelayError("unavailable"));
      return;
    }
    setStatus(everConnected ? "reconnecting" : "connecting");
    schedule(backoffDelay(attempt++, base, max, random));
  };

  function onMessage(raw: unknown) {
    if (typeof raw !== "string") return;
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (typeof msg.id === "number") {
      const p = pending.get(msg.id);
      if (!p) return;
      pending.delete(msg.id);
      clearTimeout(p.timer);
      if (msg.error) {
        const e = msg.error as { code?: string; message?: string };
        p.reject(new RelayError(e.code ?? "rpc_error", e.message));
      } else p.resolve(msg.result);
      return;
    }
    if (typeof msg.event === "string") {
      if (msg.cursor !== undefined) cursor = msg.cursor as string | number;
      for (const cb of [...(listeners.get(msg.event) ?? [])]) cb(msg.payload);
    }
  }

  async function connect() {
    if (closed) return;
    let res: TicketResult;
    try {
      res = await opts.requestTicket(opts.sessionKey, opts.machineId, mayWake);
    } catch {
      return reconnectLater();
    }
    if (closed) return;
    if (res.kind === "machine_unreachable" || res.kind === "stopped" || res.kind === "starting") {
      // Sin acción de la persona no se insiste: la VM se muestra apagada (FOCO NUEVO).
      if (!mayWake) {
        setStatus("stopped");
        rejectAll(new RelayError("machine_stopped"));
        return;
      }
      // Con acción de la persona: pocos intentos con backoff, y después error con reintento manual.
      wakingSince ??= Date.now();
      wakeAttempts += 1;
      if (wakeAttempts > MAX_WAKE_ATTEMPTS || Date.now() - wakingSince > WAKE_WINDOW_MS) {
        wakingSince = null;
        wakeAttempts = 0;
        setStatus("error");
        rejectAll(new RelayError("wake_timeout"));
        return;
      }
      setStatus("waking");
      return schedule(Math.min(wakeMs * 2 ** (wakeAttempts - 1), 15_000));
    }
    wakingSince = null;
    if (res.kind === "error") {
      // Errores del borde no transitorios no se reintentan a ciegas.
      if (res.code === "unauthorized" || res.code === "forbidden") {
        setStatus("error");
        rejectAll(new RelayError(res.code, res.message));
        return;
      }
      return reconnectLater();
    }

    if (res.kind !== "ok") return reconnectLater();
    if (!trustedRelayUrl(res.ticket.url)) {
      setStatus("error");
      rejectAll(new RelayError("untrusted_relay"));
      return;
    }
    let ws: WebSocket;
    try {
      ws = open(res.ticket.url, [SUBPROTOCOL, `ticket.${res.ticket.ticket}`]);
    } catch {
      return reconnectLater();
    }
    socket = ws;
    ws.onopen = () => {
      if (socket !== ws) return;
      everConnected = true;
      mayWake = false;
      wakeAttempts = 0;
      wakingSince = null;
      // El backoff vuelve a cero solo si la sesión se sostiene (un relay que abre y cierra no da bucle).
      const opened = ws;
      setTimeout(() => {
        if (socket === opened) attempt = 0;
      }, HEALTHY_MS);
      // Al reconectar, el último cursor para no perder ni repetir eventos.
      if (cursor !== undefined) ws.send(JSON.stringify({ resume: { cursor } }));
      setStatus("connected");
      for (const q of queue.splice(0)) if (pending.has(q.id)) ws.send(q.frame);
    };
    ws.onmessage = (e) => onMessage(e.data);
    ws.onclose = () => {
      if (socket !== ws) return;
      socket = null;
      // Las peticiones en vuelo no se repiten solas: pueden no ser idempotentes.
      rejectAll(new RelayError("connection_lost"));
      if (!closed) reconnectLater();
    };
    ws.onerror = () => {};
  }

  void connect();

  return {
    status: () => status,
    onStatus(cb) {
      statusSubs.add(cb);
      return () => statusSubs.delete(cb);
    },
    call(name, params) {
      if (closed) return Promise.reject(new RelayError("closed"));
      // El motor no expone estos comandos por relay (`relay: false`): se rechazan aquí, tipados,
      // en vez de mandarlos para que fallen allá (RV1c N16).
      if (LOCAL_ONLY.has(name)) return Promise.reject(new RelayError("not_relayable", name));
      if (status === "error") return Promise.reject(new RelayError("unavailable"));
      if (status === "stopped") return Promise.reject(new RelayError("machine_stopped"));
      const id = nextId++;
      const frame = JSON.stringify({ id, method: name, params });
      return new Promise((resolve, reject) => {
        const t = setTimeout(() => {
          pending.delete(id);
          // Una llamada vencida no se envía al reconectar: la UI ya la dio por fallida.
          const i = queue.findIndex((q) => q.id === id);
          if (i >= 0) queue.splice(i, 1);
          reject(new RelayError("timeout"));
        }, timeoutMs);
        pending.set(id, { resolve, reject, timer: t });
        if (socket && socket.readyState === 1) socket.send(frame);
        else queue.push({ id, frame });
      });
    },
    subscribe(event, cb) {
      let set = listeners.get(event);
      if (!set) listeners.set(event, (set = new Set()));
      set.add(cb);
      return () => set!.delete(cb);
    },
    close() {
      closed = true;
      clearTimeout(timer);
      queue.length = 0;
      rejectAll(new RelayError("closed"));
      socket?.close();
      socket = null;
    },
  };
}
