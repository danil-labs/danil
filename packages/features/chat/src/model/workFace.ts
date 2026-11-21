import { createContext } from "solid-js";

export type WorkFaceValue = { name: string; body?: string | null; avatar?: string | null };

/** La cara del agente de la tarea abierta; `null` si la tarea no tiene agente. */
export const WorkFace = createContext<() => WorkFaceValue | null>(() => null);
