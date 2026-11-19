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
  /** La cuenta que la pidió: las máquinas son de una cuenta y otra no puede darlas por perdidas. */
  owner?: string;
};

export type QueueState = {
  pending: number;
  /** Último aviso (rechazo o duda), ya traducido. */
  error: string | null;
  /** Todos los avisos que nadie ha cerrado, del más viejo al más nuevo. */
  notices: string[];
};

/** Lo que la flota sabe de una máquina: lista, todavía sin resolver, o ya no existe en la cuenta. */
export type HostLookup = Host | "pending" | "gone";
/** Resuelve la máquina de una entrada: su id y la cuenta que la pidió. */
export type Resolver = (id: string, owner: string | undefined) => HostLookup;

export type Storage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
};

const STORAGE_KEY = "terminus.taskQueue";
/** Intentos de archivar con un error inesperado antes de avisar y soltarlo. */
const MAX_ATTEMPTS = 3;
/** Cada cuánto se reintenta lo que espera a una máquina dormida o sin respuesta. */
const WAIT_MS = 30_000;
/** Fallos pasajeros: la máquina duerme, tarda, no despierta o no se alcanza. Repetir es seguro si nada salió, y esperar no pierde la intención. */
const TRANSIENT = new Set(["machine_asleep", "machine_off", "machine_timeout", "start_failed", "start_timeout", "unreachable", "io", "task_status_unavailable", "queue_storage", "unknown_machine"]);
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
let notices: string[] = [];
let account: string | null = null;
let clock: () => number = Date.now;
let owns: (host: string) => boolean = () => false;
/** Hasta cuándo no se reintenta una entrada tras una caída de red (en memoria). */
const retryAt = new Map<string, number>();
let timer: ReturnType<typeof setTimeout> | null = null;
let storage: Storage | null = null;
let lookup: Resolver = () => "pending";
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
  return { pending: entries.length, error, notices };
}

function notify() {
  for (const listener of listeners) listener(state());
}

function warn(text: string) {
  error = text;
  notices = [...notices, text];
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
    if (raw) {
      try {
        saved = (JSON.parse(raw) as QueueEntry[]).filter((e) => e && e.key && e.host && e.id);
      } catch {
        // Contenido que no se puede leer: se guarda aparte antes de seguir, nunca se pisa sin copia.
        await (await disk()).setItem(`${STORAGE_KEY}.unreadable.${Date.now()}`, raw);
      }
    }
  } catch {
    // El disco no contestó: no se escribe nada encima. Se vuelve a leer y mientras tanto la fila vive en memoria.
    hydrated = false;
    reread();
    return;
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
  claim(); // lo recién cargado puede traer entradas sin dueño que `setAccount` aún no vio
  notify();
  await save();
  void kick();
}

/** Las entradas sin dueño pasan a la cuenta con sesión solo si su máquina es de esa cuenta. */
function claim(): boolean {
  let claimed = false;
  if (account) for (const entry of entries) if (!entry.owner && owns(entry.host)) { entry.owner = account; claimed = true; }
  return claimed;
}

let rereading: ReturnType<typeof setTimeout> | null = null;
function reread() {
  if (rereading) return;
  rereading = setTimeout(() => {
    rereading = null;
    void hydrate();
  }, WAIT_MS);
  (rereading as { unref?: () => void }).unref?.();
}

export function subscribe(listener: (state: QueueState) => void) {
  listeners.add(listener);
  listener(state());
  return () => { listeners.delete(listener); };
}

export function clearError() {
  if (error === null && notices.length === 0) return;
  error = null;
  notices = [];
  notify();
}

/**
 * La cuenta con sesión. Las entradas nuevas la llevan. Las que no tienen dueño
 * (de una versión anterior) las reclama solo si `owns` dice que su máquina es de
 * esta cuenta; si no, esperan. Al pasar de una cuenta a otra se limpian los
 * avisos: nombran tareas de la anterior.
 */
export function setAccount(id: string | null, mine: (host: string) => boolean = () => false) {
  // Una sesión que se anula un instante (renovar el token) no borra los avisos: solo otra cuenta.
  if (account && id && id !== account && notices.length > 0) {
    error = null;
    notices = [];
    notify();
  }
  if (id) account = id;
  owns = mine;
  if (claim()) void save();
  void kick();
}

export function pendingFor(id: string): TaskAction | null {
  return entries.find((e) => e.id === id)?.action ?? null;
}

/**
 * Cómo resuelve la cola a qué máquina va cada entrada. La flota lo conecta al
 * montarse y avisa cada vez que cambia; sin esto la cola espera, no descarta.
 */
export function bindHosts(resolve: Resolver, say?: Say) {
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
  entries.push({ key, ...candidate, title: task.title ?? "", action, attempts: 0, at: Date.now(), ...(account ? { owner: account } : {}) });
  notify();
  void save();
  void kick();
}

function drop(entry: QueueEntry) {
  retryAt.delete(entry.key);
  entries = entries.filter((e) => e.key !== entry.key);
}

function message(failure: unknown) {
  if (failure instanceof HostError && failure.code === "task_status_unavailable") return t("task.header.status_unavailable");
  if (failure instanceof HostError && failure.code === "machine_asleep") return t("task.actions.online");
  return t("task.error", { detail: failure instanceof Error ? failure.message : String(failure) });
}

type Outcome = "done" | "wait";

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
  if ((retryAt.get(entry.key) ?? 0) > clock()) return "wait";
  const found = lookup(entry.host, entry.owner);
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
    // La guardia local negó la llamada: nunca salió, sea cual sea el motivo. Se quita la marca y se espera.
    if (failure instanceof HostError && failure.notSent) {
      if (entry.sent) {
        entry.sent = false;
        await save();
      }
      return "wait";
    }
    if (!entry.sent) {
      // No salió nada: dormida, sin comprobar o sin disco espera; una caída de red espera con pausa; el resto es un rechazo.
      if (code && TRANSIENT.has(code)) {
        // Sin llamada nueva hasta pasar la pausa, salvo lo que no toca a la máquina.
        if (code !== "machine_asleep" && code !== "task_status_unavailable" && code !== "queue_storage") retryAt.set(entry.key, clock() + WAIT_MS);
        return "wait";
      }
      warn(message(failure));
      return "done";
    }
    // La mutación pudo salir y no hubo acuse (o el relay respondió algo que no confirma que no entró).
    if (entry.action === "archive") {
      // Archivar es idempotente: se repite con pausa; un error inesperado se suelta tras unos intentos.
      if (code && REFUSED.has(code)) {
        warn(message(failure));
        return "done";
      }
      if (!(code && TRANSIENT.has(code))) entry.attempts += 1;
      if (!(code && TRANSIENT.has(code)) && entry.attempts >= MAX_ATTEMPTS) {
        warn(message(failure));
        return "done";
      }
      retryAt.set(entry.key, clock() + WAIT_MS);
      return "wait";
    }
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
  await null; // `current` ya está asignado antes de que corra nada.
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
    drop(entry);
    notify();
    await save();
  }
  if (waiting) later();
}

/** Solo para pruebas. */
export function __reset(options: { storage?: Storage; now?: () => number } = {}) {
  clock = options.now ?? Date.now;
  entries = [];
  current = null;
  hydrated = false;
  loaded = false;
  error = null;
  notices = [];
  listeners.clear();
  account = null;
  owns = () => false;
  retryAt.clear();
  if (rereading) clearTimeout(rereading);
  rereading = null;
  if (timer) clearTimeout(timer);
  timer = null;
  storage = options.storage ?? null;
  lookup = () => "pending";
}
export const __entries = () => entries;
export const __kick = kick;
