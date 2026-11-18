import { createSignal, type JSX, Show } from "solid-js";
import type { GroupAccount, GroupSend } from "../../lib/group-account";
import { t } from "../../lib/i18n";
import { capabilities } from "../../lib/platform";
import { cn } from "../../lib/utils";
import { TITULO_DE_GRUPO } from "../../ui/ContextMenu";
import { ITEM_DE_MENU, Popover, PopoverAnchor, PopoverContent } from "../../ui/Popover";
import { SignalDot } from "../../ui/SignalDot";
import { RETARDO_TOOLTIP, TooltipContent, TooltipRoot, TooltipTrigger } from "../../ui/Tooltip";
import { cerrarConEscape as createEscapeCloser } from "../settings";
import { GroupAvatar } from "./GroupAvatar";
import { webOrganizationAttention } from "./GroupOrganizationWatch";
import { HeaderAccountDetails } from "./HeaderAccountDetails";
import { menuArrows } from "./menu-focus";

const monogram = (name: string) => name.trim().slice(0, 1).toUpperCase() || "?";
/** La cuenta de un grupo: la inicial de su organización o correo; su menú la quita o vuelve a entrar. */
export const AccountHeader = (p: { id: string; email: string | null; extra: boolean; signedIn: boolean; stale?: boolean; name?: string; initialName?: string; children?: JSX.Element; group?: GroupAccount; send?: GroupSend; attention?: boolean; accounts?: ReturnType<typeof capabilities>["webAccounts"] }) => {
    const [promo, setPromo] = createSignal(false);
    const [profileEmail, setProfileEmail] = createSignal<string | null>(null);
    const email = () => p.email ?? profileEmail();
    const accounts = () => p.accounts;
    const [accountMenu, setAccountMenu] = createSignal<string | null>(null);
    createEscapeCloser(() => accountMenu() === p.id, () => setAccountMenu(null));
    const label = () => p.name ?? t("shell.workspaces.account", { email: p.email ?? "" });
    return (
      <Popover open={accountMenu() === p.id} onOpenChange={(open) => { setAccountMenu(open ? p.id : null); if (!open) setPromo(false); }} placement="right-start" gutter={4}>
        <PopoverAnchor class="w-full">
          <TooltipRoot openDelay={RETARDO_TOOLTIP} placement="right" gutter={6} disabled={accountMenu() === p.id}>
            <TooltipTrigger
              as="button"
              type="button"
              data-account-header={p.id}
              class="mt-2 mb-0.5 flex w-full items-center gap-1 px-3 text-left outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-primary"
              aria-label={label()}
              onClick={() => { setPromo(false); setAccountMenu(p.id); }}
            >
              <span aria-hidden="true" class="grid size-4 shrink-0 place-items-center rounded-full bg-neutral-200 text-[0.5625rem] font-semibold text-neutral-700">
                <GroupAvatar email={p.email} initial={monogram(p.initialName ?? p.email ?? "?").slice(0, 1)} opened={accountMenu() === p.id} current={!!accounts() && accounts()?.current.user_id === p.id} onEmail={setProfileEmail} />
              </span>
              <Show when={p.attention || (!!accounts() && accounts()?.current.user_id === p.id && webOrganizationAttention())}><SignalDot tone="warning" /></Show>
              <span aria-hidden="true" class="h-px flex-1 bg-border" />
            </TooltipTrigger>
            <TooltipContent>{p.name ?? p.email}</TooltipContent>
          </TooltipRoot>
        </PopoverAnchor>
        <PopoverContent role={promo() ? undefined : "menu"} class="w-64 p-1" onKeyDown={promo() ? undefined : menuArrows}>
          <Show when={!promo()}><p class={cn("m-0", TITULO_DE_GRUPO)}>{email()}</p></Show>
          <Show when={accountMenu() === p.id}><HeaderAccountDetails group={p.group} send={p.send} email={email()} webCurrent={!!accounts() && accounts()?.current.user_id === p.id} promo={promo()} onPromo={() => setPromo(true)} /></Show>
          <Show when={!promo()}>
          <Show when={!!accounts() && accounts()?.current.user_id === p.id && webOrganizationAttention()}><p role="status" class="m-0 px-2 py-1 text-caption text-neutral-500">{t("shell.workspaces.organization_required")}</p></Show>
          {p.children}
          <Show when={p.stale && p.signedIn}>
            <p class="m-0 px-2 pb-1 text-caption text-neutral-500">{t("shell.workspaces.stale")}</p>
          </Show>
          <Show when={!p.signedIn && !!accounts()?.add}>
            <button role="menuitem" class={ITEM_DE_MENU} onClick={() => (setAccountMenu(null), accounts()?.add?.(p.email))}>
              {t("shell.workspaces.sign_in_again")}
            </button>
          </Show>
          <Show when={p.extra}>
            <button
              role="menuitem"
              class={ITEM_DE_MENU}
              onClick={() => {
                setAccountMenu(null);
                if (window.confirm(t("shell.workspaces.remove_confirm", { email: p.email ?? "" }))) void accounts()?.remove(p.id);
              }}
            >
              {t("shell.workspaces.remove_account")}
            </button>
          </Show>
          </Show>
        </PopoverContent>
      </Popover>
    );
  };

