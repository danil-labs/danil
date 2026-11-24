import { BILLING_RETURN_KEY } from "./billing-v2-return";
import type { OrganizationSelection } from "@terminus/computers";
import type { Machine } from "../../platform-client/src/machines.ts";
import { createSignal, lazy, onCleanup, Show, Suspense } from "solid-js";
import type { Capabilities } from "../../host/src/platform";
import { billingV2 } from "../../platform-client/src/treasury";
import type { PlatformProfile, PlatformWorkspace, platformTransport } from "./platform-session";

import { billingHref } from "../../platform-client/src/billing-route";

const Plan = lazy(() => import("./BillingPlan"));
const Return = lazy(() => import("./CheckoutReturn"));

const pending = () => new URLSearchParams(window.location.search).has("checkout") || !!sessionStorage.getItem(BILLING_RETURN_KEY);

export function windowBilling(transport: ReturnType<typeof platformTransport>, profile: PlatformProfile, organizations: OrganizationSelection, workspace: () => PlatformWorkspace | undefined, machine: BillingReturnProps["machine"], transportFor: (org: string) => ReturnType<typeof platformTransport> = () => transport) {
  const org = profile.active_organization_id ?? null;
  async function select(id: string) {
    if (org === id) return;
    if (organizations.state().kind !== "ready") await organizations.load();
    await organizations.choose(id);
    const state = organizations.state();
    if (state.kind !== "ready" || state.active !== id) throw new Error("billing_selection_pending");
  }
  const personApi = billingV2(transport, null);
  const account: Capabilities["personalAccount"] = {
    isPersonal: async () => true,
    plan: org ? () => {
      const [state, setState] = createSignal(organizations.state());
      onCleanup(organizations.subscribe(() => setState(organizations.state())));
      const role = () => {
        const current = state();
        return (current.kind === "ready" && current.items.find(item => item.id === org)?.role) || workspace()?.role || "";
      };
      return <Suspense><Plan api={billingV2(transport, org)} summaryHref={billingHref()} role={role} context={`${profile.id}:${org}`} /></Suspense>;
    } : undefined,
  };
  const returned = () => <BillingReturnGate api={personApi} onActive={select} machine={machine} plan={id => billingV2(transportFor(id), id).organization()} />;
  return { account, returned };
}

export function BillingReturnGate(props: Omit<BillingReturnProps, "dismiss">) {
  const [open, setOpen] = createSignal(true);
  return <Show when={open() && pending()}>
    <aside class="fixed right-4 bottom-4 z-50 w-80 max-w-[calc(100vw-2rem)] rounded-lg border border-line bg-bg p-3 shadow-lg">
      <Suspense><Return api={props.api} onActive={props.onActive} onSettled={props.onSettled} machine={props.machine} plan={props.plan} dismiss={() => setOpen(false)} /></Suspense>
    </aside>
  </Show>;
}

export function organizationMachine(id: string, machines: Machine[]) {
  return machines.find(item => item.organization_id === id && item.kind !== "personal") ?? null;
}

type BillingReturnProps = Parameters<typeof Return>[0];
