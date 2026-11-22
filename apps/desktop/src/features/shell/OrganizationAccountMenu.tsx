import { Show } from "solid-js";
import { type GroupAccount, type GroupSend, redeemGroupCode } from "../../lib/group-account";
import { t } from "../../lib/i18n";
import { canRedeemPromo } from "../../lib/promo-role";
import { cn } from "../../lib/utils";
import { SEPARADOR_DE_MENU } from "../../ui/ContextMenu";
import { openHarnessWorkspaces, RAIL_MENU_ITEM } from "./rail-menu";
import PromoRedeem from "./PromoRedeem";

export function OrganizationAccountMenu(props: {
  group?: GroupAccount;
  email?: string | null;
  workspace: string;
  promo: boolean;
  send: GroupSend;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onPromo: () => void;
  onOpen: () => void;
  onHide: () => void;
  onRemove: () => void;
  onMove: (step: -1 | 1) => void;
  onDismiss: () => void;
}) {
  const moveKey = (event: KeyboardEvent) => {
    if (!event.altKey || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
    event.preventDefault();
    event.stopPropagation();
    props.onMove(event.key === "ArrowUp" ? -1 : 1);
  };
  const separator = () => <span aria-hidden="true" class={cn(SEPARADOR_DE_MENU, "block")} />;
  return <Show when={props.promo && props.group} fallback={
    <div class="contents" data-account-menu-context={props.group?.context} onKeyDown={moveKey}>
      <header class="px-2 py-1.5">
        <div class="truncate text-ui font-semibold">{props.workspace}</div>
        <Show when={props.group}>{(group) => <div class="truncate text-caption text-neutral-500">{[group().name, props.email].filter(Boolean).join(" · ")}</div>}</Show>
      </header>
      <button type="button" role="menuitem" class={RAIL_MENU_ITEM} onClick={props.onOpen}>{t("shell.rail.open")}</button>
      <Show when={props.group?.plan !== "free" && props.group?.org}>{(org) =>
        <button type="button" role="menuitem" class={RAIL_MENU_ITEM} onClick={() => { const id = org(); props.onDismiss(); void openHarnessWorkspaces(id); }}>{t("shell.workspaces.manage_in_harness")}</button>
      }</Show>
      <Show when={canRedeemPromo(props.group?.role)}><button type="button" role="menuitem" class={RAIL_MENU_ITEM} onClick={props.onPromo}>{t("web.promo.redeem")}</button></Show>
      {separator()}
      <button type="button" role="menuitem" class={cn(RAIL_MENU_ITEM, "flex items-center justify-between gap-2")} disabled={!props.canMoveUp} onClick={() => props.onMove(-1)}>
        <span>{t("shell.rail.move_up")}</span><span class="text-caption text-neutral-500">⌥↑</span>
      </button>
      <button type="button" role="menuitem" class={cn(RAIL_MENU_ITEM, "flex items-center justify-between gap-2")} disabled={!props.canMoveDown} onClick={() => props.onMove(1)}>
        <span>{t("shell.rail.move_down")}</span><span class="text-caption text-neutral-500">⌥↓</span>
      </button>
      <button type="button" role="menuitem" class={RAIL_MENU_ITEM} onClick={props.onHide}>{t("shell.workspaces.hide")}</button>
      {separator()}
      <button type="button" role="menuitem" class={cn(RAIL_MENU_ITEM, "text-error-strong")} onClick={props.onRemove}>{t("shell.workspaces.remove_workspace_menu")}</button>
    </div>
  }>{(group) => <PromoRedeem redeem={(code, key) => redeemGroupCode(props.send, group(), code, key)} />}</Show>;
}
