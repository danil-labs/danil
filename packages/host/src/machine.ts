import { capabilities } from "./platform.ts";

/** La máquina de la fila de una tarea del riel; la registra `App.tsx`, que es quien tiene las filas. */
let taskRowMachine: (id: string) => string | null | undefined = () => null;

export function setTaskRowMachine(lookup: (id: string) => string | null | undefined) {
  taskRowMachine = lookup;
}

/**
 * Las opciones de una orden sobre algo con id de panel (una tarea, un space, una
 * cuenta de IA): en la máquina que lo guarda. De una tarea manda su fila; si aún
 * no la hay, su prefijo.
 */
export function machineOf(id: string | null | undefined) {
  // En la web no hay motor local: sin fila ni prefijo, lo que pide la pantalla (una cuenta de IA, por ejemplo)
  // va a la máquina de la ventana (la VM de la nube), no a un «local» que no existe.
  const web = !capabilities().nativeWindow;
  const machine = id ? (taskRowMachine(id) ?? capabilities().taskMachine?.(id) ?? (web ? capabilities().windowMachine?.()?.id : null) ?? null) : null;
  return machine ? { headers: { "x-terminus-machine": machine } } : undefined;
}

export type MachineListEntry = { id: string; local?: boolean; features?: string[] };
export type LocalMachineEntry = { local?: boolean; features?: unknown };

/** Devuelve la entrada local dentro de una lista de máquinas (`machine_list`). */
export function findLocalMachine<T extends { local?: boolean }>(machines: readonly T[]): T | undefined {
  return machines.find((m) => m.local);
}

/** Indica si la máquina corresponde a la computadora local de esta ventana. */
export const isOwnMachine = (machine: { local?: boolean } | null | undefined): boolean => Boolean(machine?.local);
