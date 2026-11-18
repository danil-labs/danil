import { type Accessor, createSignal, type JSX, Show } from "solid-js";
import { t } from "../../lib/i18n";
import { KeyedList } from "../../ui/KeyedList";
import { ITEM_DE_MENU } from "../../ui/Popover";
import { AccountHeader } from "./AccountHeader";
import { confirmEmailClose, emailContextCount } from "./session-close-confirm";
import { emptyReasonKey } from "./session-empty";
import type { SessionRailGroup, sessionRail } from "./session-groups";

type RailWorkspace = { id: string; name: string; logo: string | null };
type RowsProps = { sessions: ReturnType<typeof sessionRail>; rows: RailWorkspace[]; render: (w: Accessor<RailWorkspace>) => JSX.Element };

export function SessionWorkspaceRows(props: RowsProps) {
  const local = () => props.sessions.groups() === null ? props.rows : props.rows.filter((w) => !props.sessions.known.has(w.id));
  return <>
    <KeyedList each={local()} by={(w) => w.id}>{(w) => props.render(w)}</KeyedList>
    <KeyedList each={props.sessions.groups() ?? []} by={(g) => g.context_id}>{(g) => <SessionGroup {...props} group={g()} />}</KeyedList>
  </>;
}

function SessionGroup(props: RowsProps & { group: SessionRailGroup }) {
  const [error, setError] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const close = async (target: { context: string } | { email: string | null; family: string }) => {
    if (busy()) return;
    if ("email" in target && !confirmEmailClose(emailContextCount(props.sessions.sessions.families(), target.email, target.family), (count) => t("shell.workspaces.close_email_confirm", { count, email: target.email ?? "" }), window.confirm.bind(window))) return;
    setBusy(true);
    setError(false);
    try {
      if ("email" in target) await props.sessions.sessions.closeEmail(target.email, target.family);
      else await props.sessions.sessions.close(target);
    }
    catch { setError(true); }
    finally { setBusy(false); }
  };
  return <>
    <AccountHeader id={props.group.context_id} email={props.group.email} initialName={props.group.org_name ?? props.group.org} name={t("shell.workspaces.session_group", { email: props.group.email ?? "", name: props.group.org_name ?? props.group.org })} group={{ context: props.group.context_id, org: props.group.org, name: props.group.org_name ?? props.group.org, plan: props.group.plan }} send={props.sessions.sessions.sendOptional} attention={!!props.group.empty_reason} notice={<Show when={props.group.empty_reason}>{(reason) => <p role="status" class="m-0 px-2 py-1 text-caption text-neutral-500">{t(emptyReasonKey(reason()))}</p>}</Show>} extra={false} signedIn>
      <button role="menuitem" class={ITEM_DE_MENU} disabled={busy()} onClick={() => void close({ context: props.group.context_id })}>{t("shell.workspaces.close_org", { name: props.group.org_name ?? props.group.org })}</button>
      <button role="menuitem" class={ITEM_DE_MENU} disabled={busy()} onClick={() => void close({ email: props.group.email, family: props.group.family })}>{t("shell.workspaces.close_email", { email: props.group.email ?? "" })}</button>
      <Show when={error()}><p role="alert" class="m-0 px-2 py-1 text-caption text-error-strong">{t("shell.workspaces.sessions_failed")}</p></Show>
    </AccountHeader>
    <Show when={props.group.available}>
      <KeyedList each={props.rows.filter((w) => props.group.available?.some((r) => r.id === w.id))} by={(w) => w.id}>{(w) => props.render(w)}</KeyedList>
    </Show>
  </>;
}
