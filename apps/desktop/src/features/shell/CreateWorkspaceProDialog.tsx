import Check from "lucide-solid/icons/check";
import { For } from "solid-js";
import { t } from "../../lib/i18n";
import { openNativeExternal } from "../../lib/native-workspace-add-link";
import { capabilities } from "../../lib/platform";
import { cn } from "../../lib/utils";
import { Dialog, DialogContent, DialogTitle } from "../../ui/Dialog";
import { billingHref } from "../../web/billing-route";
import { RAIL_MENU_ITEM } from "./rail-menu";

const benefits = ["more", "cloud", "extra"] as const;

export function CreateWorkspaceProDialog(props: { open: boolean; close: () => void }) {
  let decline: HTMLButtonElement | undefined;
  const plans = () => {
    props.close();
    if (capabilities().nativeWindow) void openNativeExternal("https://beta.danil.ai/billing?return=desk");
    else window.location.assign(billingHref());
  };
  return <Dialog open={props.open} onOpenChange={(open) => { if (!open) props.close(); }}>
    <DialogContent class="p-5" onOpenAutoFocus={(event) => { event.preventDefault(); decline?.focus(); }}>
      <DialogTitle class="m-0 text-lg font-semibold">{t("shell.workspaces.pro_title")}</DialogTitle>
      <Dialog.Description class="mt-1 mb-3 text-ui text-neutral-600">{t("shell.workspaces.pro_intro")}</Dialog.Description>
      <ul class="mb-4 flex list-none flex-col gap-2 p-0 text-ui">
        <For each={benefits}>{(benefit) => <li class="flex items-start gap-2.5">
          <span class="grid size-5 shrink-0 place-items-center rounded-md bg-success-strong/15 text-success-strong"><Check size={13} aria-hidden="true" /></span>
          <span>{t(`shell.workspaces.pro_${benefit}`)}</span>
        </li>}</For>
      </ul>
      <div class="flex justify-end gap-2">
        <button ref={decline} type="button" class={cn(RAIL_MENU_ITEM, "w-auto rounded-md px-3")} onClick={props.close}>{t("shell.workspaces.pro_later")}</button>
        <button type="button" class={cn(RAIL_MENU_ITEM, "w-auto rounded-md bg-primary px-3 text-[var(--action-text)] hover:bg-primary hover:brightness-90 focus-visible:bg-primary focus-visible:brightness-90")} onClick={plans}>{t("shell.workspaces.pro_plans")}</button>
      </div>
    </DialogContent>
  </Dialog>;
}
