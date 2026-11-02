/**
 * `/admin`: el Harness de Danil, aparte de Configuración. Lo que cada cuenta ve
 * sale de `sections.ts`; una sección sin fuente de datos no aparece.
 */
import ArrowLeft from "lucide-solid/icons/arrow-left";
import Bot from "lucide-solid/icons/bot";
import Building2 from "lucide-solid/icons/building-2";
import ChartColumn from "lucide-solid/icons/chart-column";
import CreditCard from "lucide-solid/icons/credit-card";
import ExternalLink from "lucide-solid/icons/external-link";
import History from "lucide-solid/icons/history";
import KeyRound from "lucide-solid/icons/key-round";
import LifeBuoy from "lucide-solid/icons/life-buoy";
import Server from "lucide-solid/icons/server";
import Settings from "lucide-solid/icons/settings";
import ShieldCheck from "lucide-solid/icons/shield-check";
import Sparkles from "lucide-solid/icons/sparkles";
import Users from "lucide-solid/icons/users";
import { createMemo, createResource, createSignal, For, type JSX, lazy, Match, Show, Suspense, Switch } from "solid-js";
import { isManager, type Membership } from "../../../../../packages/attention/src/support-access.ts";
import { type AccountSources, resolveWorkspaceAccount } from "../../../../../packages/attention/src/workspace-account.ts";
import { t } from "../../lib/i18n";
import { Button } from "../../ui/Button";
import { Select } from "../../ui/Select";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "../../ui/sidebar";
import type { SupportAccessSource } from "../../features/settings/SupportAccess";
import { SettingsPanel, SettingsRow, SettingsSection } from "../../features/settings/layout";
import type { AuditLogSource } from "../audit-log";
import { Members, type MembersSource } from "./Members";
import { Identity, type OrganizationSource, OrganizationWorkspaces, Plan } from "./Organization";
import type { PolicySource } from "./PolicyFlow";
import { Rules, type RulesSource } from "./Rules";
import { type AccountKind, accountKind, type GroupName, menuFor, type Section, visibleSections } from "./sections";
import type { HarnessOrgSource } from "../../features/settings/harness-org";
import { SharedAgents, SharedMcp, SharedSkills, type SharedSource } from "./Shared";
import { Usage, type UsageSource } from "./Usage";

const SupportAccess = lazy(() => import("../../features/settings/SupportAccess"));
const HarnessInsights = lazy(() => import("../../features/settings/HarnessInsights"));
const AuditLog = lazy(() => import("../../features/settings/AuditLog"));

/** El plan de conversaciones sigue en la app de Danil. */
const AGENTS_URL = "https://app.danil.ai";

export type AdminSource = {
  memberships: () => Promise<Membership[]>;
  /** El workspace activo de la sesión: la bitácora solo lee ese. */
  active: () => Promise<number | null>;
  /** De dónde sale la cuenta de `workspace` (`resolveWorkspaceAccount`). */
  accounts: AccountSources;
  support: SupportAccessSource;
  auditLog?: AuditLogSource;
  /** Lo que se comparte con el equipo de este workspace. */
  shared?: SharedSource;
  usage?: UsageSource;
  /** Consumo y actividad de Danil Machine (`/v1/org/*`). Sin esto, la sección no aparece. */
  harness?: HarnessOrgSource;
  members?: MembersSource;
  rules?: RulesSource;
  /** Dónde se propone y se sigue un cambio de política; sin esto, no se ofrece proponer. */
  policy?: PolicySource;
  organization?: OrganizationSource;
  /** Solo el demo abre en una sección. */
  section?: Section;
  /** El workspace desde el que se entró; `null` si se abrió directo: entonces manda la cuenta de la sesión. */
  workspace: string | null;
  /** Adónde lleva «Volver a Danil». */
  home: string;
  /** Configuración, abierta donde vive lo de una cuenta personal. */
  settings: string;
};

const ICONS: Record<Section, () => JSX.Element> = {
  general: () => <Settings size={15} />,
  harness: () => <ChartColumn size={15} />,
  usage: () => <ChartColumn size={15} />,
  members: () => <Users size={15} />,
  support: () => <LifeBuoy size={15} />,
  audit: () => <History size={15} />,
  skills: () => <Sparkles size={15} />,
  mcp: () => <Server size={15} />,
  agents: () => <Bot size={15} />,
  rules: () => <ShieldCheck size={15} />,
  workspaces: () => <Building2 size={15} />,
  plan: () => <CreditCard size={15} />,
  identity: () => <KeyRound size={15} />,
};

