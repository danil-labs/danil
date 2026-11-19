import { createMemo, type JSX, Show } from "solid-js";
import { capabilities } from "../../lib/platform";
import type { AttentionState, TaskAttention } from "./attention";
import { type OrganizationRailActions, OrganizationRailGroup } from "./OrganizationRailGroup";
import { OrganizationRailLayout } from "./OrganizationRailLayout";
import { watchOrganizationCredits } from "./organization-credits-watch";
import { organizationRailPreferences } from "./organization-rail-preferences";
import type { SessionRailGroup } from "./session-groups";

export function WebOrganizationRows(props: { rows: readonly { id: string; name: string; logo: string | null }[]; active: string | null; tasksOf: (id: string) => TaskAttention[]; stateLabel: (state: AttentionState | null) => string; onOpen: (id: string, context?: string) => void; onManage: () => void; onRemove: (id: string) => void; fallback: JSX.Element }) {
  const source = capabilities().groupAccount;
  const verified = capabilities().webRailSource;
  const accounts = capabilities().webAccounts;
  const prefs = organizationRailPreferences();
  const credits = watchOrganizationCredits();
  const groups = createMemo((): SessionRailGroup[] => {
    const current = verified?.group();
    return current ? [{ context_id: current.context, org: current.org, org_name: current.name, plan: current.plan, role: current.role, family: "web", email: accounts?.current.email ?? null, available: verified?.workspaces() ?? null, added: new Set(props.rows.map((row) => row.id)), person: accounts?.current.user_id ?? null }] : [];
  });
  const actions: OrganizationRailActions = { sessions: {
    sendOptional: async (context, method, path, body, key) => { if (!source || !["GET", "POST"].includes(method)) throw { detail: "invalid_request" }; return source.send(context, method as "GET" | "POST", path, body, key); },
    families: () => [{ family: "web", email: accounts?.current.email ?? null, contexts: groups() }],
    close: async () => { accounts?.signOut(); }, closeEmail: async () => { accounts?.signOut(); },
  }, remove: (_context, id) => { props.onRemove(id); } };
  return <Show when={verified?.group()} fallback={props.fallback}>
    <OrganizationRailLayout groups={groups()} rows={props.rows} preference={prefs.preference()} used={prefs.used} active={props.active && verified?.group() ? { workspace: props.active, context: verified!.group()!.context } : null} render={(org, stacked) => <OrganizationRailGroup web org={org()} stacked={stacked()} sessions={actions} active={props.active ? { workspace: props.active, context: verified!.group()!.context } : null} tasksOf={(id) => props.tasksOf(id)} stateLabel={props.stateLabel} onOpen={(tile) => { prefs.use(tile.context.org); props.onOpen(tile.id, tile.context.context_id); }} onManage={() => props.onManage()} onChange={(action) => prefs.change([org().id], org().id, action)} index={0} count={1} credits={credits} />} />
  </Show>;
}
