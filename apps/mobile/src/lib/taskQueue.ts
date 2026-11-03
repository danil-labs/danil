import AsyncStorage from "@react-native-async-storage/async-storage";
import { deleteTask, finishTask, archiveTask, type Task } from "./engine";
import { HostError, type Host } from "./hosts";
import { t } from "./i18n";

/**
 * Cola de acciones de tarea: archivar, finalizar y borrar.
 *
 * La app no espera al relay para dejar de mirar la tarea. Cada acción entra a
 * una fila por máquina (una petición en vuelo a la vez, como el relay) y la
 * pantalla sigue navegable. La fila vive en disco para sobrevivir a que la app
 * se cierre a media petición: al abrir, `hydrate()` la recupera y sigue.
 *
 * Las tres acciones siguen siendo distintas: finalizar cierra el trabajo y
 * conserva la conversación; archivar la retira y también la conserva; borrar se
 * lleva la familia y no deja nada.
 */

export type TaskAction = "archive" | "finish" | "delete";

export type QueueEntry = {
  /** `host:workspace:folder:task:action`, para no encolar dos veces lo mismo. */
  key: string;
  host: string;
  workspace: string;
  folder: string;
  id: string;
  title: string;
  action: TaskAction;
  attempts: number;
};

export type QueueState = {
  pending: number;
  /** Última acción que la máquina rechazó, ya traducida. */
  error: string | null;
};

const STORAGE_KEY = "terminus.taskQueue";
/** Una acción que la máquina rechaza por regla no se reintenta. */
const MAX_ATTEMPTS = 2;

let entries: QueueEntry[] = [];
let running = false;
let hydrated = false;
let error: string | null = null;
const listeners = new Set<(state: QueueState) => void>();

const hosts = new Map<string, Host>();

function state(): QueueState {
  return { pending: entries.length, error };
}

function notify() {
  for (const listener of listeners) listener(state());
}

async function save() {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Sin disco la fila sigue en memoria: se pierde al cerrar, no bloquea.
  }
}

/** Recupera la fila guardada. Se llama una vez al abrir la app. */
export async function hydrate() {
  if (hydrated) return;
  hydrated = true;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) entries = (JSON.parse(raw) as QueueEntry[]).filter((e) => e && e.key);
  } catch {
    entries = [];
  }
  notify();
  void kick();
}

export function subscribe(listener: (state: QueueState) => void) {
  listeners.add(listener);
  listener(state());
  return () => listeners.delete(listener);
}

export function clearError() {
  if (error === null) return;
  error = null;
  notify();
}

export function pendingFor(id: string): TaskAction | null {
  return entries.find((e) => e.id === id)?.action ?? null;
}

/**
 * Encola una acción y vuelve de inmediato.
 *
 * `host` se usa para saber a qué máquina va; el ejecutor lo resuelve la cola
 * cuando le toca el turno, porque la máquina puede estar despertando.
 */
export function enqueue(host: Host, task: Pick<Task, "workspace" | "folder" | "id"> & { title?: string }, action: TaskAction) {
  const key = `${host.id}:${task.workspace}:${task.folder}:${task.id}:${action}`;
  if (entries.some((e) => e.id === task.id)) return;
  hosts.set(host.id, host);
  entries.push({
    key,
    host: host.id,
    workspace: task.workspace,
    folder: task.folder,
    id: task.id,
    title: task.title ?? "",
    action,
    attempts: 0,
  });
  notify();
  void save();
  void kick();
}

function message(failure: unknown) {
  if (failure instanceof HostError && failure.code === "task_status_unavailable") return t("task.header.status_unavailable");
  if (failure instanceof HostError && failure.code === "machine_asleep") return t("task.actions.online");
  return t("task.error", { detail: failure instanceof Error ? failure.message : String(failure) });
}

async function run(entry: QueueEntry): Promise<"done" | "retry"> {
  const host = hosts.get(entry.host);
  if (!host) return "done";
  try {
    if (entry.action === "archive") {
      const result = await archiveTask(host, entry.workspace, entry.folder, entry.id);
      return "blocked" in result ? "done" : "done";
    }
    if (entry.action === "finish") {
      const result = await finishTask(host, entry.workspace, entry.folder, entry.id);
      if ("blocked" in result) return "done";
      return "done";
    }
    await deleteTask(host, entry.workspace, entry.folder, entry.id);
    return "done";
  } catch (failure) {
    const retry = entry.attempts + 1 < MAX_ATTEMPTS && !(failure instanceof HostError);
    error = message(failure);
    notify();
    return retry ? "retry" : "done";
  }
}

/** Vacía la fila de a una petición. Una sola ejecución a la vez. */
async function kick() {
  if (running || !hydrated) return;
  running = true;
  try {
    while (entries.length > 0) {
      const entry = entries[0];
      const outcome = await run(entry);
      if (outcome === "retry") {
        entry.attempts += 1;
        await save();
        continue;
      }
      entries = entries.filter((e) => e.key !== entry.key);
      notify();
      await save();
    }
  } finally {
    running = false;
  }
  if (entries.length > 0) void kick();
}
