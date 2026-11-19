import { createResource, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { t } from "../lib/i18n";
import { Button } from "../ui/Button";
import { BUSINESS_SALES_EMAIL, SettingsPanel, SettingsRow, SettingsSection } from "../features/settings/index";
import { PlatformSessionError } from "./platform-session";
import { billingScopes, type BillingScope } from "./billing-v2-scopes";
import { checkoutPlans } from "./billing-v2-plans";
import type { billingV2, PlanChoice } from "./billing-v2-api";
import { hostedCheckoutUrl } from "./billing-v2-return";
import NewOrganizationCheckout from "./NewOrganizationCheckout";

type Api = ReturnType<typeof billingV2>;
type Money = { currency: "MXN"; amount_micro: string };
type Page = Awaited<ReturnType<Api["transactions"]>>;

function PagedRows(props: { title: string; initial: Page; load: (cursor: string) => Promise<Page> }) {
  const [page, setPage] = createSignal(props.initial);
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal("");
  const seen = new Set<string>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;
  onCleanup(() => { disposed = true; clearTimeout(timer); });
  async function more() {
    const cursor = page().next_cursor;
    if (!cursor || busy() || seen.has(cursor)) return;
    clearTimeout(timer); setBusy(true); setError("");
    try {
      const next = await props.load(cursor);
      if (disposed) return;
      if (next.next_cursor === cursor || (next.next_cursor && seen.has(next.next_cursor))) throw new Error("repeated_cursor");
      seen.add(cursor);
      setPage(old => ({ items: [...old.items, ...next.items], next_cursor: next.next_cursor }));
    } catch (cause) {
      if (disposed) return;
      setError(cause instanceof PlatformSessionError && cause.status === 403 ? "web.billing_v2.denied" : "web.billing_v2.unavailable");
      if (cause instanceof PlatformSessionError && [404, 501, 503].includes(cause.status)) timer = setTimeout(() => void more(), 30000);
    } finally { if (!disposed) setBusy(false); }
  }
  return <SettingsSection title={props.title}>
    <Show when={page().items.length} fallback={<p>{t("web.billing_v2.empty")}</p>}><For each={page().items}>{item => <SettingsRow label={String(item.kind ?? item.status ?? "")}><span>{String(item.occurred_at ?? item.created_at ?? "")}</span></SettingsRow>}</For></Show>
    <Show when={error()}><p role="status">{t(error())}</p></Show>
    <Show when={page().next_cursor}><Button disabled={busy()} onClick={() => void more()}>{t("web.billing_v2.more")}</Button></Show>
  </SettingsSection>;
}

function displayMoney(value: Money) {
  const micro = BigInt(value.amount_micro);
  const absolute = micro < 0n ? -micro : micro;
  const cents = (absolute + 5000n) / 10000n;
  return `${micro < 0n ? "-" : ""}${(cents / 100n).toLocaleString()}.${String(cents % 100n).padStart(2, "0")}`;
}

const fulfilled = <T,>(result: PromiseSettledResult<T>): T | null => result.status === "fulfilled" ? result.value : null;
const failed = (result: PromiseSettledResult<unknown>) => result.status === "rejected" ? result.reason : null;
const message = (error: unknown) => error instanceof PlatformSessionError && error.status === 403 ? "web.billing_v2.denied" : "web.billing_v2.unavailable";

export default function BillingPlan(props: { api: Api; role: () => string; context: string; creationApi?: Api }) {
  const permitted = (scope: BillingScope) => billingScopes(props.role()).includes(scope);
  const [failure, setFailure] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [revision, refresh] = createSignal(0);
  const [data] = createResource(revision, async () => {
    const [catalog, organization, balance, transactions, invoices] = await Promise.allSettled([
      props.api.catalog(), permitted("billing.read") ? props.api.organization() : null,
      permitted("credits.read") ? props.api.balance() : null,
      permitted("credits.read") ? props.api.transactions() : null,
      permitted("billing.read") ? props.api.invoices() : null,
    ]);
    return { catalog, organization, balance, transactions, invoices };
  });
  let retry: ReturnType<typeof setTimeout> | undefined;
  const pendingPrefix = () => `danil.billing.${props.context}.`;
  const keyFor = (action: string) => { const storageKey = `${pendingPrefix()}key.${action}`; const key = sessionStorage.getItem(storageKey) ?? crypto.randomUUID(); sessionStorage.setItem(storageKey, key); return key; };
  async function run(action: string, operation: (key: string) => Promise<unknown>) {
    if (busy()) return;
    setBusy(true); setFailure("");
    try { await operation(keyFor(action)); sessionStorage.removeItem(`${pendingPrefix()}key.${action}`); refresh(n => n + 1); }
    catch (error) { setFailure(message(error)); }
    finally { setBusy(false); }
  }
  function redirect(url: string | null) {
    window.location.assign(hostedCheckoutUrl(url));
  }
  async function upgrade(plan: PlanChoice, version: number) {
    const api = props.api;
    await run(`checkout:${version}:${plan.variant ?? plan.plan_key}`, async key => redirect((await api.checkout(plan.plan_key, version, key, plan.variant)).url));
  }
  async function buy(pack: string, version: number) {
    const api = props.api;
    await run(`purchase:${version}:${pack}`, async key => redirect((await api.purchase(pack, version, key)).url));
  }
  async function portal() { const api = props.api; await run("portal", async key => redirect((await api.portal(key)).url)); }
  async function changeSubscription(cancelled: boolean) { const api = props.api; await run(cancelled ? "resume" : "cancel", key => cancelled ? api.resume(key) : api.cancel(key)); }
  function later() {
    clearTimeout(retry);
    retry = setTimeout(() => refresh(n => n + 1), 30000);
  }
  onMount(() => {
    const timer = setInterval(() => {
      const results = data.latest;
      if (results && Object.values(results).some(result => {
        const error = failed(result);
        return error && (!(error instanceof PlatformSessionError) || [404, 501, 503].includes(error.status));
      })) later();
    }, 30000);
    onCleanup(() => { clearInterval(timer); clearTimeout(retry); });
  });
  return <SettingsPanel>
    <Show when={failure()}><p role="alert">{t(failure())}</p></Show>
    <Show when={!data.loading || data.latest} fallback={<p>{t("web.billing_v2.loading")}</p>}>
      <Show when={!data.error} fallback={<p role="status">{t(message(data.error))}</p>}>
        <Show when={data()}>{value => <>
          <Show when={failed(value().organization)}>{error => <SettingsSection title={t("web.billing_v2.plan")}><p role="status">{t(message(error()))}</p></SettingsSection>}</Show>
          <Show when={failed(value().catalog)}>{error => <SettingsSection title={t("web.billing_v2.plan")}><p role="status">{t(message(error()))}</p></SettingsSection>}</Show>
          <Show when={fulfilled(value().catalog)}>{catalog => <SettingsSection title={t("web.billing_v2.choose_plan")}>
            <div class="grid gap-2 sm:grid-cols-2">
              <For each={checkoutPlans(catalog())}>{plan => <article class="rounded-lg border border-line p-3">
                <strong>{t(`web.billing_v2.plan_${plan.id}`)}</strong>
                <Show when={plan.price}>{price => <p>{displayMoney(price())} MXN / {t("web.billing_v2.month")}</p>}</Show>
                <Show when={plan.choice} fallback={<Show when={plan.id === "enterprise"} fallback={<p role="status">{t("web.billing_v2.unavailable")}</p>}><a href={`mailto:${BUSINESS_SALES_EMAIL}`}>{t("web.billing_v2.contact")}</a></Show>}>{choice =>
                  <Show when={permitted("billing.manage")}><Button disabled={busy() || (!choice().variant && fulfilled(value().organization)?.plan_key === choice().plan_key)} onClick={() => void upgrade(choice(), catalog().catalog_version)}>{t("web.billing_v2.upgrade")}</Button></Show>
                }</Show>
              </article>}</For>
            </div>
          </SettingsSection>}</Show>
          <Show when={fulfilled(value().organization)}>{org => <SettingsSection title={t("web.billing_v2.plan")}>
            <SettingsRow label={t("web.billing_v2.plan")}><span>{org().plan_key} · {org().state}</span></SettingsRow>
            <Show when={permitted("billing.manage") && org().payer.is_you}><SettingsRow label={t("web.billing_v2.payment")}><Button disabled={busy()} onClick={() => void portal()}>{t("web.billing_v2.open")}</Button></SettingsRow></Show>
            <Show when={permitted("billing.subscription.cancel")}><SettingsRow label={t(org().cancel_at_period_end ? "web.billing_v2.resume" : "web.billing_v2.cancel")}><Button disabled={busy()} onClick={() => void changeSubscription(org().cancel_at_period_end)}>{t(org().cancel_at_period_end ? "web.billing_v2.resume" : "web.billing_v2.cancel")}</Button></SettingsRow></Show>
          </SettingsSection>}</Show>
          <Show when={failed(value().balance)}>{error => <SettingsSection title={t("web.billing_v2.balance")}><p role="status">{t(message(error()))}</p></SettingsSection>}</Show>
          <Show when={fulfilled(value().balance)}>{balance => <SettingsSection title={t("web.billing_v2.balance")}>
            <For each={(["available", "included", "gift", "purchased"] as const)}>{kind => <SettingsRow label={t(`web.billing_v2.${kind}`)}><span>{displayMoney(balance()[kind])}</span></SettingsRow>}</For>
            <Show when={permitted("credits.purchase")}><For each={fulfilled(value().catalog)?.credit_packs.filter(p => p.sellable)}>{pack => <SettingsRow label={displayMoney(pack.credits)}><Button disabled={busy()} onClick={() => { const catalog = fulfilled(value().catalog); if (catalog) void buy(pack.pack_id, catalog.catalog_version); }}>{t("web.billing_v2.buy")}</Button></SettingsRow>}</For></Show>
          </SettingsSection>}</Show>
          <Show when={failed(value().transactions)}>{error => <SettingsSection title={t("web.billing_v2.transactions")}><p role="status">{t(message(error()))}</p></SettingsSection>}</Show>
          <Show when={fulfilled(value().transactions)}>{page => <PagedRows title={t("web.billing_v2.transactions")} initial={page()} load={props.api.transactions} />}</Show>
          <Show when={failed(value().invoices)}>{error => <SettingsSection title={t("web.billing_v2.invoices")}><p role="status">{t(message(error()))}</p></SettingsSection>}</Show>
          <Show when={fulfilled(value().invoices)}>{page => <PagedRows title={t("web.billing_v2.invoices")} initial={page()} load={props.api.invoices} />}</Show>
        </>}</Show>
      </Show>
    </Show>
    <Show when={props.creationApi}>{api => <NewOrganizationCheckout api={api()} />}</Show>
  </SettingsPanel>;
}
