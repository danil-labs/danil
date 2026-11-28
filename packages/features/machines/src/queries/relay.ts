/**
 * El cliente del socket de sesión de Danil Machines (protocolo v1,
 * «Navegador/escritorio ↔ relay»): call/result, subscribe/events, state y
 * ping/pong sobre un WebSocket que se reconecta con un token fresco.
 *
 * Sin APIs del DOM: el WebSocket se inyecta (el global de React Native o del
 * navegador sirve tal cual).
 */
import type { MachineState } from "../../../../platform-client/src/machine.ts";
import { relayArgs } from "../model/mcp-block.ts";
import { EventRecovery } from "../model/event-recovery.ts";
import { SUBPROTOCOL, MACHINE_SESSION_PROTOCOL, OPEN, BACKOFF, PING_EVERY, MISSED_PINGS, CALL_TIMEOUT, REPLACED, REVOKED, ADMISSION_RENEW_BEFORE, ADMISSION_RENEW_WAIT, TICKET_CONTEXT_REVOKED, RENEW_BEFORE, RENEW_RETRY, sessionUrl, tokenExpiry, timeOf, requestId, defaultFactory, type RelayAdmission, type RelayConfig, type Blocked, type EngineInfo, type RelayFailure, type Cached, type CallResult, type DeferredAction, type DeferredFrame, type EventsPage, type SocketLike, type SocketFactory, type Pending } from "../model/relay-frames.ts";
export { SUBPROTOCOL, CALL_TIMEOUT, WAKE_TIMEOUT, TOKEN_EXPIRED, sessionUrl, tokenExpiry, requestId, cachedAt } from "../model/relay-frames.ts";
export type { RelayAdmission, RelayConfig, Blocked, EngineInfo, RelayFailure, Cached, CallResult, DeferredAction, DeferredFrame, EventsPage, SocketLike, SocketFactory } from "../model/relay-frames.ts";

export class RelaySession {
  private socket: SocketLike | null = null;
  private pending = new Map<string, Pending>();
  private subscribed = false;
  private after: number | null = null;
  private replaying = false;
  private replayId: string | undefined;
  private deliveredCheckpoint: { runtime: string; cursor: number } | null = null;
  private readonly eventRecovery = new EventRecovery();
  private afterRuntime: string | null = null;
  private attempt = 0;
  private missed = 0;
  private pinger: ReturnType<typeof setInterval> | undefined;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private closed = false;
  private connectEpoch = 0;
  private prefetchedAdmission: RelayAdmission | null = null;
  private machine: MachineState = "unknown";
  private engineInfo: EngineInfo | null = null;
  private stopped: Blocked | null = null;
  private blockedListeners = new Set<(blocked: Blocked | null) => void>();
  private closeListeners = new Set<() => void>();
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

  /** «Reintentar»: vuelve a abrir una sesión detenida o aprovecha un ticket recién emitido por `wake`. */
  retry(admission?: RelayAdmission) {
    if (this.closed) return;
    if (admission) {
      this.prefetchedAdmission = admission;
      if (this.connected()) return;
      clearTimeout(this.retryTimer);
      this.setBlocked(null);
      this.attempt = 0;
      void this.connect();
      return;
    }
    if (!this.stopped) return;
    this.setBlocked(null);
    this.attempt = 0;
    void this.connect();
  }

  onClose(listener: () => void): () => void {
    this.closeListeners.add(listener);
    return () => void this.closeListeners.delete(listener);
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
    // Cerrada (revocada, reemplazada o cancelada) es definitiva: una llamada no espera un socket que no vendrá.
    if (this.closed) return Promise.reject({ code: "app_unavailable" });
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
    if (this.after !== after) this.afterRuntime = null;
    this.after = after;
    if (this.connected()) this.resubscribe();
  }

  private resubscribe() {
    this.eventRecovery.reset();
    this.deliveredCheckpoint = null;
    this.replaying = true;
    this.replayId = requestId();
    this.send({ type: "subscribe", after: this.after, recovery: 1, ...(this.afterRuntime ? { runtime: this.afterRuntime } : {}) });
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.connectEpoch += 1;
    this.prefetchedAdmission = null;
    clearTimeout(this.retryTimer);
    clearTimeout(this.renew);
    clearTimeout(this.waiting?.timer);
    this.waiting = null;
    clearInterval(this.pinger);
    this.socket?.close(1000);
    this.next?.close(1000);
    this.next = null;
    for (const [id, call] of this.pending) {
      clearTimeout(call.timer);
      call.reject({ code: "app_unavailable" });
      this.pending.delete(id);
    }
    for (const listener of [...this.closeListeners]) listener();
  }

  private send(message: object) {
    this.socket?.send(JSON.stringify(message));
  }

