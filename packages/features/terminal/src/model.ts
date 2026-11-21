import type { EngineClient } from "@danil/engine-client";

export type ShellRunParams = Parameters<EngineClient["run_shell_command"]>[0];
export type ShellWriteParams = Parameters<EngineClient["write_shell_input"]>[0];
export type ShellStopParams = Parameters<EngineClient["stop_shell_command"]>[0];
export type ShellCloseParams = Parameters<EngineClient["close_process"]>[0];

export type ShellStatus = "idle" | "starting" | "running" | "done" | "error";

export interface ShellState {
  status: ShellStatus;
  output: string;
  error: string | null;
  isPtyReady: boolean;
  pid: number | null;
  bufferedCount: number;
}