const sectionName = (section: Section) =>
  ({
    general: t("web.admin.general"),
    harness: t("web.admin.harness"),
    usage: t("web.admin.usage"),
    members: t("web.admin.members"),
    support: t("web.admin.support"),
    audit: t("audit.title"),
    skills: t("web.admin.skills"),
    mcp: t("web.admin.mcp"),
    agents: t("web.admin.agents"),
    rules: t("web.admin.rules"),
    workspaces: t("web.admin.org_workspaces"),
    plan: t("web.admin.plan"),
    identity: t("web.admin.identity"),
  })[section];

const groupName = (group: GroupName) =>
  ({
    people: t("web.admin.group_people"),
    control: t("web.admin.group_control"),
    organization: t("web.admin.group_organization"),
    summary: t("web.admin.group_summary"),
  })[group];

const roleName = (role: string) =>
  role === "owner" ? t("web.admin.role_owner") : role === "admin" ? t("web.admin.role_admin") : role === "member" ? t("web.admin.role_member") : role;

/** Acceso de soporte de un solo workspace: el selector de arriba ya lo eligió. */
const scoped = (source: SupportAccessSource, workspace: Membership): SupportAccessSource => ({
  ...source,
  workspaces: async () => [{ id: workspace.id, name: workspace.name }],
});

