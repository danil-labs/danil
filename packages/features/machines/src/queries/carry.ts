/**
 * Llevar el trabajo de una carpeta a la máquina donde nace la tarea: la parte
 * de la ventana de `@terminus/carry`. Los motores nunca hablan entre sí; la
 * ventana hace de puente con la cabecera `x-terminus-machine`. Se carga solo
 * al enviar a otra máquina: no entra en la carga inicial.
 */
import { createRoot, createSignal } from "solid-js";
import {
  type CarryEngine,
  type CarryFailure,
  type CarryJob,
  type CarryProgress,
  type CarryResult,
  type CarryState,
  type Exported,
  type Imported,
  type Part,
  type WorkStatus,
  CarryError,
  PART_RELAY,
  cancelCarry,
  carryWork,
  type Selection,
  keyVerdict,
  needsSheet,
  newState,
  withoutRemote,
} from "@terminus/carry";
import "../../../../../apps/desktop/src/locales/workPhrases";
import { invoke } from "../../../../engine-client/src/client";
import type { Project } from "../../../../../apps/desktop/src/lib/model";
import { escribirPref, leerPref } from "../../../../../apps/desktop/src/lib/prefs";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import { type CarryOrigin, machineName, rememberOrigin } from "./store";

const on = (machine: string) => ({ headers: { "x-terminus-machine": machine } });

/** Los `work_*` por el proxy de la ventana (o el transporte de la web), con la máquina en la cabecera. */
export const engine: CarryEngine = {
  status: (machine, args) => invoke<WorkStatus>("work_status", args, on(machine)),
  exportWork: (machine, args) => invoke<Exported>("work_export", args, on(machine)),
  readPart: (machine, args) => invoke<Part>("work_read_part", args, on(machine)),
  writePart: (machine, args) => invoke("work_write_part", args, on(machine)),
  importWork: (machine, args) => invoke<Imported>("work_import", args, on(machine)),
  cancel: (machine, args) => invoke("work_cancel", args, on(machine)),
  key: (machine) => invoke<{ publicKey: string }>("work_key", {}, on(machine)),
};

/** Lo que se sabe al enviar: de dónde a dónde, qué hay sin subir y si el destino ya tiene el proyecto. */
export type CarryCheck = {
  workspace: string;
  project: Project;
  source: string;
  target: string;
  status: WorkStatus;
  /** `null`: no se pudo saber (la máquina dormía); se clona si el import lo echa en falta. */
  hasProject: boolean | null;
  /** Al traer: la tarea de la otra máquina cuyo worktree se trae. */
  task: { id: string; title: string } | null;
  /**
   * La llave del destino con la que se sella, o `null` si viaja sin sellar (un
   * motor sin `work_key`). `keyChanged`: no es la fijada.
   */
  recipientKey: string | null;
  keyChanged: boolean;
};

const KEYS = "machines.carry_keys";
/** Por qué la máquina de destino no contestó (`router.ts`): apagada, sin poder encenderla o sin llegar a tiempo. */
const NOT_STARTED = new Set(["start_failed", "machine_off", "machine_timeout"]);
const pinned = () => leerPref<Record<string, string>>(KEYS, {});

/** Fija la llave de una máquina: la primera vez sola (TOFU), después al pulsar «Confiar en la nueva llave». */
export function trustKey(machine: string, key: string) {
  escribirPref(KEYS, { ...pinned(), [machine]: key });
}

/**
 * Todo va por el relay de la cuenta (`@terminus/fleet`), también desde el
 * escritorio: siempre se sella para el motor de destino, `.env` incluidos.
 */
async function keyFor(target: string): Promise<{ recipientKey: string | null; keyChanged: boolean }> {
  const key = await engine
    .key(target)
    .then((k) => k.publicKey)
    .catch((error) => {
      // Que no encendiera no es un motor sin `work_key`: la persona lo ve y el mensaje espera.
      if (NOT_STARTED.has((error as { detail?: unknown } | null)?.detail as string)) throw error;
      return null;
    });
  if (!key) return { recipientKey: null, keyChanged: false };
  const verdict = keyVerdict(pinned()[target], key);
  if (verdict === "new") trustKey(target, key);
  return { recipientKey: key, keyChanged: verdict === "changed" };
}

/**
 * Si el destino tiene la carpeta del proyecto: por su lista, con el mismo id. `machines` sale de la copia en caché de cada máquina;
 * que no la incluya puede ser que esa copia aún no llegó, y entonces se le
 * pregunta a ella antes de clonar otra vez.
 */
async function targetHasProject(target: string, project: Project): Promise<boolean> {
  if (project.machines?.includes(target)) return true;
  const theirs = await invoke<Project[]>("list_projects", {}, on(target));
  const same = theirs.find((p) => p.id === project.id);
  return !!same && !!(same.working_directory ?? same.work_tree);
}

