/** Personas de la organización: lista, rol, invitación y baja. */
import { createResource, createSignal, For, Show } from "solid-js";
import { SettingsPanel, SettingsRow, SettingsSection } from "../../features/settings/layout";
import { t } from "../../lib/i18n";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { Dialog, DialogContent, DialogTitle } from "../../ui/Dialog";
import { Input } from "../../ui/Input";
import { Select } from "../../ui/Select";

export type MemberRole = "owner" | "admin" | "member";
export type Member = { id: string; name: string; email: string; role: MemberRole; invited: boolean };
export type MembersSource = {
  list: () => Promise<Member[]>;
  invite: (email: string, role: MemberRole) => Promise<void>;
  setRole: (id: string, role: MemberRole) => Promise<void>;
  remove: (id: string) => Promise<void>;
};

function RoleSelect(props: { value: MemberRole; label: string; disabled?: boolean; onChange: (role: MemberRole) => void }) {
  return (
    <Select class="w-32" aria-label={props.label} value={props.value} disabled={props.disabled} onChange={(event) => props.onChange(event.currentTarget.value as MemberRole)}>
      <option value="owner">{t("web.admin.role_owner")}</option>
      <option value="admin">{t("web.admin.role_admin")}</option>
      <option value="member">{t("web.admin.role_member")}</option>
    </Select>
  );
}

export function Members(props: { source: MembersSource }) {
  const [rows, { refetch }] = createResource(() => props.source.list());
  const [email, setEmail] = createSignal("");
  const [role, setRole] = createSignal<MemberRole>("member");
  const [leaving, setLeaving] = createSignal<Member | null>(null);
  const [failed, setFailed] = createSignal(false);
  const act = (work: Promise<void>) => {
    setFailed(false);
    return work.then(() => void refetch()).catch(() => setFailed(true));
  };
  const lastOwner = (row: Member) => row.role === "owner" && rows()?.filter((m) => m.role === "owner" && !m.invited).length === 1;
  const invite = (event: SubmitEvent) => {
    event.preventDefault();
    const address = email().trim();
    if (!address) return;
    void act(props.source.invite(address, role())).then(() => setEmail(""));
  };
  return (
    <SettingsPanel data-admin-members="">
      <SettingsSection title={t("web.admin.members_invite")} description={t("web.admin.members_invite_hint")}>
        <form class="flex flex-wrap items-center gap-2 pt-3" onSubmit={invite}>
          <Input class="min-w-0 flex-1 basis-56" type="email" required aria-label={t("web.admin.members_email")} placeholder={t("web.admin.members_email")} value={email()} onInput={(event) => setEmail(event.currentTarget.value)} />
          <RoleSelect value={role()} label={t("web.admin.members_role")} onChange={setRole} />
          <Button type="submit" size="sm">{t("web.admin.members_invite_action")}</Button>
        </form>
      </SettingsSection>
      <SettingsSection title={t("web.admin.members")}>
        <Show when={failed()}><p role="alert" class="m-0 py-2 text-sm text-error-strong">{t("web.admin.members_failed")}</p></Show>
        <For each={rows()}>
          {(row) => (
            <SettingsRow
              data-admin-member={row.id}
              label={row.name || row.email}
              description={row.name ? row.email : undefined}
              lead={<span class="grid size-7 shrink-0 place-items-center rounded-full bg-surface-muted text-xs font-semibold">{(row.name || row.email).slice(0, 1).toUpperCase()}</span>}
            >
              <Show when={row.invited}><Badge tone="warning">{t("web.admin.members_invited")}</Badge></Show>
              <RoleSelect value={row.role} label={t("web.admin.members_role_of", { name: row.name || row.email })} disabled={lastOwner(row)} onChange={(next) => void act(props.source.setRole(row.id, next))} />
              <Button size="sm" variant="ghost" disabled={lastOwner(row)} title={lastOwner(row) ? t("web.admin.members_last_owner") : undefined} onClick={() => setLeaving(row)}>
                {row.invited ? t("web.admin.members_cancel_invite") : t("web.admin.members_remove")}
              </Button>
            </SettingsRow>
          )}
        </For>
      </SettingsSection>
      <Dialog open={leaving() !== null} onOpenChange={(open) => !open && setLeaving(null)}>
        <DialogContent class="grid w-[min(26rem,100%)] gap-3 p-5" aria-label={t("web.admin.members_remove")}>
          <DialogTitle class="m-0 text-base font-semibold">{t("web.admin.members_remove_title", { name: leaving()?.name || leaving()?.email || "" })}</DialogTitle>
          <p class="m-0 text-ui text-neutral-500">{t("web.admin.members_remove_hint")}</p>
          <div class="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setLeaving(null)}>{t("web.admin.cancel")}</Button>
            <Button size="sm" variant="danger" onClick={() => { const row = leaving(); setLeaving(null); if (row) void act(props.source.remove(row.id)); }}>{t("web.admin.members_remove")}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </SettingsPanel>
  );
}
