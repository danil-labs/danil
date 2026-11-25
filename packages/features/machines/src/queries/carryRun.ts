/**
 * El puente: el cliente pide al origen el archivo de transferencia, lo copia
 * por partes al destino y le pide importarlo. Los motores nunca hablan entre
 * sí: el cliente hace de puente por el relay, en el escritorio, la web y el teléfono.
 *
 *   despertar el destino → clonar si falta → exportar → partes → importar
 *
 * Cada paso deja su resultado en `CarryState`: reintentar sigue desde la parte
 * que falló y no repite lo hecho.
 */
import { partAt, partsOf, type Selection } from "../model/carryPlan.ts";
import type { CarryEngine, Exported, Imported } from "../model/carryTypes.ts";

export type CarryStep = "wake" | "clone" | "copy" | "ready";

export type CarryProgress = {
  step: CarryStep;
  /** Bytes ya copiados al destino y total del archivo; 0 mientras no hay archivo. */
  sent: number;
  bytes: number;
  /** La parte en curso (desde 1) y cuántas son. */
  part: number;
  parts: number;
  clone: { phase: string; percent: number | null } | null;
};

/** Por qué se detuvo; cada código tiene su arreglo en la hoja. */
export type CarryFailure =
  | { code: "interrupted"; part: number; parts: number; cause: unknown }
  | { code: "missing_base"; cause: unknown }
  | { code: "too_large"; cause: unknown }
  | { code: "clone_failed"; cause: unknown }
  | { code: "wake_failed"; cause: unknown }
  | { code: "export_failed"; cause: unknown }
  | { code: "import_failed"; cause: unknown }
  | { code: "cancelled"; cause: null };

export class CarryError extends Error {
  readonly failure: CarryFailure;
  constructor(failure: CarryFailure) {
    super(failure.code);
    this.failure = failure;
  }
}

export type CarryJob = {
  /** Máquina con el trabajo y máquina donde nace la tarea. */
  source: string;
  target: string;
  project: string;
  /** La tarea de origen cuando lo que se lleva es su worktree. */
  task: string | null;
  selection: Selection;
  partSize: number;
  /** Al traer, la rama local que recibe el trabajo. */
  branchAs?: string | null;
  /** Sin remoto y sin el proyecto en el destino: lo crea el import desde el bundle completo. */
  create?: { name: string; id: string } | null;
  /** Sellado para el motor de destino (`work_key`); sin llave viaja en claro. */
  recipientKey?: string | null;
};

export type CarryState = {
  /** Id de cliente de `work_export`: repetirlo devuelve la misma transferencia. */
  operation: string;
  exported: Exported | null;
  /** Hasta dónde ya está escrito en el destino. */
  offset: number;
  cloned: boolean;
  imported: Imported | null;
};

export const newState = (operation: string): CarryState => ({ operation, exported: null, offset: 0, cloned: false, imported: null });

export type CarryHooks = {
  progress?: (progress: CarryProgress) => void;
  /**
   * Si el destino ya tiene el proyecto; se pregunta ya despierto. Sin él se
   * clona antes de copiar; sin la pregunta, se clona si el import lo echa en falta.
   */
  hasProject?: () => Promise<boolean>;
  /** Clona el proyecto en el destino con su avance; resuelve al terminar. */
  clone?: (progress: (phase: string, percent: number | null) => void) => Promise<void>;
  /** Se consulta entre partes: cancelar no espera a que acabe la copia. */
  cancelled?: () => boolean;
};

export type CarryResult = {
  /**
   * Con esto se crea la tarea: `send_message { baseRef, unwrapSnapshot }`.
   * `null` si no viajó nada: la tarea nace en la rama por omisión, como siempre.
   */
  baseRef: string | null;
  unwrapSnapshot: boolean;
  exported: Exported | null;
  imported: Imported | null;
};

/** Sin trabajo ni archivos elegidos solo se despierta y, si falta, se clona. */
export const carriesNothing = (s: Selection) => !s.includeWork && s.files.length === 0 && !s.full;

/** La clave `work.error.*` (o la que sea) de un error del motor, en cualquiera de sus formas. */
export function errorKey(error: unknown): string | null {
  const what = error && typeof error === "object" && "what" in error ? (error as { what: unknown }).what : error;
  if (typeof what === "string") return what;
  const clave = (what as { clave?: unknown } | null)?.clave;
  return typeof clave === "string" ? clave : null;
}

/** Bytes que lleva una cadena base64. */
export function base64Bytes(data: string): number {
  const pad = data.endsWith("==") ? 2 : data.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((data.length * 3) / 4) - pad);
}

/** Intentos por parte ante un fallo del camino, no del motor. */
export const PART_ATTEMPTS = 3;
/** Los errores con nombre de la flota que dicen «se cortó», no «está mal». */
const TRANSIENT = new Set(["machine_lost", "machine_timeout", "io"]);

