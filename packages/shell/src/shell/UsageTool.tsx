import AlertTriangle from "lucide-solid/icons/triangle-alert";
import X from "lucide-solid/icons/x";
import { For, Show } from "solid-js";
import { immediateWindow } from "../../../ui/src/lib/account-usage.ts";
import { t } from "../../../ui/src/lib/i18n";
import { left, legible, tono } from "../../../ui/src/lib/limits";
import { sharedLazy } from "../../../ui/src/lib/sharedLazy";
import { cn } from "../../../ui/src/lib/utils";
import { capabilities } from "../../../host/src/platform";
import { LOCATION_BAR } from "../../../host/src/window";
import { Button } from "../../../ui/src/Button";
import { MarcaAgente } from "../../../ui/src/icons";
import { ProgressBar } from "../../../ui/src/ProgressBar";
import { type Usage, usageKey } from "./usage";
import { RefreshSpinner } from "../../../ui/src/Spinner";
import { isDanilCreditsModel } from "../../../ui/src/lib/tasks/danil-services.ts";
import { createDanilCreditsBalance } from "../../../features/chat/src/queries/danil-credits-balance";

const AccountCard = sharedLazy(() => import("../../../features/settings/src/screens/AccountCard"));
const DanilCredits = sharedLazy(() => import("../../../features/chat/src/screens/DanilCredits"));

function orderedCards(usage: Usage, agent: string) {
  const all = usage.activeCards();
  return [...all.filter((c) => c.agent === agent), ...all.filter((c) => c.agent !== agent)];
}

function hasDanilCreditsCapability() {
  return Boolean(capabilities().danilCredits || capabilities().nativeWindow);
}

/** El consumo de la cuenta del agente de esta ventana. El detalle vive en la ventana de la tarea. */
export default function UsageTool(props: {
  usage: Usage;
  agent: string;
  model?: string | null;
  pressed: boolean;
  onToggle: () => void;
}) {
  const showingCredits = () => isDanilCreditsModel(props.model) && hasDanilCreditsCapability();
  const creditsBalance = createDanilCreditsBalance({ enabled: showingCredits });
  const card = () => props.usage.activeCards().find((c) => c.agent === props.agent) ?? props.usage.activeCards()[0];
  const read = () => {
    const c = card();
    if (!c) return null;
    const k = usageKey(c.agent, c.cuenta.id);
    const fresh = legible(props.usage.reads()[k]);
    if (fresh) return { read: fresh, stale: false };
    const old = props.usage.lastGoodReads()[k];
    return old ? { read: old, stale: true } : null;
  };
  // La barra mide la ventana que corre ahora, no la que va más apretada.
  const running = () => immediateWindow(read()?.read.windows ?? []);
  const restante = () => {
    const window = running();
    return window ? left(window) : null;
  };
  const failed = () => {
    const c = card();
    if (!c || read()) return false;
    const mode = props.usage.reads()[usageKey(c.agent, c.cuenta.id)]?.mode;
    return mode === "failed" || mode === "revoked" || mode === "waiting";
  };
  const title = () => {
    if (showingCredits()) return t("usage.tool.credits_title", { balance: creditsBalance.label() });
    const c = card();
    const value = restante();
    return c && value !== null
      ? t("usage.tool.title", { agent: c.label, left: value })
      : t("usage.bar.aria");
  };

  return (
    <Show when={showingCredits() || props.usage.activeCards().length > 0}>
      <Button
        variant={props.pressed ? "secondary" : "chrome"}
        size="iconCompact"
        class="size-auto h-[30px] shrink-0 gap-1.5 px-2 text-neutral-500 focus-visible:outline-none"
        aria-label={title()}
        title={title()}
        aria-pressed={props.pressed}
        onClick={props.onToggle}
      >
        <Show
          when={showingCredits()}
          fallback={
            <Show when={card()}>
              {(c) => (
                <>
                  <span class="flex size-4 shrink-0 items-center justify-center text-neutral-950">
                    <MarcaAgente id={c().agent} size={13} />
                  </span>
                  <Show when={restante() !== null}>
                    {/* Sin número: el porcentaje y cuándo vuelve van en el detalle. */}
                    <ProgressBar
                      class={cn("h-1 w-6 shrink-0 bg-neutral-200", read()?.stale && "opacity-60")}
                      value={restante() ?? 0}
                      max={100}
                      barClass={tono(restante() ?? 0)}
                      label={title()}
                    />
                  </Show>
                  <Show when={failed()}>
                    <AlertTriangle size={12} class="shrink-0 text-warning-strong" aria-hidden />
                  </Show>
                </>
              )}
            </Show>
          }
        >
          <span class="flex size-4 shrink-0 items-center justify-center text-neutral-950">
            <MarcaAgente id="danil" size={13} />
          </span>
          <Show
            when={creditsBalance.compact()}
            fallback={
              <Show
                when={creditsBalance.amount() === undefined}
                fallback={<AlertTriangle size={12} class="shrink-0 text-warning-strong" aria-hidden />}
              >
                <span class="text-xs tabular-nums text-neutral-400">…</span>
              </Show>
            }
          >
            {(saldo) => (
              <span class="text-xs font-medium tabular-nums text-neutral-700" data-danil-credits-balance="">
                {saldo()}
              </span>
            )}
          </Show>
        </Show>
      </Button>
    </Show>
  );
}

