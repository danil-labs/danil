/**
 * La lista de máquinas compartida (plan front-move 3.2): un `GET /v1/machines` por contexto y carga.
 * La piden la ventana web (inventario de la flota), la facturación, Cuenta › Máquinas y las pantallas de
 * Desk; todas reciben la misma lectura en curso o la de hace menos de `SHARED_READ_FRESH_MS`.
 *
 * - `list(signal, { fresh: true })` relee siempre: el inventario de la ventana, que corre cuando el estado cambió.
 * - Encender (`start`, `wake`) invalida la lista antes y después: la siguiente lectura ve el estado nuevo.
 * - `admission` y `get` pasan tal cual: un ticket es de un solo uso y nunca se comparte.
 */
import type { MachinesAnswer, Machine, machinesClient } from "../../../../platform-client/src/machines.ts";
import { sharedRead } from "../../../../platform-client/src/shared-read.ts";

type Client = ReturnType<typeof machinesClient>;
export type MachinesQuery = Omit<Client, "list"> & {
  list(signal?: AbortSignal, options?: { fresh?: boolean }): Promise<MachinesAnswer<Machine[]>>;
  invalidate(): void;
};

export function machinesQuery(client: Client): MachinesQuery {
  const listed = sharedRead(() => client.list(), { keep: (answer) => answer.kind === "ok" });
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
