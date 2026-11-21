import {
  createResource,
  createSignal,
  onCleanup,
  onMount,
  type Accessor,
  type Resource,
} from "solid-js";
import {
  usePlatform,
  isClientError,
  idempotencyKey,
  backoffDelay,
  type PlatformClient,
} from "@danil/platform-client";
import {
  connectMachine,
  type LocalHost,
  type MachineConnection,
} from "@danil/engine-client";
import { useSession } from "@danil/session/solid";
import { host } from "@danil/host";
import type { Machine, Operation } from "./model.ts";

/**
 * Ordena máquinas de forma determinista (M1, 6.1) sin violar R5:
 * 1. Agrupadas por organization_id.
 * 2. Agrupadas por kind.
 * 3. Alfabéticamente por nombre o machine_id.
 */
export function sortMachines(machines: Machine[]): Machine[] {
  return [...machines].sort((a, b) => {
    const orgA = a.organization_id ?? "";
    const orgB = b.organization_id ?? "";
    if (orgA !== orgB) {
      return orgA.localeCompare(orgB);
    }

    const kindA = a.kind ?? "";
    const kindB = b.kind ?? "";
    if (kindA !== kindB) {
      return kindA.localeCompare(kindB);
    }

    const nameA = a.name?.trim() || a.machine_id;
    const nameB = b.name?.trim() || b.machine_id;
    return nameA.localeCompare(nameB);
  });
}

/**
 * Agrupa máquinas por organización para vistas que requieran secciones DS1 v2.
 */
export function groupMachinesByOrg(machines: Machine[]): Map<string, Machine[]> {
  const map = new Map<string, Machine[]>();
  for (const m of sortMachines(machines)) {
    const key = m.organization_id || m.kind || "default";
    const list = map.get(key) || [];
    list.push(m);
    map.set(key, list);
  }
  return map;
}

async function pollOperation(
  client: PlatformClient,
  operationId: string,
  signal?: AbortSignal,
): Promise<Operation> {
  let attempt = 0;
  // Tope total: encender una VM tarda minutos, no horas (SR2, N4). Después, error con reintento.
  const deadline = Date.now() + 15 * 60_000;
  while (!signal?.aborted) {
    if (Date.now() > deadline) throw new Error("operation_timeout");
    const op = await client.getOperation({ id: operationId }, { signal });
    if (op.state === "succeeded") {
      return op;
    }
    if (op.state === "failed") {
      const msg = op.error?.message ?? `Operation failed with state ${op.state}`;
      throw new Error(msg);
    }
    const delay = backoffDelay(attempt++, 1000, 5000);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, delay);
      if (signal) {
        signal.addEventListener(
          "abort",
          () => {
            clearTimeout(timer);
            reject(new DOMException("Aborted", "AbortError"));
          },
          { once: true },
        );
      }
    });
  }
  throw new DOMException("Aborted", "AbortError");
}

export interface UseMachinesReturn {
  machines: Resource<Machine[]>;
  loading: Accessor<boolean>;
  error: Accessor<unknown>;
  refetch: () => Promise<Machine[] | undefined>;
  start: (machineId: string) => Promise<Operation>;
  stop: (machineId: string) => Promise<Operation>;
  connect: (machine: Machine) => MachineConnection;
  getConnection: (machineId: string) => MachineConnection | undefined;
  operating: Accessor<Record<string, "starting" | "stopping">>;
}

/**
 * useMachines()
 * Consulta todas las máquinas visibles vía getMachines sin filtrar ni depender de workspace (M1, M2).
 * Refresco periódico cada 15 s (M7).
 * Encendido y apagado con sondeo de getOperation con signal y backoff (RV1 #29, RV2 #13).
 * Conexión que pasa host a connectMachine para Desk local (RV1 #10) y reutiliza caché (RV1 #30).
 */
