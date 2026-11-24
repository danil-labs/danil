import type { MachineResources } from "../../../engine-client/src/index.ts";
import { Show, createSignal } from "solid-js";
import { t } from "../../../ui/src/lib/i18n";
import { peso } from "../../../ui/src/lib/format";
import { cn } from "../../../ui/src/lib/utils";
import { Badge } from "../../../ui/src/Badge";
import { ProgressBar } from "../../../ui/src/ProgressBar";
import { type Machine, machineName } from "../../../features/machines/src/queries/store";
import { UPDATE_FEATURE, engineVersion, hasUsage, heaviest, leftovers, level, split, updateState } from "./machineUsage";
import { Pressable } from "../../../ui/src/Pressable";
import { Metric, NOTE, NOTE_INFO, SEG_TASKS, taskTitle, type TaskLookup, type When } from "./machine-card-parts";
import { RefreshSpinner } from "../../../ui/src/Spinner";

export { type TaskLookup, type When } from "./machine-card-parts";
export { MemoryTab } from "./machine-memory-tab";

/** Encendida, apagada, encendiéndose (si la flota lo sabe) o sin contestar. */
export type Power = "on" | "off" | "starting" | "no_answer";

const POWER_DOT: Record<Power, string> = {
  on: "bg-success-strong",
  off: "bg-neutral-500",
  starting: "bg-warning-strong animate-danil-pulse",
  no_answer: "bg-error-strong",
};

function kind(m: Machine, r: MachineResources | undefined) {
  const parts = [m.wakes ? t("shell.machine_panel.kind.vm") : m.os === "macos" ? t("shell.machine_panel.kind.mac") : t("shell.machine_panel.kind.computer")];
  if (r?.cpu?.cores) parts.push(t("shell.machine_panel.kind.cores", { count: r.cpu.cores }));
  return parts.join(" · ");
}

function disk(r: MachineResources | undefined) {
  const d = r?.storage.find((s) => s.total_bytes !== 0 && s.total_bytes - s.free_bytes >= 0);
  return d ? { used: d.total_bytes - d.free_bytes, total: d.total_bytes, free: d.free_bytes } : null;
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
  const left = () => leftovers(r());
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
    <Pressable
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
      <Show when={on() && left().length}>
        <span class={cn(NOTE_INFO, "block")}>
          {t("shell.machine_panel.leftover.card", { count: left().length, size: peso(left().reduce((n, x) => n + x.memory_bytes, 0)) })}
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
    </Pressable>
      <Show when={(!!version() && !usage()) || (updatable() && (version()?.updateAvailable || update() !== "idle" || !!updateError() || !!rejected()))}>
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
                <Pressable class="grid size-6 place-items-center rounded-sm text-neutral-500 outline-none hover:bg-surface-muted hover:text-neutral-950 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-60"
                  aria-label={t("shell.machine_panel.update_check")} title={t("shell.machine_panel.update_check")} disabled={refreshing()} onClick={() => void refresh()}>
                  <RefreshSpinner size={12} spinning={refreshing()} aria-hidden />
                </Pressable>
              </Show>
              <Show when={update() === "idle" || update() === "sending"}>
                <Pressable class={small} disabled={update() === "sending"} onClick={() => void ask(false)}>
                  {t("shell.machine_panel.update")}
                </Pressable>
              </Show>
              <Show when={update() === "scheduled"}>
                <span role="status" class="text-neutral-950">{t("shell.machine_panel.update_scheduled")}</span>
                <Pressable class={small} onClick={() => setLocal("confirm")}>{t("shell.machine_panel.update_now")}</Pressable>
              </Show>
              <Show when={update() === "now"}>
                <span role="status" class="text-neutral-950">{t("shell.machine_panel.updating")}</span>
              </Show>
            </span>
          </Show>
          <Show when={update() === "confirm"}>
            <span role="alertdialog" aria-label={t("shell.machine_panel.update_now")} class="mt-1 flex w-full flex-wrap items-center gap-2 rounded-md bg-warning/10 px-2 py-1.5 text-warning-strong">
              <span class="min-w-0 flex-1">{t("shell.machine_panel.update_now_confirm")}</span>
              <Pressable class={cn(small, "border-error-strong text-error-strong")} onClick={() => void ask(true)}>{t("shell.machine_panel.update_now")}</Pressable>
              <Pressable class={small} onClick={() => setLocal("scheduled")}>{t("shell.machine_panel.cancel")}</Pressable>
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
