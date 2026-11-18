import { createResource, Show } from "solid-js";
import type { GroupAccount, GroupSend } from "../../lib/group-account";
import { t } from "../../lib/i18n";
import { capabilities } from "../../lib/platform";
import { ITEM_DE_MENU } from "../../ui/Popover";
import { GroupAccountMenu } from "./GroupAccountMenu";
import { noteWebAccountMode } from "./session-menu-mode";

export function HeaderAccountDetails(props: { group?: GroupAccount; email: string | null; send?: GroupSend; webCurrent: boolean; promo: boolean; onPromo: () => void }) {
  const [web] = createResource(() => props.webCurrent ? capabilities().groupAccount : undefined, async (source) => { const group = await source.current(); noteWebAccountMode(); return group; });
  const group = () => props.group ?? web() ?? undefined;
  const send = () => props.send ?? capabilities().groupAccount?.send;
  return <Show when={group() && send()}><GroupAccountMenu group={group()!} send={send()!} promo={props.promo} onPromo={props.onPromo} /><Show when={props.webCurrent && !props.promo}>
    <button type="button" role="menuitem" class={ITEM_DE_MENU} onClick={() => capabilities().webAccounts?.signOut()}>{t("shell.workspaces.close_org", { name: group()!.name })}</button>
    <button type="button" role="menuitem" class={ITEM_DE_MENU} onClick={() => capabilities().webAccounts?.signOut()}>{t("shell.workspaces.close_email", { email: props.email ?? "" })}</button>
  </Show></Show>;
}
