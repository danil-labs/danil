import type { MachineResources, MachineTaskUsage } from "@terminus/protocol";
import { For, Show, createSignal } from "solid-js";
import { t } from "../../lib/i18n";
import { peso } from "../../lib/format";
import { cn } from "../../lib/utils";
import { Badge } from "../../ui/Badge";
import { ProgressBar } from "../../ui/ProgressBar";
import { type Machine, machineName } from "../machines/store";
import { UPDATE_FEATURE, active, engineVersion, hasUsage, heaviest, history, leftovers, level, split, topProcesses, updateState } from "./machineUsage";
import RefreshCw from "lucide-solid/icons/refresh-cw";

/** El título y la carpeta de una tarea de la ventana, si se conocen. */
export type TaskLookup = (session: string) => { title: string; project?: string } | undefined;

/** Cuándo, con días si pasó más de uno: `haceCuanto` se queda en horas. */
export type When = (ms: number) => string;

/** Encendida, apagada, encendiéndose (si la flota lo sabe) o sin contestar. */
export type Power = "on" | "off" | "starting" | "no_answer";

const POWER_DOT: Record<Power, string> = {
  on: "bg-success-strong",
  off: "bg-neutral-500",
  starting: "bg-warning-strong animate-danil-pulse",
  no_answer: "bg-error-strong",
};

const NOTE = "mt-2 rounded-md px-2 py-1.5 text-caption";
const NOTE_INFO = cn(NOTE, "bg-surface-muted text-neutral-500");
const SEG_TASKS = "bg-neutral-500";
const SEG_ENGINE = "bg-info-strong";
const SEG_OTHER = "bg-neutral-500/35";

export function taskTitle(task: Pick<MachineTaskUsage, "session" | "title">, lookup: TaskLookup) {
  return task.title ?? lookup(task.session)?.title ?? t("shell.machine_panel.task.unknown", { id: task.session.slice(0, 8) });
}

function kind(m: Machine, r: MachineResources | undefined) {
  const parts = [m.wakes ? t("shell.machine_panel.kind.vm") : m.os === "macos" ? t("shell.machine_panel.kind.mac") : t("shell.machine_panel.kind.computer")];
  if (r?.cpu?.cores) parts.push(t("shell.machine_panel.kind.cores", { count: r.cpu.cores }));
  return parts.join(" · ");
}

function disk(r: MachineResources | undefined) {
  const d = r?.storage.find((s) => s.total_bytes !== 0 && s.total_bytes - s.free_bytes >= 0);
  return d ? { used: d.total_bytes - d.free_bytes, total: d.total_bytes, free: d.free_bytes } : null;
}

function Metric(props: { label: string; why?: string; value?: string; children: unknown }) {
  return (
    <span class="mt-2 grid grid-cols-[4.5rem_minmax(0,1fr)_auto] items-center gap-2">
      <span class="text-caption text-neutral-500" title={props.why}>{props.label}</span>
      <span class="flex min-w-0 items-center gap-2.5">{props.children as never}</span>
      <span class="whitespace-nowrap font-mono text-caption tabular-nums text-neutral-950">{props.value}</span>
    </span>
  );
}

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

/**
 * La tarjeta de una máquina: memoria, disco y lo que exige acción. La presión,
 * la CPU y el reparto viven en el detalle; aquí solo se ve lo que se mira de
 * pasada.
 */
