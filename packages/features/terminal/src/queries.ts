import { createSignal, createEffect, onCleanup, type Accessor } from "solid-js";
import type { MachineConnection, EngineClient } from "@danil/engine-client";
import type { ShellStatus } from "./model.ts";

export type ShellConnection =
  | MachineConnection
  | (() => MachineConnection | undefined);

export interface UseShellOptions {
  sessionId?: string;
  command?: string;
  project?: string;
  autoStart?: boolean;
}

export const MAX_OUTPUT_LINES = 2000;

function appendBoundedOutput(prev: string, next: string, maxLines = MAX_OUTPUT_LINES): string {
  const combined = prev + next;
  const newlineCount = (combined.match(/\n/g) || []).length;
  if (newlineCount <= maxLines) {
    return combined;
  }
  const lines = combined.split("\n");
  return lines.slice(-maxLines).join("\n");
}

export interface UseShellReturn {
  output: Accessor<string>;
  status: Accessor<ShellStatus>;
  error: Accessor<string | null>;
  isPtyReady: Accessor<boolean>;
  pid: Accessor<number | null>;
  bufferedCount: Accessor<number>;
  run: (commandToRun?: string) => Promise<void>;
  write: (input: string) => Promise<void>;
  stop: () => Promise<void>;
  retry: () => Promise<void>;
  clear: () => void;
}

function resolveClient(conn: ShellConnection): EngineClient | undefined {
  const resolved = typeof conn === "function" ? conn() : conn;
  if (!resolved) return undefined;
  if ("client" in resolved) return resolved.client;
  return resolved as unknown as EngineClient;
}

function generateSessionId(): string {
  return "term-" + Math.random().toString(36).slice(2, 10);
}

/**
 * Hook para gestionar el ciclo de vida de un shell en el motor Danil.
 * Cumple con B-017 reteniendo en buffer las pulsaciones de stdin
 * hasta que el pty remoto confirma que está listo (shell_started).
 */
export function useShell(
  conn: ShellConnection,
  options?: UseShellOptions
): UseShellReturn {
  const [output, setOutput] = createSignal("");
  const [status, setStatus] = createSignal<ShellStatus>("idle");
  const [error, setError] = createSignal<string | null>(null);
  const [isPtyReady, setIsPtyReady] = createSignal(false);
  const [pid, setPid] = createSignal<number | null>(null);
  const [bufferedCount, setBufferedCount] = createSignal(0);

  const sessionId = options?.sessionId ?? generateSessionId();
  let lastCommand = options?.command ?? "";
  const stdinBuffer: string[] = [];
  let unsubscribe: (() => void) | null = null;
  let isFlushing = false;

  const flushStdinBuffer = async (client: EngineClient) => {
    if (isFlushing || stdinBuffer.length === 0) return;
    isFlushing = true;
    try {
      while (stdinBuffer.length > 0) {
        const item = stdinBuffer[0];
        try {
          await client.write_shell_input({
            session: sessionId,
            input: item,
          });
          stdinBuffer.shift();
          setBufferedCount(stdinBuffer.length);
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          setError(message);
          setStatus("error");
          break;
        }
      }
    } finally {
      isFlushing = false;
    }
  };

  const setupSubscription = (client: EngineClient) => {
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }

    unsubscribe = client.subscribe("chat", (payload: unknown) => {
      if (!payload || typeof payload !== "object") return;
      const event = payload as Record<string, unknown>;
      const eventSession = event.session ?? event.sessionId ?? event.session_id;
      if (eventSession && eventSession !== sessionId) {
        return;
      }
      const kind = event.type ?? event.subtype ?? event.event ?? event.kind;

      if (kind === "shell_started") {
        setIsPtyReady(true);
        setStatus("running");
        const foundPid = event.pid ?? event.process_id;
        if (typeof foundPid === "number") {
          setPid(foundPid);
        }
        void flushStdinBuffer(client);
      } else if (kind === "shell_output") {
        const raw = event.chunk ?? event.output ?? event.text ?? event.data ?? event.bytes ?? "";
        const text =
          typeof raw === "string"
            ? raw
            : raw instanceof Uint8Array
            ? new TextDecoder().decode(raw)
            : String(raw);
        if (text) {
          setOutput((prev) => appendBoundedOutput(prev, text));
        }
      } else if (kind === "shell_done") {
        setStatus("done");
        setIsPtyReady(false);
      }
    });
  };

  const run = async (commandToRun?: string): Promise<void> => {
    const client = resolveClient(conn);
    if (!client) {
      setError("No hay conexión con el motor");
      setStatus("error");
      return;
    }

    const cmd = commandToRun ?? lastCommand;
    lastCommand = cmd;
    setError(null);
    setStatus("starting");
    setIsPtyReady(false);

    setupSubscription(client);

    try {
      const res = (await client.run_shell_command({
        session: sessionId,
        command: cmd,
        project: options?.project ?? "",
      })) as Record<string, unknown> | undefined;

      if (res) {
        const foundPid = res.process_id ?? res.pid;
        if (typeof foundPid === "number") {
          setPid(foundPid);
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setStatus("error");
      setIsPtyReady(false);
    }
  };

  const write = async (input: string): Promise<void> => {
    stdinBuffer.push(input);
    setBufferedCount(stdinBuffer.length);

    if (!isPtyReady()) {
      // B-017: retiene pulsaciones en buffer hasta que el pty esté listo
      return;
    }

    const client = resolveClient(conn);
    if (!client) return;

    await flushStdinBuffer(client);
  };

  const stop = async (): Promise<void> => {
    const client = resolveClient(conn);
    if (!client) return;

    try {
      await client.stop_shell_command({ session: sessionId });
      setStatus("done");
      setIsPtyReady(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setStatus("error");
    }
  };

  const retry = async (): Promise<void> => {
    const client = resolveClient(conn);
    if (client && isPtyReady() && stdinBuffer.length > 0) {
      setError(null);
      setStatus("running");
      await flushStdinBuffer(client);
      return;
    }
    await run(lastCommand);
  };

  const clear = () => {
    setOutput("");
  };

  createEffect(() => {
    const client = resolveClient(conn);
    if (client && options?.autoStart !== false && status() === "idle") {
      void run();
    }
  });

  onCleanup(() => {
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
    const client = resolveClient(conn);
    const currentPid = pid();
    if (client && currentPid != null) {
      client.close_process({ session: sessionId, pid: currentPid }).catch(() => {});
    }
  });

  return {
    output,
    status,
    error,
    isPtyReady,
    pid,
    bufferedCount,
    run,
    write,
    stop,
    retry,
    clear,
  };
}
