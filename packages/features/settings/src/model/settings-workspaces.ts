import type { GrupoDelRiel } from "./sessions-port.ts";
import type { SettingsEntryId } from "./settings-entries.ts";

export type SettingsGovernedSection =
  | "context_sources"
  | "mcp_servers"
  | "skills"
  | "agents"
  | "models";

export type EngineWorkspaceLike = {
  id: string;
  name: string;
  logo?: string | null;
};

export type OtherAccountLike = {
  user_id: string;
  email: string | null;
  signedIn: boolean;
  workspaces: readonly {
    id: string;
    name: string;
    logo: () => Promise<string | null>;
  }[];
};

export type SettingsWorkspaceOption = {
  key: string;
  id: string;
  name: string;
  logo: string | null;
  context: string | null;
  org: string | null;
  orgName: string | null;
  plan: string | null;
  email: string | null;
  isOrg: boolean;
  active: boolean;
  otherAccount?: {
    email: string | null;
    signedIn: boolean;
    loadLogo: () => Promise<string | null>;
  };
};

export type ResolveSettingsWorkspacesInput = {
  activeId: string | null;
  activeContext: string | null;
  engineWorkspaces: readonly EngineWorkspaceLike[];
  groups: readonly GrupoDelRiel[] | null | undefined;
  otherAccounts?: readonly OtherAccountLike[];
};

export type WorkspaceMetadataLabels = {
  personal: string;
  local: string;
  expired: string;
  planFree: string;
  planBusiness: string;
};

export type ScopeBadge = {
  kind: "policy" | "org" | "workspace";
  tone: "info" | "neutral";
  label: string;
};

export type ScopeBadgeLabels = {
  orgPolicy: string;
  organization: string;
  workspace: string;
};

const WORKSPACE_SCOPED_ENTRIES: ReadonlySet<SettingsEntryId> = new Set([
  "general",
  "appearance",
  "ai-accounts",
  "source-control",
  "agents-skills",
  "connections",
]);

/**
 * Resuelve los workspaces disponibles para el selector de Configuración,
 * unificando los grupos de sesión (Desk y Web), los workspaces locales del
 * motor como respaldo y las cuentas adicionales del navegador (Web).
 */
export function resolveSettingsWorkspaces(
  input: ResolveSettingsWorkspacesInput,
): {
  options: SettingsWorkspaceOption[];
  active: SettingsWorkspaceOption | null;
} {
  const { activeId, activeContext, engineWorkspaces, groups, otherAccounts } = input;
  const byId = new Map<string, EngineWorkspaceLike>();
  for (const w of engineWorkspaces) byId.set(w.id, w);

  const options: SettingsWorkspaceOption[] = [];
  const seen = new Set<string>();
  let matchedActive = false;

  if (groups && groups.length > 0) {
    for (const group of groups) {
      const available = group.available ?? [];
      const added = group.added;
      const rows = added
        ? available.filter(
            (w) =>
              added.has(w.id) ||
              (w.id === activeId && (!activeContext || activeContext === group.context_id)),
          )
        : available;
      for (const row of rows) {
        const key = JSON.stringify([group.context_id, row.id]);
        if (seen.has(key)) continue;
        seen.add(key);
        const engine = byId.get(row.id);
        const isActive =
          activeId !== null &&
          row.id === activeId &&
          (activeContext ? group.context_id === activeContext : !matchedActive);
        if (isActive) matchedActive = true;
        options.push({
          key,
          id: row.id,
          name: row.name?.trim() || engine?.name || row.id,
          logo: row.logo ?? engine?.logo ?? null,
          context: group.context_id,
          org: group.org || null,
          orgName: group.org_name ?? null,
          plan: group.plan ?? null,
          email: group.email ?? null,
          isOrg: Boolean(group.org && group.plan !== "free"),
          active: isActive,
        });
      }
    }

    // Si los grupos aún no poblan su catálogo pero el motor ya entregó lista, no dejar el selector vacío.
    if (options.length === 0 && engineWorkspaces.length > 0) {
      for (const w of engineWorkspaces) {
        const key = JSON.stringify([null, w.id]);
        if (seen.has(key)) continue;
        seen.add(key);
        const isActive = activeId !== null && w.id === activeId;
        if (isActive) matchedActive = true;
        options.push({
          key,
          id: w.id,
          name: w.name || w.id,
          logo: w.logo ?? null,
          context: null,
          org: null,
          orgName: null,
          plan: null,
          email: null,
          isOrg: false,
          active: isActive,
        });
      }
    } else if (!matchedActive && activeId !== null) {
      // Si el contexto activo cambió o quedó en un workspace local fuera de grupos, conservarlo visible.
      const existing = options.find((o) => o.id === activeId);
      if (existing) {
        existing.active = true;
        matchedActive = true;
      } else {
        const local = byId.get(activeId);
        if (local) {
          matchedActive = true;
          options.unshift({
            key: JSON.stringify([null, local.id]),
            id: local.id,
            name: local.name || local.id,
            logo: local.logo ?? null,
            context: null,
            org: null,
            orgName: null,
            plan: null,
            email: null,
            isOrg: false,
            active: true,
          });
        }
      }
    }
  } else {
    for (const w of engineWorkspaces) {
      const key = JSON.stringify([null, w.id]);
      if (seen.has(key)) continue;
      seen.add(key);
      const isActive = activeId !== null && w.id === activeId;
      if (isActive) matchedActive = true;
      options.push({
        key,
        id: w.id,
        name: w.name || w.id,
        logo: w.logo ?? null,
        context: null,
        org: null,
        orgName: null,
        plan: null,
        email: null,
        isOrg: false,
        active: isActive,
      });
    }
  }

  for (const account of otherAccounts ?? []) {
    for (const w of account.workspaces) {
      const key = JSON.stringify(["other", account.user_id, w.id]);
      if (seen.has(key)) continue;
      seen.add(key);
      options.push({
        key,
        id: w.id,
        name: w.name || w.id,
        logo: null,
        context: null,
        org: null,
        orgName: null,
        plan: null,
        email: account.email,
        isOrg: false,
        active: false,
        otherAccount: {
          email: account.email,
          signedIn: account.signedIn,
          loadLogo: w.logo,
        },
      });
    }
  }

  const active = options.find((o) => o.active) ?? options[0] ?? null;
  return { options, active };
}

