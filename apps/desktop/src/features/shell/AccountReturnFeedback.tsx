import "../../locales/danilPhrases";
import Check from "lucide-solid/icons/check";
import CircleAlert from "lucide-solid/icons/circle-alert";
import { createEffect, createResource, createSignal, Show } from "solid-js";
import { manifiesto, t } from "../../lib/i18n";
import { capabilities } from "../../lib/platform";
import { Button } from "../../ui/Button";
import { Toast, ToastPortal } from "../../ui/Toast";
import { accountReturn, accountReturnRevision, setNewAccountTiles } from "./account-return-state";
import { accountReturnTarget } from "./account-return-target";
import type { sessionRail } from "./session-groups";
import { danilRail } from "./workspace-added-wiring";

export function AccountReturnFeedback(props: { sessions: ReturnType<typeof sessionRail>; onOpen: (id: string, context?: string) => void }) {
  const [web] = createResource(() => (accountReturnRevision(), !capabilities().nativeWindow && !!accountReturn.state() && capabilities().groupAccount), async (source) => source ? source.current() : null);
  const groups = () => {
    if (capabilities().nativeWindow) return props.sessions.groups();
    const group = web(); if (!group) return null;
    const rail = danilRail(() => new Set(), () => {});
    return [{ context_id: group.context, org: group.org, org_name: group.name, available: rail.available(), added: rail.added() }];
  };
  const [success, setSuccess] = createSignal<{ organizations: string[]; n: number } | null>(null);
  const error = () => (accountReturnRevision(), accountReturn.state()?.phase === "error");
  createEffect(() => {
    accountReturnRevision();
    if (accountReturn.state()?.phase === "pending") setSuccess(null);
    const target = accountReturnTarget(groups(), accountReturn.state()?.before ?? []), result = accountReturn.take(groups());
    if (!result) return;
    setNewAccountTiles(result.ids);
    if (result.ids[0]) props.onOpen(result.ids[0], target?.context);
    setSuccess({ organizations: result.organizations, n: result.ids.length });
  });
  return <ToastPortal>
    <Show when={success()}>{(value) => <Toast onDismiss={() => setSuccess(null)}><p class="m-0 flex items-center gap-2 text-sm font-medium"><Check size={14} aria-hidden="true" class="shrink-0 text-success-strong" />{t("shell.workspaces.added_toast_title", { orgs: new Intl.ListFormat(manifiesto().formato, { type: "conjunction" }).format(value().organizations) })}</p><p class="m-0 text-xs text-neutral-500">{t("shell.workspaces.added_toast_body", { n: value().n, count: value().n })}</p></Toast>}</Show>
    <Show when={error()}><Toast tone="error" onDismiss={() => accountReturn.clear()}><p class="m-0 flex items-center gap-2 text-sm font-medium"><CircleAlert size={14} aria-hidden="true" class="shrink-0 text-error-strong" />{t("shell.workspaces.add_failed_title")}</p><p class="m-0 text-xs text-neutral-500">{t(accountReturn.state()?.detail === "too_many_contexts" ? "danil.error.too_many_contexts" : "shell.workspaces.add_failed_body")}</p><Show when={accountReturn.state()?.detail !== "too_many_contexts"}><Button size="sm" variant="secondary" onClick={() => { if (capabilities().nativeWindow) void props.sessions.sessions.addAccount().catch(() => {}); else { accountReturn.begin(groups()?.map((g) => g.context_id) ?? []); capabilities().webAccounts?.add?.(); } }}>{t("shell.workspaces.add_retry")}</Button></Show></Toast></Show>
  </ToastPortal>;
}
