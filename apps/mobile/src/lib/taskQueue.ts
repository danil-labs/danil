import { deleteTask, finishTask, archiveTask, type Task } from "./engine.ts";
import { HostError, type Host } from "./hosts.ts";
import type { Key } from "./i18n.ts";

/**
 * Cola de acciones de tarea: archivar, finalizar y borrar.
 *
 * La app no espera al relay para dejar de mirar la tarea. Cada acción entra a
 * una fila en disco que sobrevive a que la app se cierre. Una acción sale de la
 * fila solo por una de tres razones: la máquina la aceptó, la máquina o la regla
 * la rechazó (y se avisa), o no hay manera de saber si llegó (y se avisa; nunca
 * se repite una mutación incierta de finalizar o borrar). Que la máquina aún no
 * se haya resuelto, esté dormida o no conteste NO es una razón: la intención
 * sigue en la fila hasta que se pueda transmitir.
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
  /** Cuándo se pidió, en ms. Solo se guarda: si las peticiones caducan es una decisión aparte. */
  at?: number;
  /** La mutación ya salió hacia la máquina: sin acuse no se sabe si llegó. */
  sent?: boolean;
};

export type QueueState = {
  pending: number;
  /** Último aviso (rechazo, duda o caducidad), ya traducido. */
  error: string | null;
};

/** Lo que la flota sabe de una máquina: lista, todavía sin resolver, o ya no existe en la cuenta. */
export type HostLookup = Host | "pending" | "gone";

export type Storage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
};

const STORAGE_KEY = "terminus.taskQueue";
/** Fallos de red al archivar (que es idempotente) antes de dejarlo para otra ocasión. */
const MAX_ATTEMPTS = 3;
/** Cada cuánto se reintenta lo que espera a una máquina dormida o sin respuesta. */
const WAIT_MS = 30_000;
/** Lo que la máquina acepta antes de la mutación y no la ejecuta todavía. */
const BEFORE_MUTATION = new Set(["machine_asleep", "task_status_unavailable", "queue_storage"]);
/** Rechazos que la máquina da por regla y que dicen que no se ejecutó. Cualquier otro error tras enviar es duda. */
const REFUSED = new Set(["command_unsupported", "command_not_here", "command_not_allowed", "machine_outdated"]);
const MUTATIONS = new Set(["set_task_archived", "finish_task", "delete_session"]);

let entries: QueueEntry[] = [];
let current: Promise<void> | null = null;
let again = false;
let hydrated = false;
/** La fila guardada ya se leyó: antes de eso no se escribe, para no pisarla. */
let loaded = false;
let error: string | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let storage: Storage | null = null;
let lookup: (id: string) => HostLookup = () => "pending";
type Say = (key: Key, vars?: Record<string, string | number>) => string;
/** La app pone aquí su `t`; así la cola se prueba en Node sin cargar el catálogo. */
let t: Say = (key, vars) => `${key} ${JSON.stringify(vars ?? {})}`;
const listeners = new Set<(state: QueueState) => void>();

/** El almacenamiento por omisión es el del teléfono; se carga al usarlo para que Node pueda probar la cola. */
async function disk(): Promise<Storage> {
  if (storage) return storage;
  const module = await import("@react-native-async-storage/async-storage");
  storage = module.default as Storage;
  return storage;
}

function state(): QueueState {
  return { pending: entries.length, error };
}

function notify() {
  for (const listener of listeners) listener(state());
}

function warn(text: string) {
  error = text;
  notify();
}

/**
 * Una sola escritura a la vez, y cada una escribe la fila de ese momento: un
 * instante viejo nunca pisa una marca `sent` más nueva. Dice si quedó en disco.
 */
let writing: Promise<unknown> = Promise.resolve();
function save(): Promise<boolean> {
  if (!loaded) return Promise.resolve(true);
  const write = async () => {
    try {
      await (await disk()).setItem(STORAGE_KEY, JSON.stringify(entries));
      return true;
    } catch {
      return false;
    }
  };
  const result = writing.then(write);
  writing = result;
  return result;
}

const verb = (action: TaskAction) => t(`task.queue.verb.${action}` as Key);
const label = (entry: QueueEntry) => entry.title || entry.id;

/**
 * Recupera la fila guardada. Se llama una vez al abrir la app. Una mutación de
 * finalizar o borrar que ya había salido sin acuse no se repite: se avisa.
 */
