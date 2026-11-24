/**
 * Descubrimiento y ruteo de máquinas WSL remotas a través del relay de su PC
 * Windows anfitriona (sin registrar WSL como máquina independiente en el plano
 * de control).
 *
 * Cada distro aparece como una ruta virtual `<hostId>:wsl:<distro>` nombrada
 * `<Anfitrión> - WSL` (o `<Anfitrión> - WSL (<distro>)` con varias distros).
 * Si el motor anfitrión no anuncia `guest_machines_v1` (o rechaza `guest_children`
 * como comando desconocido), el gestor retrocede en silencio sin afectar a la flota.
 */
import { type CallResult, type EngineInfo, type EventsPage, type MachineState, requestId as defaultRequestId } from "@terminus/computers";
import { isUnknownCommand } from "../../../../engine-client/src/index.ts";
import { classOf, type Link, type MachineInfo, memberKey } from "../model/fleet/index.ts";
import {
  formatWslMachineName,
  GUEST_MACHINES_FEATURE,
  normalizeWslChildren,
  parseRemoteGuestMachineId,
  remoteGuestMachineId,
  type WslChild,
} from "../model/wsl.ts";

const PROBE_TIMEOUT_MS = 10_000;
const PROBE_GAP_MS = 10_000;
const WAKE_TIMEOUT_MS = 60_000;
const POLL_EVERY_MS = 1_500;
const POLL_IDLE_MS = 5_000;

const CREATES = new Set([
  "send_message",
  "run_shell_command",
  "create_project",
  "clone_project",
  "start_project_clone",
  "create_empty_session",
  "move_task_to_space",
  "set_task_archived",
]);

const UNSUPPORTED_CODES = new Set(["command", "unsupported", "command_not_allowed"]);

function errorCode(error: unknown): string {
  if (!error || typeof error !== "object") return "";
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : "";
}

function isUnsupportedGuestError(error: unknown): boolean {
  const code = errorCode(error);
  return UNSUPPORTED_CODES.has(code) || isUnknownCommand(error);
}

export type RemoteGuestLink = Link & {
  sync(online: boolean, engine?: EngineInfo): void;
  markHostOffline(): void;
  markAwake(): void;
};

export type RemoteGuestLinkConfig = {
  guestId: string;
  hostOnline: () => boolean;
  hostCall: Link["call"];
  initialOnline: boolean;
  pollEveryMs?: number;
  pollIdleMs?: number;
  requestId?: () => string;
};

