/**
 * Una máquina a la que el teléfono le habla: una computadora de la cuenta (por
 * la flota compartida, `@terminus/fleet`, con una sesión de relay cada una) o
 * un Terminus de la red local (por el bridge de desarrollo). Las dos hablan el
 * mismo idioma, los comandos de `APP_COMMANDS`, y las dos se niegan a mandar
 * otro. Sin React Native: se prueba en Node.
 */
import {
  type Computer,
  type MachineState,
  type Power,
  RelaySession,
  type SocketFactory,
  INTENT_COMMANDS,
  isDeferrable,
  linkedWorkspaces,
  serviceFeatures,
  orderComputers,
  wakes,
} from "@terminus/computers";
import { Fleet, relayLink, type FleetEvent, type Slice, type StorageLike, isFleetError, isRead } from "@terminus/fleet";
import { type AppCommand, type AppFeature, COMMAND_NOT_HERE, COMMAND_UNSUPPORTED, CommandSupport, type EngineError, type EngineEvent, type Support, isAppCommand, isScopeRefusal } from "@terminus/protocol";

export class HostError extends Error {
  code: string;
  detail?: unknown;

  constructor(code: string, detail?: unknown) {
    super(detail && typeof detail === "string" ? `${code}: ${detail}` : code);
    this.code = code;
    this.detail = detail;
  }
}

export type CallAnswer<T> = { value: T; /** Copia del relay con la máquina apagada: cuándo se guardó, en ms. */ cachedAt: number | null };

export type Host = {
  /** `computer_id`, o `bridge` para el Terminus de la red. */
  readonly id: string;
  readonly label: string;
  readonly kind: "computer" | "bridge";
  /** La VM que Danil administra: una acción la enciende. */
  readonly managed: boolean;
  /** Los workspaces vinculados a la cuenta en esta máquina; `null` es que no se filtra (el bridge, un plano de control anterior). */
  readonly linked: ReadonlySet<string> | null;
  /** Lo que su motor anuncia (`status.service_features`); sin el dato, nada. */
  features?(): readonly string[];
  /**
   * Si su motor conoce el comando, según lo que contestó al llamarlo: `unknown`
   * hasta la primera respuesta. Un motor anterior contesta `command_unsupported`
   * y la UI oculta solo esa función; cambiar avisa por `onChange`.
   */
  supports?(command: AppCommand): Support;
  /** Lo mismo por función de la UI nueva (`APP_FEATURES`). */
  available?(feature: AppFeature): Support;
  power(): Power;
  /** Si una acción se puede mandar ya, enciende la máquina, no tiene cómo o su motor está desactualizado. */
  canAct(): "now" | "wakes" | "asleep" | "outdated";
  onChange(listener: () => void): () => void;
  /** Eventos del motor; `gap` dice que se perdieron algunos y hay que releer. */
  onEvents(listener: (events: EngineEvent[], gap: boolean) => void): () => void;
  call<T>(command: AppCommand, workspace: string | null, args?: object): Promise<CallAnswer<T>>;
  /**
   * Antes de una acción que el relay no toma por intención (fijar, renombrar,
   * archivar, cerrar una sesión): enciende la VM administrada apagada y espera a que
   * conteste. Una máquina propia apagada no se puede despertar (`machine_asleep`).
   */
  wake(): Promise<void>;
  close(): void;
};

function allowed(command: string) {
  if (!isAppCommand(command)) throw new HostError("command_not_allowed", command);
}

/**
 * Anota en `support` lo que contestó `command` y nombra el fallo: el comando que
 * la máquina no conoce sale `command_unsupported`; el que el relay no deja desde
 * esta sesión (`scope: "machine"`), `command_not_here`, sin anotarlo.
 */
function noted(support: CommandSupport, machine: string, command: string, error: unknown): HostError {
  if (isScopeRefusal(error)) return new HostError(COMMAND_NOT_HERE, command);
  if (support.note(machine, command, error)) return new HostError(COMMAND_UNSUPPORTED, command);
  return error instanceof HostError ? error : new HostError("io", error instanceof Error ? error.message : String(error));
}

/**
 * Acciones de la persona que el relay no toma por intención (no encienden la
 * VM por sí solas): la flota enciende antes la VM administrada por el plano de
 * control. Las demás acciones (marcar vista, detener, cancelar) no se mandan a
 * una máquina apagada: abrir una tarea nunca la enciende.
 */
