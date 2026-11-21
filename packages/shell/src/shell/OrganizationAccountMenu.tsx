import { createSignal, type JSX, Show } from "solid-js";
import { type GroupAccount, type GroupSend, redeemGroupCode } from "../../../../apps/desktop/src/lib/group-account";
import { t } from "../../../../apps/desktop/src/lib/i18n";
import { canRedeemPromo } from "../../../../apps/desktop/src/lib/promo-role";
import { cn } from "../../../../apps/desktop/src/lib/utils";
import { SEPARADOR_DE_MENU, TITULO_DE_GRUPO } from "../../../ui/src/ContextMenu";
import { ITEM_DE_MENU } from "../../../ui/src/Popover";
import { OrganizationPositionMenu } from "./OrganizationPositionMenu";
import PromoRedeem from "./PromoRedeem";

export function OrganizationAccountMenu(props: { group: GroupAccount; email: string | null; workspace: string; stack?: boolean; organizationControls?: boolean; onOpen?: () => void; notice?: JSX.Element; web?: boolean; canHide?: boolean; pinned: boolean; index: number; count: number; promo: boolean; send: GroupSend; onPromo: () => void; onManage: () => void; onHide: () => void; onPin: () => void; onMove: (step: -1 | 1) => void; onCloseOrg: (context: string) => Promise<void>; onCloseEmail: (email: string | null, context: string) => Promise<void>; onDismiss: () => void }) {
  const [busy, setBusy] = createSignal(false);
  const [failed, setFailed] = createSignal(false);
  const close = async (action: () => Promise<void>) => {
    if (busy()) return;
    setBusy(true); setFailed(false);
    try { await action(); props.onDismiss(); } catch { setFailed(true); } finally { setBusy(false); }
  };
  return <Show when={props.web || !props.promo || !canRedeemPromo(props.group.role)} fallback={<PromoRedeem redeem={(code, key) => redeemGroupCode(props.send, props.group, code, key)} />}>
    <div class="contents" data-account-menu-context={props.group.context} onKeyDown={(event) => { if (event.altKey && ["ArrowUp", "ArrowDown"].includes(event.key)) { event.preventDefault(); event.stopPropagation(); props.onMove(event.key === "ArrowUp" ? -1 : 1); } }}>
      <Show when={!props.stack}>
        <p class={cn("m-0", TITULO_DE_GRUPO)}>{props.workspace}</p>
        <button type="button" role="menuitem" class={ITEM_DE_MENU} onClick={() => props.onOpen?.()}>{t("shell.rail.open")}</button>
        <button type="button" role="menuitem" class={ITEM_DE_MENU} onClick={() => props.onManage()}>{t("settings.workspaces.manage")}</button>
        <Show when={props.canHide !== false}><button type="button" role="menuitem" class={ITEM_DE_MENU} onClick={() => props.onHide()}>{t("shell.workspaces.hide")}</button></Show>
        <span aria-hidden="true" class={cn(SEPARADOR_DE_MENU, "block")} />
      </Show>
      <p class={cn("m-0", TITULO_DE_GRUPO)}>{t("shell.rail.tip_account", { org: props.group.name, email: props.email ?? "" })}</p>
      {props.notice}
      <Show when={!props.web && canRedeemPromo(props.group.role)}><button type="button" role="menuitem" class={ITEM_DE_MENU} onClick={() => props.onPromo()}>{t("web.promo.redeem")}</button></Show>
      <Show when={props.organizationControls !== false}><OrganizationPositionMenu pinned={props.pinned} index={props.index} count={props.count} onPin={() => props.onPin()} onMove={(step) => props.onMove(step)} /></Show>
      <Show when={!props.web}><button type="button" role="menuitem" class={ITEM_DE_MENU} disabled={busy()} onClick={() => void close(() => props.onCloseOrg(props.group.context))}>{t("shell.workspaces.close_org", { name: props.group.name })}</button></Show>
      <button type="button" role="menuitem" class={ITEM_DE_MENU} disabled={busy()} onClick={() => void close(() => props.onCloseEmail(props.email, props.group.context))}>{t("shell.workspaces.close_email", { email: props.email ?? "" })}</button>
      <Show when={failed()}><p role="alert" class="m-0 px-2 py-1 text-caption text-error-strong">{t("shell.workspaces.sessions_failed")}</p></Show>
    </div>
  </Show>;
}