/** Enlace virtual de una distro WSL que tunela `guest_call` y `guest_events` por su PC Windows anfitriona. */
export function createRemoteGuestLink(config: RemoteGuestLinkConfig): RemoteGuestLink {
  const pollEvery = config.pollEveryMs ?? POLL_EVERY_MS;
  const pollIdle = config.pollIdleMs ?? POLL_IDLE_MS;
  const nextId = config.requestId ?? defaultRequestId;
  const materialized = new Set<string>();

  let state: MachineState = config.hostOnline() && config.initialOnline ? "online" : "offline";
  let cursor: number | null = null;
  let subscribed = false;
  let closed = false;
  let polling = false;
  let pollTimer: ReturnType<typeof setTimeout> | undefined;

  const stateListeners = new Set<(s: MachineState) => void>();
  const eventListeners = new Set<(page: EventsPage) => void>();
  const engineListeners = new Set<(engine: EngineInfo) => void>();

  const setState = (next: MachineState) => {
    if (next === state) return;
    state = next;
    for (const l of stateListeners) l(next);
  };

  const stopPoll = () => {
    clearTimeout(pollTimer);
    pollTimer = undefined;
  };

  const schedulePoll = (delay: number) => {
    if (closed || !subscribed || !config.hostOnline() || state !== "online") return;
    stopPoll();
    pollTimer = setTimeout(() => void poll(), delay);
  };

  async function poll() {
    if (closed || !subscribed || polling) return;
    if (!config.hostOnline()) {
      setState("offline");
      return;
    }
    if (state !== "online") return;
    polling = true;
    let quiet = true;
    try {
      const answer = await config.hostCall(nextId(), "guest_events", null, null, { machine: config.guestId, cursor }, 15_000);
      if (closed) return;
      if (answer.cached) {
        setState("offline");
        return;
      }
      const page = (answer.value ?? {}) as EventsPage;
      const events = Array.isArray(page.events) ? page.events : [];
      if (events.length || page.gap) {
        quiet = !events.length;
        for (const l of eventListeners) l({ ...page, events });
      }
      if (page.cursor !== null && page.cursor !== undefined) cursor = page.cursor;
    } catch (error) {
      const code = errorCode(error);
      if (!config.hostOnline() || code === "machine_off" || code === "guest_offline") {
        setState("offline");
        return;
      }
    } finally {
      polling = false;
    }
    schedulePoll(quiet ? pollIdle : pollEvery);
  }

  async function ensureWorkspace(workspace: string | null) {
    if (!workspace || materialized.has(workspace)) return;
    const answer = await config.hostCall(
      nextId(),
      "guest_call",
      workspace,
      null,
      { machine: config.guestId, command: "materialize_workspace", workspace, folder: null, args: { id: workspace } },
      30_000,
    );
    if (answer.cached) throw { code: "machine_off" };
    materialized.add(workspace);
  }

  return {
    state: () => (config.hostOnline() ? state : "offline"),
    async call(id, command, workspace, folder, args, timeoutMs): Promise<CallResult> {
      if (!config.hostOnline()) {
        setState("offline");
        throw { code: "machine_off" };
      }
      if (state === "offline" && classOf(command) === "read") {
        throw { code: "machine_off" };
      }
      try {
        if (CREATES.has(command)) await ensureWorkspace(workspace);
        const answer = await config.hostCall(
          id,
          "guest_call",
          workspace,
          null,
          { machine: config.guestId, command, workspace, folder, args: args ?? {}, timeout_ms: timeoutMs ?? null },
          timeoutMs,
        );
        if (answer.cached) {
          setState("offline");
          throw { code: "machine_off" };
        }
        if (state !== "online") {
          setState("online");
          schedulePoll(pollEvery);
        }
        return { value: answer.value, cached: null, deferred: null };
      } catch (error) {
        const code = errorCode(error);
        if (!config.hostOnline() || code === "machine_off" || code === "guest_offline") {
          setState("offline");
          throw { code: "machine_off" };
        }
        throw error;
      }
    },
    onState(listener) {
      stateListeners.add(listener);
      return () => stateListeners.delete(listener);
    },
    onEvents(listener) {
      eventListeners.add(listener);
      return () => eventListeners.delete(listener);
    },
    onEngine(listener) {
      engineListeners.add(listener);
      return () => engineListeners.delete(listener);
    },
    subscribe(after) {
      if (after === null) cursor = null;
      subscribed = true;
      if (config.hostOnline() && state === "online") schedulePoll(0);
    },
    start() {
      closed = false;
      if (!config.hostOnline()) setState("offline");
    },
    close() {
      closed = true;
      subscribed = false;
      stopPoll();
      stateListeners.clear();
      eventListeners.clear();
      engineListeners.clear();
    },
    sync(online, engine) {
      if (closed) return;
      if (!config.hostOnline()) {
        stopPoll();
        setState("offline");
        return;
      }
      const next: MachineState = online ? "online" : "offline";
      setState(next);
      if (online && engine) {
        for (const l of engineListeners) l(engine);
      }
      if (online && subscribed) schedulePoll(pollEvery);
      else stopPoll();
    },
    markHostOffline() {
      if (closed) return;
      stopPoll();
      setState("offline");
    },
    markAwake() {
      if (closed || !config.hostOnline()) return;
      setState("online");
      if (subscribed) schedulePoll(pollEvery);
    },
  };
}

type HostRecord = {
  key: string;
  info: MachineInfo;
  link: Link | null;
  stops: (() => void)[];
  features: readonly string[] | undefined;
  unsupported: boolean;
  probing: Promise<void> | null;
  lastProbeAt: number;
  guests: WslChild[];
};

export type RemoteGuestManagerConfig = {
  onChange: () => void;
  probeGapMs?: number;
  wakeTimeoutMs?: number;
  pollEveryMs?: number;
  pollIdleMs?: number;
  now?: () => number;
  requestId?: () => string;
};

/**
 * Descubre distros WSL detrás de máquinas personales Windows conectadas al relay,
 * mantiene sus filas virtuales en `Fleet` y tunela sus enlaces y `guest_start`.
 */
