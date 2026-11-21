import { isOrganizationSelectionRequired, machinesClient } from "@terminus/computers";
import { createEffect, createResource, createSignal, onCleanup, Show } from "solid-js";
import { render } from "solid-js/web";
import { aplicarLengua, t } from "../lib/i18n";
import { seguirElTema } from "../lib/theme";
import { Button } from "../ui/Button";
import { SessionLoading } from "./auth/SessionLoading";
import { signInError, WorkosAuthPage } from "./auth/workos";
import BillingPlan from "./BillingPlan";
import { billingHref, rememberBillingLogin } from "./billing-route";
import { billingV2 } from "../platform/treasury";
import { organizationSession } from "./organization-session";
import { isOrganizationAuthRequired } from "./organization-context";
import { PlatformSessionError, platformSession, platformTransport } from "./platform-session";
import { platformFetch } from "../platform/client.ts";
import type { WebSessionDeployment } from "./session-config";
import CheckoutReturn from "./CheckoutReturn";
import { BILLING_RETURN_KEY, checkoutReturn } from "./billing-v2-return";
import { organizationMachine } from "./window-billing";
import "./phrases";

declare const __DANIL_WEB_RELAY_ORIGINS__: string[];

export function startBilling(options: WebSessionDeployment, root: HTMLElement) {
  aplicarLengua();
  seguirElTema();
  const dispose = render(() => <BillingPage options={options} />, root);
  window.addEventListener("pagehide", event => { if (!event.persisted) dispose(); });
}

function BillingPage(props: { options: WebSessionDeployment }) {
  const home = new URL(import.meta.env.BASE_URL, location.origin).href;
  const query = new URLSearchParams(location.search);
  const plan = query.get("plan") ?? "";
  const initialPlan = plan || undefined;
  const initialPromotion = query.get("promo") ?? undefined;
  const returnError = signInError(location.search);
  const [expired, setExpired] = createSignal(false);
  const [authOrg, setAuthOrg] = createSignal<string>();
  const [attemptedPersonal, setAttemptedPersonal] = createSignal<string>();
  const returning = !!checkoutReturn(location.href).id || !!sessionStorage.getItem(BILLING_RETURN_KEY);
  const fromDesk = query.get("return") === "desk";
  const lifetime = new AbortController();
  const request: typeof fetch = (input, init) => platformFetch(input, {
    ...init,
    signal: init?.signal ? AbortSignal.any([init.signal, lifetime.signal]) : lifetime.signal,
  });
  const raw = platformTransport(props.options, request);
  const api = platformSession(props.options, request);
  async function authorized<T>(call: () => Promise<T>): Promise<T> {
    try { return await call(); }
    catch (error) {
      if (error instanceof PlatformSessionError && error.status === 401) setExpired(true);
      throw error;
    }
  }
  const transport = {
    call: (path: string, init?: RequestInit) => authorized(() => raw.call(path, init)),
    mutation: (path: string, init?: RequestInit) => authorized(async () => {
      try { return await raw.mutation(path, init); }
      catch (error) {
        if (path === "identity/organizations/select" && isOrganizationAuthRequired(error)) {
          setAuthOrg(JSON.parse(String(init?.body)).organization_id);
        }
        throw error;
      }
    }),
  };
  const machines = machinesClient({ endpoint: `${props.options.origin}/v1`, relayOrigins: __DANIL_WEB_RELAY_ORIGINS__, transport });
  async function machine(id: string, signal: AbortSignal) {
    if (ready()?.active !== id) return null;
    const result = await machines.list(signal);
    return result.kind === "ok" ? organizationMachine(id, result.value) : null;
  }
  const session = organizationSession(transport, lifetime.signal, () => {});
  const selection = session.selection;
  const [state, setState] = createSignal(selection.state());
  const unsubscribe = selection.subscribe(() => setState(selection.state()));
  onCleanup(() => { lifetime.abort(); unsubscribe(); selection.stop(); });
  const [profile, { refetch }] = createResource(async () => {
    try { return await authorized(() => api.me()); }
    catch (error) {
      if (isOrganizationSelectionRequired(error) || (error instanceof PlatformSessionError && error.code === "workspace_selection_required")) return null;
      throw error;
    }
  });
  createEffect(() => {
    if (!profile.loading && !profile.error && !expired()) session.load();
  });
  const ready = () => { const current = state(); return current.kind === "ready" ? current : undefined; };
  const active = () => {
    const current = ready();
    return current?.items.find(org => org.id === current.active);
  };
  const personApi = billingV2(transport, null);
  const identifiedProfile = () => profile.error ? null : profile();
  const isPersonal = (org: { id: string; plan?: string }) => {
    const type = identifiedProfile()?.organizations.find(item => item.id === org.id)?.type;
    return type ? type === "personal" : org.plan === "free" || org.plan === "pro";
  };
  const personal = () => ready()?.items.find(isPersonal);
  createEffect(() => {
    const current = ready();
    const id = personal()?.id;
    if (!current || current.busy || current.active || !id || attemptedPersonal() === id) return;
    setAttemptedPersonal(id);
    void selection.choose(id);
  });
  async function select(id: string) {
    if (ready()?.active !== id) await selection.choose(id);
    if (ready()?.active !== id) throw new Error("billing_selection_pending");
    if (!active()) await selection.load();
  }
  return <Show when={!(expired() || authOrg() || returnError)} fallback={
    <WorkosAuthPage loginUrl={api.loginUrl(home, authOrg())} error={returnError} onLogin={rememberBillingLogin} />
  }>
    <Show when={!profile.loading} fallback={<SessionLoading />}>
      <main class="h-full overflow-y-auto bg-bg px-4 py-8 text-neutral-950">
        <div class="mx-auto grid max-w-3xl gap-6">
          <Show when={!profile.error} fallback={<div role="alert"><p>{t("web.billing_v2.error")}</p><Button onClick={() => void refetch()}>{t("web.computers.retry")}</Button></div>}>
            <Show when={ready()} fallback={<p role="status">{t("web.billing_v2.loading")}</p>}>{current =>
              <Show when={!returning} fallback={<section class="mx-auto grid w-full max-w-md gap-4 py-10">
                <CheckoutReturn api={personApi} onActive={select} machine={machine} plan={id => billingV2(transport, id).organization()}
                  confirmation={{ app: home, billing: billingHref(), desk: fromDesk }} />
              </section>}>
              <Show when={current().error && !current().busy}><p role="alert">{t("web.billing_v2.error")}</p><Button onClick={() => { setAttemptedPersonal(undefined); void selection.load(); }}>{t("web.computers.retry")}</Button></Show>
              <Show when={!current().busy && !current().error && (!current().active || active())}><Show when={active()} keyed fallback={
                <BillingPlan api={personApi} fallbackPlan="free" role={() => ""} context={identifiedProfile()?.id ?? "unselected"} initialPlan={initialPlan} initialPromotion={initialPromotion} />
              }>{org =>
                <BillingPlan api={billingV2(transport, org.id)} fallbackPlan={org.plan} role={() => org.role ?? ""} context={`${identifiedProfile()?.id ?? "unselected"}:${org.id}`} initialPlan={initialPlan} initialPromotion={initialPromotion} />
              }</Show></Show>
            </Show>}</Show>
          </Show>
        </div>
      </main>
    </Show>
  </Show>;
}
