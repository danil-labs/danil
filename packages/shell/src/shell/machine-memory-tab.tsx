import type { MachineResources, MachineTaskUsage } from "../../../engine-client/src/index.ts";
import { For, Show, createSignal } from "solid-js";
import { t } from "../../../../apps/desktop/src/lib/i18n";
import { peso } from "../../../../apps/desktop/src/lib/format";
import { cn } from "../../../../apps/desktop/src/lib/utils";
import { Badge } from "../../../ui/src/Badge";
import { ProgressBar } from "../../../ui/src/ProgressBar";
import { active, engineVersion, hasUsage, history, leftovers, level, split, topProcesses } from "./machineUsage";
import { Pressable } from "../../../ui/src/Pressable";
import { Metric, NOTE_INFO, SEG_ENGINE, SEG_OTHER, SEG_TASKS, taskTitle, type TaskLookup, type When } from "./machine-card-parts";

/** Las barritas de los últimos 10 minutos: la presión de memoria, una por minuto. */
function PressureBars(props: { values: number[]; tone: string }) {
  return (
    <span class="flex h-4 shrink-0 items-end gap-[3px]" aria-hidden>
      <For each={props.values}>
        {(v) => <i class={cn("block w-1 rounded-[1px]", props.tone)} style={{ height: `${Math.round(3 + Math.min(1, Math.max(0.04, v / 45)) * 13)}px` }} />}
      </For>
    </span>
  );
}

function TaskRow(props: {
  task: MachineTaskUsage;
  scale: number;
  lookup: TaskLookup;
  when: When;
  left?: boolean;
  canStop?: boolean;
  stopping?: boolean;
  onStop?: () => void;
}) {
  const [open, setOpen] = createSignal(false);
  const title = () => taskTitle(props.task, props.lookup);
  const project = () => props.task.project ?? props.lookup(props.task.session)?.project;
  const ended = () => !props.task.ended_at
    ? t("shell.machine_panel.leftover.finished")
    : props.task.archived
      ? t("shell.machine_panel.leftover.archived", { when: props.when(props.task.ended_at) })
      : t("shell.machine_panel.leftover.ended", { when: props.when(props.task.ended_at) });
  return (
    <li class={cn("rounded-md", open() && "bg-surface-muted/60")} data-machine-task={props.task.session}>
      <div class="flex min-w-0 items-center gap-2 rounded-md pr-1.5 hover:bg-surface-muted/60">
        <Pressable aria-expanded={open()} onClick={() => setOpen((v) => !v)}
          class="min-w-0 flex-1 py-1.5 pl-1.5 text-left outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary">
          <span class="block truncate text-xs font-medium text-neutral-950">{title()}</span>
          <span class="flex min-w-0 flex-wrap items-center gap-x-1.5 text-caption text-neutral-500">
            <Show when={project()}>{(p) => <span class="truncate">{p()}</span>}</Show>
            <Show when={props.left} fallback={
              <Show when={props.task.state === "running"} fallback={<Badge class="px-1.5 py-0 text-2xs">{t("shell.machine_panel.task.idle")}</Badge>}>
                <Badge tone="success" class="px-1.5 py-0 text-2xs">{t("shell.machine_panel.task.working")}</Badge>
              </Show>
            }>
              <span>{ended()}</span>
            </Show>
            <span>{t("shell.machine_panel.task.processes", { count: props.task.processes })}</span>
          </span>
        </Pressable>
        <span class="shrink-0 font-mono text-caption tabular-nums text-neutral-950">{peso(props.task.memory_bytes)}</span>
        <Show when={props.left && props.canStop}>
          <Pressable disabled={props.stopping} onClick={() => props.onStop?.()}
            aria-label={t("shell.machine_panel.stop_aria", { title: title() })}
            class="shrink-0 rounded-[5px] border border-border px-2 py-0.5 text-caption text-neutral-950 outline-none hover:border-error-strong hover:text-error-strong focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary disabled:opacity-60">
            {props.stopping ? t("shell.machine_panel.stopping") : t("shell.machine_panel.stop")}
          </Pressable>
        </Show>
      </div>
      <div class="px-1.5 pb-1.5">
        <span class="flex h-1 w-full overflow-hidden rounded-full bg-surface-muted">
          <span class={cn("h-full", props.left ? "bg-warning-strong/80" : "bg-neutral-500/70")}
            style={{ width: `${props.scale ? Math.min(100, (props.task.memory_bytes / props.scale) * 100) : 0}%` }} />
        </span>
      </div>
      <Show when={open()}>
        <ul class="m-0 list-none px-2 pb-2">
          <For each={topProcesses(props.task)}>
            {(p) => (
              <li class="flex justify-between gap-2 py-px text-caption text-neutral-500">
                <span class="truncate">{p.count > 1 ? `${p.command} (${p.count})` : p.command}</span>
                <span class="shrink-0 font-mono tabular-nums">{peso(p.bytes)}</span>
              </li>
            )}
          </For>
        </ul>
      </Show>
    </li>
  );
}

/**
 * La pestaña Memoria del detalle: tareas por consumo, «Quedó corriendo» con
 * «Detener» por tarea (solo si el host anuncia `machine_usage_v1`) y el motor.
 */