export async function hydrate() {
  if (hydrated) return;
  hydrated = true;
  let saved: QueueEntry[] = [];
  try {
    const raw = await (await disk()).getItem(STORAGE_KEY);
    if (raw) saved = (JSON.parse(raw) as QueueEntry[]).filter((e) => e && e.key && e.host && e.id);
  } catch {
    saved = [];
  }
  // Lo que ya se encoló durante la carga va después de lo guardado, sin duplicar.
  const fresh = entries.filter((e) => !saved.some((s) => sameTask(s, e)));
  entries = [...saved, ...fresh];
  for (const entry of [...entries]) {
    if (entry.sent && entry.action !== "archive") {
      drop(entry);
      warn(t("task.queue.uncertain", { title: label(entry), action: verb(entry.action) }));
    }
  }
  loaded = true;
  notify();
  await save();
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
 * Cómo resuelve la cola a qué máquina va cada entrada. La flota lo conecta al
 * montarse y avisa cada vez que cambia; sin esto la cola espera, no descarta.
 */
export function bindHosts(resolve: (id: string) => HostLookup, say?: Say) {
  lookup = resolve;
  if (say) t = say;
  void kick();
}

const sameTask = (a: Pick<QueueEntry, "host" | "workspace" | "folder" | "id">, b: Pick<QueueEntry, "host" | "workspace" | "folder" | "id">) =>
  a.host === b.host && a.workspace === b.workspace && a.folder === b.folder && a.id === b.id;

/** Encola una acción y vuelve de inmediato. A qué máquina va y cuándo se ejecuta lo decide la cola con la flota. */
export function enqueue(host: Host, task: Pick<Task, "workspace" | "folder" | "id"> & { title?: string }, action: TaskAction) {
  const key = `${host.id}:${task.workspace}:${task.folder}:${task.id}:${action}`;
  const candidate = { host: host.id, workspace: task.workspace, folder: task.folder, id: task.id };
  if (entries.some((e) => sameTask(e, candidate))) return;
  entries.push({ key, ...candidate, title: task.title ?? "", action, attempts: 0, at: Date.now() });
  notify();
  void save();
  void kick();
}

function drop(entry: QueueEntry) {
  entries = entries.filter((e) => e.key !== entry.key);
}

function message(failure: unknown) {
  if (failure instanceof HostError && failure.code === "task_status_unavailable") return t("task.header.status_unavailable");
  if (failure instanceof HostError && failure.code === "machine_asleep") return t("task.actions.online");
  return t("task.error", { detail: failure instanceof Error ? failure.message : String(failure) });
}

type Outcome = "done" | "wait" | "retry" | "skip";

/** La máquina de la acción con el rastro de si la mutación ya salió. */
function tracked(host: Host, entry: QueueEntry): Host {
  const proxy = Object.create(host) as Host;
  proxy.call = async (command, workspace, args) => {
    if (MUTATIONS.has(command) && !entry.sent) {
      // Sin la marca en disco no se envía una mutación que no se puede repetir: tras un reinicio no sabríamos que salió.
      entry.sent = true;
      if (!(await save()) && entry.action !== "archive") {
        entry.sent = false;
        throw new HostError("queue_storage");
      }
    }
    return host.call(command, workspace, args);
  };
  return proxy;
}

async function run(entry: QueueEntry): Promise<Outcome> {
  const found = lookup(entry.host);
  if (found === "pending") return "wait";
  if (found === "gone") {
    warn(t("task.queue.gone", { title: label(entry) }));
    return "done";
  }
  const host = tracked(found, entry);
  try {
    const result =
      entry.action === "archive"
        ? await archiveTask(host, entry.workspace, entry.folder, entry.id)
        : entry.action === "finish"
          ? await finishTask(host, entry.workspace, entry.folder, entry.id)
          : await deleteTask(host, entry.workspace, entry.folder, entry.id);
    if (result && typeof result === "object" && "blocked" in result) {
      // La regla de la máquina lo detuvo: no se ejecutó y se dice.
      warn(t("task.queue.blocked", { title: label(entry), action: verb(entry.action) }));
    }
    return "done";
  } catch (failure) {
    const code = failure instanceof HostError ? failure.code : null;
    if (!entry.sent) {
      // No salió nada: dormida o sin comprobar espera; otra falla de red reintenta; el resto es un rechazo.
      if (code && BEFORE_MUTATION.has(code)) return "wait";
      if (code === "io" || code === null) return entry.attempts + 1 < MAX_ATTEMPTS ? "retry" : "wait";
      warn(message(failure));
      return "done";
    }
    // La guardia local negó la llamada: nunca salió. Se quita la marca y se espera.
    if (failure instanceof HostError && failure.notSent) {
      entry.sent = false;
      await save();
      return "wait";
    }
    // La mutación pudo salir y no hubo acuse (o el relay respondió algo que no confirma que no entró). Archivar es idempotente: se repite. Lo demás, nunca a ciegas.
    if (entry.action === "archive") return code && REFUSED.has(code) ? (warn(message(failure)), "done") : "wait";
    if (code && REFUSED.has(code)) {
      warn(message(failure));
      return "done";
    }
    warn(t("task.queue.uncertain", { title: label(entry), action: verb(entry.action) }));
    return "done";
  }
}

function later() {
  if (timer || typeof setTimeout !== "function") return;
  timer = setTimeout(() => {
    timer = null;
    void kick();
  }, WAIT_MS);
  (timer as { unref?: () => void }).unref?.();
}

/**
 * Vacía la fila. Una sola ejecución a la vez; una entrada que espera no frena a
 * las de otra máquina, y lo que espera se vuelve a intentar al cambiar la flota
 * o cada `WAIT_MS`.
 */
function kick(): Promise<void> {
  if (!loaded) return Promise.resolve();
  if (current) {
    // Algo cambió mientras corría: una pasada más, para no perder el cambio.
    again = true;
    return current;
  }
  current = rounds();
  return current;
}

/** Se libera `current` en el mismo turno en que se decide no repetir: así un aviso nunca cae en el hueco. */
async function rounds() {
  try {
    do {
      again = false;
      await drain();
    } while (again);
  } finally {
    current = null;
  }
}

async function drain() {
  let waiting = false;
  const skipped = new Set<string>();
  for (;;) {
    const entry = entries.find((e) => !skipped.has(e.key));
    if (!entry) break;
    const outcome = await run(entry);
    if (outcome === "wait") {
      skipped.add(entry.key);
      waiting = true;
      continue;
    }
    if (outcome === "retry") {
      entry.attempts += 1;
      await save();
      continue;
    }
    drop(entry);
    notify();
    await save();
  }
  if (waiting) later();
}

/** Solo para pruebas. */
export function __reset(options: { storage?: Storage } = {}) {
  entries = [];
  current = null;
  hydrated = false;
  loaded = false;
  error = null;
  if (timer) clearTimeout(timer);
  timer = null;
  storage = options.storage ?? null;
  lookup = () => "pending";
}
export const __entries = () => entries;
export const __kick = kick;
