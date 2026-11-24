/**
 * Piezas compartidas por los enlaces de máquinas huésped locales (`guestLink.ts`)
 * y remotas a través del relay (`remoteGuestLink.ts`).
 */
import type { MachineState } from "../../../../platform-client/src/machine.ts";
import { type CallResult, type EngineInfo, type EventsPage, requestId as defaultRequestId } from "../model/relay-frames.ts";
import { isUnknownCommand } from "../../../../engine-client/src/index.ts";
import { classOf, type Link } from "../model/fleet/index.ts";

const POLL_EVERY_MS = 1_500;
const POLL_IDLE_MS = 5_000;

/** Lo que crea o acomoda algo en el workspace: antes, el workspace debe existir en el huésped. */
export const GUEST_CREATES = new Set([
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

export function errorCode(error: unknown): string {
  if (!error || typeof error !== "object") return "";
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : "";
}

export function isUnsupportedGuestError(error: unknown): boolean {
  const code = errorCode(error);
  return UNSUPPORTED_CODES.has(code) || isUnknownCommand(error);
}

/** Estado y suscripciones comunes de un enlace huésped (`onState`, `onEvents`, `onEngine`). */
export function createGuestLinkChannels(initialState: MachineState) {
  let current: MachineState = initialState;
  const stateListeners = new Set<(s: MachineState) => void>();
  const eventListeners = new Set<(page: EventsPage) => void>();
  const engineListeners = new Set<(engine: EngineInfo) => void>();

  return {
    state: () => current,
    setState(next: MachineState) {
      if (next === current) return;
      current = next;
      for (const l of stateListeners) l(next);
    },
    emitEvents(page: EventsPage) {
      for (const l of eventListeners) l(page);
    },
    emitEngine(engine: EngineInfo) {
      for (const l of engineListeners) l(engine);
    },
    onState(listener: (s: MachineState) => void) {
      stateListeners.add(listener);
      return () => { stateListeners.delete(listener); };
    },
    onEvents(listener: (page: EventsPage) => void) {
      eventListeners.add(listener);
      return () => { eventListeners.delete(listener); };
    },
    onEngine(listener: (engine: EngineInfo) => void) {
      engineListeners.add(listener);
      return () => { engineListeners.delete(listener); };
    },
    clear() {
      stateListeners.clear();
      eventListeners.clear();
      engineListeners.clear();
    },
  };
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
  const channels = createGuestLinkChannels(config.hostOnline() && config.initialOnline ? "online" : "offline");

  let cursor: number | null = null;
  let subscribed = false;
  let closed = false;
  let polling = false;
  let pollTimer: ReturnType<typeof setTimeout> | undefined;

  const stopPoll = () => {
    clearTimeout(pollTimer);
    pollTimer = undefined;
  };

  const schedulePoll = (delay: number) => {
    if (closed || !subscribed || !config.hostOnline() || channels.state() !== "online") return;
    stopPoll();
    pollTimer = setTimeout(() => void poll(), delay);
  };

  async function poll() {
    if (closed || !subscribed || polling) return;
    if (!config.hostOnline()) {
      channels.setState("offline");
      return;
    }
    if (channels.state() !== "online") return;
    polling = true;
    let quiet = true;
    try {
      const answer = await config.hostCall(nextId(), "guest_events", null, null, { machine: config.guestId, cursor }, 15_000);
      if (closed) return;
      if (answer.cached) {
        channels.setState("offline");
        return;
      }
      const page = (answer.value ?? {}) as EventsPage;
      const events = Array.isArray(page.events) ? page.events : [];
      if (events.length || page.gap) {
        quiet = !events.length;
        channels.emitEvents({ ...page, events });
      }
      if (page.cursor !== null && page.cursor !== undefined) cursor = page.cursor;
    } catch (error) {
      const code = errorCode(error);
      if (!config.hostOnline() || code === "machine_off" || code === "guest_offline") {
        channels.setState("offline");
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
    state: () => (config.hostOnline() ? channels.state() : "offline"),
    async call(id, command, workspace, folder, args, timeoutMs): Promise<CallResult> {
      if (!config.hostOnline()) {
        channels.setState("offline");
        throw { code: "machine_off" };
      }
      if (channels.state() === "offline" && classOf(command) === "read") {
        throw { code: "machine_off" };
      }
      try {
        if (GUEST_CREATES.has(command)) await ensureWorkspace(workspace);
        const answer = await config.hostCall(
          id,
          "guest_call",
          workspace,
          null,
          { machine: config.guestId, command, workspace, folder, args: args ?? {}, timeout_ms: timeoutMs ?? null },
          timeoutMs,
        );
        if (answer.cached) {
          channels.setState("offline");
          throw { code: "machine_off" };
        }
        if (channels.state() !== "online") {
          channels.setState("online");
          schedulePoll(pollEvery);
        }
        return { value: answer.value, cached: null, deferred: null };
      } catch (error) {
        const code = errorCode(error);
        if (!config.hostOnline() || code === "machine_off" || code === "guest_offline") {
          channels.setState("offline");
          throw { code: "machine_off" };
        }
        throw error;
      }
    },
    onState: channels.onState,
    onEvents: channels.onEvents,
    onEngine: channels.onEngine,
    subscribe(after) {
      if (after === null) cursor = null;
      subscribed = true;
      if (config.hostOnline() && channels.state() === "online") schedulePoll(0);
    },
    start() {
      closed = false;
      if (!config.hostOnline()) channels.setState("offline");
    },
    close() {
      closed = true;
      subscribed = false;
      stopPoll();
      channels.clear();
    },
    sync(online, engine) {
      if (closed) return;
      if (!config.hostOnline()) {
        stopPoll();
        channels.setState("offline");
        return;
      }
      const next: MachineState = online ? "online" : "offline";
      channels.setState(next);
      if (online && engine) channels.emitEngine(engine);
      if (online && subscribed) schedulePoll(pollEvery);
      else stopPoll();
    },
    markHostOffline() {
      if (closed) return;
      stopPoll();
      channels.setState("offline");
    },
    markAwake() {
      if (closed || !config.hostOnline()) return;
      channels.setState("online");
      if (subscribed) schedulePoll(pollEvery);
    },
  };
}
