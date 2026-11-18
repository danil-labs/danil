import { createEffect, createSignal, onCleanup, Show } from "solid-js";
import { t } from "../../lib/i18n";
import { ITEM_DE_MENU } from "../../ui/Popover";
import { createWorkspaceSourceWait } from "./workspace-source-wait";

export function WorkspaceSourceStatus(props: { organization: string; available: readonly unknown[] | null; onRetry: () => Promise<unknown> }) {
  const [revision, bump] = createSignal(0);
  const wait = createWorkspaceSourceWait(() => props.onRetry(), () => bump((n) => n + 1));
  createEffect(() => wait.update(props.available));
  onCleanup(wait.dispose);
  const expired = () => (revision(), wait.view().timedOut);
  return <Show when={expired()} fallback={<p class="m-0 px-2 py-1.5 text-caption text-neutral-500">{t("shell.workspaces.danil_loading")}</p>}>
    <p role="alert" class="m-0 px-2 py-1.5 text-caption text-error-strong">{t("shell.workspaces.machine_unresponsive", { name: props.organization })}</p>
    <button type="button" role="menuitem" class={ITEM_DE_MENU} onClick={() => void wait.retry()}>{t("shell.workspaces.machine_retry")}</button>
  </Show>;
}
