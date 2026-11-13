import { createEffect, createResource, createSignal, onCleanup, Show } from "solid-js";
import { capabilities } from "../../lib/platform";
import { t } from "../../lib/i18n";
import { prosaDe } from "../../ui/Failure";
import { Button } from "../../ui/Button";
import { availableDanilCredits } from "./danil-credits";
import type { OpcionDeModelo } from "../../lib/models";

/** La opción ejecutable procede del catálogo autenticado del motor. */
export default function DanilCredits(props: { model?: OpcionDeModelo; onSelect?: () => void; disabled?: boolean; onPrepare?: () => Promise<void> }) {
  const [preparation, { refetch: retryPreparation }] = createResource(
    () => props.onPrepare,
    async prepare => {
      try { await prepare(); return null; }
      catch (cause) { return prosaDe(cause); }
    },
  );
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
  const balanceLabel = () => {
    if (balance.loading) return t("chat.credits.loading");
    const available = balance();
    return available == null
      ? t("chat.credits.unavailable")
      : t("chat.credits.amount", { count: available });
  };
  return (
    <section class="grid min-w-0 gap-3 p-3" aria-label={t("chat.credits.label")}>
      <div class="text-ui font-semibold text-neutral-950">{t("chat.credits.label")}</div>
      <Button
        variant="outline"
        size="sm"
        class="justify-between"
        disabled={!props.model?.usable || !props.onSelect || props.disabled || preparation.loading || !!preparation()}
        title={!props.model?.usable || !props.onSelect || props.disabled ? t("chat.credits.unavailable") : undefined}
        onClick={() => props.onSelect?.()}
      >
        <span>{t("chat.credits.model")}</span>
        <span class="text-caption">{t(props.model?.usable && props.onSelect && !props.disabled ? "chat.credits.select" : "chat.credits.unavailable")}</span>
      </Button>
      <Show when={preparation.loading}><p class="m-0 text-caption text-neutral-500" role="status">{t("chat.credits.loading")}</p></Show>
      <Show when={!preparation.loading && preparation()}>{failure => <div class="grid gap-2" data-credits-status="">
        <p class="m-0 text-caption text-neutral-500" role="status">{failure()}</p>
        <Button variant="ghost" size="sm" onClick={() => void retryPreparation()}>{t("common.part.retry")}</Button>
      </div>}</Show>
      <dl class="m-0 grid gap-2 text-caption">
        <div class="flex justify-between gap-3">
          <dt class="text-neutral-500">{t("chat.credits.payer")}</dt>
          <dd class="m-0 text-neutral-950">{t("chat.credits.account")}</dd>
        </div>
        <div class="flex justify-between gap-3">
          <dt class="text-neutral-500">{t("chat.credits.balance")}</dt>
          <dd class="m-0 text-neutral-500" role="status">{balanceLabel()}</dd>
        </div>
      </dl>
    </section>
  );
}
