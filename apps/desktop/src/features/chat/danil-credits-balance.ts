import { createEffect, createResource, createSignal, onCleanup } from "solid-js";
import { t } from "../../lib/i18n";
import { capabilities } from "../../lib/platform";
import { desktopCredits } from "./danil-credits-desktop";

export function createDanilCreditsBalance() {
  const [revision, setRevision] = createSignal(0);
  const source = () => capabilities().danilCredits ?? (capabilities().nativeWindow ? desktopCredits : undefined);
  createEffect(() => {
    const stop = source()?.subscribe?.(() => setRevision((value) => value + 1));
    if (stop) onCleanup(stop);
  });
  let pending: AbortController | undefined;
  onCleanup(() => pending?.abort());
  const [balance, { refetch }] = createResource(() => source() && { source: source()!, revision: revision() }, ({ source }) => {
    pending?.abort(); pending = new AbortController();
    return source.readBalance(pending.signal).catch(() => null);
  });
  createEffect(() => {
    if (!import.meta.env.DANIL_CREDITS_V2 || !capabilities().nativeWindow || !source() || balance.loading || balance() !== null) return;
    const timer = setTimeout(() => void refetch(), 10_000); onCleanup(() => clearTimeout(timer));
  });
  const amount = () => !source() ? null : balance.loading ? undefined : balance() ?? null;
  const label = () => {
    const value = amount();
    if (value === undefined) return t("chat.services.loading");
    return value === null ? t("chat.credits.unavailable") : t("chat.credits.amount", { count: value });
  };
  return { amount, label };
}
