/** Personas de la organización: lista, rol, invitación y baja. */
import { createResource, createSignal, For, Show } from "solid-js";
import { SettingsPanel, SettingsRow, SettingsSection } from "../../features/settings/layout";
import { t } from "../../lib/i18n";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { Dialog, DialogContent, DialogTitle } from "../../ui/Dialog";
import { Input } from "../../ui/Input";
import { Select } from "../../ui/Select";
import { seatsFull, type SeatUsage } from "../../features/settings/business-billing";

export type MemberRole = "owner" | "admin" | "member";
export type Member = { id: string; name: string; email: string; role: MemberRole; invited: boolean };
export type MembersSource = {
  list: () => Promise<Member[]>;
  invite: (email: string, role: MemberRole) => Promise<void>;
  setRole: (id: string, role: MemberRole) => Promise<void>;
  remove: (id: string) => Promise<void>;
};

/** Los lugares de Danil Business del workspace y dónde se agregan. Sin esto, no hay límite que enseñar. */
export type MembersSeats = { usage: () => Promise<SeatUsage>; addHref: string };

/** El BFF rechaza la invitación con el plan lleno (`seat_limit_reached`). */
const seatLimit = (error: unknown) => {
  const code = (error as { code?: unknown; message?: unknown } | null)?.code ?? (error as { message?: unknown } | null)?.message;
  return code === "seat_limit_reached";
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

export function Members(props: { source: MembersSource; seats?: MembersSeats }) {
  const [rows, { refetch }] = createResource(() => props.source.list());
  const [seats, { refetch: refetchSeats }] = createResource(async () => (props.seats ? await props.seats.usage().catch(() => null) : null));
  const [limitHit, setLimitHit] = createSignal(false);
  const business = () => {
    const s = seats();
    return s?.business ? s : null;
  };
  const full = () => limitHit() || (business() ? seatsFull(business()!) : false);
  const [email, setEmail] = createSignal("");
  const [role, setRole] = createSignal<MemberRole>("member");
  const [leaving, setLeaving] = createSignal<Member | null>(null);
  const [failed, setFailed] = createSignal(false);
  const act = (work: Promise<void>) => {
    setFailed(false);
    return work.then(() => { void refetch(); void refetchSeats(); }).catch((error) => {
      if (seatLimit(error)) setLimitHit(true);
      else setFailed(true);
    });
  };
  const lastOwner = (row: Member) => row.role === "owner" && rows()?.filter((m) => m.role === "owner" && !m.invited).length === 1;
  const invite = (event: SubmitEvent) => {
    event.preventDefault();
    const address = email().trim();
    if (!address || full()) return;
    setLimitHit(false);
    void act(props.source.invite(address, role())).then(() => { if (!limitHit() && !failed()) setEmail(""); });
  };
  return (
    <SettingsPanel data-admin-members="">
      <SettingsSection title={t("web.admin.members_invite")} description={t("web.admin.members_invite_hint")}>
        <Show when={business() && !full()}>
          <p class="m-0 pt-2 text-xs text-neutral-500" data-admin-seats="">{t("web.admin.members_seats", { used: business()!.seatsUsed, allowed: business()!.seatsAllowed })}</p>
        </Show>
        <Show when={full()}>
          <div role="status" class="mt-3 grid gap-2 rounded-md border border-warning-strong p-3 text-ui" data-admin-seats-full="">
            <p class="m-0">
              {business() ? t("web.admin.members_seats_full", { used: business()!.seatsUsed, allowed: business()!.seatsAllowed }) : t("web.admin.members_seats_full_plain")}
            </p>
            <Show when={props.seats}>
              {(link) => <Button as="a" size="sm" variant="secondary" class="justify-self-start" href={link().addHref} data-admin-add-seats="">{t("web.admin.members_add_seats")}</Button>}
            </Show>
          </div>
        </Show>
        <form class="flex flex-wrap items-center gap-2 pt-3" onSubmit={invite}>
          <Input class="min-w-0 flex-1 basis-56" type="email" required aria-label={t("web.admin.members_email")} placeholder={t("web.admin.members_email")} value={email()} onInput={(event) => setEmail(event.currentTarget.value)} />
          <RoleSelect value={role()} label={t("web.admin.members_role")} onChange={setRole} />
          <Button type="submit" size="sm" disabled={full()}>{t("web.admin.members_invite_action")}</Button>
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