export const WAKES_FIRST: ReadonlySet<string> = new Set([
  "set_session_pinned",
  "rename_session",
  "set_task_archived",
  "finish_task",
  "guardar_imagen_pegada",
  "guardar_adjunto",
  "prepare_attachments",
  "add_account",
  "remove_account",
  // Los espacios y Mantener despierta (UI nueva). La previa de eliminar también:
  // es el primer paso de borrar y sin ella no hay `seen` que mandar.
  "create_space",
  "rename_space",
  "space_delete_preview",
  "delete_space",
  "set_keep_awake",
]);

/** Pide al plano de control que encienda la computadora (`POST /v1/computers/:id/start`). */
export type Waker = (computer: string) => Promise<boolean>;

export type AccountFleetConfig = {
  endpoint: string;
  getToken: () => string | Promise<string>;
  onUnauthorized?: () => void;
  /** Antes de reconectar la sesión de `computer`: `false` la deja parada. */
  beforeReconnect?: (computer: string) => () => Promise<boolean>;
  wake?: Waker;
  /** Donde se guarda la última rebanada de cada máquina (`SliceBook`). */
  storage?: StorageLike | null;
};

/** Lo que la flota sabe de las máquinas de la cuenta, como `Host` para las pantallas. */
export type AccountFleet = {
  /** Las máquinas como las dice ahora `/v1/computers`: las nuevas se conectan y las que ya no están se cierran, sin tocar las demás. */
  set(computers: readonly Computer[]): Host[];
  /** Lo que se guardó de cada máquina, al cerrar o al irse la app al fondo. */
  flush(): void;
  /** `license_required` si el relay detuvo alguna sesión por falta de Terminus de pago; `null` si no. */
  license(): "license_required" | null;
  /** «Reintentar» del aviso de licencia: reabre las sesiones detenidas. */
  retry(): void;
  close(): void;
};

/** El nombre que dan las pantallas a cada fallo de la flota (`HostError.code`). */
function hostError(error: unknown, label: string): HostError {
  if (error instanceof HostError) return error;
  if (!isFleetError(error)) {
    const failure = (error ?? {}) as { code?: string; detail?: unknown; what?: unknown };
    return new HostError(failure.code ?? "io", failure.detail ?? failure.what);
  }
  if (error.code === "machine_off") return new HostError(error.canWake ? "start_failed" : "machine_asleep", label);
  if (error.code === "version_mismatch") return new HostError("machine_outdated", label);
  if (error.code === "machine_timeout" && error.detail === "start") return new HostError("start_timeout", label);
  return new HostError(error.code, error.detail ?? label);
}

/** Una lectura sin nada guardado: por qué no hay respuesta. */
function sliceError(slice: Slice, label: string): HostError {
  if (slice.status === "outdated") return new HostError("machine_outdated", label);
  if (slice.status === "off") return new HostError("machine_off", label);
  return new HostError(slice.error ?? "machine_timeout", label);
}

/**
 * Las computadoras de la cuenta sobre una sola flota (`@terminus/fleet`), con
 * las reglas del escritorio y la web: la máquina sale del sobre, toda espera
 * tiene tope, una que no contesta conserva su última rebanada y una apagada con
 * copia no se pregunta. Abrir no enciende nada; solo una acción.
 */