/** Cuentas, barras, refrescar e ir a proveedores, en la ventana de la tarea. */
export function UsagePanel(props: { usage: Usage; agent: string; onManage: () => void; onClose?: () => void }) {
  const cards = () => orderedCards(props.usage, props.agent);
  return (
    <>
      <div class={cn("flex shrink-0 items-center justify-between gap-2 border-b border-border/60 px-3", LOCATION_BAR)}>
        <span class="text-xs font-semibold text-neutral-950">{t("usage.heading")}</span>
        <Show when={props.onClose}>
          {(close) => (
            <Button variant="ghost" size="iconCompact" class="size-6 text-neutral-500" title={t("chat.delegation.close_panel")} aria-label={t("chat.delegation.close_panel")} onClick={() => close()()}>
              <X size={14} />
            </Button>
          )}
        </Show>
      </div>
      <div class="min-h-0 flex-1 overflow-y-auto">
        <Show when={hasDanilCreditsCapability()}>
          <CreditsSection />
        </Show>
        <For each={cards()}>
          {(p) => (
            <section class="border-b border-border last:border-b-0">
              <h3 class="m-0 flex items-center gap-1.5 px-3 pt-2.5 pb-1 text-xs font-semibold text-neutral-500">
                <MarcaAgente id={p.agent} size={14} />
                {p.label}
              </h3>
              <div class="px-3 pb-2.5 pt-1">
                <AccountCard
                  account={p.cuenta}
                  active
                  status={props.usage.statuses()[usageKey(p.agent, p.cuenta.id)]}
                  limits={props.usage.reads()[usageKey(p.agent, p.cuenta.id)]}
                  lastGood={props.usage.lastGoodReads()[usageKey(p.agent, p.cuenta.id)]}
                  loadingLimits={props.usage.inProgress()[usageKey(p.agent, p.cuenta.id)]}
                  refreshingLimits={props.usage.inProgress()[usageKey(p.agent, p.cuenta.id)]}
                  onRefreshLimits={() => props.usage.refresh(p.agent, p.cuenta.id)}
                  onRename={(label) => props.usage.rename(p.agent, p.cuenta.id, label)}
                />
              </div>
            </section>
          )}
        </For>
      </div>
      <div class="flex shrink-0 items-center justify-between gap-2 border-t border-border px-3 pt-2 pb-3">
        <Button variant="ghost" size="compact" class="gap-1.5" title={t("usage.refresh")} disabled={props.usage.updating()} onClick={props.usage.refreshAll}>
          <RefreshSpinner size={12} spinning={props.usage.updating()} />
          {t("usage.refresh_all")}
        </Button>
        <Button variant="ghost" size="compact" class="font-semibold hover:text-neutral-950" onClick={props.onManage}>
          {t("usage.manage_accounts")}
        </Button>
      </div>
    </>
  );
}

/** Solo Danil Credits: el Router gratuito no consume de la cuenta. */
function CreditsSection() {
  return (
    <section class="border-b border-border">
      <h3 class="m-0 flex items-center gap-1.5 px-3 pt-2.5 pb-1 text-xs font-semibold text-neutral-500">
        <MarcaAgente id="danil" size={14} />
        {t("chat.services.label")}
      </h3>
      <div class="px-3 pb-2.5 pt-1">
        <DanilCredits />
      </div>
    </section>
  );
}
