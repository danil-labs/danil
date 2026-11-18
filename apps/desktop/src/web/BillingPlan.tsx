import { createResource, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { t } from "../lib/i18n";
import { Button } from "../ui/Button";
import { SettingsPanel, SettingsRow, SettingsSection } from "../features/settings/layout";
import { PlatformSessionError } from "./platform-session";
import { billingScopes, type BillingScope } from "./billing-v2-scopes";
import type { billingV2 } from "./billing-v2-api";
import { checkoutReturn, followCheckout } from "./billing-v2-return";

type Api = ReturnType<typeof billingV2>;
type Money = { currency: "MXN"; amount_micro: string };

function displayMoney(value: Money) {
  const micro = BigInt(value.amount_micro);
  const absolute = micro < 0n ? -micro : micro;
  const cents = (absolute + 5000n) / 10000n;
  return `${micro < 0n ? "-" : ""}${(cents / 100n).toLocaleString()}.${String(cents % 100n).padStart(2, "0")}`;
}

export default function BillingPlan(props: { api: Api; role: () => string; context: string }) {
  const permitted = (scope: BillingScope) => billingScopes(props.role()).includes(scope);
  const [failure, setFailure] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [checkoutState, setCheckoutState] = createSignal("");
  const lifetime = new AbortController();
  let returned: { id: string; cancelled: boolean } | undefined;
  const [revision, refresh] = createSignal(0);
  const [data] = createResource(revision, async () => {
    const [catalog, organization, balance, transactions, invoices] = await Promise.all([
      props.api.catalog(), permitted("billing.read") ? props.api.organization() : null,
      permitted("credits.read") ? props.api.balance() : null,
      permitted("credits.read") ? props.api.transactions() : null,
      permitted("billing.read") ? props.api.invoices() : null,
    ]);
    return { catalog, organization, balance, transactions, invoices };
  });
  let retry: ReturnType<typeof setTimeout> | undefined;
  const pendingPrefix = `danil.billing.${props.context}.`;
  const message = (error: unknown) => error instanceof PlatformSessionError && error.status === 403 ? "web.billing_v2.denied" : "web.billing_v2.unavailable";
  const keyFor = (action: string) => { const storageKey = `${pendingPrefix}key.${action}`; const key = sessionStorage.getItem(storageKey) ?? crypto.randomUUID(); sessionStorage.setItem(storageKey, key); return key; };
  async function run(action: string, operation: (key: string) => Promise<unknown>) {
    if (busy()) return;
    setBusy(true); setFailure("");
    try { await operation(keyFor(action)); sessionStorage.removeItem(`${pendingPrefix}key.${action}`); refresh(n => n + 1); }
    catch (error) { setFailure(message(error)); }
    finally { setBusy(false); }
  }
  function redirect(url: string | null) {
    if (!url) throw new Error("checkout_not_ready");
    const target = new URL(url);
    if (target.protocol !== "https:" || target.username || target.password) throw new Error("invalid_checkout_url");
    window.location.assign(target.href);
  }
  function later() {
    clearTimeout(retry);
    retry = setTimeout(() => refresh(n => n + 1), 30000);
  }
  async function checkReturn() {
    if (!returned || busy()) return;
    setBusy(true); setFailure(""); setCheckoutState("pending");
    const deadline = AbortSignal.timeout(60000);
    const signal = AbortSignal.any([lifetime.signal, deadline]);
    try {
      const outcome = await followCheckout({
        cancelled: returned.cancelled,
        read: async () => (await props.api.checkoutStatus(returned!.id, signal)).state,
        active: async () => (await props.api.organization(signal)).state === "active",
        wait: ms => new Promise<void>((resolve, reject) => {
          signal.throwIfAborted();
          const onAbort = () => { clearTimeout(timer); reject(signal.reason); };
          const timer = setTimeout(() => { signal.removeEventListener("abort", onAbort); resolve(); }, ms);
          signal.addEventListener("abort", onAbort, { once: true });
        }),
      });
      if (!lifetime.signal.aborted) setCheckoutState(outcome);
    } catch (error) {
      if (!lifetime.signal.aborted) {
        if (deadline.aborted) setCheckoutState("processing");
        else { setCheckoutState(""); setFailure(message(error)); }
      }
    } finally { if (!lifetime.signal.aborted) setBusy(false); }
  }
  onMount(() => {
    const url = checkoutReturn(window.location.href);
    if (url.clean !== window.location.href) history.replaceState(history.state, "", url.clean);
    if (url.id && permitted("billing.read")) {
      returned = { id: url.id, cancelled: url.cancelled };
      void checkReturn();
    } else if (url.id) {
      setFailure("web.billing_v2.denied");
    }
    const timer = setInterval(() => { if (data.error && (!(data.error instanceof PlatformSessionError) || [404, 501, 503].includes(data.error.status))) later(); }, 30000);
    onCleanup(() => { lifetime.abort(); clearInterval(timer); clearTimeout(retry); });
  });
  return <SettingsPanel>
    <Show when={failure()}><p role="alert">{t(failure())}</p></Show>
    <Show when={checkoutState()}><p role="status">{t(`web.billing_v2.checkout_${checkoutState()}`)}</p></Show>
    <Show when={checkoutState() === "processing" && returned && !returned.cancelled}><Button disabled={busy()} onClick={() => void checkReturn()}>{t("web.billing_v2.check_again")}</Button></Show>
    <Show when={!data.loading} fallback={<p>{t("web.billing_v2.loading")}</p>}>
      <Show when={!data.error} fallback={<p role="status">{t(message(data.error))}</p>}>
        <Show when={data()}>{value => <>
          <Show when={value().organization}>{org => <SettingsSection title={t("web.billing_v2.plan")}>
            <SettingsRow label={t("web.billing_v2.plan")}><span>{org().plan_key} · {org().state}</span></SettingsRow>
            <For each={value().catalog.plans.filter(p => p.sellable && (p.plan_key === "pro" || p.plan_key === "team") && p.plan_key !== org().plan_key)}>{plan =>
              <Show when={permitted("billing.manage")}><SettingsRow label={plan.plan_key}><Button disabled={busy()} onClick={() => void run(`checkout:${plan.plan_key}`, async key => {
                const result = await props.api.checkout(plan.plan_key as "pro" | "team", value().catalog.catalog_version, key);
                redirect(result.url);
              })}>{t("web.billing_v2.upgrade")}</Button></SettingsRow></Show>
            }</For>
            <Show when={permitted("billing.manage") && org().payer.is_you}><SettingsRow label={t("web.billing_v2.payment")}><Button disabled={busy()} onClick={() => void run("portal", async key => redirect((await props.api.portal(key)).url))}>{t("web.billing_v2.open")}</Button></SettingsRow></Show>
            <Show when={permitted("billing.subscription.cancel")}><SettingsRow label={t(org().cancel_at_period_end ? "web.billing_v2.resume" : "web.billing_v2.cancel")}><Button disabled={busy()} onClick={() => void run(org().cancel_at_period_end ? "resume" : "cancel", key => org().cancel_at_period_end ? props.api.resume(key) : props.api.cancel(key))}>{t(org().cancel_at_period_end ? "web.billing_v2.resume" : "web.billing_v2.cancel")}</Button></SettingsRow></Show>
          </SettingsSection>}</Show>
          <Show when={value().balance}>{balance => <SettingsSection title={t("web.billing_v2.balance")}>
            <For each={(["available", "included", "gift", "purchased"] as const)}>{kind => <SettingsRow label={t(`web.billing_v2.${kind}`)}><span>{displayMoney(balance()[kind])}</span></SettingsRow>}</For>
            <Show when={permitted("credits.purchase")}><For each={value().catalog.credit_packs.filter(p => p.sellable)}>{pack => <SettingsRow label={displayMoney(pack.credits)}><Button disabled={busy()} onClick={() => void run(`purchase:${pack.pack_id}`, async key => redirect((await props.api.purchase(pack.pack_id, value().catalog.catalog_version, key)).url))}>{t("web.billing_v2.buy")}</Button></SettingsRow>}</For></Show>
          </SettingsSection>}</Show>
          <Show when={value().transactions}>{page => <SettingsSection title={t("web.billing_v2.transactions")}><Show when={page().items.length} fallback={<p>{t("web.billing_v2.empty")}</p>}><For each={page().items}>{item => <SettingsRow label={String(item.kind ?? "")}><span>{String(item.occurred_at ?? "")}</span></SettingsRow>}</For></Show></SettingsSection>}</Show>
          <Show when={value().invoices}>{page => <SettingsSection title={t("web.billing_v2.invoices")}><Show when={page().items.length} fallback={<p>{t("web.billing_v2.empty")}</p>}><For each={page().items}>{item => <SettingsRow label={String(item.status ?? "")}><span>{String(item.created_at ?? "")}</span></SettingsRow>}</For></Show></SettingsSection>}</Show>
        </>}</Show>
      </Show>
    </Show>
  </SettingsPanel>;
}
