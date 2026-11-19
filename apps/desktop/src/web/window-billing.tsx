import type { Machine, OrganizationSelection } from "@terminus/computers";
import { createSignal, lazy, Show, Suspense } from "solid-js";
import type { Capabilities } from "../lib/platform";
import { billingV2 } from "./billing-v2-api";
import type { PlatformProfile, PlatformWorkspace, platformTransport } from "./platform-session";

const Plan = lazy(() => import("./BillingPlan"));
const Return = lazy(() => import("./CheckoutReturn"));

export const webBillingEnabled = import.meta.env.VITE_DANIL_BILLING_V2 === "true";
const pending = () => new URLSearchParams(window.location.search).has("checkout") || !!sessionStorage.getItem("danil.billing.return");

export function windowBilling(transport: ReturnType<typeof platformTransport>, profile: PlatformProfile, organizations: OrganizationSelection, workspace: () => PlatformWorkspace | undefined, machine: BillingReturnProps["machine"]) {
  const org = profile.active_organization_id ?? null;
  const role = () => {
    const state = organizations.state();
    return (state.kind === "ready" && state.items.find(item => item.id === org)?.role) || workspace()?.role || "";
  };
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
    plan: () => <Suspense><Plan api={billingV2(transport, org)} creationApi={personApi} role={role} context={`${profile.id}:${org}`} /></Suspense>,
  };
  const returned = () => pending() ? <ReturnNotice /> : undefined;
  function ReturnNotice() {
    const [open, setOpen] = createSignal(true);
    return <Show when={open()}><aside class="fixed right-4 bottom-4 z-50 w-80 max-w-[calc(100vw-2rem)] rounded-lg border border-line bg-bg p-3 shadow-lg">
      <Suspense><Return api={personApi} onActive={select} machine={machine} plan={id => billingV2(transport, id).organization()} dismiss={() => setOpen(false)} /></Suspense>
    </aside></Show>;
  }
  return { account, returned };
}

export function organizationMachine(id: string, machines: Machine[]) {
  return machines.find(item => item.organization_id === id && item.kind !== "personal") ?? null;
}

type BillingReturnProps = Parameters<typeof Return>[0];
