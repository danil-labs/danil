import { createResource, Show } from "solid-js";
import type { GroupSend } from "../../lib/group-account";
import { t } from "../../lib/i18n";
import type { watchOrganizationCredits } from "./organization-credits-watch";
import type { OrgTile } from "./organization-rail-model";

export function OrganizationWorkspaceTooltip(props: { tile: OrgTile; stale?: boolean; active: boolean; send: GroupSend; credits: ReturnType<typeof watchOrganizationCredits> }) {
  const [balance] = createResource(() => props.active && { context: props.tile.context.context_id, org: props.tile.context.org, revision: props.credits.revision() }, ({ context, org }) => props.credits.read({ context, org, name: props.tile.context.org_name ?? org, plan: props.tile.context.plan }, props.send));
  return <div class="grid gap-0.5" data-organization-tooltip={props.tile.context.context_id}>
    <span class="font-semibold">{props.tile.name}<Show when={props.stale}><span class="font-normal opacity-80"> · {t("shell.rail.attention_stale")}</span></Show></span>
    <span class="font-normal opacity-80">{t("shell.rail.tip_account", { org: props.tile.context.org_name ?? props.tile.context.org, email: props.tile.context.email ?? "" })}</span>
    <span class="font-normal tabular-nums"><Show when={!balance.loading} fallback={t("shell.rail.tip_balance_loading")}>{balance() == null ? t("shell.rail.tip_balance_unavailable") : t("shell.rail.tip_balance", { amount: t("chat.credits.amount", { count: balance()! }) })}</Show></span>
  </div>;
}