export function MachineCard(props: {
  machine: Machine;
  resources: MachineResources | undefined;
  power: Power;
  /** La hora de la copia de una máquina apagada; sin ella, la de la medición. */
  cachedAt?: number | null;
  selected: boolean;
  disabled?: boolean;
  lookup: TaskLookup;
  when: When;
  onSelect: () => void;
  /** `engine_update({ release, force })`; `force` corta los turnos en curso. Devuelve el fallo en prosa, o `""`. */
  onUpdate?: (force: boolean) => Promise<string>;
  /** `engine_update_status({ refresh: true })`: pregunta ya por la última release firmada. */
  onRefresh?: () => Promise<void>;
  /** Un código de error del motor en prosa (`no_release_known`…). */
  failure?: (code: string) => string;
}) {
  const r = () => props.resources;
  const on = () => props.power === "on";
  const usage = () => hasUsage(r());
  const lvl = () => (on() ? level(r()) : null);
  const tone = () => lvl() === "critical" ? "bg-error-strong" : lvl() === "high" ? "bg-warning-strong" : SEG_TASKS;
  const parts = () => { const x = r(); return hasUsage(x) ? split(x) : null; };
  const d = () => disk(r());
  const cpu = () => on() && usage() && r()?.cpu?.usage_percent !== undefined ? Math.round(r()!.cpu!.usage_percent!) : null;
  const cpuHigh = () => (cpu() ?? 0) >= 90;
  const state = () => !on()
    ? null
    : !usage()
      ? { label: t("shell.machine_panel.state.disk_only"), tone: "neutral" as const }
      : lvl() === "critical"
        ? { label: t("shell.machine_panel.state.critical"), tone: "danger" as const }
        : lvl() === "high"
          ? { label: t("shell.machine_panel.state.high"), tone: "warning" as const }
          : cpuHigh()
            ? { label: t("shell.machine_panel.state.cpu"), tone: "warning" as const }
            : null;
  const warnTasks = () => heaviest(r()).filter((x) => x.memory_bytes > 0)
    .map((x) => t("shell.machine_panel.warn.task", { title: taskTitle(x, props.lookup), size: peso(x.memory_bytes) })).join(", ");

  const version = () => engineVersion(r(), props.machine.version);
  const updatable = () => on() && !!props.machine.features?.includes(UPDATE_FEATURE) && !!props.onUpdate;
  /** Lo de esta ventana: `confirm` pregunta antes de «Actualizar ya»; el resto lo dice el motor (`updateState`). */
  const [local, setLocal] = createSignal<"idle" | "sending" | "confirm" | "scheduled" | "now">("idle");
  const [updateError, setUpdateError] = createSignal("");
  const [refreshing, setRefreshing] = createSignal(false);
  const engineState = () => updateState(r()?.engine);
  const update = () => {
    const mine = local();
    if (mine === "sending" || mine === "confirm") return mine;
    const said = engineState();
    if (said === "scheduled" || said === "now") return said;
    return mine;
  };
  const rejected = () => {
    const e = r()?.engine?.download;
    return engineState() === "rejected" && e?.error ? (props.failure?.(e.error) ?? e.error) : "";
  };
  const ask = async (force: boolean) => {
    setUpdateError("");
    setLocal("sending");
    const failure = (await props.onUpdate?.(force)) ?? "";
    setUpdateError(failure);
    setLocal(failure ? "idle" : force ? "now" : "scheduled");
  };
  const refresh = async () => {
    setRefreshing(true);
    await props.onRefresh?.();
    setRefreshing(false);
  };
  const small = "shrink-0 rounded-[5px] border border-border px-2 py-0.5 text-caption text-neutral-950 outline-none hover:bg-surface-muted focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary disabled:opacity-60";

  return (
    <div
      data-machine-card={props.machine.id}
      class={cn("rounded-lg border border-border", props.selected && "border-primary/55")}
    >
    <button
      type="button"
      aria-expanded={props.selected}
      disabled={props.disabled}
      class={cn(
        "block w-full rounded-lg px-3 pt-2.5 pb-2 text-left outline-none hover:bg-surface-muted/55 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary disabled:cursor-default",
        !on() && "opacity-60",
      )}
      onClick={() => props.onSelect()}
    >
      <span class="flex min-w-0 items-center gap-2">
        <span class="truncate text-xs font-semibold text-neutral-950">{machineName(props.machine.id, props.machine.local)}</span>
        <span class="min-w-0 flex-1 truncate text-caption text-neutral-500">{kind(props.machine, r())}</span>
        <span class="flex shrink-0 items-center gap-1 text-caption text-neutral-500" data-machine-power={props.power}>
          <span class={cn("size-1.5 rounded-full", POWER_DOT[props.power])} aria-hidden />
          {t(`shell.machine_panel.power.${props.power}`)}
        </span>
        <Show when={state()}>
          {(s) => <Badge tone={s().tone} class="shrink-0 px-1.5 py-0 text-2xs">{s().label}</Badge>}
        </Show>
      </span>

      <Show when={parts()}>
        {(p) => (
          <>
            <Metric label={t("shell.machine_panel.metric.memory")} value={t("shell.machine_panel.free", { size: peso(p().available) })}>
              <ProgressBar class="h-2" value={p().total - p().available} max={p().total} barClass={tone()}
                label={t("shell.machine_panel.memory_aria", { used: peso(p().total - p().available), total: peso(p().total) })} />
            </Metric>
          </>
        )}
      </Show>

      <Show when={d()}>
        {(x) => (
          <Metric label={t("shell.machine_panel.metric.disk")} value={t("shell.machine_panel.free", { size: peso(x().free) })}>
            <ProgressBar class="h-2" value={x().used} max={x().total} barClass="bg-neutral-500/70"
              label={t("shell.storage.disk_aria", { used: peso(x().used), free: peso(x().free), total: peso(x().total) })} />
          </Metric>
        )}
      </Show>

      <Show when={(lvl() === "high" || lvl() === "critical") && warnTasks()}>
        <span role="status" class={cn(NOTE, "block", lvl() === "critical" ? "bg-error/10 text-error-strong" : "bg-warning/10 text-warning-strong")}>
          {lvl() === "critical" ? t("shell.machine_panel.warn.critical", { tasks: warnTasks() }) : t("shell.machine_panel.warn.high", { tasks: warnTasks() })}
        </span>
      </Show>
      <Show when={lvl() !== "high" && lvl() !== "critical" && cpuHigh()}>
        <span role="status" class={cn(NOTE, "block bg-warning/10 text-warning-strong")}>
          {t("shell.machine_panel.warn.cpu", { percent: cpu() ?? 0 })}
        </span>
      </Show>
      <Show when={props.power === "off" || props.power === "starting"}>
        <span class={cn(NOTE_INFO, "block")}>
          {!r()
            ? t("shell.machine_panel.off_never")
            : props.machine.wakes
              ? t("shell.machine_panel.off_wakes", { when: props.when(props.cachedAt ?? r()!.measured_at) })
              : t("shell.machine_panel.off", { when: props.when(props.cachedAt ?? r()!.measured_at) })}
        </span>
      </Show>
    </button>
      <Show when={updatable() && (version()?.updateAvailable || update() !== "idle" || !!updateError() || !!rejected())}>
        <div class={cn("flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 px-3 pb-2.5 text-caption text-neutral-500", !on() && "opacity-60")} data-machine-engine="">
          <Show when={version()}>
            {(v) => (
              <span class="font-mono tabular-nums">
                {v().build ? t("shell.machine_panel.engine_version_build", { version: v().version, build: v().build! }) : t("shell.machine_panel.engine_version", { version: v().version })}
              </span>
            )}
          </Show>
          <Show when={version()?.updateAvailable}>
            <Badge tone="info" class="px-1.5 py-0 text-2xs">{t("shell.machine_panel.update_available")}</Badge>
          </Show>
          <Show when={updatable()}>
            <span class="ml-auto flex items-center gap-1.5">
              <Show when={props.onRefresh}>
                <button type="button" class="grid size-6 place-items-center rounded-sm text-neutral-500 outline-none hover:bg-surface-muted hover:text-neutral-950 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-60"
                  aria-label={t("shell.machine_panel.update_check")} title={t("shell.machine_panel.update_check")} disabled={refreshing()} onClick={() => void refresh()}>
                  <RefreshCw size={12} class={refreshing() ? "animate-spin" : undefined} aria-hidden />
                </button>
              </Show>
              <Show when={update() === "idle" || update() === "sending"}>
                <button type="button" class={small} disabled={update() === "sending"} onClick={() => void ask(false)}>
                  {t("shell.machine_panel.update")}
                </button>
              </Show>
              <Show when={update() === "scheduled"}>
                <span role="status" class="text-neutral-950">{t("shell.machine_panel.update_scheduled")}</span>
                <button type="button" class={small} onClick={() => setLocal("confirm")}>{t("shell.machine_panel.update_now")}</button>
              </Show>
              <Show when={update() === "now"}>
                <span role="status" class="text-neutral-950">{t("shell.machine_panel.updating")}</span>
              </Show>
            </span>
          </Show>
          <Show when={update() === "confirm"}>
            <span role="alertdialog" aria-label={t("shell.machine_panel.update_now")} class="mt-1 flex w-full flex-wrap items-center gap-2 rounded-md bg-warning/10 px-2 py-1.5 text-warning-strong">
              <span class="min-w-0 flex-1">{t("shell.machine_panel.update_now_confirm")}</span>
              <button type="button" class={cn(small, "border-error-strong text-error-strong")} onClick={() => void ask(true)}>{t("shell.machine_panel.update_now")}</button>
              <button type="button" class={small} onClick={() => setLocal("scheduled")}>{t("shell.machine_panel.cancel")}</button>
            </span>
          </Show>
          <Show when={updateError() || rejected()}>
            <span role="alert" class="w-full text-error-strong">{updateError() || rejected()}</span>
          </Show>
        </div>
      </Show>
    </div>
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
        <button type="button" aria-expanded={open()} onClick={() => setOpen((v) => !v)}
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
        </button>
        <span class="shrink-0 font-mono text-caption tabular-nums text-neutral-950">{peso(props.task.memory_bytes)}</span>
        <Show when={props.left && props.canStop}>
          <button type="button" disabled={props.stopping} onClick={() => props.onStop?.()}
            aria-label={t("shell.machine_panel.stop_aria", { title: title() })}
            class="shrink-0 rounded-[5px] border border-border px-2 py-0.5 text-caption text-neutral-950 outline-none hover:border-error-strong hover:text-error-strong focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary disabled:opacity-60">
            {props.stopping ? t("shell.machine_panel.stopping") : t("shell.machine_panel.stop")}
          </button>
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
