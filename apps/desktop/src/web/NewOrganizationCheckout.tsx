import { createEffect, createMemo, createResource, createSignal, For, onCleanup, Show } from "solid-js";
import { t } from "../lib/i18n";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Select } from "../ui/Select";
import { SettingsRow, SettingsSection } from "../features/settings/index";
import { PlatformSessionError } from "./platform-session";
import { PAYMENT_URL_DEADLINE_MS, waitForPaymentUrl } from "./billing-v2-return";
import { BillingPromotionField, promotionCodeInvalid } from "./BillingPromotionField";
import { checkoutPlans } from "./billing-v2-plans";
import type { billingV2 } from "../platform/treasury";
import { rememberBillingReturn } from "./billing-route";
import { bindCreationCheckout, creationKey } from "./billing-v2-idempotency";

type Api = ReturnType<typeof billingV2>;

export default function NewOrganizationCheckout(props: { api: Api; initialPlan?: string; initialPromotion?: string }) {
  const [open, setOpen] = createSignal(false);
  const [catalog, { refetch }] = createResource(open, () => props.api.catalog());
  const [name, setName] = createSignal("");
  const [plan, setPlan] = createSignal(props.initialPlan ?? "pro");
  const [promotion, setPromotion] = createSignal(props.initialPromotion ?? "");
  const [promotionInvalid, setPromotionInvalid] = createSignal(false);
  const plans = createMemo(() => {
    const data = catalog.error ? undefined : catalog();
    return data ? checkoutPlans(data).filter(item => item.choice) : [];
  });
  const selected = () => plans().find(item => item.id === plan()) ?? plans()[0];
  const [busy, setBusy] = createSignal(false);
  const [status, setStatus] = createSignal("");
  const lifetime = new AbortController();
  onCleanup(() => lifetime.abort());
  let retryDelay = 1000;
  createEffect(() => {
    const error = catalog.error;
    if (!open() || !error) { retryDelay = 1000; return; }
    if (!(error instanceof PlatformSessionError) || ![404, 429, 501, 503].includes(error.status)) return;
    const retryAfter = Math.max(0, Number(error.retryAfter) * 1000 || 0);
    const timer = setTimeout(() => {
      void Promise.resolve(refetch()).catch(cause => setStatus(cause instanceof PlatformSessionError && cause.status === 403 ? "denied" : "unavailable"));
    }, Math.max(retryAfter, retryDelay * (0.75 + Math.random() * 0.5)));
    retryDelay = Math.min(retryDelay * 2, 30000);
    onCleanup(() => clearTimeout(timer));
  });
  async function submit() {
    const current = catalog();
    const option = selected();
    const choice = option?.choice;
    if (busy() || !current || !option || !choice) return;
    setBusy(true); setStatus(""); setPromotionInvalid(false);
    const deadline = AbortSignal.timeout(PAYMENT_URL_DEADLINE_MS);
    const signal = AbortSignal.any([lifetime.signal, deadline]);
    try {
      const version = current.catalog_version;
      const code = promotion().trim() || undefined;
      const organizationName = name();
      const key = await creationKey(sessionStorage, option.id, version, organizationName, code);
      signal.throwIfAborted();
      const created = await props.api.createOrganization(choice.plan_key, version, organizationName, key, choice.variant, code);
      bindCreationCheckout(sessionStorage, key, created.checkout_id);
      const url = await waitForPaymentUrl(created, () => props.api.checkoutStatus(created.checkout_id, signal), signal, () => setStatus("checkout_preparing"));
      rememberBillingReturn(created.checkout_id);
      window.location.assign(url);
    } catch (error) {
      if (lifetime.signal.aborted) return;
      if (promotionCodeInvalid(error)) setPromotionInvalid(true);
      else setStatus(error instanceof Error && error.message === "invalid_organization_name" ? "invalid_name" : error instanceof PlatformSessionError && error.status === 403 ? "denied" : "unavailable");
    } finally { if (!lifetime.signal.aborted) setBusy(false); }
  }
  return <SettingsSection title={t("web.billing_v2.new_org")}>
    <Show when={open()} fallback={<Button variant="secondary" onClick={() => setOpen(true)}>{t("web.billing_v2.new_org")}</Button>}>
      <Show when={!catalog.loading} fallback={<p>{t("web.billing_v2.loading")}</p>}>
        <Show when={!catalog.error && catalog()} fallback={<p role="status">{t("web.billing_v2.unavailable")}</p>}>
          <>
            <SettingsRow label={<label for="billing-org-name">{t("web.billing_v2.org_name")}</label>}><Input id="billing-org-name" value={name()} onInput={event => setName(event.currentTarget.value)} /></SettingsRow>
            <SettingsRow label={<label for="billing-org-plan">{t("web.billing_v2.plan")}</label>}><Select id="billing-org-plan" value={selected()?.id ?? ""} disabled={busy()} onChange={event => { setPlan(event.currentTarget.value); setPromotionInvalid(false); }}><For each={plans()}>{item => <option value={item.id}>{t(`web.billing_v2.plan_${item.id}`)}</option>}</For></Select></SettingsRow>
            <Show when={selected()}><BillingPromotionField value={promotion()} disabled={busy()} invalid={promotionInvalid()}
              onEdit={value => { setPromotion(value); setPromotionInvalid(false); }} /></Show>
            <Button disabled={busy() || !selected()} onClick={() => void submit()}>{t("web.billing_v2.continue")}</Button>
          </>
        </Show>
      </Show>
    </Show>
    <Show when={status()}><p role="status">{t(`web.billing_v2.${status()}`)}</p></Show>
  </SettingsSection>;
}
