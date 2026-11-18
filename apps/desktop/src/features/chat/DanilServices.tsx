import Check from "lucide-solid/icons/check";
import type { RouterOfferState } from "@terminus/tasks";
import { Show, type JSX } from "solid-js";
import { t } from "../../lib/i18n";
import { Button } from "../../ui/Button";
import DanilCreditsCard, { UseButton, type Service } from "./DanilCreditsCard";

/** Los servicios de Danil eligen el modelo por su cuenta: aquí no se nombra ninguno. */
export default function DanilServices(props: {
  onPrepare?: () => Promise<void>;
  credits: Service;
  router: Service & { state: RouterOfferState; activating: boolean; onActivate: () => void };
}) {
  return (
    <div class="grid min-w-0 divide-y divide-border">
      <DanilCreditsCard onPrepare={props.onPrepare} credits={props.credits} />
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
