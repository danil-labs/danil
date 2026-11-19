import type { Machine } from "@terminus/computers";
import { createSignal, onCleanup, onMount, Show } from "solid-js";
import { t } from "../lib/i18n";
import { Button } from "../ui/Button";
import { PlatformSessionError } from "./platform-session";
import { checkoutReturn, followCheckout } from "./billing-v2-return";
import type { billingV2 } from "./billing-v2-api";
import { clearCreationCheckout } from "./billing-v2-idempotency";

type Api = ReturnType<typeof billingV2>;
const RETURN_KEY = "danil.billing.return";

export default function CheckoutReturn(props: { api: Api; onActive?: (organizationId: string) => Promise<void>; machine?: (organizationId: string, signal: AbortSignal) => Promise<Machine | null>; plan?: (organizationId: string) => ReturnType<Api["organization"]>; dismiss?: () => void }) {
  const [message, setMessage] = createSignal("");
  const [failure, setFailure] = createSignal("");
  const [plan, setPlan] = createSignal<string>();
  const [machine, setMachine] = createSignal<Machine>();
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
        if (result) { setMachine(result); if (result.state !== "creating" && result.state !== "provisioning") return; }
        await wait(2500, signal);
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
        wait: ms => wait(ms, signal),
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
            if (!lifetime.signal.aborted) setPlan(active.plan_key === "team" && active.edition === "business" ? "business" : active.plan_key);
          }
          catch { if (!lifetime.signal.aborted) setFailure("unavailable"); }
        }
      }
      if (outcome.kind !== "processing" && !lifetime.signal.aborted) { sessionStorage.removeItem(RETURN_KEY); clearCreationCheckout(sessionStorage, returned.id); }
    } catch (error) {
      if (!lifetime.signal.aborted) {
        if (deadline.aborted) setMessage(paid ? "checkout_paid_pending" : returned.cancelled ? "checkout_cancel_notice" : "checkout_processing");
        else {
          setMessage("");
          setFailure(error instanceof PlatformSessionError && error.status === 403 ? "denied" : "unavailable");
          if (error instanceof PlatformSessionError && [403, 404].includes(error.status)) sessionStorage.removeItem(RETURN_KEY);
        }
      }
    } finally { if (!lifetime.signal.aborted) setBusy(false); }
  }
  onMount(() => {
    const url = checkoutReturn(window.location.href);
    if (url.clean !== window.location.href) history.replaceState(history.state, "", url.clean);
    if (url.id) {
      returned = { id: url.id, cancelled: url.cancelled };
      sessionStorage.setItem(RETURN_KEY, JSON.stringify(returned));
    } else {
      try {
        const stored = JSON.parse(sessionStorage.getItem(RETURN_KEY) ?? "null") as { id?: unknown; cancelled?: unknown } | null;
        if (typeof stored?.id === "string" && /^bchk_[0-9A-Za-z]{16,40}$/.test(stored.id) && typeof stored.cancelled === "boolean") returned = { id: stored.id, cancelled: stored.cancelled };
      } catch { sessionStorage.removeItem(RETURN_KEY); }
    }
    if (returned) void check();
  });
  return <>
    <Show when={message() === "checkout_active"} fallback={<Show when={message()}><p role="status">{t(`web.billing_v2.${message()}`)}</p></Show>}>
      <section class="rounded-lg border border-line bg-bg p-3" role="status">
        <strong>{t("web.billing_v2.checkout_active")}</strong>
        <Show when={plan()}>{key => <p>{t(`web.billing_v2.plan_${key()}`)}</p>}</Show>
        <p>{!machine() || ["creating", "provisioning"].includes(machine()!.state) ? t("web.billing_v2.machine_creating") : machine()!.name || t("web.billing_v2.machine")}</p>
      </section>
    </Show>
    <Show when={message() === "checkout_paid_pending" && !busy() && !returned?.cancelled}><p role="status">{t("web.billing_v2.checkout_processing")}</p></Show>
    <Show when={failure()}><p role="alert">{t(`web.billing_v2.${failure()}`)}</p></Show>
    <Show when={!busy() && returned && ((!returned.cancelled && ["checkout_processing", "checkout_paid_pending"].includes(message())) || (selectedOrganization && failure())) && !checkingMachine()}><Button onClick={() => void check()}>{t("web.billing_v2.check_again")}</Button></Show>
    <Show when={props.dismiss && (message() || failure())}><Button variant="ghost" onClick={() => props.dismiss?.()}>{t("web.billing_v2.close")}</Button></Show>
  </>;
}

function wait(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    signal.throwIfAborted();
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, ms);
    signal.addEventListener("abort", abort, { once: true });
  });
}
