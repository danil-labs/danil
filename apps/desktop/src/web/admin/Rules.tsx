/** Reglas: por workspace; las de organización solo existen en Enterprise. Muchas orientan y no bloquean. */
import { createResource, For, Show } from "solid-js";
import { SettingsPanel, SettingsRow, SettingsSection } from "../../features/settings/layout";
import { t } from "../../lib/i18n";
import { Badge } from "../../ui/Badge";
import { PolicyFlow, type PolicySource } from "./PolicyFlow";

export type RuleEnforcement = "advisory" | "client" | "server";
export type PolicyRule = { id: string; name: string; value: string; enforcement: RuleEnforcement; scope: "workspace" | "organization" };
export type RulesSource = { rules: () => Promise<PolicyRule[]> };

const TONE: Record<RuleEnforcement, "neutral" | "active" | "success"> = { advisory: "neutral", client: "active", server: "success" };

function RuleRows(props: { rows: PolicyRule[] }) {
  return (
    <For each={props.rows}>
      {(row) => (
        <SettingsRow data-policy-rule={row.enforcement} label={row.name} description={row.value}>
          <Badge tone={TONE[row.enforcement]}>{t(`web.admin.enforcement.${row.enforcement}`)}</Badge>
        </SettingsRow>
      )}
    </For>
  );
}

export function Rules(props: { source: RulesSource; policy: PolicySource; organization: boolean; canPropose: boolean }) {
  const [rows] = createResource(() => props.source.rules());
  const of = (scope: PolicyRule["scope"]) => rows()?.filter((row) => row.scope === scope) ?? [];
  return (
    <SettingsPanel data-admin-rules="">
      <SettingsSection title={t("web.admin.rules_workspace")} description={t("web.admin.rules_hint")}>
        <RuleRows rows={of("workspace")} />
      </SettingsSection>
      <Show when={props.organization && of("organization").length}>
        <SettingsSection title={t("web.admin.rules_organization")} description={t("web.admin.rules_organization_hint")}>
          <RuleRows rows={of("organization")} />
        </SettingsSection>
      </Show>
      <PolicyFlow area="rules" source={props.policy} canPropose={props.canPropose} />
    </SettingsPanel>
  );
}
