import { createResource, createSignal, Show } from "solid-js";
import { createAccountAddAction } from "../../../../../apps/desktop/src/lib/account-add";
import { type GroupAccount, type GroupSend, readGroupBalance } from "../../../../../apps/desktop/src/lib/group-account";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import { capabilities } from "../../../../host/src/platform";
import { Button } from "../../../../ui/src/Button";
import { KeyedList } from "../../../../ui/src/KeyedList";
import { accountReturn, noteWebAccountMode, sessionRailState } from "../../../../shell/src/shell";
import { SettingsBlock, SettingsPanel, SettingsRow, SettingsSection } from "../../../../ui/src/SettingsLayout";

type Row = GroupAccount & { email: string | null; family: string };
export default function SessionAccounts() {
  const rail = sessionRailState;
  const addAccount = createAccountAddAction(capabilities().nativeWindow, () => rail()!.sessions.addAccount(), capabilities().webAccounts?.add ? () => { accountReturn.begin(rows().map((r) => r.context)); capabilities().webAccounts?.add?.(); } : undefined);
  const [web] = createResource(() => !capabilities().nativeWindow && capabilities().groupAccount, async (source) => { const group = source ? await source.current() : null; noteWebAccountMode(); return group; });
  const rows = (): Row[] => capabilities().nativeWindow ? (rail()?.groups() ?? []).map((g) => ({ context: g.context_id, org: g.org, name: g.org_name ?? g.org, plan: g.plan, email: g.email, family: g.family })) : web() ? [{ ...web()!, email: capabilities().webAccounts?.current.email ?? null, family: "web" }] : [];
  const emails = () => [...new Map(rows().map((r) => [r.email?.trim().toLowerCase() ?? r.family, r.email])).entries()];
  const mine = (key: string) => rows().filter((r) => (r.email?.trim().toLowerCase() ?? r.family) === key);
  const [confirm, setConfirm] = createSignal<string | null>(null);
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const run = async (action: () => Promise<unknown> | unknown) => {
    if (busy()) return;
    setBusy(true); setError(null);
    try { await action(); } catch (cause) { setError((cause as { detail?: string } | null)?.detail === "too_many_contexts" ? "danil.error.too_many_contexts" : "shell.workspaces.sessions_failed"); } finally { setBusy(false); }
  };
  const closeAll = (key: string) => run(async () => {
    const group = mine(key)[0];
    if (!group) return;
    setConfirm(null);
    if (capabilities().nativeWindow) await rail()?.sessions.closeEmail(group.email, group.family);
    else capabilities().webAccounts?.signOut();
  });
  const send: GroupSend = (context, method, path, body, key) => capabilities().nativeWindow ? rail()!.sessions.sendOptional(context, method, path, body, key) : capabilities().groupAccount!.send(context, method, path, body, key);
  return <SettingsPanel data-session-accounts="">
    <SettingsSection title={t("danil.accounts.title")} description={t("danil.accounts.description")} aside={<Show when={addAccount}><Button size="sm" variant="secondary" onClick={() => void Promise.resolve(addAccount?.()).catch(() => {})}>{t("shell.workspaces.add_session")}</Button></Show>}>
      <Show when={!rows().length}><SettingsBlock><p class="m-0 text-sm text-neutral-500">{t("danil.accounts.empty")}</p></SettingsBlock></Show>
      <Show when={error()}>{(key) => <SettingsBlock><p role="alert" class="m-0 text-caption text-error-strong">{t(key())}</p></SettingsBlock>}</Show>
    </SettingsSection>
    <KeyedList each={emails()} by={([key]) => key}>{(entry) => { const [key, email] = entry(); return <SettingsSection title={email ?? t("danil.account.your_account")} aside={<Show when={mine(key).length > 1}><Button size="sm" variant="ghost" disabled={busy()} onClick={() => setConfirm(key)}>{t("danil.accounts.close_all")}</Button></Show>}>
      <KeyedList each={mine(key)} by={(group) => group.context}>{(group) => <AccountOrganization group={group()} send={send} busy={busy()} onClose={() => void run(() => capabilities().nativeWindow ? rail()?.sessions.close({ context: group().context }) : capabilities().webAccounts?.signOut())} />}</KeyedList>
      <Show when={confirm() === key}><SettingsRow label={t("danil.accounts.close_all_confirm", { email: email ?? "", count: mine(key).length })}>
        <Button size="sm" variant="secondary" disabled={busy()} onClick={() => void closeAll(key)}>{t("danil.account.sign_out")}</Button>
        <Button size="sm" variant="ghost" onClick={() => setConfirm(null)}>{t("danil.accounts.close_no")}</Button>
      </SettingsRow></Show>
    </SettingsSection>; }}</KeyedList>
  </SettingsPanel>;
}
function AccountOrganization(props: { group: Row; send: GroupSend; busy: boolean; onClose: () => void }) {
  const [balance] = createResource(() => props.group.context, () => readGroupBalance(props.send, props.group));
  const label = () => balance.loading ? t("shell.workspaces.danil_loading") : balance() === null || balance() === undefined ? t("chat.credits.unavailable") : t("chat.credits.amount", { count: balance()! });
  return <SettingsRow label={<span class="flex items-baseline gap-2">{props.group.name}<span class="shrink-0 font-mono text-[0.68rem] text-neutral-500">{props.group.plan}</span></span>} description={<span class="tabular-nums">{t("danil.accounts.credits", { balance: label() })}</span>}>
    <Button size="sm" variant="secondary" disabled={props.busy} onClick={() => props.onClose()}>{t("danil.account.sign_out")}</Button>
  </SettingsRow>;
}
