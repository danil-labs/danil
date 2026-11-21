import { createSignal, type Accessor } from "solid-js";
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
  if (hit) return hit;

  const isLocal = opts.machine.kind === "local" && opts.host !== undefined;
  const transport: StatefulTransport = isLocal
    ? createLocalTransport(opts.host!)
    : createRelayTransport({
        ...opts.platform,
        sessionKey: opts.sessionKey,
        machineId: opts.machine.machine_id,
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
