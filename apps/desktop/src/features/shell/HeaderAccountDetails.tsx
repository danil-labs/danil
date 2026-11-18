import { createResource, type JSX, Show } from "solid-js";
import type { GroupAccount, GroupSend } from "../../lib/group-account";
import { t } from "../../lib/i18n";
import { capabilities } from "../../lib/platform";
import { ITEM_DE_MENU } from "../../ui/Popover";
import { GroupAccountMenu } from "./GroupAccountMenu";
import { setWebOrganizationName, webOrganizationAttention } from "./GroupOrganizationWatch";
import { noteWebAccountMode } from "./session-menu-mode";
import { WebOrganizationStep } from "./WebOrganizationStep";

export function HeaderAccountDetails(props: { group?: GroupAccount; email: string | null; send?: GroupSend; webCurrent: boolean; promo: boolean; notice?: JSX.Element; organizationPicker: boolean; onOrganization: () => void; onOrganizationClose: () => void; onPromo: () => void }) {
  const [web] = createResource(() => props.webCurrent ? capabilities().groupAccount : undefined, async (source) => { const group = await source.current(); if (group) setWebOrganizationName(group.name); noteWebAccountMode(); return group; });
  const group = () => props.group ?? web() ?? undefined;
  const send = () => props.send ?? capabilities().groupAccount?.send;
  return <Show when={!props.organizationPicker} fallback={<WebOrganizationStep onClose={props.onOrganizationClose} />}><Show when={group() && send()}><GroupAccountMenu group={group()!} send={send()!} promo={props.promo} notice={<>{props.notice}<Show when={props.webCurrent && webOrganizationAttention()}><p role="status" class="m-0 px-2 py-1 text-caption text-neutral-500">{t("shell.workspaces.web_organization_required")}</p><button type="button" role="menuitem" class={ITEM_DE_MENU} onClick={() => props.onOrganization()}>{t("shell.workspaces.choose_organization")}</button></Show></>} onPromo={props.onPromo} /><Show when={props.webCurrent && !props.promo}>
    <button type="button" role="menuitem" class={ITEM_DE_MENU} onClick={() => capabilities().webAccounts?.signOut()}>{t("shell.workspaces.close_email", { email: props.email ?? "" })}</button>
  </Show></Show></Show>;
}
