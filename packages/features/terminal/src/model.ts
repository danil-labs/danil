import type { EngineClient } from "@danil/engine-client";

export type ShellRunParams = Parameters<EngineClient["run_shell_command"]>[0];
export type ShellWriteParams = Parameters<EngineClient["write_shell_input"]>[0];
export type ShellStopParams = Parameters<EngineClient["stop_shell_command"]>[0];
export type ShellCloseParams = Parameters<EngineClient["close_process"]>[0];

export type ShellStatus = "idle" | "starting" | "running" | "done" | "error";

export interface ShellStreamEvent {
  session: string;
  kind: "shell_started" | "shell_output" | "shell_done" | string;
  text?: string;
  pid?: number;
}

export function parseShellEvent(payload: unknown): ShellStreamEvent | null {
  if (!payload || typeof payload !== "object") return null;
  const ev = payload as Record<string, unknown>;
  if (typeof ev.session !== "string" || typeof ev.kind !== "string") {
    return null;
  }
  return {
    session: ev.session,
    kind: ev.kind,
    text: typeof ev.text === "string" ? ev.text : undefined,
    pid: typeof ev.pid === "number" ? ev.pid : undefined,
  };
}

export interface ShellState {
  status: ShellStatus;
  output: string;
  error: string | null;
  isPtyReady: boolean;
  pid: number | null;
  bufferedCount: number;
}
