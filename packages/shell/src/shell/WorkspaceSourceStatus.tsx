import { createEffect, createSignal, onCleanup, Show } from "solid-js";
import { t } from "../../../ui/src/lib/i18n";
import { ITEM_DE_MENU } from "../../../ui/src/Popover";
import { createWorkspaceSourceWait } from "./workspace-source-wait";
import { Pressable } from "../../../ui/src/Pressable";

export function WorkspaceSourceStatus(props: { available: readonly unknown[] | null; onRetry: () => Promise<unknown> }) {
  const [revision, bump] = createSignal(0);
  const wait = createWorkspaceSourceWait(() => props.onRetry(), () => bump((n) => n + 1));
  createEffect(() => wait.update(props.available));
  onCleanup(wait.dispose);
  const expired = () => (revision(), wait.view().timedOut);
  return <Show when={expired()} fallback={<p class="m-0 px-2 py-1.5 text-caption text-neutral-500">{t("shell.workspaces.danil_loading")}</p>}>
    <p role="alert" class="m-0 px-2 py-1.5 text-caption text-error-strong">{t("shell.workspaces.catalog_error")}</p>
    <Pressable role="menuitem" class={ITEM_DE_MENU} onClick={() => void wait.retry()}>{t("common.part.retry")}</Pressable>
  </Show>;
}
