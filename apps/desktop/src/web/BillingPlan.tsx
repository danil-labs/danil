import { createResource, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { t } from "../lib/i18n";
import { Button } from "../ui/Button";
import { BUSINESS_SALES_EMAIL } from "../lib/sales-contact";
import { SettingsPanel, SettingsRow, SettingsSection } from "../features/settings/index";
import { PlatformSessionError } from "./platform-session";
import { billingScopes, type BillingScope } from "./billing-v2-scopes";
import { BillingPromotionField, promotionCodeInvalid } from "./BillingPromotionField";
import { billingFingerprint } from "./billing-v2-idempotency";
import { checkoutPlans } from "./billing-v2-plans";
import type { billingV2, PlanChoice } from "./billing-v2-api";
import { hostedCheckoutUrl, PAYMENT_URL_DEADLINE_MS, paymentInProgress, waitForPaymentUrl } from "./billing-v2-return";
import { rememberBillingReturn } from "./billing-route";

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
      setError(cause instanceof PlatformSessionError && cause.status === 403 ? "web.billing_v2.denied" : "web.billing_v2.error");
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
const message = (error: unknown) => error instanceof PlatformSessionError && error.status === 403 ? "web.billing_v2.denied" : "web.billing_v2.error";

export default function BillingPlan(props: { api: Api; role: () => string; context: string; fallbackPlan?: string; summaryHref?: string; initialPlan?: string; initialPromotion?: string; revision?: number }) {
  const summary = () => props.summaryHref !== undefined;
  const permitted = (scope: BillingScope) => billingScopes(props.role()).includes(scope);
  const lifetime = new AbortController();
  onCleanup(() => lifetime.abort());
  const [preparing, setPreparing] = createSignal(false);
  const [promotion, setPromotion] = createSignal(props.initialPromotion ?? "");
  const [selected, setSelected] = createSignal(props.initialPlan);
  const [promotionInvalid, setPromotionInvalid] = createSignal(false);
  const [failure, setFailure] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [revision, refresh] = createSignal(0);
  const [data] = createResource(() => [revision(), props.revision, props.role()] as const, async () => {
    const [catalog, organization, balance, transactions] = await Promise.allSettled([
      summary() ? null : props.api.catalog(), permitted("billing.read") ? props.api.organization() : null,
      permitted("credits.read") ? props.api.balance() : null,
      !summary() && permitted("credits.read") ? props.api.transactions() : null,
    ]);
    return { catalog, organization, balance, transactions };
  });
  const currentPlan = (value: NonNullable<ReturnType<typeof data>>) => {
    const org = fulfilled(value.organization);
    const key = org?.plan_key ?? props.fallbackPlan;
    const variant = fulfilled(value.catalog)?.plans.find(plan => plan.plan_key === key)?.display_variants?.find(item => item.plan_key === key && item.edition === org?.edition);
    return { id: variant?.variant ?? key, label: variant?.display_name ?? (key ? t(`web.billing_v2.plan_${key}`) : "") };
  };
  const pendingPrefix = () => `danil.billing.${props.context}.`;
  const keyFor = (action: string) => { const storageKey = `${pendingPrefix()}key.${action}`; const key = sessionStorage.getItem(storageKey) ?? crypto.randomUUID(); sessionStorage.setItem(storageKey, key); return key; };
  async function run(action: string, operation: (key: string, signal: AbortSignal) => Promise<unknown>, promotionCode?: string) {
    if (busy()) return;
    setBusy(true); setFailure(""); setPromotionInvalid(false);
    const signal = AbortSignal.any([lifetime.signal, AbortSignal.timeout(PAYMENT_URL_DEADLINE_MS)]);
    try {
      const scopedAction = promotionCode ? `${action}:${await billingFingerprint(promotionCode)}` : action;
      signal.throwIfAborted();
      await operation(keyFor(scopedAction), signal);
      sessionStorage.removeItem(`${pendingPrefix()}key.${scopedAction}`);
      refresh(n => n + 1);
    } catch (error) {
      if (lifetime.signal.aborted) return;
      if (promotionCodeInvalid(error)) setPromotionInvalid(true);
      else setFailure(message(error));
    }
    finally { if (!lifetime.signal.aborted) { setPreparing(false); setBusy(false); } }
  }
  function redirect(url: string, checkoutId?: string) {
    lifetime.signal.throwIfAborted();
    rememberBillingReturn(checkoutId);
    window.location.assign(url);
  }
  async function upgrade(plan: PlanChoice, version: number) {
    const api = props.api;
    const code = promotion().trim() || undefined;
    const option = plan.variant ?? plan.plan_key;
    await run(`checkout:upgrade:${version}:${option}`, async (key, signal) => {
      signal.throwIfAborted();
      const created = await api.checkout(plan.plan_key, version, key, plan.variant, code);
      redirect(await waitForPaymentUrl(created, () => api.checkoutStatus(created.checkout_id, signal), signal, () => setPreparing(true)), created.checkout_id);
    }, code);
  }
  async function buy(pack: string, version: number) {
    const api = props.api;
    await run(`purchase:${version}:${pack}`, async (key, signal) => {
      const created = await api.purchase(pack, version, key);
      redirect(await waitForPaymentUrl(created, async () => {
        const purchase = await api.purchaseStatus(created.purchase_id, signal);
        return { url: purchase.url, terminal: !paymentInProgress(purchase.state) };
      }, signal, () => setPreparing(true)));
    });
  }
  async function portal() { const api = props.api; await run("portal", async key => redirect(hostedCheckoutUrl((await api.portal(key)).url, "portal"))); }
  onMount(() => {
    const timer = setInterval(() => {
      if (data.loading) return;
      const results = data.latest;
      if (results && Object.values(results).some(result => {
        const error = failed(result);
        return error && (!(error instanceof PlatformSessionError) || [404, 501, 503].includes(error.status));
      })) refresh(n => n + 1);
    }, 30000);
    onCleanup(() => clearInterval(timer));
  });
  return <SettingsPanel>
    <Show when={props.summaryHref}>{href => <div><Button as="a" href={href()}>{t("settings.billing.change_plan")}</Button></div>}</Show>
    <Show when={preparing()}><p role="status">{t("web.billing_v2.checkout_preparing")}</p></Show>
    <Show when={failure()}><p role="alert">{t(failure())}</p></Show>
    <Show when={!data.loading || data.latest} fallback={<p>{t("web.billing_v2.loading")}</p>}>
      <Show when={!data.error} fallback={<p role="status">{t(message(data.error))}</p>}>
        <Show when={data()}>{value => <>
          <Show when={currentPlan(value()).id}><SettingsSection>
            <SettingsRow label={t("web.billing_v2.your_plan")}><span>{currentPlan(value()).label}</span></SettingsRow>
          </SettingsSection></Show>
          <Show when={failed(value().organization)}>{error => <SettingsSection title={t("web.billing_v2.plan")}><p role="status">{t(message(error()))}</p></SettingsSection>}</Show>
          <Show when={failed(value().catalog)}>{error => <SettingsSection title={t("web.billing_v2.plan")}><p role="status">{t(error() instanceof PlatformSessionError && (error().status === 503 || error().code === "plan_price_pending") ? "web.billing_v2.unavailable" : message(error()))}</p></SettingsSection>}</Show>
          <Show when={fulfilled(value().catalog)}>{catalog => <SettingsSection title={t("web.billing_v2.choose_plan")}>
            <Show when={permitted("billing.manage") && checkoutPlans(catalog()).some(plan => plan.choice)}>
              <BillingPromotionField value={promotion()} disabled={busy()} invalid={promotionInvalid()}
                onEdit={value => { setPromotion(value); setPromotionInvalid(false); }} />
            </Show>
            <div class="grid gap-2 sm:grid-cols-2">
              <For each={checkoutPlans(catalog())}>{plan => <article class="rounded-lg border p-3" classList={{ "border-primary": selected() === plan.id, "border-line": selected() !== plan.id }} aria-current={selected() === plan.id ? "true" : undefined}>
                <strong>{plan.displayName ?? t(`web.billing_v2.plan_${plan.id}`)}</strong>
                <Show when={plan.price}>{price => <p>{displayMoney(price())} MXN / {t("web.billing_v2.month")}</p>}</Show>
                <Show when={plan.choice} fallback={<Show when={plan.id === "enterprise"} fallback={plan.pricePending ? <p role="status">{t("web.billing_v2.unavailable")}</p> : null}><a href={`mailto:${BUSINESS_SALES_EMAIL}`}>{t("web.billing_v2.contact")}</a></Show>}>{choice =>
                  <Show when={permitted("billing.manage")}><Button disabled={busy() || currentPlan(value()).id === plan.id} onClick={() => { setSelected(plan.id); void upgrade(choice(), catalog().catalog_version); }}>{t(currentPlan(value()).id === "free" ? "web.billing_v2.choose" : "web.billing_v2.upgrade")}</Button></Show>
                }</Show>
              </article>}</For>
            </div>
          </SettingsSection>}</Show>
          <Show when={fulfilled(value().organization)}>{org => <SettingsSection>
            <Show when={!summary() && permitted("billing.manage") && org().payer.is_you}><SettingsRow label={t("web.billing_v2.payment")}><Button disabled={busy()} onClick={() => void portal()}>{t("web.billing_v2.open")}</Button></SettingsRow></Show>
          </SettingsSection>}</Show>
          <Show when={failed(value().balance)}>{error => <SettingsSection title={t("web.billing_v2.balance")}><p role="status">{t(message(error()))}</p></SettingsSection>}</Show>
          <Show when={fulfilled(value().balance)}>{balance => <SettingsSection title={t("web.billing_v2.balance")}>
            <For each={(["available", "included", "gift", "purchased"] as const)}>{kind => <SettingsRow label={t(`web.billing_v2.${kind}`)}><span>{displayMoney(balance()[kind])}</span></SettingsRow>}</For>
            <Show when={!summary() && permitted("credits.purchase")}><For each={fulfilled(value().catalog)?.credit_packs.filter(p => p.sellable)}>{pack => <SettingsRow label={displayMoney(pack.credits)}><Button disabled={busy()} onClick={() => { const catalog = fulfilled(value().catalog); if (catalog) void buy(pack.pack_id, catalog.catalog_version); }}>{t("web.billing_v2.buy")}</Button></SettingsRow>}</For></Show>
          </SettingsSection>}</Show>
          <Show when={failed(value().transactions)}>{error => <SettingsSection title={t("web.billing_v2.transactions")}><p role="status">{t(message(error()))}</p></SettingsSection>}</Show>
          <Show when={fulfilled(value().transactions)}>{page => <PagedRows title={t("web.billing_v2.transactions")} initial={page()} load={props.api.transactions} />}</Show>
        </>}</Show>
      </Show>
    </Show>
  </SettingsPanel>;
}
