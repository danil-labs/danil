import Check from "lucide-solid/icons/check";
import type { RouterOfferState } from "@terminus/tasks";
import { createResource, Show, type JSX } from "solid-js";
import { t } from "../../lib/i18n";
import { capabilities } from "../../lib/platform";
import { Button } from "../../ui/Button";
import { prosaDe } from "../../ui/Failure";
import { createDanilCreditsBalance } from "./danil-credits-balance";

type Service = { ready: boolean; selected: boolean; onUse: () => void };

/** Los servicios de Danil eligen el modelo por su cuenta: aquí no se nombra ninguno. */
export default function DanilServices(props: {
  onPrepare?: () => Promise<void>;
  credits: Service;
  router: Service & { state: RouterOfferState; activating: boolean; onActivate: () => void };
}) {
  const balance = createDanilCreditsBalance();
  // Abrir la sección prepara Credits; su fallo se queda en la tarjeta y se reintenta aquí.
  const [preparation, { refetch: retryPreparation }] = createResource(
    () => props.onPrepare,
    async (prepare) => {
      try { await prepare(); return null; }
      catch (cause) { return prosaDe(cause); }
    },
  );
  const credits = (): Service => ({ ...props.credits, ready: props.credits.ready && !preparation.loading && !preparation() });
  const recharge = () => capabilities().danilCredits?.recharge;
  return (
    <div class="grid min-w-0 divide-y divide-border">
      <section class="grid min-w-0 gap-2 p-3" aria-label={t("chat.credits.label")}>
        <h3 class="m-0 text-ui font-semibold text-neutral-950">{t("chat.credits.label")}</h3>
        <div class="flex min-h-6 items-center justify-between gap-2">
          <p class="m-0 truncate text-xs tabular-nums text-neutral-950">
            <span class="mr-1.5 text-caption text-neutral-500">{t("chat.credits.balance")}</span>
            <span role="status">{balance.label()}</span>
          </p>
          <Show when={recharge()}>
            {(open) => (
              <Button variant="ghost" size="compact" class="text-neutral-500 hover:text-neutral-950" onClick={() => void open()().catch(() => undefined)}>
                {t("chat.credits.add")}
              </Button>
            )}
          </Show>
        </div>
        <Show when={!preparation.loading && preparation()}>
          {(failure) => (
            <div class="flex items-center justify-between gap-2" data-credits-status="">
              <p class="m-0 min-w-0 text-caption text-neutral-500" role="status">{failure()}</p>
              <Button variant="ghost" size="compact" onClick={() => void retryPreparation()}>{t("common.part.retry")}</Button>
            </div>
          )}
        </Show>
        <UseButton service={credits()} unavailable={t("chat.credits.unavailable")} />
      </section>
      <section class="grid min-w-0 gap-2 p-3" aria-label={t("surfaces.label.free")} data-router-state={props.router.state}>
        <div class="flex items-center justify-between gap-2">
          <h3 class="m-0 text-ui font-semibold text-neutral-950">{t("surfaces.label.free")}</h3>
          <Show when={props.router.state === "ready"}>
            <Check size={13} class="shrink-0 text-neutral-500" role="img" aria-label={t("chat.services.active")} />
          </Show>
        </div>
        <p class="m-0 text-xs text-neutral-500">{t("chat.services.router_description")}</p>
        <Show when={props.router.state === "activate"}>
          <Button variant="outline" size="sm" class="w-full" disabled={props.router.activating} onClick={props.router.onActivate}>
            {t("chat.model.router_activate")}
          </Button>
        </Show>
        <Show when={props.router.state === "ready"}>
          <UseButton service={props.router} unavailable={t("chat.model.router_route_unavailable")} />
        </Show>
        <Show when={props.router.state !== "activate" && props.router.state !== "ready"}>
          <p class="m-0 flex min-h-8 items-center justify-center rounded-md border border-border text-xs text-neutral-500" role="status">
            {routerStatus(props.router.state)}
          </p>
        </Show>
      </section>
    </div>
  );
}

function routerStatus(state: RouterOfferState): JSX.Element {
  if (state === "loading") return t("chat.services.loading");
  if (state === "update_engine") return t("chat.model.router_update_engine");
  return t("chat.model.router_route_unavailable");
}

function UseButton(props: { service: Service; unavailable: string }) {
  return (
    <Button
      variant="outline"
      size="sm"
      class="w-full"
      aria-pressed={props.service.selected}
      disabled={!props.service.ready || props.service.selected}
      title={props.service.ready ? undefined : props.unavailable}
      onClick={() => props.service.onUse()}
    >
      <Show when={props.service.selected} fallback={t("chat.services.use")}>
        <Check size={14} aria-hidden="true" />
        {t("chat.services.in_use")}
      </Show>
    </Button>
  );
}
