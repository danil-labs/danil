import type { MachineTaskUsage } from "@terminus/protocol";
import { t } from "../../../../apps/desktop/src/lib/i18n";
import { cn } from "../../../../apps/desktop/src/lib/utils";

/** El título y la carpeta de una tarea de la ventana, si se conocen. */
export type TaskLookup = (session: string) => { title: string; project?: string } | undefined;

/** Cuándo, con días si pasó más de uno: `haceCuanto` se queda en horas. */
export type When = (ms: number) => string;

export const NOTE = "mt-2 rounded-md px-2 py-1.5 text-caption";
export const NOTE_INFO = cn(NOTE, "bg-surface-muted text-neutral-500");
export const SEG_TASKS = "bg-neutral-500";
export const SEG_ENGINE = "bg-info-strong";
export const SEG_OTHER = "bg-neutral-500/35";

export function taskTitle(task: Pick<MachineTaskUsage, "session" | "title">, lookup: TaskLookup) {
  return task.title ?? lookup(task.session)?.title ?? t("shell.machine_panel.task.unknown", { id: task.session.slice(0, 8) });
}

export function Metric(props: { label: string; why?: string; value?: string; children: unknown }) {
  return (
    <span class="mt-2 grid grid-cols-[4.5rem_minmax(0,1fr)_auto] items-center gap-2">
      <span class="text-caption text-neutral-500" title={props.why}>{props.label}</span>
      <span class="flex min-w-0 items-center gap-2.5">{props.children as never}</span>
      <span class="whitespace-nowrap font-mono text-caption tabular-nums text-neutral-950">{props.value}</span>
    </span>
  );
}
