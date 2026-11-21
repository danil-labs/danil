import { createSignal, untrack, type Accessor } from "solid-js";
import { createEngineClient, type EngineClient } from "./generated/client.ts";
import { createLocalTransport, type LocalHost } from "./transports/local.ts";
import { createRelayTransport, type RelayOptions } from "./transports/relay.ts";
import type { ConnectionStatus, StatefulTransport } from "./transports/types.ts";

export interface MachineRef {
  machine_id: string;
  /** "local" = el motor de esta computadora (solo Desk). */
  kind?: string;
}

export interface ConnectOptions {
  sessionKey: string;
  machine: MachineRef;
  /** Presente solo en Desk. */
  host?: LocalHost;
  platform: { requestTicket: RelayOptions["requestTicket"] } & Partial<Omit<RelayOptions, "sessionKey" | "machineId" | "requestTicket">>;
  /** true solo por una acción de la persona (Conectar, Encender): permite despertar la VM. */
  wake?: boolean;
}

export interface MachineConnection {
  client: EngineClient;
  status: Accessor<ConnectionStatus>;
  close(): void;
}

const cache = new Map<string, MachineConnection>();

/** El ÚNICO lugar del front que distingue local de relay (R5). */
export function connectMachine(opts: ConnectOptions): MachineConnection {
  const key = `${opts.sessionKey}\u0000${opts.machine.machine_id}`;
  const hit = cache.get(key);
  // Una conexión en error (ticket 401/403, VM que no despertó) no se reusa: tras volver a
  // iniciar sesión o reintentar, se abre otra.
  // `untrack`: quien llama desde un memo no queda suscrito al estado (si no, cada cambio de
  // estado reabriría la conexión: RV1b N1).
  // Una conexión en `stopped` sí se reabre si ahora la persona pide despertar.
  const reusable = hit && untrack(hit.status) !== "error" && !(opts.wake && untrack(hit.status) === "stopped");
  if (reusable) return hit;
  if (hit) hit.close();

  // Lo local lo declara el host (Desk sabe qué máquina es esta computadora); la UI no (R5).
  const isLocal = opts.host?.isLocal?.(opts.machine.machine_id) === true;
  const transport: StatefulTransport = isLocal
    ? createLocalTransport(opts.host!)
    : createRelayTransport({
        ...opts.platform,
        sessionKey: opts.sessionKey,
        machineId: opts.machine.machine_id,
        wake: opts.wake === true,
      });

  const [status, setStatus] = createSignal<ConnectionStatus>(transport.status());
  transport.onStatus(setStatus);
  const conn: MachineConnection = {
    client: createEngineClient(transport),
    status,
    close() {
      cache.delete(key);
      transport.close();
    },
  };
  cache.set(key, conn);
  return conn;
}
