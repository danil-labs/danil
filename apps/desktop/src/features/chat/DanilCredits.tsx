import { Show } from "solid-js";
import { t } from "../../lib/i18n";
import { capabilities } from "../../lib/platform";
import { Button } from "../../ui/Button";
import { createDanilCreditsBalance } from "./danil-credits-balance";

/** Saldo y recarga de Danil Credits, fuera del selector: Consumo y Configuración. */
export default function DanilCredits() {
  const balance = createDanilCreditsBalance();
  const recharge = () => capabilities().danilCredits?.recharge;
  return (
    <div class="flex flex-col gap-1.5 rounded-md border border-border p-3" aria-label={t("chat.credits.label")}>
      <div class="flex min-h-6 items-center justify-between gap-3">
        <span class="text-xs font-semibold text-neutral-950">{t("chat.credits.label")}</span>
        <Show when={recharge()}>
          {(open) => (
            <Button variant="outline" size="compact" onClick={() => void open()().catch(() => undefined)}>
              {t("chat.credits.add")}
            </Button>
          )}
        </Show>
      </div>
      <p class="m-0 text-xs tabular-nums text-neutral-500">
        {t("chat.credits.balance")} <span class="font-medium text-neutral-950" role="status">{balance.label()}</span>
      </p>
    </div>
  );
}
