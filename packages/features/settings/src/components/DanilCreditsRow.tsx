import { Show } from "solid-js";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import { capabilities } from "../../../../host/src/platform";
import { Button } from "../../../../ui/src/Button";
import { createDanilCreditsBalance } from "../../../chat/src/queries/store";
import { SettingsRow } from "../../../../ui/src/SettingsLayout";

/**
 * Danil Credits como fila de Configuración. El saldo sale del mismo
 * `createDanilCreditsBalance` que la tarjeta de Consumo (`DanilCredits.tsx`),
 * que no cambia. Sin recarga no hay botón ni hueco.
 */
export default function DanilCreditsRow() {
  const balance = createDanilCreditsBalance();
  const recharge = () => capabilities().danilCredits?.recharge;
  return (
    <SettingsRow
      role="group"
      aria-label={t("chat.credits.label")}
      label={t("chat.credits.label")}
      description={<span class="tabular-nums">{t("chat.credits.balance")} <span class="font-medium text-neutral-950" role="status">{balance.label()}</span></span>}
    >
      <Show when={recharge()}>
        {/* Igual que `DanilCredits.tsx`: el fallo de abrir la recarga se traga (deuda conocida). */}
        {(open) => <Button variant="outline" size="compact" onClick={() => void open()().catch(() => undefined)}>{t("chat.credits.add")}</Button>}
      </Show>
    </SettingsRow>
  );
}