export function createRemoteGuestManager(config: RemoteGuestManagerConfig) {
  const probeGapMs = config.probeGapMs ?? PROBE_GAP_MS;
  const wakeTimeoutMs = config.wakeTimeoutMs ?? WAKE_TIMEOUT_MS;
  const now = config.now ?? Date.now;
  const nextId = config.requestId ?? defaultRequestId;

  const hosts = new Map<string, HostRecord>();
  const virtualLinks = new Map<string, RemoteGuestLink>();
  let lastBase: readonly MachineInfo[] = [];
  let closed = false;

  const getOrCreateHost = (info: MachineInfo): HostRecord => {
    const key = memberKey(info.id, info.context);
    let record = hosts.get(key);
    if (!record) {
      record = {
        key,
        info,
        link: null,
        stops: [],
        features: info.features,
        unsupported: false,
        probing: null,
        lastProbeAt: 0,
        guests: [],
      };
      hosts.set(key, record);
    } else {
      record.info = info;
      if (info.features !== undefined) record.features = info.features;
    }
    return record;
  };

  const isEligible = (record: HostRecord): boolean => {
    if (record.info.child || record.info.hosted === true) return false;
    if (record.features !== undefined) return record.features.includes(GUEST_MACHINES_FEATURE);
    if (record.unsupported) return false;
    return record.info.os === undefined || record.info.os === "windows";
  };

  const hostIsOnline = (record: HostRecord | undefined): boolean => !!record?.link && record.link.state() === "online";

  const notifyVirtualLinks = (record: HostRecord) => {
    const online = hostIsOnline(record);
    for (const child of record.guests) {
      const id = remoteGuestMachineId(record.info.id, child.id);
      const vlink = virtualLinks.get(memberKey(id, record.info.context));
      if (!vlink) continue;
      if (!online) vlink.markHostOffline();
      else vlink.sync(child.online, { contract: child.contract, host_version: child.version, service_features: child.features });
    }
  };

  const markHostLinksOffline = (record: HostRecord) => {
    for (const child of record.guests) {
      const id = remoteGuestMachineId(record.info.id, child.id);
      virtualLinks.get(memberKey(id, record.info.context))?.markHostOffline();
    }
  };

  async function probeHost(record: HostRecord, force: boolean): Promise<void> {
    if (closed || !record.link || !hostIsOnline(record) || !isEligible(record)) return;
    if (record.probing) return record.probing;
    if (!force && record.lastProbeAt > 0 && now() - record.lastProbeAt < probeGapMs) return;

    const link = record.link;
    record.lastProbeAt = now();
    let run: Promise<void> | null = null;
    run = (async () => {
      try {
        const answer = await link.call(nextId(), "guest_children", null, null, {}, PROBE_TIMEOUT_MS);
        if (closed || record.link !== link || answer.cached) return;
        const next = normalizeWslChildren(answer.value);
        const changed = JSON.stringify(record.guests) !== JSON.stringify(next);
        record.guests = next;
        notifyVirtualLinks(record);
        if (changed) config.onChange();
      } catch (error) {
        if (closed || record.link !== link) return;
        if (isUnsupportedGuestError(error)) {
          record.unsupported = true;
          if (record.guests.length) {
            record.guests = [];
            config.onChange();
          }
        }
      } finally {
        if (record.probing === run) record.probing = null;
      }
    })();
    record.probing = run;
    return run;
  }

  return {
    /** Observa el enlace de una máquina anfitriona para descubrir WSL y reflejar sus caídas al instante. */
    attachHost(info: MachineInfo, link: Link): Link {
      const record = getOrCreateHost(info);
      for (const stop of record.stops) stop();
      record.stops = [];
      record.link = link;

      record.stops.push(
        link.onState((state) => {
          if (closed || record.link !== link) return;
          if (state === "online") {
            notifyVirtualLinks(record);
            void probeHost(record, true);
          } else if (state === "offline" || state === "stopped") {
            markHostLinksOffline(record);
          }
        }),
        link.onEngine?.((engine) => {
          if (closed || record.link !== link) return;
          if (engine.service_features !== undefined) {
            record.features = engine.service_features;
            if (engine.service_features.includes(GUEST_MACHINES_FEATURE)) {
              record.unsupported = false;
              void probeHost(record, true);
            } else {
              record.unsupported = true;
            }
          }
        }) ?? (() => {}),
        link.onEvents((page) => {
          if (closed || record.link !== link) return;
          if (page.events?.some((e) => e.name === "guest-state-changed")) {
            void probeHost(record, true);
          }
        }),
      );

      if (link.state() === "online") void probeHost(record, false);

      return {
        ...link,
        close() {
          for (const stop of record.stops) stop();
          record.stops = [];
          if (record.link === link) {
            record.link = null;
            markHostLinksOffline(record);
          }
          link.close();
        },
      };
    },

    /** Sincroniza el inventario base y devuelve las máquinas base más las rutas virtuales WSL conocidas. */
    syncHosts(baseRows?: readonly MachineInfo[]): MachineInfo[] {
      const rows = baseRows ?? lastBase;
      if (baseRows) lastBase = baseRows;
      const present = new Set<string>();
      for (const info of rows) {
        if (info.child) continue;
        const record = getOrCreateHost(info);
        present.add(record.key);
        if (hostIsOnline(record) && isEligible(record) && record.lastProbeAt === 0) {
          void probeHost(record, false);
        }
      }
      for (const [key, record] of [...hosts]) {
        if (!present.has(key)) {
          for (const stop of record.stops) stop();
          markHostLinksOffline(record);
          hosts.delete(key);
        }
      }

      const virtual: MachineInfo[] = [];
      for (const host of rows) {
        if (host.child || host.hosted === true) continue;
        const record = hosts.get(memberKey(host.id, host.context));
        if (!record?.guests.length) continue;
        const siblings = record.guests.length;
        for (const child of record.guests) {
          virtual.push({
            id: remoteGuestMachineId(host.id, child.id),
            name: formatWslMachineName(host.name, child, siblings),
            wakes: true,
            linked: host.linked ?? null,
            os: "linux",
            child: true,
            host: host.id,
            kind: host.kind,
            hosted: false,
            organizationId: host.organizationId ?? null,
            ...(host.context ? { context: host.context } : {}),
            ...(child.features.length ? { features: child.features } : {}),
            ...(child.version ? { version: child.version } : {}),
          });
        }
      }
      return [...rows, ...virtual];
    },

    /** Una tarea WSL remota sigue escribible mientras su anfitrión Windows siga en línea y pueda despertarla. */
    canContinue(fleet: { canContinue(machine: string, context?: string): boolean }, machine: string, context?: string): boolean {
      if (fleet.canContinue(machine, context)) return true;
      const remote = parseRemoteGuestMachineId(machine);
      return !!remote && fleet.canContinue(remote.host, context);
    },

    /** Crea el enlace virtual para `<hostId>:wsl:<distro>` tunelado por su anfitrión. */
    connect(info: MachineInfo): Link {
      const parsed = parseRemoteGuestMachineId(info.id);
      if (!parsed) throw { code: "unknown_machine", detail: info.id };
      const hostKey = memberKey(parsed.host, info.context);
      const vkey = memberKey(info.id, info.context);
      const record = hosts.get(hostKey);
      const child = record?.guests.find((g) => g.id === parsed.guest);

      const link = createRemoteGuestLink({
        guestId: parsed.guest,
        initialOnline: !!child?.online,
        hostOnline: () => hostIsOnline(hosts.get(hostKey)),
        hostCall: (id, command, workspace, folder, args, timeoutMs) => {
          const hostLink = hosts.get(hostKey)?.link;
          if (!hostLink || hostLink.state() !== "online") {
            return Promise.reject({ code: "machine_off" });
          }
          return hostLink.call(id, command, workspace, folder, args, timeoutMs);
        },
        pollEveryMs: config.pollEveryMs,
        pollIdleMs: config.pollIdleMs,
        requestId: nextId,
      });

      const managed: RemoteGuestLink = {
        ...link,
        close() {
          if (virtualLinks.get(vkey) === managed) virtualLinks.delete(vkey);
          link.close();
        },
      };
      virtualLinks.set(vkey, managed);
      return managed;
    },

    /** Despierta la distro WSL (`guest_start`) si su Windows anfitrión está en línea; si no, `not_startable`. */
    async wake(id: string, context?: string): Promise<boolean | "not_startable"> {
      const parsed = parseRemoteGuestMachineId(id);
      if (!parsed) return false;
      const hostKey = memberKey(parsed.host, context);
      const record = hosts.get(hostKey);
      const hostLink = record?.link;
      if (!record || !hostLink || hostLink.state() !== "online") return "not_startable";
      try {
        const answer = await hostLink.call(nextId(), "guest_start", null, null, { machine: parsed.guest }, wakeTimeoutMs);
        if (answer.cached) return "not_startable";
        const ok = answer.value === true || (!!answer.value && typeof answer.value === "object" && (answer.value as { online?: unknown }).online === true);
        if (ok) {
          record.guests = record.guests.map((g) => (g.id === parsed.guest ? { ...g, online: true } : g));
          virtualLinks.get(memberKey(id, context))?.markAwake();
          void probeHost(record, true);
        }
        return ok;
      } catch (error) {
        const code = errorCode(error);
        if (code === "not_remotely_startable" || code === "machine_off") return "not_startable";
        return false;
      }
    },

    /** Fuerza relectura de `guest_children` en un anfitrión concreto (útil en pruebas o reconexiones). */
    refreshHost(hostId: string, context?: string): Promise<void> {
      const record = hosts.get(memberKey(hostId, context));
      return record ? probeHost(record, true) : Promise.resolve();
    },

    close() {
      closed = true;
      for (const record of hosts.values()) {
        for (const stop of record.stops) stop();
      }
      hosts.clear();
      virtualLinks.clear();
    },
  };
}
