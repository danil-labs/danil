import { For, Show } from "solid-js";
import { t } from "../../../../apps/desktop/src/lib/i18n";
import { haceCuanto } from "../../../../apps/desktop/src/lib/limits";
import { cn } from "../../../../apps/desktop/src/lib/utils";
import Server from "lucide-solid/icons/server";
import { Popover, PopoverContent, PopoverTrigger } from "../../../ui/src/Popover";
import { MachineCard, MemoryTab, type TaskLookup } from "./MachineCard";
import { UPDATE_FEATURE, USAGE_FEATURE, hasUsage } from "./machineUsage";
import { Pressable } from "../../../ui/src/Pressable";
import { actividadDe } from "./storage-model";
import { Accion } from "./StorageParts";
import { type StorageProps, createStorageState } from "./storage-state";
import { createStorageTasks } from "./storage-tasks";
import { createStorageRows } from "./StorageRows";
import { createDiskView } from "./StorageDiskView";
import { RefreshSpinner } from "../../../ui/src/Spinner";

export default function Almacenamiento(props: StorageProps) {
  const s = createStorageState(props);
  const { abierto, setAbierto, midiendo, datos, inventory, machine, summaries, inventoryError, readError, listing, expanded, setTabChoice, stopping, stopFailure,
    choose, summaryOf, tab, showsDisk, powerOf, pressure, pressureName, updateFailure, updateEngine, refreshEngine, stopTask, openInventory, clearing } = s;
  const k = createStorageTasks(s);
  const rows = createStorageRows(props, s, k);
  const { DiskView } = createDiskView(props, s, k, rows);

  const lookup: TaskLookup = (session) => props.lookup?.(session);
  const triggerTitle = () => {
    const p = pressure();
    if (!p) return t("shell.machine_panel.title");
    return p.level === "critical"
      ? t("shell.machine_panel.trigger.critical", { name: pressureName() })
      : t("shell.machine_panel.trigger.high", { name: pressureName() });
  };

  return (
    <Popover
      open={abierto()}
      onOpenChange={(v: boolean) => {
        setAbierto(v);
        if (v && !clearing()) void openInventory();
      }}
      placement={props.vertical ? "right-end" : "bottom-end"}
      gutter={6}
    >
      {/* El disparador **no lleva `onClick` propio**: Kobalte no compone
          manejadores como hacía Radix con `asChild`, así que el último gana y el
          panel dejaría de abrirse. Lo que hay que hacer al abrir va en
          `onOpenChange`. */}
      <PopoverTrigger
        as={(p: object) => (
          <Pressable
            {...p}
            class={cn(
              "relative flex shrink-0 items-center text-neutral-500 outline-none transition-colors hover:bg-surface-muted hover:text-neutral-950 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary data-[expanded]:bg-surface-muted",
              props.vertical ? "size-8 justify-center rounded-md" : "gap-1 rounded-sm px-1.5 py-0.5",
            )}
            aria-label={t("shell.machine_panel.title")}
            title={triggerTitle()}
            data-machine-pressure={pressure()?.level}
          >
            <Server
              size={props.vertical ? 16 : 12}
              class={midiendo() || clearing() ? "animate-pulse" : undefined}
              aria-hidden
            />
            <Show when={!props.vertical}><span>{t("shell.machine_panel.title")}</span></Show>
            {/* Como el punto de «mantener despierta» en el avatar: sin presión, nada. */}
            <Show when={pressure()}>
              {(p) => (
                <span aria-hidden class={cn(
                  "pointer-events-none absolute top-1 right-1 size-2 rounded-full border-2 border-surface-raised",
                  p().level === "critical" ? "bg-error-strong" : "bg-warning-strong",
                )} />
              )}
            </Show>
          </Pressable>
        )}
      />

      <PopoverContent
        class="flex max-h-[min(560px,var(--kb-popper-content-available-height))] w-[520px] max-w-[calc(100vw-16px)] flex-col p-0"
        onOpenAutoFocus={(e: Event) => e.preventDefault()}
      >
        <div class="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-2">
          <h2 class="m-0 flex items-center gap-1.5 text-xs font-semibold text-neutral-950">
            <Server size={12} class="text-neutral-500" aria-hidden />
            {t("shell.machine_panel.title")}
          </h2>
          <span class="flex items-center gap-1">
            <span class="font-mono text-caption tabular-nums text-neutral-500">
              {clearing()
                ? t("shell.storage.emptying")
                : midiendo()
                  ? t("shell.storage.measuring")
                  : showsDisk() && datos() ? haceCuanto(datos()!.medido_en)
                    : summaryOf(machine())?.resources ? haceCuanto(summaryOf(machine())!.resources!.measured_at) : ""}
            </span>
            <Accion
              etiqueta={inventoryError() || readError() || summaries()[machine() ?? ""]?.error || summaries()[machine() ?? ""]?.resources?.error ? t("shell.storage.retry") : t("shell.storage.remeasure")}
              disabled={midiendo() || clearing() || listing()}
              onClick={() => void openInventory()}
            >
              <RefreshSpinner size={12} spinning={midiendo()} aria-hidden />
            </Accion>
          </span>
        </div>

        <div class="min-h-0 overflow-y-auto">
          <Show when={inventoryError()}>
            <p role="alert" class="m-0 px-3 py-2 text-xs text-error-strong">{inventoryError()}</p>
          </Show>
          <Show when={listing()}>
            <p role="status" class="m-0 px-3 py-2 text-xs text-neutral-500">{t("shell.storage.measuring")}</p>
          </Show>
          <Show when={!listing() && !inventoryError() && inventory().length === 0}>
            <p class="m-0 px-3 py-2 text-xs text-neutral-500">{t("shell.storage.no_machines")}</p>
          </Show>
          <div class="flex flex-col gap-2 p-2">
            <For each={inventory()}>{(m) => (
              <>
                <MachineCard machine={m} resources={summaryOf(m.id)?.resources} power={powerOf(m)} cachedAt={summaryOf(m.id)?.cachedAt}
                  selected={machine() === m.id && expanded()} disabled={clearing()} lookup={lookup} when={actividadDe}
                  onSelect={() => choose(m)} onUpdate={(force) => updateEngine(m, force)}
                  onRefresh={m.features?.includes(UPDATE_FEATURE) ? () => refreshEngine(m) : undefined} failure={updateFailure} />
                <Show when={machine() === m.id && expanded()}>
                  <section class="-mt-1 rounded-b-lg border-t border-border pt-2" data-machine-detail={m.id}>
                    <div class="flex items-center gap-1 px-1" role="tablist">
                      <For each={(hasUsage(summaryOf(m.id)?.resources) ? ["memory", "disk"] : ["disk"]) as ("memory" | "disk")[]}>
                        {(v) => (
                          <Pressable role="tab" aria-selected={tab() === v} onClick={() => setTabChoice(v)}
                            class={cn("rounded-md px-2.5 py-1 text-xs outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-primary",
                              tab() === v ? "bg-surface-muted font-semibold text-neutral-950" : "text-neutral-500 hover:text-neutral-950")}>
                            {v === "memory" ? t("shell.machine_panel.tab.memory") : t("shell.machine_panel.tab.disk")}
                          </Pressable>
                        )}
                      </For>
                    </div>
                    <Show when={tab() === "memory" && summaryOf(m.id)?.resources}>
                      {(r) => (
                        <div class="px-1 pb-1">
                          <MemoryTab resources={r()} machineId={m.id} lookup={lookup} when={actividadDe}
                            canStop={m.on && !!m.features?.includes(USAGE_FEATURE)}
                            stopping={stopping()} failure={stopFailure()} onStop={(x) => void stopTask(m, x)} />
                        </div>
                      )}
                    </Show>
                    <Show when={tab() === "disk"}>
                      <div class="-mx-2">
                        <DiskView />
                      </div>
                    </Show>
                  </section>
                </Show>
              </>
            )}</For>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
