import { invoke } from "../../../../engine-client/src/client.ts";
import type { Turn } from "../model/transcript.ts";

// Lo que falla en el camino a la ventana y no en el comando: se vuelve a
// preguntar en vez de pintarlo (`cli/service/mod.rs`, `para_la_ventana`).
export const TRANSPORTE = new Set([
  "shell.service.unreachable",
  "shell.service.busy",
  "shell.service.version",
]);

/** Un turno que sigue contestando, tal como lo cuenta `turn::list_live_turns`. */
export type TerminalLanzada = {
  project: string;
  provider: string;
  model: string | null;
  effort: string | null;
  permission_mode: string | null;
};

/** Lo que devuelve `run_shell_command`: el turno y la tarea donde corrió. */
export type Corrida = { session: string; turn: Turn };

/** Un `!` escrito sin tarea, hasta que Rust dice cuál abrió. */
export type ComandoQueNace = {
  lanzado: TerminalLanzada;
  provisional: string;
  titulo: string;
  claveBorrador: string;
  generation: number;
  session: string | null;
  recordSpace?: (taskId: string) => void;
};

export type LiveTurn = {
  session: string;
  workspace: string;
  project: string;
  started_at: number;
  /** El agente ya contestó y el turno solo sigue abierto por una hija. */
  background?: boolean;
  /** Lo que ocupa la tarea es un `!` y no el agente. */
  shell?: { id: string; command: string };
};

export type SleepSessionDeps = { machineOf: (session: string | null | undefined) => { headers: { "x-terminus-machine": string } } | undefined; };

// Sin botón todavía: expone `sleep_session` para el gesto «Dormir» que la
// pantalla aún no ofrece.
/** Movido tal cual de packages/shell/src/app/App.tsx (líneas 341–345, tarea 2.5); `machineOf` es de machines y llega por `deps` (R3). */
export function createSleepSession(deps: SleepSessionDeps) {
  const { machineOf } = deps;
  async function sleepSession(project: string, session: string) {
    await invoke<void>("sleep_session", { project, session }, machineOf(session));
  }
  return { sleepSession };
}
