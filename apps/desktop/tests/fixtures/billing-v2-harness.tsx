import { render } from "solid-js/web";
import "../../src/web/phrases";
import BillingPlan from "../../src/web/BillingPlan";
import NewOrganizationCheckout from "../../src/web/NewOrganizationCheckout";
import CheckoutReturn from "../../src/web/CheckoutReturn";
import { BillingReturnGate } from "../../src/web/window-billing";
import { PlatformSessionError } from "../../src/web/platform-session";
import catalog from "./billing-v2/catalog.synthetic.json";
import organization from "./billing-v2/organization.suspended.json";
import balance from "./billing-v2/balance.with-debt.json";
import transactions from "./billing-v2/transactions.page.json";
import type { billingV2 } from "../../src/web/billing-v2-api";

const params = new URLSearchParams(location.search);
const calls: string[] = [];
let checkoutReads = 0;
let catalogReads = 0;
let purchaseReads = 0;
const checkoutId = "bchk_01SYNTHETICCHK0001";
const purchaseId = "bpur_01SYNTHETICPURCHASE1";
const paymentUrl = "https://checkout.stripe.com/c/pay/synthetic";
const pendingPayment = params.get("pending");
if (params.get("short") === "1") {
  const timeout = AbortSignal.timeout.bind(AbortSignal);
  AbortSignal.timeout = () => {
    const signal = timeout(300);
    signal.addEventListener("abort", () => Object.assign(window, { billingDeadlineElapsed: true }));
    return signal;
  };
}
Object.assign(window, { billingCalls: calls });
const api = {
  catalog: async () => { calls.push("catalog"); if (params.get("catalog") === "retry" && ++catalogReads === 1) throw new PlatformSessionError(503, null); return { ...catalog.value, plans: catalog.value.plans.map(plan => plan.plan_key === "team" ? {
      ...plan, sellable: true, price: { currency: "MXN", amount_micro: "1999000000" },
      display_variants: params.has("variants") ? [{ variant: "business", plan_key: "team", edition: "business", display_name: "Business" }] : undefined,
    } : plan), credit_packs: catalog.value.credit_packs.map(pack => ({ ...pack, sellable: pendingPayment === "credits" })) }; },
  organization: async () => ({ ...organization.value, payer: { is_you: params.get("payer") === "yes" } }),
  balance: async () => balance.value,
  transactions: async (cursor?: string) => {
    calls.push(`transactions:${cursor ?? "first"}`);
    return cursor ? { items: [{ transaction_id: "second", kind: "gift", occurred_at: "2026-11-22" }], next_cursor: null } : { ...transactions.value, next_cursor: "next_page" };
  },
  checkout: async (plan: string, _version: number, _key: string, variant?: string, code?: string) => { calls.push(`checkout:${plan}:${variant ?? ""}`); if (params.has("promo-error") && code) { calls.push(`promo:${code}`); throw new PlatformSessionError(422, null, "promotion_code_invalid"); } return { checkout_id: "bchk_01SYNTHETICCHK0001", state: "creating", url: null }; },
  createOrganization: async (plan: string, _version: number, name: string, _key: string, _variant?: string, code?: string) => { calls.push(`new:${plan}:${name}`); if (params.has("promo-error") && code) { calls.push(`promo:${code}`); throw new PlatformSessionError(422, null, "promotion_code_invalid"); } return { checkout_id: "bchk_01SYNTHETICCHK0001", state: "creating", url: null }; },
  checkoutStatus: async (id: string) => {
    calls.push("checkout-status");
    if (id !== checkoutId) throw new Error("unexpected checkout ID");
    if (pendingPayment === "plan" && ++checkoutReads >= 2) return { state: "pending", terminal: false, url: paymentUrl };
    if (["expired", "canceled"].includes(params.get("return") ?? "")) return { state: params.get("return"), terminal: true };
    if (params.get("return") === "foreign") throw new PlatformSessionError(404, null);
    if (params.get("return") === "cancel-paid-pending") return { state: "paid", terminal: false };
    if (params.get("return") && ++checkoutReads >= 2) return { state: "active", terminal: true, organization_id: "org_NEW" };
    return { state: "pending", terminal: false };
  },
  purchase: async () => ({ purchase_id: purchaseId, state: "creating", url: null }),
  purchaseStatus: async (id: string) => {
    calls.push(`purchase-status:${id}`);
    if (id !== purchaseId) throw new Error("unexpected purchase ID");
    const ready = ++purchaseReads >= 2;
    return { purchase_id: id, state: ready ? "open" : "creating", url: ready ? paymentUrl : null };
  },
  portal: async () => ({ url: "https://billing.stripe.com/" }),
} as unknown as ReturnType<typeof billingV2>;

const select = async (id: string) => { calls.push(`select:${id}`); };
render(() => params.has("gate") ? <BillingReturnGate api={api} onActive={select} />
  : params.get("return") ? <CheckoutReturn api={api} onActive={select} />
  : params.get("new") === "1" ? <NewOrganizationCheckout api={api} />
  : <BillingPlan api={api} role={() => params.get("role") ?? "owner"} context="test" />,
  document.getElementById("root")!);
