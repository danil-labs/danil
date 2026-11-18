import { Show } from "solid-js";
import { t } from "../../lib/i18n";
import type { Capabilities } from "../../lib/platform";
import { Button } from "../../ui/Button";
import { Input } from "../../ui/Input";
import { createPromoState } from "./promo-state";

export default function PromoRedeem(props: { redeem: NonNullable<Capabilities["webPromo"]> }) {
  const state = createPromoState(() => props.redeem);
  return <form class="flex flex-col gap-2 p-2" onSubmit={event => void state.submit(event)}>
    <label class="text-caption font-medium text-neutral-500" for="promo-code">{t("web.promo.redeem")}</label>
    <Input id="promo-code" value={state.code()} onInput={event => state.setCode(event.currentTarget.value)} disabled={state.busy()} autocomplete="off" />
    <Button type="submit" variant="secondary" disabled={state.busy() || !state.valid()}>{t("web.promo.redeem")}</Button>
    <Show when={state.message()}><p class="m-0 text-caption" role={state.failed() ? "alert" : "status"} data-rejection-code={state.rejection()?.code} data-retry-after-ms={state.rejection()?.delay}>{state.label()}</p></Show>
  </form>;
}
