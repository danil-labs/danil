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
  type PlatformClient,
} from "@danil/platform-client";
import {
  connectMachine,
  type LocalHost,
  type MachineConnection,
} from "@danil/engine-client";
import type { Session, SessionSource } from "@danil/session";
import type { Machine, Operation } from "./model.ts";

export interface SessionOptions {
  session?: Session | null;
  source?: SessionSource | null;
  client?: PlatformClient;
  sessionKey?: string;
  host?: LocalHost;
}

export type SessionInput =
  | Session
  | SessionSource
  | SessionOptions
  | (() => Session | null | undefined)
  | null
  | undefined;

function createIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `idemp_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

interface ResolvedSession {
  sessionKey: string;
  source?: SessionSource;
  client?: PlatformClient;
  host?: LocalHost;
}

function isSessionSource(v: unknown): v is SessionSource {
  return typeof v === "object" && v !== null && "list" in v && typeof (v as any).list === "function";
}

function isSession(v: unknown): v is Session {
  return typeof v === "object" && v !== null && "key" in v && typeof (v as any).key === "string" && !("list" in v);
}

function resolveSession(input?: SessionInput): ResolvedSession {
  if (!input) {
    return { sessionKey: "web" };
  }
  if (typeof input === "function") {
    const s = input();
    return { sessionKey: s?.key ?? "web" };
  }
  if (typeof input === "object" && input !== null) {
    if (isSessionSource(input)) {
      const sessions = input.list();
      return { sessionKey: sessions[0]?.key ?? "web", source: input };
    }
    if (isSession(input)) {
      return { sessionKey: input.key };
    }
    const opts = input as SessionOptions;
    const s = opts.session;
    const sKey = opts.sessionKey ?? s?.key ?? "web";
    return {
      sessionKey: sKey,
      source: opts.source ?? undefined,
      client: opts.client,
      host: opts.host,
    };
  }
  return { sessionKey: "web" };
}

async function pollOperation(
  client: PlatformClient,
  operationId: string,
  timeoutMs = 60_000,
  intervalMs = 1_500,
): Promise<Operation> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const op = await client.getOperation({ id: operationId });
    const s = op.state?.toLowerCase();
    if (s === "succeeded" || s === "success" || s === "completed" || s === "done") {
      return op;
    }
    if (s === "failed" || s === "error") {
      const msg = op.error?.message ?? `Operation failed with state ${op.state}`;
      throw new Error(msg);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error("Operation timed out");
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
 * useMachines(session)
 * Consulta todas las máquinas visibles vía getMachines sin filtrar ni depender de workspace (M1, M2).
 * Refresco periódico cada 15 s (M7).
 * Encendido y apagado con sondeo de getOperation (M6).
 * Conexión que despierta la VM reintentando automáticamente (M6b).
 */
export function useMachines(session?: SessionInput): UseMachinesReturn {
  const client = usePlatform();
  const resolved = () => resolveSession(session);

  const getClient = () => resolved().client ?? client;

  const [machines, { refetch }] = createResource(
    () => resolved().sessionKey,
    async () => {
      const res = await getClient().getMachines();
      return res.items ?? [];
    },
  );

  const [operating, setOperating] = createSignal<Record<string, "starting" | "stopping">>({});
  const [connections, setConnections] = createSignal<Record<string, MachineConnection>>({});

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
    const cl = getClient();
    try {
      const op = await cl.startMachine({
        id: machineId,
        idempotencyKey: createIdempotencyKey(),
      });
      const opId = op.id ?? op.operation_id;
      let finalOp = op;
      if (opId) {
        finalOp = await pollOperation(cl, opId);
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
    const cl = getClient();
    try {
      const op = await cl.stopMachine({
        id: machineId,
        idempotencyKey: createIdempotencyKey(),
      });
      const opId = op.id ?? op.operation_id;
      let finalOp = op;
      if (opId) {
        finalOp = await pollOperation(cl, opId);
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
    const r = resolved();
    const cl = getClient();

    const conn = connectMachine({
      sessionKey: r.sessionKey,
      machine: {
        machine_id: machine.machine_id,
        kind: machine.kind,
      },
      host: r.host,
      platform: {
        requestTicket: async (_sKey, machineId) => {
          try {
            const ticketRes = await cl.createMachineTicket({
              id: machineId,
              idempotencyKey: createIdempotencyKey(),
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
          } catch (err: any) {
            if (err && (err.status === 409 || err.code === "machine_unreachable")) {
              return { kind: "machine_unreachable" };
            }
            if (err && (err.code === "stopped" || err.code === "starting")) {
              return { kind: err.code };
            }
            return {
              kind: "error",
              code: err?.code ?? "ticket_failed",
              message: err?.message,
            };
          }
        },
      },
    });

    setConnections((prev) => ({ ...prev, [machine.machine_id]: conn }));
    return conn;
  }

  function getConnection(machineId: string): MachineConnection | undefined {
    return connections()[machineId];
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