export function accountFleet(config: AccountFleetConfig, factory?: SocketFactory): AccountFleet {
  let rows = new Map<string, Computer>();
  const hosts = new Map<string, Host>();
  const changes = new Map<string, Set<() => void>>();
  const feeds = new Map<string, Set<(events: EngineEvent[], gap: boolean) => void>>();
  const fleet = new Fleet({
    self: null,
    panelIds: false,
    connect: (info) => {
      const relay = new RelaySession(
        { endpoint: config.endpoint, computerId: info.id, getToken: config.getToken, onUnauthorized: config.onUnauthorized, beforeReconnect: config.beforeReconnect?.(info.id) },
        factory,
      );
      // Hasta que el relay diga su estado, vale el de la fila de `/v1/computers`.
      const state = (): MachineState => (relay.state() === "unknown" ? ((rows.get(info.id)?.state as MachineState | undefined) ?? "unknown") : relay.state());
      const link = relayLink(relay, state);
      // Un cambio de enlace (socket abierto o cerrado) también repinta.
      relay.onLink(() => changed(info.id));
      return link;
    },
    wake: config.wake,
    storage: config.storage ?? null,
    onChange: (machine) => changed(machine),
    // La cola de aplazadas cambió (aquí o en otro dispositivo): la lista se relee.
    onDeferred: (machine) => changed(machine),
    onEvents: (machine, events: FleetEvent[], gap) => {
      for (const listener of feeds.get(machine) ?? []) listener(events as EngineEvent[], gap);
    },
  });
  fleet.subscribeEvents();
  const lastPower = new Map<string, Power>();
  const changed = (machine: string) => {
    // Al volver a encenderse puede traer otro motor: lo que se supo de sus comandos se vuelve a saber al llamar.
    const now = fleet.power(machine);
    const before = lastPower.get(machine);
    lastPower.set(machine, now);
    if (now === "on" && before !== undefined && before !== "on") support.forget(machine);
    for (const listener of changes.get(machine) ?? []) listener();
  };
  const support = new CommandSupport(changed);
  const listen = <T,>(book: Map<string, Set<T>>, machine: string, listener: T) => {
    const set = book.get(machine) ?? new Set<T>();
    set.add(listener);
    book.set(machine, set);
    return () => void set.delete(listener);
  };

  function hostOf(computer: Computer): Host {
    const id = computer.computer_id;
    const label = () => fleet.name(id);
    const power = (): Power => fleet.power(id);
    const canAct = (): ReturnType<Host["canAct"]> => {
      const now = power();
      if (now === "on") return "now";
      if (now === "outdated") return "outdated";
      return fleet.info(id)?.wakes || now === "starting" ? "wakes" : "asleep";
    };
    const host: Host = {
      id,
      get label() {
        return label();
      },
      kind: "computer",
      get managed() {
        return fleet.info(id)?.wakes ?? false;
      },
      get linked() {
        return fleet.info(id)?.linked ?? null;
      },
      features: () => fleet.info(id)?.features ?? [],
      supports: (command) => support.supports(id, command),
      available: (feature) => support.feature(id, feature),
      power,
      canAct,
      onChange: (listener) => listen(changes, id, listener),
      onEvents: (listener) => listen(feeds, id, listener),
      async call<T>(command: AppCommand, workspace: string | null, args: object = {}) {
        allowed(command);
        const envelope = { machine: id, workspace, command, args: args as Record<string, unknown> };
        if (isRead(command)) {
          // Una lectura es una rebanada: apagada con copia no se pregunta, y sin respuesta se queda la anterior.
          const slice = await fleet.read(envelope).catch((error: unknown) => {
            throw noted(support, id, command, hostError(error, label()));
          });
          if (!slice.has) throw noted(support, id, command, sliceError(slice, label()));
          // Una copia no dice qué conoce el motor de ahora; una respuesta viva sí.
          if (slice.status === "ok") support.note(id, command);
          return { value: slice.value as T, cachedAt: slice.status === "ok" ? null : slice.at };
        }
        // Fijar, archivar, renombrar o mover con la máquina apagada (VM o propia): el relay lo guarda sin encenderla.
        const deferred = isDeferrable(command) && power() === "off";
        // Lo que no es intención ni enciende antes la VM no se le manda apagada.
        if (!deferred && !INTENT_COMMANDS.has(command) && !WAKES_FIRST.has(command) && power() !== "on" && power() !== "starting") {
          throw new HostError(canAct() === "outdated" ? "machine_outdated" : canAct() === "asleep" ? "machine_asleep" : "machine_off", label());
        }
        try {
          const { value, at } = await fleet.raw(envelope);
          // Aplazada por el relay (`at`): aún no la vio el motor.
          if (at === null) support.note(id, command);
          return { value: value as T, cachedAt: at };
        } catch (error) {
          throw noted(support, id, command, hostError(error, label()));
        }
      },
      async wake() {
        if (power() === "on") return;
        if (canAct() === "outdated") throw new HostError("machine_outdated", label());
        try {
          await fleet.wake(id);
        } catch (error) {
          throw hostError(error, label());
        }
      },
      // La sesión la cierra la flota cuando la máquina deja la cuenta.
      close: () => {},
    };
    return host;
  }

  return {
    set(computers) {
      const ordered = orderComputers(computers);
      rows = new Map(ordered.map((c) => [c.computer_id, c]));
      fleet.setMachines(
        ordered.map((c) => ({ id: c.computer_id, name: c.name?.trim() || c.computer_id, wakes: wakes(c), outdated: c.state === "outdated", linked: linkedWorkspaces(c), features: serviceFeatures(c) })),
      );
      for (const id of [...hosts.keys()]) if (!rows.has(id)) hosts.delete(id);
      return ordered.map((c) => {
        const known = hosts.get(c.computer_id) ?? hostOf(c);
        hosts.set(c.computer_id, known);
        return known;
      });
    },
    flush: () => fleet.flush(),
    license: () => fleet.license(),
    retry: () => fleet.retry(),
    close: () => fleet.close(),
  };
}

