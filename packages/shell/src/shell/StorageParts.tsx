import type { MachineResources } from "../../../engine-client/src/index.ts";
import type { JSX } from "solid-js";
import { Show } from "solid-js";
import { t } from "../../../../apps/desktop/src/lib/i18n";
import { peso } from "../../../ui/src/lib/format";
import { cn } from "../../../ui/src/lib/utils";
import { TooltipAction } from "../../../ui/src/TooltipAction";
import { ProgressBar } from "../../../ui/src/ProgressBar";
import type { Machine, Summary } from "./storage-model";

/** Un botón de icono de la fila, con su globo. */
export function Accion(props2: {
  etiqueta: string;
  onClick: () => void;
  disabled?: boolean;
  tono?: "aviso";
  children: JSX.Element;
}) {
  return (
    <TooltipAction
      class={cn(
              "flex size-6 shrink-0 items-center justify-center rounded-sm outline-none hover:bg-surface-muted focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary disabled:opacity-60",
              props2.tono === "aviso"
                ? "text-warning-strong"
                : "text-neutral-500 hover:text-neutral-950",
            )}
      etiqueta={props2.etiqueta}
      onClick={props2.onClick}
      disabled={props2.disabled}
    >
      {props2.children}
    </TooltipAction>
  );
}

/** Ámbar lo que se puede tirar, gris lo que se conserva. */
export function Barra(props2: { bytes: number; recuperable: number; escala: number; alto?: string }) {
  const ancho = () => (props2.escala ? (props2.bytes / props2.escala) * 100 : 0);
  const tirable = () => (props2.bytes ? (props2.recuperable / props2.bytes) * 100 : 0);
  return (
    <span class={cn("flex w-full overflow-hidden rounded-full bg-surface-muted", props2.alto ?? "h-1")}>
      <span class="flex h-full" style={{ width: `${ancho()}%` }}>
        <span class="h-full bg-warning-strong/80" style={{ width: `${tirable()}%` }} />
        <span class="h-full flex-1 bg-neutral-500/45" />
      </span>
    </span>
  );
}

function comparable(disk: MachineResources["storage"][number]) {
  return [disk.total_bytes, disk.free_bytes, disk.available_bytes].every((n) => Number.isFinite(n) && n >= 0)
    && (disk.total_bytes > 0) && disk.free_bytes <= disk.total_bytes && disk.available_bytes <= disk.free_bytes;
}

export const summaryStale = (m: Machine, summary: Summary | undefined) => !!summary?.resources
  && (!m.on || !!summary.stale || !!summary.error || Date.now() - summary.resources.measured_at > 300_000);

export function Disk(props2: { disk: MachineResources["storage"][number] }) {
  const used = () => props2.disk.total_bytes - props2.disk.free_bytes;
  return (
    <div class="mt-2">
      <p class="m-0 truncate text-caption text-neutral-500">{t("shell.storage.engine_data")}</p>
      <Show when={comparable(props2.disk)} fallback={<p class="m-0 text-xs text-neutral-500">{t("shell.storage.capacity_unavailable")}</p>}>
        <ProgressBar class="my-1.5 h-2 border border-neutral-500" value={used()} max={props2.disk.total_bytes}
          label={t("shell.storage.disk_aria", { used: peso(used()), free: peso(props2.disk.free_bytes), total: peso(props2.disk.total_bytes) })}
          barClass="bg-neutral-500" />
        <p class="m-0 flex flex-wrap gap-x-3 text-caption text-neutral-500">
          <span>{t("shell.storage.disk_used", { size: peso(used()) })}</span>
          <span>{t("shell.storage.disk_free", { size: peso(props2.disk.free_bytes) })}</span>
          <span>{t("shell.storage.disk_total", { size: peso(props2.disk.total_bytes) })}</span>
        </p>
        <Show when={props2.disk.available_bytes !== props2.disk.free_bytes}>
          <p class="m-0 mt-1 text-caption text-neutral-500">{t("shell.storage.disk_available", { size: peso(props2.disk.available_bytes) })}</p>
        </Show>
      </Show>
    </div>
  );
}
