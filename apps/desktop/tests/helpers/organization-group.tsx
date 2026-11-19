import { createContextAttention } from "../../src/features/machines/context-attention";
import { render } from "solid-js/web";
import { OrganizationRailGroup, type OrganizationRailActions } from "../../src/features/shell/OrganizationRailGroup";
import { watchOrganizationCredits } from "../../src/features/shell/organization-credits-watch";
import type { SessionRailGroup } from "../../src/features/shell/session-groups";

export function mountOrganizationGroup(root: HTMLElement, stacked = false, single = false) {
  const actions: string[] = [];
  const attention = createContextAttention();
  const contexts: SessionRailGroup[] = (single ? ["ana"] : ["ana", "bea"]).map((context) => ({ context_id: context, org: "org", org_name: "Acme", family: context, email: `${context}@example.test`, role: context === "ana" ? "admin" : "member", plan: "paid", available: [{ id: "shared", name: "Docs" }], added: new Set(["shared"]), person: context }));
  const sessions: OrganizationRailActions = { sessions: {
    sendOptional: async (context) => { actions.push(`balance/${context}`); return { status: 200, body: { organization_id: "org", available: { currency: "MXN", amount_micro: "1000000" } } }; },
    families: () => contexts.map((context) => ({ family: context.family, email: context.email, contexts: [context] })),
    close: async (target) => { actions.push(`close/${"context" in target ? target.context : target.family}`); },
    closeEmail: async (email) => { actions.push(`email/${email}`); },
  }, remove: async (context, id) => { actions.push(`remove/${context}/${id}`); } };
  const org = { id: "org", name: "Acme", contexts, pinned: false, tiles: contexts.map((context) => ({ key: `${context.context_id}/shared`, id: "shared", name: "Docs", logo: null, context })) };
  const dispose = render(() => <OrganizationRailGroup org={org} stacked={stacked} sessions={sessions} active={null} tasksOf={(_id, context) => context === "bea" ? [{ session: "task", project: "project", state: "asked" }] : []} stateLabel={(state) => state ?? ""} onOpen={(tile) => actions.push(`open/${tile.context.context_id}/${tile.id}`)} onManage={() => actions.push("manage")} onChange={(action) => actions.push(action)} index={0} count={1} credits={watchOrganizationCredits()} />, root);
  return { dispose: () => { dispose(); attention.close(); }, actions, stale: () => attention.suspend("bea"), fresh: () => attention.resume("bea") };
}
