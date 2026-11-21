import { Show } from "solid-js";
import { t } from "./i18n.ts";
import type { OrgTile } from "./organization-rail-model.ts";

export interface OrganizationWorkspaceTooltipProps {
  tile: OrgTile;
  stale?: boolean;
  active?: boolean;
  balance?: number | string | null;
  loadingBalance?: boolean;
  send?: any;
  credits?: any;
}

export function OrganizationWorkspaceTooltip(props: OrganizationWorkspaceTooltipProps) {
  const loading = () => props.loadingBalance ?? false;
  const balance = () => props.balance ?? null;

  return (
    <div class="grid gap-0.5" data-organization-tooltip={props.tile.context.context_id}>
      <span class="font-semibold">
        {props.tile.name}
        <Show when={props.stale}>
          <span class="font-normal opacity-80"> · {t("shell.rail.attention_stale")}</span>
        </Show>
      </span>
      <span class="font-normal opacity-80">
        {t("shell.rail.tip_account", {
          org: props.tile.context.org_name ?? props.tile.context.org,
          email: props.tile.context.email ?? "",
        })}
      </span>
      <span class="font-normal tabular-nums">
        <Show when={!loading()} fallback={t("shell.rail.tip_balance_loading")}>
          {balance() == null
            ? t("shell.rail.tip_balance_unavailable")
            : t("shell.rail.tip_balance", {
                amount: t("chat.credits.amount", { count: balance()! }),
              })}
        </Show>
      </span>
    </div>
  );
}
