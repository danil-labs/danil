import type { Machine } from "../../platform-client/src/machines.ts";
import { createSignal, onCleanup, onMount, Show } from "solid-js";
import { t } from "../../ui/src/lib/i18n";
import { Button } from "../../ui/src/Button";
import { PlatformSessionError } from "./platform-session";
import { BILLING_RETURN_KEY, checkoutReturn, followCheckout, waitWithSignal } from "./billing-v2-return";
import type { billingV2 } from "../../platform-client/src/treasury";
import { clearCreationCheckout } from "./billing-v2-idempotency";

type Api = ReturnType<typeof billingV2>;

export default function CheckoutReturn(props: { api: Api; onActive?: (organizationId: string) => Promise<void>; machine?: (organizationId: string, signal: AbortSignal) => Promise<Machine | null>; plan?: (organizationId: string) => ReturnType<Api["organization"]>; dismiss?: () => void; onSettled?: () => void; confirmation?: { app: string; billing: string; desk: boolean } }) {
  const [message, setMessage] = createSignal("");
  const [failure, setFailure] = createSignal("");
  const [plan, setPlan] = createSignal<string>();
  const [machine, setMachine] = createSignal<Machine>();
  const readyMachine = () => ["running", "stopped", "stopping"].includes(machine()?.state ?? "");
  const [checkingMachine, setCheckingMachine] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const lifetime = new AbortController();
  let returned: { id: string; cancelled: boolean } | undefined;
  let selectedOrganization: string | undefined;
  onCleanup(() => lifetime.abort());
  async function watchMachine(id: string) {
    if (!props.machine) return;
    setCheckingMachine(true);
    const signal = AbortSignal.any([lifetime.signal, AbortSignal.timeout(120000)]);
    try {
      while (!signal.aborted) {
        const result = await props.machine(id, signal);
        signal.throwIfAborted();
        if (result) { setMachine(result); if (readyMachine()) return; }
        await waitWithSignal(2500, signal);
      }
    } catch {
      if (!signal.aborted) setFailure("unavailable");
    } finally { if (!lifetime.signal.aborted) setCheckingMachine(false); }
  }
  async function check() {
    if (!returned || busy()) return;
    setBusy(true); setFailure("");
    setMessage(returned.cancelled ? "checkout_cancel_notice" : "checkout_pending");
    const deadline = AbortSignal.timeout(returned.cancelled ? 10000 : 60000);
    const signal = AbortSignal.any([lifetime.signal, deadline]);
    let paid = false;
    try {
      const outcome = await followCheckout({
        cancelled: returned.cancelled,
        read: () => props.api.checkoutStatus(returned!.id, signal),
        onState: state => { if (state === "paid") { paid = true; setMessage("checkout_paid_pending"); } },
        wait: ms => waitWithSignal(ms, signal),
      });
      if (lifetime.signal.aborted) return;
      if (outcome.kind === "active" && outcome.organizationId && props.onActive) {
        selectedOrganization = outcome.organizationId;
        await props.onActive(outcome.organizationId);
      }
      setMessage(outcome.kind === "processing" && paid ? "checkout_paid_pending" : outcome.kind === "processing" && returned.cancelled ? "checkout_cancel_notice" : `checkout_${outcome.kind}`);
      if (outcome.kind === "active" && outcome.organizationId) {
        void watchMachine(outcome.organizationId);
        if (props.plan && !lifetime.signal.aborted) {
          try {
            const active = await props.plan(outcome.organizationId);
            if (!lifetime.signal.aborted) setPlan(active.plan_key);
          }
          catch { if (!lifetime.signal.aborted) setFailure("unavailable"); }
        }
      }
      if (outcome.kind !== "processing" && !lifetime.signal.aborted) { sessionStorage.removeItem(BILLING_RETURN_KEY); clearCreationCheckout(sessionStorage, returned.id); props.onSettled?.(); }
    } catch (error) {
      if (!lifetime.signal.aborted) {
        if (deadline.aborted) setMessage(paid ? "checkout_paid_pending" : returned.cancelled ? "checkout_cancel_notice" : "checkout_processing");
        else {
          setMessage("");
          setFailure(error instanceof PlatformSessionError && error.status === 403 ? "denied" : "unavailable");
          if (error instanceof PlatformSessionError && [403, 404].includes(error.status)) sessionStorage.removeItem(BILLING_RETURN_KEY);
        }
      }
    } finally { if (!lifetime.signal.aborted) setBusy(false); }
  }
  onMount(() => {
    const url = checkoutReturn(window.location.href);
    if (url.clean !== window.location.href) history.replaceState(history.state, "", url.clean);
    if (url.id) {
      returned = { id: url.id, cancelled: url.cancelled };
      sessionStorage.setItem(BILLING_RETURN_KEY, JSON.stringify(returned));
    } else {
      try {
        const stored = JSON.parse(sessionStorage.getItem(BILLING_RETURN_KEY) ?? "null") as { id?: unknown; cancelled?: unknown } | null;
        if (typeof stored?.id === "string" && /^bchk_[0-9A-Za-z]{16,40}$/.test(stored.id) && typeof stored.cancelled === "boolean") returned = { id: stored.id, cancelled: stored.cancelled };
      } catch { sessionStorage.removeItem(BILLING_RETURN_KEY); }
    }
    if (returned) void check();
  });
  return <>
    <Show when={message() === "checkout_active"} fallback={<Show when={message()}><p role="status">{t(`web.billing_v2.${message()}`)}</p></Show>}>
      <section class="grid gap-2 rounded-lg border border-line bg-bg p-4" role="status">
        <Show when={props.confirmation} fallback={<>
          <strong>{t("web.billing_v2.checkout_active")}</strong>
          <Show when={plan()}>{key => <p>{t(`web.billing_v2.plan_${key()}`)}</p>}</Show>
        </>}>
          <h1 class="m-0 text-xl font-bold">{plan()
            ? t("web.billing_v2.confirmed_plan", { plan: t(`web.billing_v2.plan_${plan()}`) })
            : t("web.billing_v2.checkout_active")}</h1>
        </Show>
        <Show when={props.machine}><p>{t(readyMachine() ? "web.billing_v2.machine_ready" : props.confirmation ? "web.billing_v2.confirmation_machine_creating" : "web.billing_v2.machine_creating")}</p></Show>
      </section>
    </Show>
    <Show when={message() === "checkout_paid_pending" && !busy() && !returned?.cancelled}><p role="status">{t("web.billing_v2.checkout_processing")}</p></Show>
    <Show when={failure()}><p role="alert">{t(`web.billing_v2.${failure()}`)}</p></Show>
    <Show when={!busy() && returned && ((!returned.cancelled && ["checkout_processing", "checkout_paid_pending"].includes(message())) || (selectedOrganization && failure())) && !checkingMachine()}><Button onClick={() => void check()}>{t("web.billing_v2.check_again")}</Button></Show>
    <Show when={props.confirmation}>{target =>
      <Show when={message() === "checkout_active" || message() === "checkout_paid"}
        fallback={<Button as="a" variant="ghost" href={target().billing} onClick={() => sessionStorage.removeItem(BILLING_RETURN_KEY)}>{t("web.billing_v2.back_to_plans")}</Button>}>
        <div class="flex flex-wrap gap-2">
          <Button as="a" href={target().desk ? "terminus-notice://open" : target().app}>{t(target().desk ? "web.billing_v2.back_to_desk" : "web.billing_v2.open_app")}</Button>
          <Show when={target().desk}><Button as="a" href={target().app} variant="ghost">{t("web.billing_v2.open_app")}</Button></Show>
        </div>
        <Show when={target().desk}><p>{t("web.billing_v2.desk_fallback")}</p></Show>
      </Show>
    }</Show>
    <Show when={props.dismiss && (message() || failure())}><Button variant="ghost" onClick={() => props.dismiss?.()}>{t("web.billing_v2.close")}</Button></Show>
  </>;
}
