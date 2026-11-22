/** Registros de mantenimiento: no tienen identidad ni ciclo de vida de tarea. */
export type ActivityState = "running" | "success" | "failure" | "interrupted";
export type ActivityRow = {
  id: string;
  project: string;
  title: string;
  state: ActivityState;
  created_at: number;
  updated_at: number;
  steps: number;
};
export type ActivityStep = {
  id: string;
  command: string;
  cwd: string;
  state: ActivityState;
  started_at: number;
  ended_at: number | null;
  exit_code: number | null;
  error: string | null;
};
export type Activity = Omit<ActivityRow, "steps"> & { steps: ActivityStep[] };
export type ActivityLog = { text: string; next_offset: number; bytes: number; has_more: boolean };
export type ActivityEvent = { workspace: string; id: string; title: string; state: ActivityState; machine?: string };
