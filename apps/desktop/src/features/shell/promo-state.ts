import { createSignal } from "solid-js";
import { t } from "../../lib/i18n";
import type { Capabilities } from "../../lib/platform";
import { normalizePromoCode, promoRejection } from "../../lib/promo-rejections";

export function createPromoState(redeem: () => NonNullable<Capabilities["webPromo"]>) {
  const [code, setCode] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [message, setMessage] = createSignal("");
  const [failed, setFailed] = createSignal(false);
  const [rejection, setRejection] = createSignal<ReturnType<typeof promoRejection>>();
  const valid = () => normalizePromoCode(code());
  let attempt: { code: string; key: string } | undefined;
  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (busy()) return;
    const value = valid();
    if (!value) { setMessage("web.promo.invalid"); setFailed(true); setRejection(undefined); return; }
    if (attempt?.code !== value) attempt = { code: value, key: crypto.randomUUID() };
    setBusy(true); setMessage(""); setFailed(false); setRejection(undefined);
    try {
      const result = await redeem()(value, attempt.key);
      setMessage(result.unavailable ? "web.promo.unavailable" : result.machine?.state === "ready" || result.machine?.state === "running" ? "web.promo.ready" : "web.promo.success");
      if (!result.unavailable) { setCode(""); attempt = undefined; }
    } catch (cause) {
      const error = promoRejection(cause);
      setFailed(true); setRejection(error); setMessage(error.key);
    } finally { setBusy(false); }
  }
  return { code, setCode, busy, message, failed, rejection, valid, submit, label: () => t(message(), rejection()?.data) };
}
