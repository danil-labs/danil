import { createEffect, createResource, createSignal, For, onCleanup, Show } from "solid-js";
import { t } from "../lib/i18n";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Select } from "../ui/Select";
import { SettingsRow, SettingsSection } from "../features/settings/index";
import { PlatformSessionError } from "./platform-session";
import { hostedCheckoutUrl } from "./billing-v2-return";
import { checkoutPlans } from "./billing-v2-plans";
import type { billingV2 } from "./billing-v2-api";
import { bindCreationCheckout, creationKey } from "./billing-v2-idempotency";

type Api = ReturnType<typeof billingV2>;

export default function NewOrganizationCheckout(props: { api: Api; onActive?: (organizationId: string) => Promise<void> }) {
  const [open, setOpen] = createSignal(false);
  const [catalog, { refetch }] = createResource(open, () => props.api.catalog());
  const [name, setName] = createSignal("");
  const [plan, setPlan] = createSignal("pro");
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
    const choice = current && checkoutPlans(current).find(item => item.id === plan())?.choice;
    if (busy() || !current || !choice) return;
    setBusy(true); setStatus("");
    const deadline = AbortSignal.timeout(60000);
    const signal = AbortSignal.any([lifetime.signal, deadline]);
    try {
      const version = current.catalog_version;
      const key = await creationKey(sessionStorage, plan(), version, name());
      const created = await props.api.createOrganization(choice.plan_key, version, name(), key, choice.variant);
      bindCreationCheckout(sessionStorage, key, created.checkout_id);
      let url = created.url;
      let delay = 1000;
      while (!url) {
        setStatus("checkout_preparing");
        let retryAfter = 0;
        try {
          const state = await props.api.checkoutStatus(created.checkout_id, signal);
          if (state.state === "active" && state.organization_id && props.onActive) { await props.onActive(state.organization_id); return; }
          if (state.terminal) throw new Error("checkout_finished");
          url = state.url;
        } catch (error) {
          if (!(error instanceof PlatformSessionError) || ![404, 429, 501, 503].includes(error.status)) throw error;
          retryAfter = Math.max(0, Number(error.retryAfter) * 1000 || 0);
        }
        if (!url) await new Promise<void>((resolve, reject) => {
          signal.throwIfAborted();
          const onAbort = () => { clearTimeout(timer); reject(signal.reason); };
          const timer = setTimeout(() => { signal.removeEventListener("abort", onAbort); resolve(); }, Math.max(retryAfter, delay * (0.75 + Math.random() * 0.5)));
          signal.addEventListener("abort", onAbort, { once: true });
        });
        delay = Math.min(delay * 2, 8000);
      }
      window.location.assign(hostedCheckoutUrl(url));
    } catch (error) {
      if (!lifetime.signal.aborted) setStatus(error instanceof Error && error.message === "invalid_organization_name" ? "invalid_name" : error instanceof PlatformSessionError && error.status === 403 ? "denied" : "unavailable");
    } finally { if (!lifetime.signal.aborted) setBusy(false); }
  }
  return <SettingsSection title={t("web.billing_v2.new_org")}>
    <Show when={open()} fallback={<Button variant="secondary" onClick={() => setOpen(true)}>{t("web.billing_v2.new_org")}</Button>}>
      <Show when={!catalog.loading} fallback={<p>{t("web.billing_v2.loading")}</p>}>
        <Show when={!catalog.error && catalog()} fallback={<p role="status">{t("web.billing_v2.unavailable")}</p>}>
          {value => <>
            <SettingsRow label={<label for="billing-org-name">{t("web.billing_v2.org_name")}</label>}><Input id="billing-org-name" value={name()} onInput={event => setName(event.currentTarget.value)} /></SettingsRow>
            <SettingsRow label={<label for="billing-org-plan">{t("web.billing_v2.plan")}</label>}><Select id="billing-org-plan" value={plan()} onChange={event => setPlan(event.currentTarget.value)}><For each={checkoutPlans(value()).filter(item => item.choice)}>{item => <option value={item.id}>{t(`web.billing_v2.plan_${item.id}`)}</option>}</For></Select></SettingsRow>
            <Button disabled={busy() || !checkoutPlans(value()).some(item => item.choice && item.id === plan())} onClick={() => void submit()}>{t("web.billing_v2.continue")}</Button>
          </>}
        </Show>
      </Show>
    </Show>
    <Show when={status()}><p role="status">{t(`web.billing_v2.${status()}`)}</p></Show>
  </SettingsSection>;
}