  private async connect() {
    if (this.closed || this.stopped) return;
    const epoch = ++this.connectEpoch;
    const prefetched = this.prefetchedAdmission;
    this.prefetchedAdmission = null;
    if (!prefetched && this.attempt > 0 && this.config.beforeReconnect) {
      const go = await this.config.beforeReconnect().catch(() => true);
      if (this.closed || epoch !== this.connectEpoch) return;
      if (!go) return this.close();
    }
    let token: string;
    let protocol = SUBPROTOCOL;
    let sessionExpires: number | null = null;
    let target = sessionUrl(this.config.endpoint, this.config.computerId, this.config.contracts);
    try {
      if (prefetched || this.config.getAdmission) {
        const admission = prefetched ?? await this.config.getAdmission!();
        if (this.closed || epoch !== this.connectEpoch) return;
        token = admission.ticket;
        // La URL validada del ticket viene sin query: se le suma `?contracts=` (opcional en machine-session.v1).
        const query = target.includes("?") ? target.slice(target.indexOf("?")) : "";
        target = admission.url + query;
        protocol = admission.protocol ?? MACHINE_SESSION_PROTOCOL;
        sessionExpires = timeOf(admission.session_expires_at);
        if (protocol !== MACHINE_SESSION_PROTOCOL) throw new Error("unsupported_machine_protocol");
      } else if (this.config.getToken) {
        token = await this.config.getToken();
        if (this.closed || epoch !== this.connectEpoch) return;
      } else throw new Error("relay_admission_required");
    } catch (error) {
      if (this.closed || epoch !== this.connectEpoch) return;
      // VM apagada: no se reintenta en bucle. Queda detenida hasta que una acción la encienda y llame a `retry()`.
      if ((error as { code?: unknown } | null)?.code === "machine_stopped") {
        this.machine = "stopped";
        for (const listener of this.stateListeners) listener(this.machine);
        return this.setBlocked("machine_stopped");
      }
      return this.reconnectLater();
    }
    if (this.closed || epoch !== this.connectEpoch) return;
    // Un WebSocket de navegador no puede poner Authorization; el relay rechaza el token en la query.
    const protocols = [protocol, `${this.config.getAdmission ? "ticket" : "bearer"}.${token}`];
    let socket: SocketLike;
    try {
      socket = this.factory(target, protocols);
    } catch {
      return this.reconnectLater();
    }
    // Relevo (machine-session.v1, «sin renovación»): el socket vivo sigue recibiendo hasta que el nuevo abre.
    const handover = this.socket !== null;
    if (handover) {
      this.next?.close(1000);
      this.next = socket;
    } else this.socket = socket;
    let opened = false;
    socket.onopen = () => {
      if (this.socket !== socket && this.next !== socket) return;
      if (this.config.getAdmission && socket.protocol !== protocol) return this.close();
      opened = true;
      if (this.next === socket) {
        const previous = this.socket;
        this.next = null;
        this.socket = socket;
        clearInterval(this.pinger);
        clearTimeout(this.waiting?.timer);
        this.waiting = null;
        previous?.close(1000);
      }
      this.attempt = 0;
      this.missed = 0;
      this.token = token;
      if (!this.config.getAdmission) this.scheduleRenew(tokenExpiry(token));
      else if (sessionExpires !== null) {
        // Antes de `session_expires_at`: renueva en el canal si el relay lo anuncia; si no, ticket nuevo y socket nuevo.
        clearTimeout(this.renew);
        const end = sessionExpires;
        const remaining = end - Date.now();
        const margin = Math.min(ADMISSION_RENEW_BEFORE, Math.max(100, remaining / 10));
        this.renew = setTimeout(() => void this.renewAdmission(socket, end), Math.max(1, remaining - margin));
      }
      clearInterval(this.pinger);
      this.pinger = setInterval(() => this.ping(), PING_EVERY);
      if (this.subscribed) this.resubscribe();
      for (const call of this.pending.values()) socket.send(call.message);
      for (const listener of this.linkListeners) listener(true);
    };
    socket.onmessage = (event) => {
      if (this.socket === socket) this.receive(event.data);
    };
    socket.onerror = () => {};
    socket.onclose = (event) => {
      if (this.next === socket) {
        // El relevo falló antes de abrir: la sesión viva sigue y se reintenta con otro ticket.
        this.next = null;
        if (this.socket) return this.reconnectLater();
      } else if (this.socket !== socket) return;
      // Revocación, licencia o reemplazo: terminales también durante un relevo (machine-session.v1,
      // «Vida del socket»); el socket pendiente se cancela y nunca toma la sesión.
      const terminal = event.code === REVOKED || event.code === REPLACED || (this.config.getAdmission !== undefined && event.code === TICKET_CONTEXT_REVOKED);
      if (terminal && this.next) {
        this.next.close(1000);
        this.next = null;
      }
      if (this.next && this.socket === socket) {
        // El viejo cerró durante el relevo por otra causa: el nuevo toma la sesión al abrir.
        this.socket = null;
        clearInterval(this.pinger);
        for (const listener of this.linkListeners) listener(false);
        return;
      }
      this.socket = null;
      clearInterval(this.pinger);
      clearTimeout(this.renew);
      clearTimeout(this.waiting?.timer);
      this.waiting = null;
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
      // Con ticket, `4005` (vencimiento de la sesión del puente) cae en `reconnectLater`: otro ticket y otra conexión.
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

  private waiting: { socket: SocketLike; timer: ReturnType<typeof setTimeout> } | null = null;
  /** El socket de un relevo, abierto mientras `socket` sigue vivo; toma la sesión cuando abre. */
  private next: SocketLike | null = null;

  /** Antes de `session_expires_at`: renueva dentro del canal si el relay lo anuncia; si no, o si falla, reabre. */
  private async renewAdmission(socket: SocketLike, end: number) {
    if (this.closed || this.socket !== socket) return;
    if (!this.config.renewInChannel?.() || !this.config.getAdmission) return this.reopen(socket);
    let ticket: string;
    try {
      ticket = (await this.config.getAdmission()).ticket;
    } catch {
      return this.reopen(socket);
    }
    if (this.closed || this.socket !== socket) return;
    this.send({ type: "auth", ticket });
    // Un relay que no contesta (o contesta con error) no deja caer la sesión: se reabre antes del fin.
    const wait = Math.max(500, Math.min(ADMISSION_RENEW_WAIT, end - Date.now() - 1_000));
    this.waiting = { socket, timer: setTimeout(() => (this.waiting = null, this.reopen(socket)), wait) };
  }

  /** La respuesta del relay a una renovación en el canal: `{auth, expires_at}` o `{auth, error}`. */
  private admissionAnswered(message: { expires_at?: unknown; error?: unknown }) {
    const waiting = this.waiting;
    if (!waiting || this.socket !== waiting.socket) return;
    clearTimeout(waiting.timer);
    this.waiting = null;
    const end = timeOf(message.expires_at);
    if (message.error || end === null) return this.reopen(waiting.socket);
    clearTimeout(this.renew);
    this.renew = setTimeout(() => void this.renewAdmission(waiting.socket, end), Math.max(1_000, end - Date.now() - ADMISSION_RENEW_BEFORE));
  }

  /** Cambia de sesión del puente antes de que venza: cierra esta (sin avisar de un corte) y abre otra con un ticket nuevo. */
  /** Ticket nuevo y socket nuevo; el viejo sigue vivo hasta que el nuevo abre y entonces se cierra con `1000` (machine-session.v1). */
  private reopen(socket: SocketLike) {
    if (this.closed || this.socket !== socket) return;
    clearTimeout(this.waiting?.timer);
    this.waiting = null;
    void this.connect();
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
        const restored = this.eventRecovery.receive(message as unknown as EventsPage);
        let page = message as unknown as EventsPage;
        if (restored.handled) {
          if (!restored.page) return;
          page = restored.page;
        }
        const cursor = typeof page.cursor === "number" && Number.isSafeInteger(page.cursor) && page.cursor >= 0 ? page.cursor : null;
        const runtime = typeof page.runtime === "string" && page.runtime.length ? page.runtime : null;
        const previous = this.deliveredCheckpoint;
        const failed = message.error !== undefined && message.error !== null;
        const restarted = runtime !== null && previous !== null && runtime !== previous.runtime;
        // A subscription's first checkpoint is admissible even when it equals its resume cursor.
        if (!failed && !page.gap && runtime && cursor !== null && previous?.runtime === runtime && cursor <= previous.cursor) return;
        if (!failed && runtime && cursor !== null && (!previous || restarted || cursor > previous.cursor)) {
          this.deliveredCheckpoint = { runtime, cursor };
          this.after = cursor;
          this.afterRuntime = runtime;
        } else if (!failed && !previous && cursor !== null) this.after = cursor;
        if (failed) {
          for (const listener of this.eventListeners) listener(page);
          return;
        }
        if (restored.handled) {
          this.replaying = false;
          for (const listener of this.eventListeners) listener({ ...page, replay: true, replayId: JSON.stringify([this.replayId, page.recovery?.id]) });
          return;
        }
        if (runtime && previous?.runtime === runtime && page.events) page.events = page.events.filter(event => !Number.isSafeInteger(event.seq) || event.seq! > previous.cursor);
        if (restarted || page.gap) { this.replaying = true; this.replayId = requestId(); }
        if (!this.replaying && page.replay === true) this.replayId = requestId();
        const replay = this.replaying || page.replay === true;
        this.replaying = page.replay === true;
        for (const listener of this.eventListeners) listener({ ...page, replay, replayId: replay ? this.replayId : undefined });
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
        this.engineInfo = {
          contract: text(message.contract), host_version: text(message.host_version),
          ...(Array.isArray(message.service_features) ? { service_features: message.service_features.filter((feature): feature is string => typeof feature === "string") } : {}),
        };
        for (const listener of this.engineListeners) listener(this.engineInfo);
        return;
      }
      case "auth":
        if (this.config.getAdmission) return this.admissionAnswered(message);
        this.scheduleRenew(timeOf(message.expires_at) ?? (this.token ? tokenExpiry(this.token) : null));
        return;
      case "ping":
        this.send({ type: "pong", t: message.t });
        return;
    }
  }
}