export function MemoryTab(props: {
  resources: MachineResources;
  /** La clave de las muestras de presión de esta máquina. */
  machineId: string;
  lookup: TaskLookup;
  when: When;
  canStop: boolean;
  stopping: Record<string, boolean>;
  failure: Record<string, string>;
  onStop: (task: MachineTaskUsage) => void;
}) {
  const tasks = () => active(props.resources);
  const left = () => leftovers(props.resources);
  const scale = () => Math.max(0, ...tasks().map((x) => x.memory_bytes), ...left().map((x) => x.memory_bytes));
  const lvl = () => level(props.resources);
  const barTone = () => lvl() === "critical" ? "bg-error-strong" : lvl() === "high" ? "bg-warning-strong" : "bg-neutral-500/50";
  const bars = () => {
    const h = history(props.machineId, props.resources);
    return h.length ? h : [props.resources.pressure?.memory ?? 0];
  };
  const version = () => engineVersion(props.resources);
  const parts = () => hasUsage(props.resources) ? split(props.resources) : null;
  const section = "m-0 mt-2.5 mb-1 flex items-center justify-between gap-2 px-1.5 text-caption font-semibold text-neutral-950";
  return (
    <div data-machine-memory="">
      <Show when={props.resources.pressure}>
        {(pr) => (
          <Metric label={t("shell.machine_panel.metric.pressure")} why={t("shell.machine_panel.pressure.why")}
            value={props.resources.memory?.swap_used_bytes ? t("shell.machine_panel.compressed", { size: peso(props.resources.memory.swap_used_bytes) }) : ""}>
            <PressureBars values={bars()} tone={barTone()} />
            <span class="truncate text-caption text-neutral-500">
              {t("shell.machine_panel.pressure.text", { memory: Math.round(pr().memory), io: Math.round(pr().io) })}
            </span>
          </Metric>
        )}
      </Show>
      <Show when={props.resources.cpu?.usage_percent !== undefined}>
        <Metric label={t("shell.machine_panel.metric.cpu")} value={`${Math.round(props.resources.cpu!.usage_percent!)} %`}>
          <ProgressBar class="h-2" value={props.resources.cpu!.usage_percent!} max={100} barClass={SEG_TASKS}
            label={t("shell.machine_panel.cpu_aria", { percent: Math.round(props.resources.cpu!.usage_percent!) })} />
        </Metric>
      </Show>

      <Show when={parts()}>
        {(p) => (
          <div class="mt-2 px-1.5">
            <ProgressBar class="h-2" value={p().total - p().available} max={p().total}
              label={t("shell.machine_panel.memory_aria", { used: peso(p().total - p().available), total: peso(p().total) })}
              segments={[
                { value: p().tasks, class: SEG_TASKS, label: t("shell.machine_panel.legend.tasks", { size: peso(p().tasks) }) },
                { value: p().engine, class: SEG_ENGINE, label: t("shell.machine_panel.legend.engine", { size: peso(p().engine) }) },
                { value: p().other, class: SEG_OTHER, label: t("shell.machine_panel.legend.other") },
              ]} />
            <span class="mt-1 flex flex-wrap gap-x-2.5 gap-y-0.5 text-2xs text-neutral-500">
              <span class="flex items-center gap-1"><span class={cn("size-2 rounded-[2px]", SEG_TASKS)} aria-hidden />{t("shell.machine_panel.legend.tasks", { size: peso(p().tasks) })}</span>
              <span class="flex items-center gap-1"><span class={cn("size-2 rounded-[2px]", SEG_ENGINE)} aria-hidden />{t("shell.machine_panel.legend.engine", { size: peso(p().engine) })}</span>
              <span class="flex items-center gap-1"><span class={cn("size-2 rounded-[2px]", SEG_OTHER)} aria-hidden />{t("shell.machine_panel.legend.other")}</span>
            </span>
          </div>
        )}
      </Show>

      <p class={section}>
        <span>{t("shell.machine_panel.tasks")}</span>
      </p>
      <Show when={tasks().length} fallback={<p class="m-0 px-1.5 text-caption text-neutral-500">{t("shell.machine_panel.tasks.none")}</p>}>
        <ul class="m-0 list-none p-0">
          <For each={tasks()}>{(x) => <TaskRow task={x} scale={scale()} lookup={props.lookup} when={props.when} />}</For>
        </ul>
      </Show>

      <p class={section}>
        <span>{t("shell.machine_panel.leftover")}</span>
      </p>
      <Show when={left().length} fallback={<p class="m-0 px-1.5 text-caption text-neutral-500">{t("shell.machine_panel.leftover.none")}</p>}>
        <ul class="m-0 list-none p-0">
          <For each={left()}>
            {(x) => (
              <>
                <TaskRow task={x} scale={scale()} lookup={props.lookup} when={props.when} left
                  canStop={props.canStop} stopping={!!props.stopping[x.session]} onStop={() => props.onStop(x)} />
                <Show when={props.failure[x.session]}>
                  {(f) => <li role="alert" class="px-1.5 py-0.5 text-caption text-error-strong">{f()}</li>}
                </Show>
              </>
            )}
          </For>
        </ul>
      </Show>

      <Show when={props.resources.engine?.rss_bytes !== undefined && props.resources.engine}>
        {(e) => (
          <>
            <p class={section}>
              <span>{t("shell.machine_panel.engine")}</span>
              <span class="font-mono font-normal tabular-nums">{peso(e().rss_bytes ?? 0)}</span>
            </p>
            <p class="m-0 px-1.5 text-caption text-neutral-500">
              <Show when={version()}>
                {(v) => (
                  <span class="font-mono">
                    {v().build ? t("shell.machine_panel.engine_version_build", { version: v().version, build: v().build! }) : t("shell.machine_panel.engine_version", { version: v().version })}
                    {" · "}
                  </span>
                )}
              </Show>
              {t("shell.machine_panel.engine.detail", { threads: e().threads ?? 0 })}
            </p>
          </>
        )}
      </Show>
      <Show when={props.resources.attribution === "best_effort"}>
        <p class={NOTE_INFO}>{t("shell.machine_panel.best_effort")}</p>
      </Show>
    </div>
  );
}
