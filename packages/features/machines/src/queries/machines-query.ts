/**
 * La lista de máquinas compartida (plan front-move 3.2): un `GET /v1/machines` por contexto y carga.
 * La piden la ventana web (inventario de la flota), la facturación, Cuenta › Máquinas y las pantallas de
 * Desk; todas reciben la misma lectura en curso o la de hace menos de `SHARED_READ_FRESH_MS`.
 *
 * - `list(signal, { fresh: true })` relee: el inventario de la ventana, que corre cuando el estado cambió. Si
 *   llega menos de `MACHINES_SETTLE_MS` después de la lectura anterior, recibe esa: el cambio es el eco de lo que
 *   esa lectura mostró (front-req-1: la VM apagada contesta 409 al ticket, la flota la marca `off` y la ventana
 *   vuelve a pedir la lista que ya decía `stopped`). Encender invalida, así que tras `start`/`wake` sí se relee.
 * - Encender (`start`, `wake`) invalida la lista antes y después: la siguiente lectura ve el estado nuevo.
 * - `admission` y `get` pasan tal cual: un ticket es de un solo uso y nunca se comparte.
 */
import type { Machine, machinesClient } from "../../../../platform-client/src/machines.ts";
import type { MachinesAnswer } from "../../../../platform-client/src/machines-config.ts";
import { sharedRead } from "../../../../platform-client/src/shared-read.ts";

type Client = ReturnType<typeof machinesClient>;
export type MachinesQuery = Omit<Client, "list"> & {
  list(signal?: AbortSignal, options?: { fresh?: boolean }): Promise<MachinesAnswer<Machine[]>>;
  invalidate(): void;
};

/** Lo que tarda el arranque en contestar los tickets de la primera lista (CSRF y POST): su eco no es un cambio. */
const MACHINES_SETTLE_MS = 2_000;

export function machinesQuery(client: Client): MachinesQuery {
  const listed = sharedRead(() => client.list(), { keep: (answer) => answer.kind === "ok", settleMs: MACHINES_SETTLE_MS });
  const powering = <T>(run: () => Promise<T>) => {
    listed.invalidate();
    return run().finally(listed.invalidate);
  };
  return {
    ...client,
    list: (signal, options) => listed.read({ ...options, signal }),
    start: (id) => powering(() => client.start(id)),
    wake: (id) => powering(() => client.wake(id)),
    invalidate: listed.invalidate,
  };
}

/** Un cliente por contexto (`X-Danil-Session`), cada uno con su lista compartida. */
export function contextMachinesQuery(factory: (context: string) => Client) {
  const queries = new Map<string, MachinesQuery>();
  return (context: string): MachinesQuery => {
    let found = queries.get(context);
    if (!found) { found = machinesQuery(factory(context)); queries.set(context, found); }
    return found;
  };
}