export function AdminPage(props: { source: AdminSource }) {
  const [data] = createResource(async () => {
    const [rows, active] = await Promise.all([props.source.memberships(), props.source.active().catch(() => null)]);
    const account = props.source.workspace === null
      ? rows.find((m) => m.id === active)
      : await resolveWorkspaceAccount(props.source.workspace, props.source.accounts);
    return { rows, active, current: rows.find((m) => m.id === account?.id) ?? null };
  });
  const current = () => data()?.current ?? null;
  const available = createMemo(() => {
    const s = props.source;
    return new Set<Section>([
      "general", "support", "audit",
      ...(s.harness ? (["harness"] as const) : []),
      ...(s.usage ? (["usage"] as const) : []),
      ...(s.members ? (["members"] as const) : []),
      ...(s.shared ? (["skills", "mcp", "agents"] as const) : []),
      ...(s.rules && s.policy ? (["rules"] as const) : []),
      // Sin organización conocida (BFF sin el dato, o workspace personal) no hay lista que pedir.
      // Decide el id, no el nombre: una organización sin nombre sigue existiendo.
      ...(s.organization?.workspaces && current()?.organizationId ? (["workspaces"] as const) : []),
      ...(s.organization?.plan ? (["plan"] as const) : []),
      ...(s.organization?.identity?.length ? (["identity"] as const) : []),
    ]);
  });
  const manager = () => isManager(current()?.role ?? "");
  const kind = () => (current() ? accountKind(current()!) : "personal");
  const visible = () => (current() ? visibleSections(kind(), manager(), available()) : []);
  /** Un miembro lee una lista corta, sin títulos de grupo. */
  const grouped = manager;
  const menu = () => {
    const groups = menuFor(visible());
    return grouped() ? groups : [{ group: groups[0]?.group ?? "summary", sections: groups.flatMap((entry) => entry.sections) }];
  };
  const [chosen, setChosen] = createSignal<Section | null>(props.source.section ?? null);
  const section = () => {
    const wanted = chosen();
    return wanted && visible().includes(wanted) ? wanted : visible()[0];
  };
  const back = (
    <Button as="a" variant="ghost" size="sm" href={props.source.home} class="justify-self-start" data-admin-back="">
      <ArrowLeft size={15} />
      {t("web.admin.back")}
    </Button>
  );

  return (
    <main class="flex h-dvh min-h-0 flex-col bg-bg text-neutral-950 md:flex-row" data-admin-page="">
      <Switch>
        <Match when={data.loading}>
          <p role="status" class="m-auto text-sm text-neutral-500">{t("web.admin.loading")}</p>
        </Match>
        <Match when={data.error}>
          <div class="m-auto grid max-w-md gap-3 p-6">
            <p role="alert" class="m-0 text-sm text-error-strong">{t("web.admin.failed")}</p>
            {back}
          </div>
        </Match>
        <Match when={current() && kind() === "personal"}>
          <div class="m-auto grid max-w-md gap-3 p-6" data-admin-personal="">
            <h1 class="m-0 text-lg font-semibold">{t("web.admin.title")}</h1>
            <p role="status" class="m-0 text-sm text-neutral-500">{t("web.admin.personal")}</p>
            <div class="flex flex-wrap gap-2">
              <Button as="a" size="sm" href={props.source.settings}>{t("web.admin.personal_open")}</Button>
              {back}
            </div>
          </div>
        </Match>
        <Match when={!current() || visible().length === 0}>
          <div class="m-auto grid max-w-md gap-3 p-6" data-admin-denied="">
            <h1 class="m-0 text-lg font-semibold">{t("web.admin.title")}</h1>
            <p role="status" class="m-0 text-sm text-neutral-500">{current() ? t("web.admin.denied_workspace") : t("web.service.unresolved")}</p>
            {back}
          </div>
        </Match>
        <Match when={current()}>
          {(w) => (
            <>
              <nav aria-label={t("web.admin.title")} class="flex shrink-0 flex-col gap-1 bg-rail px-2 py-3 md:w-[17rem]">
                <p class="m-0 px-3 pb-2 font-display text-lead font-semibold" data-admin-name="">{t("web.admin.title")}</p>
                <div class="mx-1 mb-3 grid gap-1.5 rounded-lg border border-border bg-surface p-2" data-admin-scope="">
                  <div class="flex min-w-0 items-center gap-2">
                    <span class="grid size-7 shrink-0 place-items-center rounded-md bg-neutral-950 text-xs font-bold text-bg">
                      {(w().name || "?").slice(0, 1).toUpperCase()}
                    </span>
                    <div class="min-w-0 leading-tight">
                      <p class="m-0 truncate text-ui font-semibold">{w().name || t("settings.support_access.unnamed", { id: w().id })}</p>
                      <p class="m-0 truncate text-xs text-neutral-500">
                        {[w().organization, w().plan, roleName(w().role)].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                  </div>
                </div>
                <Select class="md:hidden" aria-label={t("web.admin.title")} value={section()} onChange={(event) => setChosen(event.currentTarget.value as Section)}>
                  <For each={menu()}>{(group) => (
                    <optgroup label={groupName(group.group)}>
                      <For each={group.sections}>{(entry) => <option value={entry}>{sectionName(entry)}</option>}</For>
                    </optgroup>
                  )}</For>
                </Select>
                <div class="hidden min-h-0 overflow-y-auto md:contents">
                <For each={menu()}>
                  {(g) => (
                    <div class="grid gap-1 pb-3" data-admin-group={g.group}>
                      <Show when={grouped() && menu().length > 1}><p class="m-0 px-3 pb-1 text-xs text-neutral-500">{groupName(g.group)}</p></Show>
                      <SidebarMenu class="gap-0.5">
                        <For each={g.sections}>
                          {(s) => (
                            <SidebarMenuItem>
                              <SidebarMenuButton
                                isActive={section() === s}
                                selectionMark={false}
                                aria-current={section() === s ? "page" : undefined}
                                data-admin-section={s}
                                class="h-9 min-h-9 grid-cols-[18px_minmax(0,1fr)] gap-2.5 rounded-md border-0 py-0 pl-3 pr-2 data-[active=true]:bg-surface data-[active=true]:font-semibold"
                                onClick={() => setChosen(s)}
                              >
                                <span class="flex size-4 items-center justify-center">{ICONS[s]()}</span>
                                <span class="truncate">{sectionName(s)}</span>
                              </SidebarMenuButton>
                            </SidebarMenuItem>
                          )}
                        </For>
                      </SidebarMenu>
                    </div>
                  )}
                </For>
                </div>
                <div class="mt-auto border-0 border-t border-solid border-border px-1 pt-2">{back}</div>
              </nav>
              <section class="min-h-0 min-w-0 flex-1 overflow-auto bg-surface px-6 pb-10 pt-6 md:px-8">
                <div class="mx-auto max-w-3xl">
                  <Body section={section()} workspace={w()} source={props.source} active={data()!.active} manager={manager()} kind={kind()} onOpen={setChosen} />
                </div>
              </section>
            </>
          )}
        </Match>
      </Switch>
    </main>
  );
}

function General(props: { workspace: Membership; source: AdminSource; onOpen: (section: Section) => void }) {
  const name = () => props.workspace.name || t("settings.support_access.unnamed", { id: props.workspace.id });
  return (
    <SettingsSection title={t("web.admin.general")} data-admin-general="">
      <SettingsRow label={t("web.admin.name")} description={name()} />
      <Show when={props.workspace.organization}>{(organization) => <SettingsRow label={t("web.admin.organization")} description={organization()} />}</Show>
      <Show when={props.workspace.plan}>{(plan) => <SettingsRow label={t("web.admin.plan_name")} description={plan()} />}</Show>
      <SettingsRow label={t("web.admin.role")} description={roleName(props.workspace.role)} />
      <Show when={props.source.usage}>
        <SettingsRow label={t("web.admin.usage")} description={t("web.admin.usage_summary")}>
          <Button size="sm" variant="secondary" onClick={() => props.onOpen("usage")}>{t("web.admin.open")}</Button>
        </SettingsRow>
      </Show>
      <Show when={!props.source.usage && !props.source.harness}>
        <SettingsRow label={t("web.admin.usage")} description={t("web.admin.usage_desktop_only")} />
      </Show>
      <SettingsRow label={t("web.admin.conversations_plan")} description={t("web.admin.conversations_plan_hint")}>
        <Button as="a" size="sm" variant="secondary" href={AGENTS_URL} target="_blank" rel="noopener noreferrer">
          {t("web.admin.open")}
          <ExternalLink size={13} />
        </Button>
      </SettingsRow>
    </SettingsSection>
  );
}

function Body(props: { section: Section | undefined; workspace: Membership; source: AdminSource; active: number | null; manager: boolean; kind: AccountKind; onOpen: (section: Section) => void }) {
  const policy = () => props.source.policy;
  /** La cuenta elegida en `/admin` manda: la ruta la revalida contra la membresía. */
  const harnessSource = () => {
    const base = props.source.harness;
    if (!base) return undefined;
    const scoped: HarnessOrgSource = {
      get: (path, query = "") => base.get(path, `${query}${query ? "&" : ""}account_id=${props.workspace.id}`),
    };
    return scoped;
  };
  return (
    <SettingsPanel>
      <Switch>
        <Match when={props.section === "general"}>
          <General workspace={props.workspace} source={props.source} onOpen={props.onOpen} />
        </Match>
        <Match when={props.section === "usage" && props.source.usage}>
          {(usage) => <Usage source={usage()} own={!props.manager} />}
        </Match>
        <Match when={props.section === "harness" && harnessSource()}>
          {(harness) => <Suspense fallback={null}><HarnessInsights source={harness()} /></Suspense>}
        </Match>
        <Match when={props.section === "members" && props.source.members}>{(members) => <Members source={members()} />}</Match>
        <Match when={props.section === "skills" && props.source.shared}>{(s) => <SharedSkills source={s()} policy={policy()} canPropose={props.manager} />}</Match>
        <Match when={props.section === "mcp" && props.source.shared}>{(s) => <SharedMcp source={s()} policy={policy()} canPropose={props.manager} />}</Match>
        <Match when={props.section === "agents" && props.source.shared}>{(s) => <SharedAgents source={s()} policy={policy()} canPropose={props.manager} />}</Match>
        <Match when={props.section === "rules" && props.source.rules && policy()}>
          <Rules source={props.source.rules!} policy={policy()!} organization={props.kind === "enterprise"} canPropose={props.manager} />
        </Match>
        <Match when={props.section === "support"}>
          <Suspense fallback={null}>
            <SupportAccess source={scoped(props.source.support, props.workspace)} />
          </Suspense>
        </Match>
        <Match when={props.section === "audit"}>
          <Show
            when={props.source.auditLog && props.active === props.workspace.id ? props.source.auditLog : undefined}
            fallback={<SettingsSection title={t("audit.title")} description={props.source.auditLog ? t("web.admin.audit_other") : t("audit.unavailable")} />}
          >
            {(source) => (
              <Suspense fallback={null}>
                <AuditLog source={source()} />
              </Suspense>
            )}
          </Show>
        </Match>
        <Match when={props.section === "workspaces" && props.source.organization?.workspaces}>
          {(rows) => <OrganizationWorkspaces source={rows()} account={props.workspace.id} organization={props.workspace.organization} />}
        </Match>
        <Match when={props.section === "plan" && props.source.organization?.plan}>{(plan) => <Plan source={plan()} />}</Match>
        <Match when={props.section === "identity" && props.source.organization?.identity}>{(rows) => <Identity rows={rows()} />}</Match>
      </Switch>
    </SettingsPanel>
  );
}
