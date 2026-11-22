import { createResource, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { t } from "../lib/i18n";
import { Button } from "../../../../packages/ui/src/Button";
import { BUSINESS_SALES_EMAIL } from "../lib/sales-contact";
import { SettingsPanel, SettingsRow, SettingsSection } from "../../../../packages/features/settings/src/index";
import { PlatformSessionError } from "../../../../packages/session/src/platform-session";
import { billingScopes, type BillingScope } from "./billing-v2-scopes";
import { BillingPromotionField, promotionCodeInvalid } from "./BillingPromotionField";
import { billingFingerprint } from "./billing-v2-idempotency";
import { checkoutPlans } from "./billing-v2-plans";
import type { billingV2, PlanChoice } from "../../../../packages/platform-client/src/treasury";
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
    return { id: key, label: key ? t(`web.billing_v2.plan_${key}`) : "" };
  };
  const paid = (key: string | undefined) => key === "pro" || key === "team" || key === "enterprise";
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
    const refreshOnFocus = () => { if (!data.loading) refresh(n => n + 1); };
    window.addEventListener("focus", refreshOnFocus);
    onCleanup(() => window.removeEventListener("focus", refreshOnFocus));
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
          <Show when={currentPlan(value()).id}>
            <SettingsSection title={t("web.billing_v2.current_plan", { plan: currentPlan(value()).label })}
              aside={<Show when={!summary() && paid(currentPlan(value()).id) && permitted("billing.manage") && fulfilled(value().organization)?.payer.is_you}>
                <Button disabled={busy()} onClick={() => void portal()}>{t("web.billing_v2.manage_subscription")}</Button>
              </Show>} />
          </Show>
          <Show when={failed(value().organization)}>{error => <SettingsSection title={t("web.billing_v2.plan")}><p role="status">{t(message(error()))}</p></SettingsSection>}</Show>
          <Show when={failed(value().catalog)}>{error => <SettingsSection title={t("web.billing_v2.plan")}><p role="status">{t(error() instanceof PlatformSessionError && (error().status === 503 || error().code === "plan_price_pending") ? "web.billing_v2.unavailable" : message(error()))}</p></SettingsSection>}</Show>
          <Show when={fulfilled(value().catalog)}>{catalog => {
            const plans = () => {
              const current = currentPlan(value()).id;
              return checkoutPlans(catalog()).filter(plan => !paid(current) || (plan.id !== "free" && plan.id !== current));
            };
            const review = () => {
              const plan = plans().find(item => item.id === selected());
              if (!permitted("billing.manage") || !plan?.choice || !plan.price || plan.id === currentPlan(value()).id) return;
              return { id: plan.id, choice: plan.choice, price: plan.price };
            };
            return <Show when={review()} fallback={<SettingsSection title={t(paid(currentPlan(value()).id) ? "web.billing_v2.other_plans" : "web.billing_v2.choose_plan")}>
              <div class="grid gap-2 sm:grid-cols-2">
                <For each={plans()}>{plan => <article class="rounded-lg border border-line p-3">
                  <strong>{t(`web.billing_v2.plan_${plan.id}`)}</strong>
                  <Show when={plan.price}>{price => <p>{displayMoney(price())} MXN / {t("web.billing_v2.month")}</p>}</Show>
                  <Show when={plan.choice} fallback={<Show when={plan.id === "enterprise"} fallback={plan.pricePending ? <p role="status">{t("web.billing_v2.unavailable")}</p> : null}><a href={`mailto:${BUSINESS_SALES_EMAIL}`}>{t("web.billing_v2.contact")}</a></Show>}>
                    <Show when={permitted("billing.manage")}><Button disabled={busy() || currentPlan(value()).id === plan.id} onClick={() => setSelected(plan.id)}>{t(currentPlan(value()).id === "free" ? "web.billing_v2.choose" : "web.billing_v2.upgrade")}</Button></Show>
                  </Show>
                </article>}</For>
              </div>
            </SettingsSection>}>{plan =>
              <SettingsSection title={t(`web.billing_v2.plan_${plan().id}`)}>
                <p>{displayMoney(plan().price)} MXN / {t("web.billing_v2.month")}</p>
                <BillingPromotionField label={t("web.billing_v2.have_code")} value={promotion()} disabled={busy()} invalid={promotionInvalid()}
                  onEdit={value => { setPromotion(value); setPromotionInvalid(false); }} />
                <div class="flex flex-wrap gap-2">
                  <Button disabled={busy()} onClick={() => void upgrade(plan().choice, catalog().catalog_version)}>{t("web.billing_v2.continue")}</Button>
                  <Button variant="ghost" disabled={busy()} onClick={() => { setSelected(undefined); setPromotionInvalid(false); setFailure(""); }}>{t("web.billing_v2.choose_another_plan")}</Button>
                </div>
              </SettingsSection>
            }</Show>;
          }}</Show>
          <Show when={failed(value().balance)}>{error => <SettingsSection title={t("web.billing_v2.balance")}><p role="status">{t(message(error()))}</p></SettingsSection>}</Show>
          <Show when={fulfilled(value().balance)}>{balance => <SettingsSection title={t("web.billing_v2.balance")}>
            <For each={(["available", "included", "gift", "purchased"] as const)}>{kind => <SettingsRow label={t(`web.billing_v2.${kind}`)}><span>{displayMoney(balance()[kind])}</span></SettingsRow>}</For>
          </SettingsSection>}</Show>
          <Show when={!summary() && permitted("credits.purchase") && fulfilled(value().catalog)}>{catalog => {
            const packs = () => catalog().credit_packs.filter(pack => pack.sellable);
            return <Show when={packs().length}><SettingsSection title={t("web.billing_v2.buy")}>
              <For each={packs()}>{pack => <SettingsRow label={t("web.billing_v2.credit_pack", { amount: displayMoney(pack.credits) })}>
                <Button disabled={busy()} onClick={() => void buy(pack.pack_id, catalog().catalog_version)}>{t("web.billing_v2.buy")}</Button>
              </SettingsRow>}</For>
            </SettingsSection></Show>;
          }}</Show>
          <Show when={failed(value().transactions)}>{error => <SettingsSection title={t("web.billing_v2.transactions")}><p role="status">{t(message(error()))}</p></SettingsSection>}</Show>
          <Show when={fulfilled(value().transactions)}>{page => <PagedRows title={t("web.billing_v2.transactions")} initial={page()} load={props.api.transactions} />}</Show>
        </>}</Show>
      </Show>
    </Show>
  </SettingsPanel>;
}
