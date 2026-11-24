/**
 * Una máquina local (hoy, Linux en esta PC) como enlace de la flota: la misma
 * forma que una sesión de relay (`Link` de `@terminus/fleet`), pero cada orden
 * va directo al motor del huésped por la ventana (`guest_call`), sin pasar por
 * la nube. Los eventos se leen por páginas (`guest_events`), como los del relay.
 *
 * La máquina hija no se inscribe en el plano de control: su id es
 * `<canal>:<huésped>` (`wsl:<distro>`) y sólo existe en esta computadora.
 */
import { invoke } from "@tauri-apps/api/core";
import type { CallResult, EngineInfo, EventsPage, MachineState } from "@terminus/computers";
import { classOf, type Link, type MachineInfo } from "../model/fleet/index.ts";
import type { Invoke } from "../model/router-commands";
import { formatWslMachineName, isAnyGuestMachine, isLocalGuestMachine, WSL_MACHINE_PREFIX, type WslChild } from "../model/wsl";

/** Los prefijos de id de las máquinas locales, uno por canal. */
const GUEST_PREFIXES = [WSL_MACHINE_PREFIX];

const POLL_EVERY = 1_000;
const POLL_IDLE = 4_000;
const HEALTH_EVERY = 15_000;
/** Cuánto vale una lectura de `guest_children`: los enlaces de todas las máquinas locales la comparten. */
const CHILDREN_FOR = 3_000;

export const isGuestMachine = (id: string | null | undefined): id is string =>
  !!id && GUEST_PREFIXES.some((p) => id.startsWith(p)) && isLocalGuestMachine(id);

export { isAnyGuestMachine };

type ChildHealth = { id: string; online: boolean; contract: string | null; version: string | null };
let childrenRead: { at: number; list: Promise<ChildHealth[]> } | null = null;
const awakeHooks = new Map<string, Set<() => void>>();

/** Descarta la caché compartida de `guest_children` (al despertar o cambiar de estado una distro). */
export function invalidateGuestChildren() {
  childrenRead = null;
}

/** Una sola lectura de `guest_children` cada pocos segundos, para todas las máquinas locales. */
function sharedChildren(): Promise<ChildHealth[]> {
  const now = Date.now();
  if (!childrenRead || now - childrenRead.at > CHILDREN_FOR) {
    const read = invoke<ChildHealth[]>("guest_children").catch((error) => {
      if (childrenRead?.list === read) childrenRead = null;
      throw error;
    });
    childrenRead = { at: now, list: read };
  }
  return childrenRead.list;
}

/** La fila de la flota de una distro conectada. Se puede encender (la ventana la despierta). */
export function guestMachineInfo(child: WslChild, hostName?: string | null, siblingCount = 1): MachineInfo {
  return {
    id: child.id,
    name: hostName ? formatWslMachineName(hostName, child, siblingCount) : child.name,
    wakes: true,
    linked: null,
    child: true,
    os: "linux",
    ...(child.features.length ? { features: child.features } : {}),
    ...(child.version ? { version: child.version } : {}),
  };
}

/** Lo que crea o acomoda algo en el workspace: antes, el workspace (y su carpeta) tienen que existir en la distribución. */
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

type Folder = { id: string; name?: string; working_directory?: string | null };

