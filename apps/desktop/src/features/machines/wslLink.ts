/**
 * Linux en esta PC como enlace de la flota: la misma forma que una sesión de
 * relay (`Link` de `@terminus/fleet`), pero cada orden va directo al motor de
 * la distro por la ventana (`wsl_child_call`), sin pasar por la nube. Los
 * eventos se leen por páginas (`wsl_child_events`), como los del relay.
 *
 * La máquina hija no se inscribe en el plano de control: su id es
 * `wsl:<distro>` y sólo existe en esta computadora.
 */
import { invoke } from "@tauri-apps/api/core";
import type { CallResult, EngineInfo, EventsPage, MachineState } from "@terminus/computers";
import { classOf, type Link, type MachineInfo } from "@terminus/fleet";
import { WSL_MACHINE_PREFIX, type WslChild } from "./wsl";

const POLL_EVERY = 1_000;
const POLL_IDLE = 4_000;
const HEALTH_EVERY = 15_000;

export const isWslMachine = (id: string | null | undefined): id is string => !!id && id.startsWith(WSL_MACHINE_PREFIX);

/** La fila de la flota de una distro conectada. Se puede encender (la ventana la despierta). */
export function wslMachineInfo(child: WslChild): MachineInfo {
  return {
    id: child.id,
    name: child.name,
    wakes: true,
    linked: null,
    child: true,
    os: "linux",
    ...(child.features.length ? { features: child.features } : {}),
    ...(child.version ? { version: child.version } : {}),
  };
}

/** Lo que crea algo en una carpeta: antes, la carpeta tiene que estar en la distribución. */
const CREATES = new Set(["send_message", "run_shell_command"]);

type Folder = { id: string; name?: string; working_directory?: string | null };

export function createWslLink(machine: string): Link {
  const copied = new Set<string>();
  const workspaces = new Set<string>();

  const childCall = <T,>(command: string, args: unknown, workspace: string | null, timeoutMs = 30_000) =>
    invoke<T>("wsl_child_call", { machine, command, args: args ?? {}, workspace, folder: null, timeoutMs });

  /** El workspace de la ventana, con el mismo id, en la distribución (la hija no tiene cuenta que lo traiga). */
  async function ensureWorkspace(workspace: string | null) {
    if (!workspace || workspaces.has(workspace)) return;
    await childCall("materialize_workspace", { id: workspace }, workspace);
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
    const here = await invoke<Folder[]>("list_projects").catch(() => [] as Folder[]);
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
    const here = await invoke<Folder[]>("list_projects");
    const folder = Array.isArray(here) ? here.find((f) => f.id === project) : undefined;
    if (!folder?.working_directory) throw { code: "folder_missing", detail: project };
    await invoke("wsl_child_copy_folder", { machine, project, name: folder.name ?? project, path: folder.working_directory, workspace });
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
      const list = await invoke<{ id: string; online: boolean; contract: string | null; version: string | null }[]>("wsl_children");
      const me = list.find((c) => c.id === machine);
      if (me?.online) {
        setState("online");
        for (const l of engineListeners) l({ contract: me.contract, host_version: me.version });
      } else if (state !== "starting") setState("offline");
    } catch {
      setState("offline");
    }
    healthTimer = setTimeout(() => void health(), HEALTH_EVERY);
  }

  async function poll() {
    if (closed || !subscribed) return;
    let quiet = true;
    try {
      const page = await invoke<EventsPage & { latest?: number | null }>("wsl_child_events", { machine, cursor });
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
    pollTimer = setTimeout(() => void poll(), quiet && state !== "online" ? POLL_IDLE : POLL_EVERY);
  }

  return {
    state: () => state,
    async call(_id, command, workspace, folder, args, timeoutMs): Promise<CallResult> {
      if (command === "list_projects") return { value: await foldersFor(workspace), cached: null, deferred: null };
      // Apagada, leer no la enciende: la barra no prende Linux solo por estar abierta.
      if (state === "offline" && classOf(command) === "read") throw { code: "machine_off" };
      if (CREATES.has(command)) await ensureFolder((args as { project?: unknown } | null)?.project, workspace);
      const value = await invoke<unknown>("wsl_child_call", { machine, command, workspace, folder, args: args ?? {}, timeoutMs: timeoutMs ?? null });
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
      stateListeners.clear();
      eventListeners.clear();
      engineListeners.clear();
    },
  };
}

/** Despierta la distro: la ventana deja abierto un `wsl.exe` y espera a que su motor conteste. */
export const wakeWslMachine = (machine: string) => invoke<boolean>("wsl_child_wake", { machine });
