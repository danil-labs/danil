import { radiantUsageSetOptIn, radiantUsageStatus } from "../queries/engine-harness";
import { listen } from "../../../../host/src/serviceEvents.ts";
import { createEffect, createSignal, on, onCleanup, Show } from "solid-js";
import { type Tailscale } from "../../../../session/src/governance";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import { Badge } from "../../../../ui/src/Badge";
import { asFailure, type Failure, FailureNote } from "../../../../ui/src/Failure";
import { Toggle } from "../../../../ui/src/Toggle";

export const ROW = "flex flex-wrap items-baseline justify-between gap-2 text-sm";

/** Espeja `radiant::usage_report::Status`. */
type UsageReport = {
  state: "active" | "pending" | "off" | "not_chosen" | "unsupported" | "not_governed";
  policy: string | null;
  opted_in: boolean;
  queued: number;
  quarantined: number;
  last_error: string | null;
};

function usageState(state: UsageReport["state"]): string {
  switch (state) {
    case "active":
      return t("harness.usage.state.active");
    case "pending":
      return t("harness.usage.state.pending");
    case "off":
      return t("harness.usage.state.off");
    case "not_chosen":
      return t("harness.usage.state.not_chosen");
    default:
      return t("harness.usage.state.unsupported");
  }
}

/** El reporte de consumo de IA a Harness de este workspace (`radiant/usage_report.rs`). */
export function UsageReporting(props: { workspace: string }) {
  const [report, setReport] = createSignal<UsageReport | null>(null);
  const [failure, setFailure] = createSignal<Failure | null>(null);
  let request = 0;

  async function load() {
    const mine = ++request;
    try {
      const next = await radiantUsageStatus<UsageReport>();
      if (mine === request) setReport(next);
    } catch {
      if (mine === request) setReport(null);
    }
  }

  async function choose(enabled: boolean) {
    setFailure(null);
    const mine = ++request;
    try {
      const next = await radiantUsageSetOptIn<UsageReport>({ enabled });
      if (mine === request) setReport(next);
    } catch (error) {
      setFailure(asFailure(error));
    }
  }

  createEffect(on(() => props.workspace, () => void load()));
  const stops = [listen("usage", () => void load()), listen("radiant", () => void load())];
  onCleanup(() => stops.forEach((stop) => void stop.then((s) => s())));

  return (
    <Show when={report()}>
      {(r) => (
        <div class="grid gap-1">
          <div class="flex items-center justify-between gap-2">
            <span class="text-sm text-neutral-500">{t("harness.usage.title")}</span>
            <Show
              when={r().policy === "optional"}
              fallback={
                <Show when={r().policy === "required"}>
                  <Badge forma="dato">{t("harness.usage.required")}</Badge>
                </Show>
              }
            >
              <Toggle checked={r().opted_in} label={t("harness.usage.toggle")} onChange={(on) => void choose(on)} />
            </Show>
          </div>
          <span class="text-sm text-neutral-950">{usageState(r().state)}</span>
          <span class="text-xs text-neutral-500">{t("harness.usage.what")}</span>
          <Show when={r().queued > 0}>
            <div class={ROW}>
              <span class="text-neutral-500">{t("harness.usage.queued")}</span>
              <span class="text-neutral-950">{r().queued}</span>
            </div>
          </Show>
          <Show when={r().quarantined > 0}>
            <div class={ROW}>
              <span class="text-neutral-500">{t("harness.usage.quarantined")}</span>
              <span class="text-warning-strong">{r().quarantined}</span>
            </div>
          </Show>
          <Show when={failure()}>{(error) => <FailureNote f={error()} />}</Show>
        </div>
      )}
    </Show>
  );
}

export function connectionStatus(status: string): string {
  switch (status) {
    case "connected":
      return t("harness.governance.connection.connected");
    case "not_connected":
      return t("harness.governance.connection.not_connected");
    case "needs_reauthorization":
      return t("harness.governance.connection.needs_reauthorization");
    default:
      return t("harness.governance.connection.unknown");
  }
}

export function tailscaleState(state: Tailscale, tailnet: string): string {
  switch (state.kind) {
    case "missing":
      return t("harness.governance.tailscale.state_missing");
    case "stopped":
      return t("harness.governance.tailscale.state_stopped");
    default:
      return state.tailnet === tailnet || state.suffix.replace(/\.$/, "") === tailnet
        ? t("harness.governance.tailscale.state_on", { tailnet })
        : t("harness.governance.tailscale.state_other", { tailnet: state.tailnet || state.suffix });
  }
}