/** Dirección y token que imprime el bridge de desarrollo. */
export type Pairing = { url: string; token: string };

type Fetch = typeof fetch;

async function bridgeRequest<T>(pairing: Pairing, path: string, init: { method?: string; body?: string } = {}, timeoutMs = 30_000, f: Fetch = fetch): Promise<T> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), timeoutMs);
  try {
    const response = await f(`${pairing.url.replace(/\/$/, "")}${path}`, {
      ...init,
      signal: abort.signal,
      headers: { authorization: `Bearer ${pairing.token}`, "content-type": "application/json" },
    });
    const body = (await response.json()) as T & { error?: EngineError | null };
    if (!response.ok) throw new HostError(body.error?.code ?? `http_${response.status}`, body.error?.detail);
    return body;
  } catch (error) {
    if (error instanceof HostError) throw error;
    throw new HostError("unreachable", error instanceof Error ? error.message : String(error));
  } finally {
    clearTimeout(timer);
  }
}

export function bridgeStatus(pairing: Pairing) {
  return bridgeRequest<{ bridge: number; engine: { version: string; runtime: string } }>(pairing, "/v1/status", {}, 8_000);
}

/** El Terminus de la red local por el bridge. Siempre está encendido o no se alcanza. */
export function bridgeHost(pairing: Pairing, label: string): Host {
  const changeListeners = new Set<() => void>();
  const eventListeners = new Set<(events: EngineEvent[], gap: boolean) => void>();
  let online = false;
  let stopped = false;
  const support = new CommandSupport(() => {
    for (const listener of changeListeners) listener();
  });
  const setOnline = (next: boolean) => {
    if (online === next) return;
    online = next;
    for (const listener of changeListeners) listener();
  };
  void (async () => {
    let after = -1;
    while (!stopped) {
      try {
        const page = await bridgeRequest<{ events: (EngineEvent & { seq: number })[]; after: number }>(pairing, `/v1/events?after=${after}`, {}, 35_000);
        const gap = after < 0 || page.events.some((e) => e.name === "resync");
        after = page.after;
        setOnline(true);
        const events = page.events.filter((e) => e.name !== "resync");
        if (events.length || gap) for (const listener of eventListeners) listener(events, gap);
      } catch {
        setOnline(false);
        after = -1;
        await new Promise((r) => setTimeout(r, 3_000));
      }
    }
  })();
  return {
    id: "bridge",
    label,
    kind: "bridge",
    managed: false,
    linked: null,
    supports: (command) => support.supports("bridge", command),
    available: (feature) => support.feature("bridge", feature),
    power: () => (online ? "on" : "off"),
    canAct: () => (online ? "now" : "asleep"),
    onChange(listener) {
      changeListeners.add(listener);
      return () => void changeListeners.delete(listener);
    },
    onEvents(listener) {
      eventListeners.add(listener);
      return () => void eventListeners.delete(listener);
    },
    async call<T>(command: AppCommand, workspace: string | null, args: object = {}) {
      allowed(command);
      const body = await bridgeRequest<{ result: unknown; error: EngineError | null }>(pairing, "/v1/call", {
        method: "POST",
        body: JSON.stringify({ command, args, workspace }),
      }).catch((error: unknown) => {
        // Un bridge anterior contesta 403 `command_not_allowed` a lo que no tiene en su lista.
        throw noted(support, "bridge", command, error);
      });
      // El fallo del motor tal como llega, con su frase (`message_key`), antes de perderla en `HostError`.
      if (body.error) throw support.note("bridge", command, body.error) ? new HostError(COMMAND_UNSUPPORTED, command) : new HostError(body.error.code, body.error.detail);
      support.note("bridge", command);
      const result = body.result as { value?: unknown } | null;
      // `service invoke` envuelve la respuesta del comando en `value`.
      const value = (result && typeof result === "object" && "value" in result ? result.value : result) as T;
      return { value, cachedAt: null };
    },
    async wake() {
      if (!online) throw new HostError("machine_asleep", label);
    },
    close: () => {
      stopped = true;
    },
  };
}
