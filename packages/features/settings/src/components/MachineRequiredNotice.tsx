import Laptop from "lucide-solid/icons/laptop";
import { Show } from "solid-js";
import { isPaidPlan } from "../../../../host/src/platform";
import { Button } from "../../../../ui/src/Button";
import { t } from "../../../../ui/src/lib/i18n";

function openSettings(panel: string) {
  window.dispatchEvent(new window.CustomEvent("harness:open-settings", { detail: panel }));
}

function MachineActions() {
  return (
    <div class="flex flex-wrap items-center gap-2">
      <Show
        when={isPaidPlan()}
        fallback={
          <>
            <Button type="button" size="sm" variant="secondary" onClick={() => openSettings("maintenance")}>
              {t("settings.no_machines.download_desk")}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => openSettings("cuenta-danil")}>
              {t("settings.no_machines.view_plans")}
            </Button>
          </>
        }
      >
        <Button type="button" size="sm" variant="secondary" onClick={() => openSettings("cuenta-danil")}>
          {t("settings.no_machines.manage_plan")}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => openSettings("maintenance")}>
          {t("settings.no_machines.download_desk")}
        </Button>
      </Show>
    </div>
  );
}

/** Aviso compacto para subsecciones que dependen de una máquina conectada. */
export function MachineRequiredNotice(props: { message?: string; compact?: boolean }) {
  return (
    <div
      data-machine-required=""
      class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface-muted/40 px-3.5 py-2.5"
    >
      <span class="flex min-w-0 items-center gap-2 text-xs text-neutral-500">
        <Laptop size={14} class="shrink-0" aria-hidden="true" />
        <span class="min-w-0">{props.message ?? t("settings.no_machines.inline")}</span>
      </span>
      <Show when={!props.compact}>
        <MachineActions />
      </Show>
    </div>
  );
}

/** Estado de sección completa cuando el contexto actual no tiene máquinas. */
export function MachineRequiredState(props: { title?: string; body?: string }) {
  return (
    <div
      data-machine-required=""
      class="grid justify-items-start gap-3 rounded-lg border border-border bg-surface-muted/40 p-4"
    >
      <div class="flex items-start gap-2.5">
        <span class="grid size-8 shrink-0 place-items-center rounded-md border border-border bg-surface text-neutral-500" aria-hidden="true">
          <Laptop size={16} />
        </span>
        <div class="grid gap-1">
          <p class="m-0 text-ui font-medium text-neutral-950">
            {props.title ?? t("settings.no_machines.title")}
          </p>
          <p class="m-0 text-xs text-neutral-500">
            {props.body ?? t("settings.no_machines.body")}
          </p>
        </div>
      </div>
      <MachineActions />
    </div>
  );
}
