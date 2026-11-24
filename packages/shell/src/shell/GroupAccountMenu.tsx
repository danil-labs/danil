import { createResource, type JSX, Show } from "solid-js";
import { type GroupAccount, type GroupSend, readGroupBalance, redeemGroupCode } from "../../../session/src/group-account";
import { t } from "../../../ui/src/lib/i18n";
import { canRedeemPromo } from "../../../session/src/promo-role";
import { cn } from "../../../ui/src/lib/utils";
import { SEPARADOR_DE_MENU } from "../../../ui/src/ContextMenu";
import { ITEM_DE_MENU } from "../../../ui/src/Popover";
import PromoRedeem from "./PromoRedeem";
import { Pressable } from "../../../ui/src/Pressable";

function groupBalanceLabel(amount: number | null | undefined) {
  return amount === undefined ? t("shell.workspaces.danil_loading") : amount === null ? t("chat.credits.unavailable") : t("chat.credits.amount", { count: amount });
}

export function GroupAccountMenu(props: { group: GroupAccount; send: GroupSend; promo: boolean; web?: boolean; notice?: JSX.Element; onPromo: () => void }) {
  const [balance] = createResource(() => props.group, (group) => readGroupBalance(props.send, group));
  return <Show when={props.web || !props.promo || !canRedeemPromo(props.group.role)} fallback={<PromoRedeem redeem={(code, key) => redeemGroupCode(props.send, props.group, code, key)} />}>
    <p class="m-0 truncate px-2 pb-1 text-caption text-neutral-500">{props.group.name}</p>
    {props.notice}
    <span aria-hidden="true" class={cn(SEPARADOR_DE_MENU, "block")} />
    <p class="m-0 flex items-center justify-between gap-3 px-2 py-1.5 text-xs tabular-nums text-neutral-500">{t("chat.credits.label")} <span class="font-medium text-neutral-950" role="status">{groupBalanceLabel(balance.loading ? undefined : balance() ?? null)}</span></p>
    <Show when={!props.web && canRedeemPromo(props.group.role)}><Pressable role="menuitem" class={ITEM_DE_MENU} onClick={() => props.onPromo()}>{t("web.promo.redeem")}</Pressable></Show>
    <span aria-hidden="true" class={cn(SEPARADOR_DE_MENU, "block")} />
  </Show>;
}
