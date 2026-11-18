import { For, Show } from "solid-js";
import { t } from "../../lib/i18n";
import { emptyReasonKey, normalizeEmptyReason } from "./session-empty";
import type { sessionRail } from "./session-groups";

export function SessionEmptyNotice(props: { sessions: ReturnType<typeof sessionRail> }) {
  return <>
    <Show when={props.sessions.organizationNotice()}><p role="status" class="m-0 px-2 py-1.5 text-caption text-neutral-500">{t("shell.workspaces.organization_required")}</p><button type="button" class="px-2 text-caption text-neutral-500 underline" onClick={() => props.sessions.clearOrganizationNotice()}>{t("shell.workspaces.dismiss_removed")}</button></Show>
    <Show when={props.sessions.emptyReason()}>{(reason) => <p role="status" class="m-0 px-2 py-1.5 text-caption text-neutral-500">{t(emptyReasonKey(reason()))}</p>}</Show>
    <For each={props.sessions.removed()}>{(item) => <div data-removed-context={item.context_id} class="px-2 py-1.5 text-caption text-neutral-500"><p role="status" class="m-0">{t("shell.workspaces.removed_org", { name: item.org })} {t(emptyReasonKey(normalizeEmptyReason(item.reason) ?? "unknown"))}</p><button type="button" class="text-caption text-neutral-500 underline" onClick={() => props.sessions.sessions.dismissRemoved(item.context_id)}>{t("shell.workspaces.dismiss_removed")}</button></div>}</For>
  </>;
}
