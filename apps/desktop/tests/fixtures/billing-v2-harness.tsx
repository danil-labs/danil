import { render } from "solid-js/web";
import "../../src/web/phrases";
import BillingPlan from "../../src/web/BillingPlan";
import NewOrganizationCheckout from "../../src/web/NewOrganizationCheckout";
import CheckoutReturn from "../../src/web/CheckoutReturn";
import SessionGate from "../../src/web/SessionGate";
import type { OrganizationSelection } from "@terminus/computers";
import { PlatformSessionError } from "../../src/web/platform-session";
import catalog from "./billing-v2/catalog.synthetic.json";
import organization from "./billing-v2/organization.suspended.json";
import balance from "./billing-v2/balance.with-debt.json";
import transactions from "./billing-v2/transactions.page.json";
import invoices from "./billing-v2/invoices.page.admin.json";
import type { billingV2 } from "../../src/web/billing-v2-api";

const params = new URLSearchParams(location.search);
const calls: string[] = [];
let checkoutReads = 0;
let catalogReads = 0;
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
  catalog: async () => { calls.push("catalog"); if (params.get("catalog") === "retry" && ++catalogReads === 1) throw new PlatformSessionError(503, null); return { ...catalog.value, plans: catalog.value.plans.map(plan => ({ ...plan, sellable: plan.plan_key === "team" })) }; },
  organization: async () => ({ ...organization.value, payer: { is_you: params.get("payer") === "yes" } }),
  balance: async () => balance.value,
  transactions: async (cursor?: string) => {
    calls.push(`transactions:${cursor ?? "first"}`);
    return cursor ? { items: [{ transaction_id: "second", kind: "gift", occurred_at: "2026-11-22" }], next_cursor: null } : { ...transactions.value, next_cursor: "next_page" };
  },
  invoices: async () => {
    if (params.get("invoices") === "unavailable") throw new PlatformSessionError(503, null);
    return invoices.value;
  },
  checkout: async () => { calls.push("checkout"); return { checkout_id: "bchk_01SYNTHETICCHK0001", state: "creating", url: null }; },
  createOrganization: async (plan: string, _version: number, name: string) => { calls.push(`new:${plan}:${name}`); return { checkout_id: "bchk_01SYNTHETICCHK0001", state: "creating", url: null }; },
  checkoutStatus: async () => {
    calls.push("checkout-status");
    if (params.get("return") === "foreign") throw new PlatformSessionError(404, null);
    if (params.get("return") === "cancel-paid-pending") return { state: "paid", terminal: false };
    if (params.get("return") && ++checkoutReads >= 2) return { state: "active", terminal: true, organization_id: "org_NEW" };
    return { state: "pending", terminal: false };
  },
  purchase: async () => ({ url: null }),
  portal: async () => ({ url: "https://billing.stripe.com/" }),
  cancel: async () => organization.value,
  resume: async () => organization.value,
} as unknown as ReturnType<typeof billingV2>;

const organizations = { choose: async () => {} } as unknown as OrganizationSelection;
render(() => params.has("gate") ? <SessionGate identified={() => true} signedOut={() => false} busy={() => false} preparing={() => false} error={() => ""} orgNeeded={() => false} noWorkspace={() => true} rows={() => []} organizations={organizations} orgState={() => ({ kind: "ready", items: [], active: null, busy: false, error: null })} loginUrl={() => "#"} returnError="" load={() => {}} choose={() => {}} logout={() => {}} redeem={async () => ({})} billing={params.get("gate") === "on" ? { api, onActive: async id => { calls.push(`select:${id}`); } } : undefined} /> : params.get("return") ? <CheckoutReturn api={api} onActive={async id => { calls.push(`select:${id}`); }} /> : params.get("new") === "1" ? <NewOrganizationCheckout api={api} /> : <BillingPlan api={api} role={() => params.get("role") ?? "owner"} context="test" />, document.getElementById("root")!);
