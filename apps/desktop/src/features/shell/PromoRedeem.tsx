import { createSignal, Show } from "solid-js";
import { t } from "../../lib/i18n";
import type { Capabilities } from "../../lib/platform";
import { Button } from "../../ui/Button";
import { Input } from "../../ui/Input";

export default function PromoRedeem(props: { redeem: NonNullable<Capabilities["webPromo"]>; reauth?: Capabilities["webReauth"] }) {
  const [code, setCode] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [message, setMessage] = createSignal("");
  const [failed, setFailed] = createSignal(false);
  let attempt: { code: string; key: string } | undefined;
  async function submit(event: SubmitEvent) {
    event.preventDefault();
    const value = code().trim();
    if (busy() || !value) return;
    if (attempt?.code !== value) attempt = { code: value, key: crypto.randomUUID() };
    setBusy(true); setMessage(""); setFailed(false);
    try {
      const result = await props.redeem(value, attempt.key);
      setMessage(result.machine?.state === "ready" || result.machine?.state === "running" ? "web.promo.ready" : "web.promo.success");
      setCode("");
      attempt = undefined;
    } catch (cause) {
      const error = cause as { status?: number; code?: string } | null;
      setFailed(true);
      setMessage(error?.status === 422 ? "web.promo.invalid" : error?.status === 403 && error.code !== "organization_selection_required" ? "web.promo.denied" :
        error?.status === 409 ? (error.code === "organization_has_machine" ? "web.promo.has_machine" : "web.promo.used") : "web.promo.unavailable");
    } finally { setBusy(false); }
  }
  return <form class="flex flex-col gap-2 p-2" onSubmit={event => void submit(event)}>
    <Show when={props.reauth?.needed()}><p class="m-0 text-caption" role="alert" data-web-reauth="">{t("web.promo.reauth")}</p>
      <Button type="button" variant="secondary" data-web-reauth-sign-in="" onClick={() => props.reauth?.signIn()}>{t("web.promo.reauth_action")}</Button></Show>
    <label class="text-caption font-medium text-neutral-500" for="promo-code">{t("web.promo.redeem")}</label>
    <Input id="promo-code" value={code()} onInput={event => setCode(event.currentTarget.value)} disabled={busy()} autocomplete="off" />
    <Button type="submit" variant="secondary" disabled={busy() || !code().trim()}>{t("web.promo.redeem")}</Button>
    <Show when={message()}><p class="m-0 text-caption" role={failed() ? "alert" : "status"}>{t(message())}</p></Show>
  </form>;
}
