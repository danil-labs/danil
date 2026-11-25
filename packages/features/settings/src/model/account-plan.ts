import type { GrupoDelRiel } from "./sessions-port.ts";
export { billingHref } from "../../../../platform-client/src/billing-route.ts";

export type AccountPlanGroup = Pick<
  GrupoDelRiel,
  "context_id" | "org" | "org_name" | "plan" | "role" | "email" | "family" | "added" | "available"
>;

export type AccountOrganization = {
  id: string;
  name?: string | null;
  plan?: string | null;
  role?: string | null;
};

export type AccountPlanTarget = {
  org: string;
  orgName: string | null;
  plan: string | null;
  role: string | null;
};

const ADMIN_ROLES = new Set(["owner", "admin"]);

const PLAN_LABEL_KEYS: Record<string, string> = {
  free: "settings.account.plan_free",
  pro: "settings.account.plan_pro",
  team: "settings.account.plan_team",
  business: "settings.account.plan_business",
  enterprise: "settings.account.plan_enterprise",
};

/** Solo `owner` y `admin` pueden ver y administrar el plan de la organización. */
export function isPlanAdminRole(role: string | null | undefined): boolean {
  if (!role) return false;
  return ADMIN_ROLES.has(role.trim().toLowerCase());
}

/**
 * Resuelve el grupo de sesión correspondiente al workspace/contexto elegido en
 * Configuración. Cuando hay varias organizaciones y ninguna coincide, devuelve
 * `null` para no mostrar datos de otra organización por error.
 */
export function resolveAccountGroup(
  groups: readonly AccountPlanGroup[] | null | undefined,
  selection: { workspace: string | null; context?: string | null },
): AccountPlanGroup | null {
  if (!groups || groups.length === 0) return null;
  if (selection.context) {
    const byContext = groups.find((group) => group.context_id === selection.context);
    if (byContext) return byContext;
  }
  if (selection.workspace) {
    const byWorkspace = groups.find(
      (group) =>
        group.added?.has(selection.workspace!) ||
        group.available?.some((row) => row.id === selection.workspace),
    );
    if (byWorkspace) return byWorkspace;
  }
  return groups.length === 1 ? groups[0] : null;
}

/**
 * Resuelve organización, plan y rol para el workspace/contexto activo,
 * combinando el riel de sesiones (Desk y Web) con los respaldos de
 * `groupAccount` (Web) y `organizations` (Desk/Web).
 */
export function resolveAccountPlan(input: {
  workspace: string | null;
  context?: string | null;
  groups?: readonly AccountPlanGroup[] | null;
  webGroup?: {
    context?: string;
    org: string;
    name?: string | null;
    plan?: string | null;
    role?: string | null;
  } | null;
  organizations?: readonly AccountOrganization[] | null;
  activeOrganizationId?: string | null;
}): AccountPlanTarget | null {
  const findOrg = (orgId: string) => input.organizations?.find((item) => item.id === orgId) ?? null;

  const group = resolveAccountGroup(input.groups, {
    workspace: input.workspace,
    context: input.context ?? null,
  });
  if (group) {
    const orgInfo = findOrg(group.org);
    return {
      org: group.org,
      orgName: group.org_name ?? orgInfo?.name ?? null,
      plan: group.plan ?? orgInfo?.plan ?? null,
      role: group.role ?? orgInfo?.role ?? null,
    };
  }

  if (input.webGroup && (!input.context || !input.webGroup.context || input.webGroup.context === input.context)) {
    const orgInfo = findOrg(input.webGroup.org);
    return {
      org: input.webGroup.org,
      orgName: input.webGroup.name ?? orgInfo?.name ?? null,
      plan: input.webGroup.plan ?? orgInfo?.plan ?? null,
      role: input.webGroup.role ?? orgInfo?.role ?? null,
    };
  }

  if (input.activeOrganizationId && input.organizations?.length) {
    const orgInfo = findOrg(input.activeOrganizationId);
    if (orgInfo) {
      return {
        org: orgInfo.id,
        orgName: orgInfo.name ?? null,
        plan: orgInfo.plan ?? null,
        role: orgInfo.role ?? null,
      };
    }
  }

  return null;
}

/** URL de billing en la web que abre Desk para la organización seleccionada. */
export function deskBillingUrl(org: string, origin = "https://beta.danil.ai"): string {
  const url = new URL("/billing", origin);
  url.search = new URLSearchParams({ org, return: "desk" }).toString();
  return url.href;
}

/** Clave de traducción para el nombre del plan activo, o `null` si es personalizado. */
export function planLabelKey(plan: string | null | undefined): string | null {
  if (!plan) return null;
  const normalized = plan.trim().toLowerCase();
  return Object.hasOwn(PLAN_LABEL_KEYS, normalized) ? PLAN_LABEL_KEYS[normalized] : null;
}
