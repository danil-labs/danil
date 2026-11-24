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
import { requestId as defaultRequestId } from "../model/relay-frames.ts";
import { type Link, type MachineInfo, memberKey } from "../model/fleet/index.ts";
import {
  formatWslMachineName,
  GUEST_MACHINES_FEATURE,
  normalizeWslChildren,
  parseRemoteGuestMachineId,
  remoteGuestMachineId,
  type WslChild,
} from "../model/wsl.ts";
import {
  createRemoteGuestLink,
  errorCode,
  isUnsupportedGuestError,
  type RemoteGuestLink,
  type RemoteGuestLinkConfig,
} from "./guest-link-helpers.ts";

export { createRemoteGuestLink, type RemoteGuestLink, type RemoteGuestLinkConfig };

const PROBE_TIMEOUT_MS = 10_000;
const PROBE_GAP_MS = 10_000;
const WAKE_TIMEOUT_MS = 60_000;

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