function formatPlan(plan: string | null, labels: WorkspaceMetadataLabels): string | null {
  if (!plan) return null;
  const normalized = plan.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === "free") return labels.planFree;
  if (normalized === "business") return labels.planBusiness;
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

/**
 * Texto secundario discreto del workspace en el selector (organización/plan o personal/local).
 */
export function workspaceMetadataLabel(
  option: Pick<SettingsWorkspaceOption, "isOrg" | "orgName" | "plan" | "email" | "otherAccount">,
  labels: WorkspaceMetadataLabels,
): string {
  if (option.otherAccount) {
    if (!option.otherAccount.signedIn) {
      return [option.email, labels.expired].filter(Boolean).join(" · ") || labels.expired;
    }
    return option.email ?? "";
  }

  const plan = formatPlan(option.plan, labels);
  if (option.isOrg) {
    const parts = [option.orgName, plan].filter((part): part is string => Boolean(part));
    if (parts.length > 0) return parts.join(" · ");
    return option.email ?? labels.local;
  }

  if (option.plan === "free") {
    return [labels.personal, plan].filter(Boolean).join(" · ");
  }

  if (option.orgName) {
    return [option.orgName, plan].filter(Boolean).join(" · ");
  }

  if (plan) return plan;
  if (option.email) return option.email;
  return labels.local;
}

/**
 * Sección gobernada por Radiant correspondiente a la entrada/pestaña actual, si aplica.
 */
export function governedSectionFor(
  entryId: SettingsEntryId,
  tabId: string,
): SettingsGovernedSection | null {
  if (entryId === "general") return "context_sources";
  if (entryId === "ai-accounts") return "models";
  if (entryId === "agents-skills") return tabId === "skills" ? "skills" : "agents";
  if (entryId === "connections" && tabId === "operation") return "mcp_servers";
  return null;
}

/**
 * Badge discreto de alcance para el encabezado de la sección activa de Configuración.
 */
export function settingsScopeBadge(input: {
  entryId: SettingsEntryId;
  workspace: Pick<SettingsWorkspaceOption, "isOrg"> | null;
  governed: boolean;
  labels: ScopeBadgeLabels;
}): ScopeBadge | null {
  const { entryId, workspace, governed, labels } = input;
  if (governed) {
    return { kind: "policy", tone: "info", label: labels.orgPolicy };
  }
  if (workspace && WORKSPACE_SCOPED_ENTRIES.has(entryId)) {
    return { kind: "workspace", tone: "neutral", label: labels.workspace };
  }
  return null;
}
