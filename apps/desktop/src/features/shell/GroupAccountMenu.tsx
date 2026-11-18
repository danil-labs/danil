import { createResource, Show } from "solid-js";
import { type GroupAccount, type GroupSend, readGroupBalance, redeemGroupCode } from "../../lib/group-account";
import { t } from "../../lib/i18n";
import { cn } from "../../lib/utils";
import { SEPARADOR_DE_MENU } from "../../ui/ContextMenu";
import { ITEM_DE_MENU } from "../../ui/Popover";
import PromoRedeem from "./PromoRedeem";

export function groupBalanceLabel(amount: number | null | undefined) {
  return amount === undefined ? t("shell.workspaces.danil_loading") : amount === null ? t("chat.credits.unavailable") : t("chat.credits.amount", { count: amount });
}

export function GroupAccountMenu(props: { group: GroupAccount; send: GroupSend; promo: boolean; onPromo: () => void }) {
  const [balance] = createResource(() => props.group, (group) => readGroupBalance(props.send, group));
  return <Show when={!props.promo} fallback={<PromoRedeem redeem={(code, key) => redeemGroupCode(props.send, props.group, code, key)} />}>
    <p class="m-0 truncate px-2 pb-1 text-caption text-neutral-500">{props.group.name}</p>
    <span aria-hidden="true" class={cn(SEPARADOR_DE_MENU, "block")} />
    <p class="m-0 flex items-center justify-between gap-3 px-2 py-1.5 text-xs tabular-nums text-neutral-500">{t("chat.credits.label")} <span class="font-medium text-neutral-950" role="status">{groupBalanceLabel(balance.loading ? undefined : balance() ?? null)}</span></p>
    <button type="button" role="menuitem" class={ITEM_DE_MENU} onClick={() => props.onPromo()}>{t("web.promo.redeem")}</button>
    <span aria-hidden="true" class={cn(SEPARADOR_DE_MENU, "block")} />
  </Show>;
}
