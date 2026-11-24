import type { CarryFailure, CarryJob, CarryProgress, CarryResult, CarryState } from "../../../features/machines/src/queries/carryRun.ts";
import type { WorkStatus } from "../../../features/machines/src/model/carryTypes.ts";
import type { Project } from "./model";

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
