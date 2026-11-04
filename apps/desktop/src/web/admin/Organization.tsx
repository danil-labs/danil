/** Lo de la organización: sus workspaces, su plan y, en Enterprise, solo lo que ya esté configurado. */
import { createResource, For, Show } from "solid-js";
import { SettingsPanel, SettingsRow, SettingsSection } from "../../features/settings/layout";
import type { OrganizationWorkspace } from "../../../../../packages/attention/src/support-access.ts";
import { t } from "../../lib/i18n";

export type IdentityRow = { id: "sso" | "scim" | "domains" | "retention" | "roles"; value: string };
export type OrganizationSource = {
  /** Los workspaces de la organización dueña del workspace `account`. Verlos no da entrada a ellos. */
  workspaces?: (account: number) => Promise<OrganizationWorkspace[]>;
  plan?: () => Promise<{ name: string; detail: string }>;
  /** Lo propio de Enterprise que esta organización ya tiene; sin filas, la sección no existe. */
  identity?: IdentityRow[];
};

export function OrganizationWorkspaces(props: { source: (account: number) => Promise<OrganizationWorkspace[]>; account: number; organization: string | null }) {
  const [rows] = createResource(() => props.account, (account) => props.source(account));
  return (
    <SettingsSection title={t("web.admin.org_workspaces")} description={props.organization ?? undefined} data-admin-org-workspaces="">
      <Show when={rows.error}><p role="alert" class="m-0 text-sm text-error-strong">{t("web.admin.failed")}</p></Show>
      <For each={rows()}>{(row) => <SettingsRow label={row.name} description={t("web.admin.org_workspace_members", { count: row.members })} />}</For>
    </SettingsSection>
  );
}

export function Plan(props: { source: () => Promise<{ name: string; detail: string }> }) {
  const [plan] = createResource(() => props.source());
  return (
    <SettingsSection title={t("web.admin.plan")}>
      <Show when={plan()}>{(value) => <SettingsRow label={value().name} description={value().detail} />}</Show>
    </SettingsSection>
  );
}

export function Identity(props: { rows: IdentityRow[] }) {
  return (
    <SettingsPanel>
      <SettingsSection title={t("web.admin.identity")}>
        <For each={props.rows}>{(row) => <SettingsRow label={t(`web.admin.identity_${row.id}`)} description={row.value} />}</For>
      </SettingsSection>
    </SettingsPanel>
  );
}
