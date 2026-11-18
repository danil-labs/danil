import { createEffect, createResource, createSignal, Show } from "solid-js";
import { t } from "../../lib/i18n";
import { capabilities } from "../../lib/platform";
import { Button } from "../../ui/Button";
import { Toast, ToastPortal } from "../../ui/Toast";
import { accountReturn, accountReturnRevision, setNewAccountTiles } from "./account-return-state";
import type { sessionRail } from "./session-groups";
import { danilRail } from "./workspace-added-wiring";

export function AccountReturnFeedback(props: { sessions: ReturnType<typeof sessionRail>; onOpen: (id: string) => void }) {
  const [web] = createResource(() => (accountReturnRevision(), !capabilities().nativeWindow && !!accountReturn.state() && capabilities().groupAccount), async (source) => source ? source.current() : null);
  const groups = () => {
    if (capabilities().nativeWindow) return props.sessions.groups();
    const group = web(); if (!group) return null;
    const rail = danilRail(() => new Set(), () => {});
    return [{ context_id: group.context, org: group.org, org_name: group.name, available: rail.available(), added: rail.added() }];
  };
  const [success, setSuccess] = createSignal<{ orgs: string; n: number } | null>(null);
  const error = () => (accountReturnRevision(), accountReturn.state()?.phase === "error");
  createEffect(() => {
    accountReturnRevision();
    if (accountReturn.state()?.phase === "pending") setSuccess(null);
    const result = accountReturn.take(groups());
    if (!result) return;
    setNewAccountTiles(result.ids);
    if (result.ids[0]) props.onOpen(result.ids[0]);
    setSuccess({ orgs: result.organizations.join(", "), n: result.ids.length });
  });
  return <ToastPortal>
    <Show when={success()}>{(value) => <Toast onDismiss={() => setSuccess(null)}><p class="m-0 text-sm font-medium">{t("shell.workspaces.added_toast_title", value())}</p><p class="m-0 text-sm text-neutral-500">{t("shell.workspaces.added_toast_body", { ...value(), count: value().n })}</p></Toast>}</Show>
    <Show when={error()}><Toast tone="error" onDismiss={() => accountReturn.clear()}><p class="m-0 text-sm font-medium">{t("shell.workspaces.add_failed_title")}</p><p class="m-0 text-sm text-neutral-500">{t("shell.workspaces.add_failed_body")}</p><Show when={accountReturn.state()?.detail === "too_many_contexts"}><p role="alert" class="m-0 text-sm text-error-strong">{t("danil.error.too_many_contexts")}</p></Show><Button size="sm" variant="secondary" onClick={() => { if (capabilities().nativeWindow) void props.sessions.sessions.addAccount().catch(() => {}); else { accountReturn.begin(groups()?.map((g) => g.context_id) ?? []); capabilities().webAccounts?.add?.(); } }}>{t("shell.workspaces.add_retry")}</Button></Toast></Show>
  </ToastPortal>;
}
