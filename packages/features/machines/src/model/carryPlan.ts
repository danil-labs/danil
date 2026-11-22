/**
 * Qué viaja y cuánto cuesta: reglas puras que comparten la hoja de la ventana,
 * la web y el teléfono (diseño «Llevar y traer trabajo entre máquinas», D1 y D2).
 */
import type { WorkStatus } from "./carryTypes.ts";

const MIB = 1024 * 1024;

/** Partes de 512 KiB: todo cliente va por el relay y cada parte es una llamada corta. */
export const PART_RELAY = 512 * 1024;
/** Arriba de esto la hoja avisa (D1). */
export const WARN_BYTES = 100 * MIB;
/** Arriba de esto no se lleva: el motor contesta `work.error.too_large` (D1). */
export const MAX_BYTES = 1024 * MIB;
/** Un archivo ignorado de más de esto no se puede elegir. */
export const IGNORED_MAX = MIB;
/** Los archivos nuevos de más de esto salen desmarcados (D2). */
export const LARGE_NEW = 10 * MIB;

/** Lo que la persona eligió en la hoja; con ello se pide `work_export`. */
export type Selection = {
  /** Llevar los commits sin push y los cambios sin commit. */
  includeWork: boolean;
  /** Archivos ignorados que viajan. */
  files: string[];
  /** Archivos nuevos que no viajan aunque `includeWork` sea cierto. */
  exclude: string[];
  /** El bundle con toda la historia: sin remoto, o si al destino le falta la base. */
  full: boolean;
};

export const hasWork = (s: WorkStatus) => s.ahead > 0 || s.changed > 0 || s.untracked > 0;

/** Un ignorado de más de 1 MiB no se elige: suele ser generado. */
export const choosable = (file: { bytes: number }) => file.bytes <= IGNORED_MAX;

/** La selección con la que abre la hoja: los `.env*` marcados y los nuevos grandes fuera. */
export function initialSelection(s: WorkStatus): Selection {
  return {
    includeWork: hasWork(s),
    files: s.ignored.filter((f) => f.suggested && choosable(f)).map((f) => f.path),
    exclude: s.largeUntracked.map((f) => f.path),
    full: !s.remoteBase,
  };
}

/**
 * Si al enviar hace falta la hoja. Sin hoja se manda como siempre: el destino
 * ya tiene el proyecto y en el origen no hay nada sin subir.
 */
export function needsSheet(s: WorkStatus | null, targetHasProject: boolean): boolean {
  if (!s) return !targetHasProject;
  return !targetHasProject || hasWork(s);
}

export type SizeVerdict = "ok" | "warn" | "block";

export function sizeVerdict(bytes: number): SizeVerdict {
  if (bytes > MAX_BYTES) return "block";
  return bytes > WARN_BYTES ? "warn" : "ok";
}

/** Cuántas partes hacen `bytes`; siempre al menos una. */
export const partsOf = (bytes: number, size: number) => Math.max(1, Math.ceil(bytes / size));

/** La parte (desde 1) en la que va `offset`. */
export const partAt = (offset: number, size: number) => Math.floor(offset / size) + 1;

/**
 * Segundos estimados para copiar `bytes` a `bytesPerSecond`, redondeados hacia
 * arriba y nunca cero: la hoja dice «unos N s», no «0 s».
 */
export const etaSeconds = (bytes: number, bytesPerSecond: number) =>
  Math.max(1, Math.ceil(bytes / Math.max(1, bytesPerSecond)));

/** `takenAt` en milisegundos, venga en segundos o en milisegundos. */
export const takenAtMs = (s: Pick<WorkStatus, "takenAt">) => (s.takenAt < 1e12 ? s.takenAt * 1000 : s.takenAt);

/** Al traer no se marca ningún ignorado: en la otra máquina suelen ser generados. */
export const bringSelection = (s: WorkStatus): Selection => ({ ...initialSelection(s), files: [] });

/** La rama local que recibe lo traído: la de la tarea o, sin rama, una con el nombre de la máquina. */
export function bringBranch(s: Pick<WorkStatus, "branch" | "head">, machine: string): string {
  if (s.branch) return s.branch;
  const slug = machine.toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "machine";
  return `terminus/${slug}-${s.head.slice(0, 7)}`;
}

/** Sin remoto el destino no puede clonar: el trabajo viaja entero y el import crea el proyecto. */
export const withoutRemote = (s: Pick<WorkStatus, "remoteUrl">, projectRemote?: string | null) => !s.remoteUrl && !projectRemote;

/**
 * TOFU: la primera llave de una máquina se fija; si después cambia, la persona
 * decide si confía. Un relay que cambiara la llave por la suya se nota aquí.
 */
export function keyVerdict(pinned: string | null | undefined, key: string): "new" | "same" | "changed" {
  if (!pinned) return "new";
  return pinned === key ? "same" : "changed";
}
