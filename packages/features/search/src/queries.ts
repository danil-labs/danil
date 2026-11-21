/**
 * Consultas hacia el motor Danil Engine para búsqueda global.
 *
 * Único archivo de la feature que invoca directamente a @danil/engine-client.
 */

import { createResource, type Accessor, type Resource } from "solid-js";
import type { EngineClient, MachineConnection } from "@danil/engine-client";
import type { Archivadas } from "./model.ts";

/**
 * Consulta reactiva de tareas archivadas mediante el comando RPC1 `archived_tasks`.
 */
export function useArchivedTasks(
  target?: Accessor<EngineClient | MachineConnection | null | undefined> | EngineClient | MachineConnection | null | undefined,
): [Resource<Archivadas | undefined>, { refetch: () => void; mutate: (v: Archivadas | undefined) => void }] {
  const getTarget = () => (typeof target === "function" ? target() : target);
  const getClient = (): EngineClient | null => {
    const t = getTarget();
    if (!t) return null;
    if ("client" in t && t.client) return t.client;
    return t as EngineClient;
  };

  const [data, { refetch, mutate }] = createResource(getClient, async (client) => {
    const raw = await client.archived_tasks();
    return raw as unknown as Archivadas;
  });

  return [data, { refetch, mutate }];
}

/**
 * Llamada directa para cargar tareas archivadas dado un cliente del motor.
 */
export async function fetchArchivedTasks(client: EngineClient): Promise<Archivadas> {
  const raw = await client.archived_tasks();
  return raw as unknown as Archivadas;
}