export function createGuestLink(machine: string, native?: Invoke): Link {
  const copied = new Set<string>();
  const workspaces = new Set<string>();

  const childCall = <T,>(command: string, args: unknown, workspace: string | null, timeoutMs = 30_000) =>
    invoke<T>("guest_call", { machine, command, args: args ?? {}, workspace, folder: null, timeoutMs });

  const localRead = <T,>(command: string, workspace: string | null): Promise<T> =>
    native
      ? (native(command, {}, workspace ? { headers: { "x-terminus-workspace": workspace } } : undefined) as Promise<T>)
      : invoke<T>(command);

  const spaces = new Set<string>();

  /** Los espacios de esta PC, con el mismo id: sin ellos la distribución rechaza la tarea (`spaces.error.missing`). */
  async function syncSpaces(workspace: string) {
    const here = await localRead<{ id: string }[]>("list_spaces", workspace).catch(() => [] as { id: string }[]);
    const list = Array.isArray(here) ? here : [];
    await invoke("guest_sync_spaces", { machine, workspace, spaces: list });
    for (const s of list) spaces.add(s.id);
  }

  /** El workspace de la ventana, con el mismo id, en la distribución (la hija no tiene cuenta que lo traiga). */
  async function ensureWorkspace(workspace: string | null) {
    if (!workspace || workspaces.has(workspace)) return;
    await childCall("materialize_workspace", { id: workspace }, workspace);
    await syncSpaces(workspace);
    workspaces.add(workspace);
  }

  /**
   * Las carpetas de la distribución y, con el mismo id, las de esta PC que
   * todavía no tiene: elegir una la copia al crear la tarea (`ensureFolder`).
   */
  async function foldersFor(workspace: string | null): Promise<Folder[]> {
    // Apagada, se ofrecen las de esta PC sin encenderla: elegir una y enviar la enciende.
    let own: Folder[] = [];
    if (state !== "offline") {
      await ensureWorkspace(workspace);
      const there = await childCall<Folder[]>("list_projects", {}, workspace);
      own = Array.isArray(there) ? there : [];
    }
    const here = await localRead<Folder[]>("list_projects", workspace).catch(() => [] as Folder[]);
    const missing = (Array.isArray(here) ? here : []).filter((f) => f.working_directory && !own.some((o) => o.id === f.id));
    return [...own, ...missing];
  }

  /**
   * La carpeta de la tarea, en la distribución. Si no está, se copia una vez
   * desde esta PC (`~/danil/<nombre>`) y se registra con el mismo id.
   */
  async function ensureFolder(project: unknown, workspace: string | null) {
    if (typeof project !== "string" || !project || copied.has(project)) return;
    await ensureWorkspace(workspace);
    const there = await childCall<Folder[]>("list_projects", {}, workspace);
    if (Array.isArray(there) && there.some((f) => f.id === project)) {
      copied.add(project);
      return;
    }
    const here = await localRead<Folder[]>("list_projects", workspace);
    const folder = Array.isArray(here) ? here.find((f) => f.id === project) : undefined;
    if (!folder?.working_directory) throw { code: "folder_missing", detail: project };
    await invoke("guest_copy_folder", { machine, project, name: folder.name ?? project, path: folder.working_directory, workspace });
    copied.add(project);
  }

  let state: MachineState = "unknown";
  let cursor: number | null = null;
  let subscribed = false;
  let closed = false;
  let pollTimer: ReturnType<typeof setTimeout> | undefined;
  let healthTimer: ReturnType<typeof setTimeout> | undefined;
  const stateListeners = new Set<(s: MachineState) => void>();
  const eventListeners = new Set<(page: EventsPage) => void>();
  const engineListeners = new Set<(engine: EngineInfo) => void>();

  const setState = (next: MachineState) => {
    if (next === state) return;
    state = next;
    for (const l of stateListeners) l(next);
  };

  async function health() {
    if (closed) return;
    try {
      const list = await sharedChildren();
      const me = list.find((c) => c.id === machine);
      if (me?.online) {
        setState("online");
        for (const l of engineListeners) l({ contract: me.contract, host_version: me.version });
      } else if (state !== "starting") setState("offline");
    } catch {
      setState("offline");
    }
    if (!closed) healthTimer = setTimeout(() => void health(), HEALTH_EVERY);
  }

  async function poll() {
    if (closed || !subscribed) return;
    let quiet = true;
    try {
      const page = await invoke<EventsPage & { latest?: number | null }>("guest_events", { machine, cursor });
      if (state !== "online") setState("online");
      const events = page.events ?? [];
      if (events.length || page.gap) {
        quiet = !events.length;
        for (const l of eventListeners) l({ ...page, events });
      }
      if (page.cursor !== null && page.cursor !== undefined) cursor = page.cursor;
    } catch {
      if (state === "online") setState("offline");
    }
    if (!closed && subscribed) pollTimer = setTimeout(() => void poll(), quiet && state !== "online" ? POLL_IDLE : POLL_EVERY);
  }

  const onAwake = () => {
    if (closed) return;
    setState("online");
    clearTimeout(healthTimer);
    void health();
  };
  let hooks = awakeHooks.get(machine);
  if (!hooks) {
    hooks = new Set();
    awakeHooks.set(machine, hooks);
  }
  hooks.add(onAwake);

  return {
    state: () => state,
    async call(_id, command, workspace, folder, args, timeoutMs): Promise<CallResult> {
      if (command === "list_projects") return { value: await foldersFor(workspace), cached: null, deferred: null };
      // Apagada, leer no la enciende: la barra no prende Linux solo por estar abierta.
      if (state === "offline" && classOf(command) === "read") throw { code: "machine_off" };
      if (CREATES.has(command)) {
        await ensureWorkspace(workspace);
        await ensureFolder((args as { project?: unknown } | null)?.project, workspace);
        const space = (args as { space?: unknown } | null)?.space;
        if (workspace && typeof space === "string" && space && !spaces.has(space)) await syncSpaces(workspace);
      }
      const value = await invoke<unknown>("guest_call", { machine, command, workspace, folder, args: args ?? {}, timeoutMs: timeoutMs ?? null });
      if (state !== "online") setState("online");
      return { value, cached: null, deferred: null };
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
      // El cursor del relay no vale aquí: los eventos de la distro tienen el suyo.
      if (after === null) cursor = null;
      const first = !subscribed;
      subscribed = true;
      if (first) void poll();
    },
    start() {
      closed = false;
      void health();
    },
    close() {
      closed = true;
      subscribed = false;
      clearTimeout(pollTimer);
      clearTimeout(healthTimer);
      const set = awakeHooks.get(machine);
      set?.delete(onAwake);
      if (set && !set.size) awakeHooks.delete(machine);
      stateListeners.clear();
      eventListeners.clear();
      engineListeners.clear();
    },
  };
}

/** Enciende el huésped (en WSL, la ventana deja abierto un `wsl.exe`) y avisa al enlace local en cuanto contesta. */
export async function wakeGuestMachine(machine: string): Promise<boolean> {
  const ok = await invoke<boolean>("guest_start", { machine });
  if (ok) {
    invalidateGuestChildren();
    for (const notify of awakeHooks.get(machine) ?? []) notify();
  }
  return ok;
}