export function useMachines(): UseMachinesReturn {
  const client = usePlatform();
  const session = useSession();
  const sessionKey = () => session.active() ?? session.sessions()[0]?.key ?? "";

  const abortController = new AbortController();
  onCleanup(() => {
    abortController.abort();
  });

  const [machines, { refetch }] = createResource(
    () => sessionKey(),
    async () => {
      const res = await client.getMachines();
      return sortMachines(res.items ?? []);
    },
  );

  const [operating, setOperating] = createSignal<Record<string, "starting" | "stopping">>({});

  onMount(() => {
    const timer = setInterval(() => {
      void refetch();
    }, 15_000);

    onCleanup(() => {
      clearInterval(timer);
    });
  });

  async function start(machineId: string): Promise<Operation> {
    setOperating((prev) => ({ ...prev, [machineId]: "starting" }));
    try {
      const op = await client.startMachine(
        {
          id: machineId,
          idempotencyKey: idempotencyKey(),
        },
        { signal: abortController.signal },
      );
      const opId = op.id ?? op.operation_id;
      let finalOp = op;
      if (opId) {
        finalOp = await pollOperation(client, opId, abortController.signal);
      }
      await refetch();
      return finalOp;
    } finally {
      setOperating((prev) => {
        const next = { ...prev };
        delete next[machineId];
        return next;
      });
    }
  }

  async function stop(machineId: string): Promise<Operation> {
    setOperating((prev) => ({ ...prev, [machineId]: "stopping" }));
    try {
      const op = await client.stopMachine(
        {
          id: machineId,
          idempotencyKey: idempotencyKey(),
        },
        { signal: abortController.signal },
      );
      const opId = op.id ?? op.operation_id;
      let finalOp = op;
      if (opId) {
        finalOp = await pollOperation(client, opId, abortController.signal);
      }
      await refetch();
      return finalOp;
    } finally {
      setOperating((prev) => {
        const next = { ...prev };
        delete next[machineId];
        return next;
      });
    }
  }

  function connect(machine: Machine): MachineConnection {
    const sKey = sessionKey();

    return connectMachine({
      sessionKey: sKey,
      machine: {
        machine_id: machine.machine_id,
        kind: machine.kind,
      },
      host,
      platform: {
        requestTicket: async (_sKey, machineId) => {
          try {
            const ticketRes = await client.createMachineTicket({
              id: machineId,
              idempotencyKey: idempotencyKey(),
            });
            if (ticketRes.ticket && ticketRes.url) {
              return {
                kind: "ok",
                ticket: {
                  ticket: ticketRes.ticket,
                  url: ticketRes.url,
                  expires_at: ticketRes.expires_at !== undefined ? String(ticketRes.expires_at) : undefined,
                },
              };
            }
            return {
              kind: "error",
              code: "invalid_ticket_response",
              message: "Missing ticket or admission url",
            };
          } catch (err: unknown) {
            if (isClientError(err)) {
              if (err.kind === "unauthorized" || err.kind === "forbidden") {
                return {
                  kind: "error",
                  code: err.kind,
                  message: err.kind,
                };
              }
              if (err.kind === "unavailable") {
                return {
                  kind: "error",
                  code: "unavailable",
                  message: "Plataforma no disponible",
                };
              }
              if (err.kind === "error") {
                if (err.code === "machine_unreachable" || err.code === "stopped") {
                  return { kind: "machine_unreachable" };
                }
                if (err.code === "starting") {
                  return { kind: "starting" };
                }
                return {
                  kind: "error",
                  code: err.code || "ticket_failed",
                  message: err.message,
                };
              }
            }
            const message = err instanceof Error ? err.message : String(err);
            return {
              kind: "error",
              code: "ticket_failed",
              message,
            };
          }
        },
      },
    });
  }

  function getConnection(machineId: string): MachineConnection | undefined {
    const list = machines();
    const machine = list?.find((m) => m.machine_id === machineId);
    if (!machine) return undefined;
    return connect(machine);
  }

  const handleRefetch = async (): Promise<Machine[] | undefined> => {
    const res = await refetch();
    return res ?? undefined;
  };

  return {
    machines,
    loading: () => machines.loading,
    error: () => machines.error,
    refetch: handleRefetch,
    start,
    stop,
    connect,
    getConnection,
    operating,
  };
}
