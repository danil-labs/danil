import { createEffect, createResource, createSignal, onCleanup } from "solid-js";
import { t } from "../../lib/i18n";
import { capabilities } from "../../lib/platform";
import { availableDanilCredits } from "./danil-credits";

/** Saldo leído de la capacidad; un saldo desconocido se muestra como tal, nunca como cero. */
export function createDanilCreditsBalance() {
  const [revision, setRevision] = createSignal(0);
  createEffect(() => {
    const off = capabilities().danilCredits?.subscribe?.(() => setRevision((value) => value + 1));
    if (off) onCleanup(off);
  });
  const [balance] = createResource(
    () => {
      const source = capabilities().danilCredits;
      return source ? { source, revision: revision() } : undefined;
    },
    async ({ source }) => {
      try { return availableDanilCredits(await source.readBalance()); }
      catch { return null; }
    },
  );
  const amount = () => (balance.loading ? undefined : balance() ?? null);
  const label = () => {
    const value = amount();
    if (value === undefined) return t("chat.services.loading");
    return value === null ? t("chat.credits.unavailable") : t("chat.credits.amount", { count: value });
  };
  return { amount, label };
}