/** Si un error es del camino (relay, conector), en la forma de la ventana (`detail`) o de la flota (`code`). */
export function transient(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { detail?: unknown; code?: unknown };
  return (typeof e.detail === "string" && TRANSIENT.has(e.detail)) || (typeof e.code === "string" && TRANSIENT.has(e.code));
}

function fail(failure: CarryFailure): never {
  throw new CarryError(failure);
}

/** Pide el archivo al origen, una sola vez por `operation`. Lo usa también la hoja para saber el tamaño. */
export async function prepare(engine: CarryEngine, job: CarryJob, state: CarryState): Promise<Exported> {
  if (state.exported) return state.exported;
  try {
    state.exported = await engine.exportWork(job.source, {
      project: job.project,
      task: job.task,
      operation: state.operation,
      includeWork: job.selection.includeWork,
      exclude: job.selection.exclude,
      files: job.selection.files,
      full: job.selection.full,
      ...(job.recipientKey ? { recipientKey: job.recipientKey } : {}),
    });
  } catch (cause) {
    fail({ code: errorKey(cause) === "work.error.too_large" ? "too_large" : "export_failed", cause });
  }
  return state.exported;
}

/** Lleva el trabajo de `job.source` a `job.target` y dice con qué base nace la tarea. */
export async function carryWork(engine: CarryEngine, job: CarryJob, state: CarryState, hooks: CarryHooks = {}): Promise<CarryResult> {
  const progress = (p: Partial<CarryProgress> & { step: CarryStep }) => {
    const bytes = state.exported?.bytes ?? 0;
    hooks.progress?.({ sent: state.offset, bytes, part: partAt(state.offset, job.partSize), parts: partsOf(bytes, job.partSize), clone: null, ...p });
  };
  const stop = () => {
    if (hooks.cancelled?.()) fail({ code: "cancelled", cause: null });
  };
  const clone = async () => {
    if (!hooks.clone || state.cloned) return false;
    progress({ step: "clone" });
    try {
      await hooks.clone((phase, percent) => progress({ step: "clone", clone: { phase, percent } }));
    } catch (cause) {
      fail({ code: "clone_failed", cause });
    }
    state.cloned = true;
    return true;
  };

  if (!state.imported) {
    progress({ step: "wake" });
    try {
      // Sin proyecto: el destino puede no tenerlo todavía y el proxy no sabría a cuál traducirlo.
      await engine.importWork(job.target, { transfer: "", project: "", sha256: "", bytes: 0, probe: true });
    } catch (cause) {
      fail({ code: "wake_failed", cause });
    }
    stop();
    if (hooks.hasProject && !(await hooks.hasProject().catch(() => true))) await clone();
    stop();
    if (carriesNothing(job.selection)) {
      progress({ step: "ready" });
      return { baseRef: null, unwrapSnapshot: false, exported: null, imported: null };
    }

    progress({ step: "copy" });
    const exported = await prepare(engine, job, state);
    let attempts = 0;
    while (state.offset < exported.bytes) {
      stop();
      progress({ step: "copy" });
      try {
        const part = await engine.readPart(job.source, { transfer: exported.transfer, offset: state.offset, size: job.partSize });
        const size = base64Bytes(part.data);
        if (size === 0 && !part.eof) throw new Error("empty_part");
        await engine.writePart(job.target, { transfer: exported.transfer, offset: state.offset, data: part.data });
        state.offset = part.eof ? exported.bytes : state.offset + size;
        attempts = 0;
      } catch (cause) {
        // El relay perdió el conector o la parte no llegó a tiempo: se repite esa
        // misma parte (idempotente por `offset`) antes de pedirle a la persona.
        if (transient(cause) && ++attempts < PART_ATTEMPTS) continue;
        fail({ code: "interrupted", part: partAt(state.offset, job.partSize), parts: partsOf(exported.bytes, job.partSize), cause });
      }
    }
    progress({ step: "copy" });

    const args = { transfer: exported.transfer, project: job.project, sha256: exported.sha256, bytes: exported.bytes, ...(job.branchAs ? { branchAs: job.branchAs } : {}), ...(job.create ? { create: job.create } : {}) };
    for (;;) {
      stop();
      try {
        state.imported = await engine.importWork(job.target, args);
        break;
      } catch (cause) {
        const key = errorKey(cause);
        if (key === "work.error.project_missing" && (await clone())) continue;
        fail({ code: key === "work.error.missing_base" ? "missing_base" : "import_failed", cause });
      }
    }
  }
  progress({ step: "ready" });
  const imported = state.imported as Imported;
  return { baseRef: imported.base, unwrapSnapshot: imported.snapshot || imported.files.length > 0, exported: state.exported, imported };
}

/** Borra la transferencia en las dos máquinas. No lanza: lo que no se borre lo limpia el motor en una hora. */
export async function cancelCarry(engine: CarryEngine, job: Pick<CarryJob, "source" | "target">, state: CarryState): Promise<void> {
  const transfer = state.exported?.transfer;
  if (!transfer) return;
  await Promise.all([
    engine.cancel(job.source, { transfer }).catch(() => {}),
    engine.cancel(job.target, { transfer }).catch(() => {}),
  ]);
}