/**
 * Antes del primer mensaje de una tarea en otra máquina: si hace falta la hoja.
 * `null` es mandar como siempre (nada que llevar, o un motor que no sabe de
 * `work_status`: entonces `ensure_here` sigue clonando en silencio).
 */
export async function checkCarry(input: { workspace: string; project: Project; source: string; target: string }, force = false): Promise<CarryCheck | null> {
  if (input.source === input.target) return null;
  const [status, hasProject] = await Promise.all([
    engine.status(input.source, { project: input.project.id, task: null }).catch(() => null),
    targetHasProject(input.target, input.project).catch(() => null),
  ]);
  if (!status || (!force && !needsSheet(status, hasProject ?? true))) return null;
  return { ...input, status, hasProject, task: null, ...(await keyFor(input.target)) };
}

/**
 * Traer a la máquina de la ventana el trabajo de una tarea que corre en otra.
 * Despierta la otra antes de preguntar: traer es una intención. Lanza si no contesta.
 */
export async function checkBring(input: { workspace: string; project: Project; source: string; target: string; task: { id: string; title: string } }): Promise<CarryCheck> {
  await engine.importWork(input.source, { transfer: "", project: "", sha256: "", bytes: 0, probe: true });
  const [status, hasProject] = await Promise.all([
    engine.status(input.source, { project: input.project.id, task: input.task.id }),
    targetHasProject(input.target, input.project).catch(() => null),
  ]);
  // Traer pasa por el relay como llevar: se sella para el motor de esta máquina.
  return { ...input, status, hasProject, ...(await keyFor(input.target)) };
}

/** «Seguir en una tarea nueva aquí» (D4): título, último mensaje del agente y los commits; no la transcripción. */
export function bringSummary(check: CarryCheck, lastAgentMessage: string | null, branch: string | null): string {
  const machine = machineName(check.source);
  const lines = [t("work.bring.summary", { task: check.task?.title ?? "", machine })];
  if (lastAgentMessage?.trim()) {
    const last = lastAgentMessage.trim();
    lines.push("", t("work.bring.summary_last"), last.length > SUMMARY_MAX ? `${last.slice(0, SUMMARY_MAX)}…` : last);
  }
  if (check.status.ahead > 0) {
    lines.push("", t("work.bring.summary_commits", { count: check.status.ahead, branch: branch ?? check.status.branch ?? "", head: check.status.head.slice(0, 7) }));
  }
  return `${lines.join("\n")}\n\n`;
}

/** Del último mensaje del agente basta el final de su respuesta: el resto está en la original. */
const SUMMARY_MAX = 1200;

/** Una copia en marcha o detenida, por la clave del borrador que la espera. */
export type Carry = {
  check: CarryCheck;
  job: CarryJob;
  state: CarryState;
  progress: CarryProgress | null;
  failure: CarryFailure | null;
  /** El tamaño de la rama completa, cuando falta la base y ya se exportó. */
  fullBytes: number | null;
  cancelled: boolean;
  /** Ya traído: la base con la que nace la tarea nueva aquí, sin copiar nada más. */
  ready: CarryResult | null;
};

/** Con qué nace la tarea: la base y en qué máquina (`x-terminus-machine`). */
export type CarriedBase = CarryResult & { target: string };

const [carries, setCarries] = createRoot(() => createSignal<Record<string, Carry>>({}));
export { carries };

function update(key: string, change: (c: Carry) => Carry) {
  setCarries((all) => (all[key] ? { ...all, [key]: change(all[key]) } : all));
}

/** Sin medir: una cifra prudente para el tiempo estimado por el relay. */
const RELAY_BYTES_PER_SECOND = 1024 * 1024;
export const bytesPerSecond = () => RELAY_BYTES_PER_SECOND;

/** Partes de 512 KiB: cada una es una llamada corta del relay (plazo de 60 s). */
export const partSize = () => PART_RELAY;

/** Los archivos ignorados (`.env`) solo viajan sellados (D3). */
export const ignoredAllowed = (check: Pick<CarryCheck, "recipientKey">) => !!check.recipientKey;

/** Lo elegido en la hoja queda esperando el envío del borrador `key`. */
export function planCarry(key: string, check: CarryCheck, job: CarryJob, state: CarryState, ready: CarryResult | null = null) {
  setCarries((all) => ({ ...all, [key]: { check, job, state, progress: null, failure: null, fullBytes: null, cancelled: false, ready } }));
}

export function dropCarry(key: string) {
  setCarries(({ [key]: _, ...rest }) => rest);
}

/** Sin remoto el destino no puede clonar: el import crea el proyecto desde el bundle completo. */
export const createsProject = (check: CarryCheck) => withoutRemote(check.status, check.project.remote_url) && check.hasProject !== true;

