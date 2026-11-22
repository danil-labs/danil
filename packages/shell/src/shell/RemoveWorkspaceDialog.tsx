import { Pressable } from "../../../ui/src/Pressable";
import { createSignal, Show } from "solid-js";
import { t } from "../../../../apps/desktop/src/lib/i18n";
import { cn } from "../../../../apps/desktop/src/lib/utils";
import { Dialog, DialogContent, DialogTitle } from "../../../ui/src/Dialog";
import { RAIL_MENU_ITEM } from "./rail-menu";
import type { RailWorkspaceTarget, Revocation } from "./remove-rail-workspace";

export function RemoveWorkspaceDialog(props: {
  workspace: RailWorkspaceTarget | null;
  onCancel: () => void;
  onRemove: (workspace: RailWorkspaceTarget) => Promise<Revocation>;
  onUnavailable: () => void;
}) {
  const [busy, setBusy] = createSignal(false);
  const [failed, setFailed] = createSignal(false);
  let cancelButton: HTMLButtonElement | undefined;
  function close() {
    setFailed(false);
    props.onCancel();
  }
  async function confirm() {
    const workspace = props.workspace;
    if (!workspace || busy()) return;
    setBusy(true);
    setFailed(false);
    try {
      const result = await props.onRemove(workspace);
      close();
      if (result === "unavailable") props.onUnavailable();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }
  return <Dialog open={!!props.workspace} onOpenChange={(open) => { if (!open && !busy()) close(); }}>
    <DialogContent onOpenAutoFocus={(event) => { event.preventDefault(); cancelButton?.focus(); }}>
      <DialogTitle class="m-0 text-base font-semibold">{t("shell.workspaces.remove_title", { name: props.workspace?.name ?? "" })}</DialogTitle>
      <ul class="my-3 list-disc space-y-1 pl-5 text-ui text-neutral-700">
        <li>{t("shell.workspaces.remove_bar")}</li>
        <li>{t("shell.workspaces.remove_access")}</li>
        <li>{t("shell.workspaces.remove_keep_work")}</li>
        <li>{t("shell.workspaces.remove_return")}</li>
      </ul>
      <Show when={failed()}><p role="alert" class="text-ui text-error-strong">{t("shell.workspaces.remove_failed")}</p></Show>
      <div class="flex justify-end gap-2">
        <Pressable ref={cancelButton} disabled={busy()} class={cn(RAIL_MENU_ITEM, "w-auto px-3")} onClick={close}>{t("shell.workspaces.remove_cancel")}</Pressable>
        <Pressable disabled={busy()} class={cn(RAIL_MENU_ITEM, "w-auto bg-error-strong px-3 text-[var(--action-text)] hover:bg-error-strong hover:brightness-90 focus-visible:bg-error-strong focus-visible:brightness-90")} onClick={() => void confirm()}>{t("shell.workspaces.remove_confirm_button")}</Pressable>
      </div>
    </DialogContent>
  </Dialog>;
}
