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
  requestTicket(sessionKey: string, machineId: string): Promise<TicketResult>;
  /** Inyectable para pruebas; por defecto el WebSocket global. */
  webSocket?: (url: string, protocols: string[]) => WebSocket;
  random?: () => number;
  backoff?: { baseMs?: number; maxMs?: number };
  /** Espera entre reintentos mientras la máquina despierta (M6b). */
  wakeRetryMs?: number;
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

/** Backoff exponencial con jitter completo (B-033). */
export function backoffDelay(attempt: number, baseMs: number, maxMs: number, random: () => number): number {
  const cap = Math.min(maxMs, baseMs * 2 ** attempt);
  return Math.floor(cap / 2 + random() * (cap / 2));
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
  const queue: string[] = [];
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
      res = await opts.requestTicket(opts.sessionKey, opts.machineId);
    } catch {
      return reconnectLater();
    }
    if (closed) return;
    if (res.kind === "machine_unreachable" || res.kind === "stopped" || res.kind === "starting") {
      setStatus("waking"); // M6b: sin lista blanca de comandos (B-035)
      return schedule(wakeMs);
    }
    if (res.kind === "error") {
      // Errores del borde no transitorios no se reintentan a ciegas.
      if (res.code === "unauthorized" || res.code === "forbidden") {
        setStatus("error");
        rejectAll(new RelayError(res.code, res.message));
        return;
      }
      return reconnectLater();
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
      attempt = 0;
      everConnected = true;
      // Al reconectar, el último cursor para no perder ni repetir eventos.
      if (cursor !== undefined) ws.send(JSON.stringify({ resume: { cursor } }));
      setStatus("connected");
      for (const q of queue.splice(0)) ws.send(q);
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
      if (status === "error") return Promise.reject(new RelayError("unavailable"));
      const id = nextId++;
      const frame = JSON.stringify({ id, method: name, params });
      return new Promise((resolve, reject) => {
        const t = setTimeout(() => {
          pending.delete(id);
          reject(new RelayError("timeout"));
        }, timeoutMs);
        pending.set(id, { resolve, reject, timer: t });
        if (socket && socket.readyState === 1) socket.send(frame);
        else queue.push(frame);
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