/** La copia que corre al enviar, con lo elegido en la hoja. */
export function jobFor(check: CarryCheck, choice: { selection: Selection; partSize: number; task: string | null; branchAs: string | null }): CarryJob {
  const create = createsProject(check) ? { name: check.project.name, id: check.project.id } : null;
  const files = ignoredAllowed(check) ? choice.selection.files : [];
  const selection = create ? { ...choice.selection, files, includeWork: true, full: true } : { ...choice.selection, files };
  return { source: check.source, target: check.target, project: check.project.id, task: choice.task, selection, partSize: choice.partSize, branchAs: choice.branchAs, create, recipientKey: check.recipientKey };
}

/** Clona en el destino por `start_project_clone`, con su avance, como al añadir una carpeta. */
async function cloneOn(check: CarryCheck, progress: (phase: string, percent: number | null) => void) {
  const url = check.status.remoteUrl ?? check.project.remote_url;
  if (!url) throw { what: { clave: "work.error.project_missing" }, detail: "no_remote" };
  const { followClone } = await import("../../../projects/src/queries/remoteClone");
  const operation = crypto.randomUUID();
  await followClone(
    { operation, machine: check.target, workspace: check.workspace, name: check.project.name },
    { url, name: check.project.name, operation, workspace: check.workspace, id: check.project.id },
    (p) => progress(p.phase, p.percent),
  );
}

/**
 * Corre la copia del borrador `key`. Resuelve con la base de la tarea, o con
 * `null` si se detuvo: el fallo queda en `carries()` con su arreglo.
 */
export async function runCarry(key: string): Promise<CarriedBase | null> {
  const carry = carries()[key];
  if (!carry) return null;
  if (carry.ready) {
    rememberPending(key, carry);
    dropCarry(key);
    return { ...carry.ready, target: carry.job.target };
  }
  update(key, (c) => ({ ...c, failure: null, cancelled: false }));
  try {
    const result = await carryWork(engine, carry.job, carry.state, {
      progress: (progress) => update(key, (c) => ({ ...c, progress })),
      hasProject: carry.check.hasProject === null ? undefined : async () => carry.check.hasProject as boolean,
      clone: carry.job.create ? undefined : (progress) => cloneOn(carry.check, progress),
      cancelled: () => !!carries()[key]?.cancelled,
    });
    rememberPending(key, carry);
    dropCarry(key);
    return { ...result, target: carry.job.target };
  } catch (error) {
    const failure: CarryFailure = error instanceof CarryError ? error.failure : { code: "import_failed", cause: error };
    if (failure.code === "cancelled") {
      setCarries(({ [key]: _, ...rest }) => rest);
      return null;
    }
    update(key, (c) => ({ ...c, failure }));
    if (failure.code === "missing_base") void prepareFull(key);
    return null;
  }
}

/** Con la base que falta se manda la rama completa: se exporta ya para decir cuánto pesa. */
async function prepareFull(key: string) {
  const carry = carries()[key];
  if (!carry) return;
  await cancelCarry(engine, carry.job, carry.state);
  const job = { ...carry.job, selection: { ...carry.job.selection, full: true } };
  const state = newState(crypto.randomUUID());
  update(key, (c) => ({ ...c, job, state }));
  const exported = await engine.exportWork(job.source, {
    project: job.project, task: job.task, operation: state.operation, includeWork: job.selection.includeWork,
    exclude: job.selection.exclude, files: job.selection.files, full: true,
  }).catch(() => null);
  if (exported) {
    state.exported = exported;
    update(key, (c) => ({ ...c, fullBytes: exported.bytes }));
  }
}

/** Cancelar: se detiene entre partes y la transferencia se borra en las dos máquinas. */
export async function stopCarry(key: string) {
  const carry = carries()[key];
  if (!carry) return;
  if (carry.progress && !carry.failure) update(key, (c) => ({ ...c, cancelled: true }));
  else setCarries(({ [key]: _, ...rest }) => rest);
  await cancelCarry(engine, carry.job, carry.state);
}

/** La copia que acaba de terminar, hasta que el envío diga qué tarea creó. */
const pending = new Map<string, CarryOrigin>();

function rememberPending(key: string, carry: Carry) {
  // Lo traído no nace en una tarea hasta que se envía el borrador de aquí.
  if (carry.check.task && !carry.ready) return;
  const from = carry.check.task ? { session: carry.check.task.id, project: carry.check.project.id, title: carry.check.task.title } : undefined;
  pending.set(key, { machine: carry.check.source, branch: carry.ready?.imported?.branch ?? carry.check.status.branch, at: Date.now(), ...(from ? { from } : {}) });
}

/** La tarea `session` nació de la copia del borrador `key`: su encabezado lo dice. */
export function adoptOrigin(key: string, session: string) {
  const origin = pending.get(key);
  if (!origin) return;
  pending.delete(key);
  rememberOrigin(session, origin);
}

/** La máquina donde vive la carpeta: la de la ventana en el escritorio. */
export function sourceOf(project: Project, windowMachine: string): string | null {
  if (!project.machines) return windowMachine;
  return project.machines.includes(windowMachine) ? windowMachine : (project.machines[0] ?? null);
}
