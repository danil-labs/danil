import { createEffect, createMemo } from "solid-js";
import type { TaskAttention } from "./attention";
import { OrganizationRailGroup } from "./OrganizationRailGroup";
import { OrganizationRailLayout } from "./OrganizationRailLayout";
import { watchOrganizationCredits } from "./organization-credits-watch";
import { type OrgTile, orderedOrganizations } from "./organization-rail-model";
import { organizationRailPreferences } from "./organization-rail-preferences";
import type { sessionRail } from "./session-groups";

export function OrganizationSessionRows(props: { sessions: ReturnType<typeof sessionRail>; rows: readonly { id: string; name: string; logo: string | null }[]; active: { workspace: string; context: string } | null; tasksOf: (id: string, context: string) => TaskAttention[]; staleOf?: (id: string, context: string) => boolean; stateLabel: (state: "approving" | "asked" | "failed" | "unseen" | null) => string; onOpen: (id: string, context: string) => void; onManage: () => void }) {
  const prefs = organizationRailPreferences();
  const credits = watchOrganizationCredits();
  let lastOpen = "";
  createEffect(() => { const active = props.active, key = active ? JSON.stringify([active.context, active.workspace]) : ""; if (key === lastOpen) return; lastOpen = key; const group = props.sessions.groups()?.find((item) => item.context_id === active?.context); if (group) prefs.use(group.org); });
  const groups = createMemo(() => (props.sessions.groups() ?? []).map((group) => ({ ...group, available: group.available?.filter((row) => group.added?.has(row.id) || (props.active?.workspace === row.id && props.active.context === group.context_id)) ?? null })));
  const organizations = createMemo(() => orderedOrganizations(groups(), props.rows, prefs.preference()));
  createEffect(() => { if (props.sessions.groups()?.some((group) => group.empty_reason && !organizations().some((org) => org.contexts.some((context) => context.context_id === group.context_id)))) props.sessions.notifyOrganization(); });
  const open = (tile: OrgTile) => { prefs.use(tile.context.org); props.onOpen(tile.id, tile.context.context_id); };
  return <OrganizationRailLayout groups={groups()} rows={props.rows} preference={prefs.preference()} used={prefs.used} active={props.active} render={(org, stacked) => <OrganizationRailGroup org={org()} stacked={stacked()} sessions={props.sessions} active={props.active} tasksOf={props.tasksOf} staleOf={props.staleOf} stateLabel={props.stateLabel} onOpen={open} onManage={() => props.onManage()} onChange={(action) => prefs.change(organizations().map((group) => group.id), org().id, action)} index={organizations().findIndex((group) => group.id === org().id)} count={organizations().length} credits={credits} />} />;
}
