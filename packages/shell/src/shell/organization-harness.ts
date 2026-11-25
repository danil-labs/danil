export const HARNESS_URL = "https://harness.danil.ai/";

export type HarnessGroup = {
  context_id: string;
  org: string;
  plan?: string | null;
  role?: string | null;
  personal?: boolean;
  org_type?: string | null;
  empty_reason?: string | null;
  added?: ReadonlySet<string> | null;
  available?: readonly { id: string }[] | null;
};

export type HarnessWebGroup = {
  context?: string;
  org: string;
  plan?: string | null;
  role?: string | null;
  personal?: boolean;
};

export type HarnessOrgInfo = {
  id: string;
  plan?: string | null;
  role?: string | null;
  type?: string | null;
};

const ADMIN_ROLES = new Set(["owner", "admin"]);

/** Solo `owner` y `admin` administran la organización en Harness; nunca `member`, `guest` ni desconocido. */
export function isHarnessAdminRole(role: string | null | undefined): boolean {
  if (typeof role !== "string") return false;
  return ADMIN_ROLES.has(role.trim().toLowerCase());
}

/**
 * Verdadero solo para una organización (nunca personal, local ni support).
 * Prioriza marcas explícitas (`personal`, `type`), y sin ellas exige un plan distinto de `free`.
 */
export function isOrganizationScope(info: {
  org?: string | null;
  personal?: boolean | null;
  type?: string | null;
  plan?: string | null;
}): boolean {
  if (!info.org || !info.org.trim()) return false;
  if (info.personal === true) return false;
  const orgType = typeof info.type === "string" ? info.type.trim().toLowerCase() : "";
  if (orgType === "personal") return false;
  if (orgType === "organization" || orgType === "team") return true;
  if (info.personal === false) return true;
  const plan = typeof info.plan === "string" ? info.plan.trim().toLowerCase() : "";
  return Boolean(plan && plan !== "free");
}

function matchRailGroup(
  groups: readonly HarnessGroup[],
  workspace: string,
  context: string | null | undefined,
): HarnessGroup | null {
  if (context) {
    return groups.find((g) => g.context_id === context) ?? null;
  }
  const matches = groups.filter(
    (g) => g.added?.has(workspace) || g.available?.some((w) => w.id === workspace),
  );
  return matches.length === 1 ? matches[0] : null;
}

/**
 * Decide si «Ir a Harness de Organización» debe mostrarse para el workspace abierto.
 * Estricto en Desk y Web: el workspace abierto pertenece a una organización (no personal ni local)
 * y el rol de la persona en esa organización es `owner` o `admin`.
 */
export function canOpenOrganizationHarness(input: {
  workspace: string | null | undefined;
  context?: string | null;
  groups?: readonly HarnessGroup[] | null;
  webGroup?: HarnessWebGroup | null;
  organizations?: readonly HarnessOrgInfo[] | null;
  activeOrganizationId?: string | null;
}): boolean {
  const workspace = input.workspace?.trim() || null;
  if (!workspace) return false;

  const findOrg = (orgId: string) => input.organizations?.find((o) => o.id === orgId) ?? null;

  if (input.groups && input.groups.length > 0) {
    const group = matchRailGroup(input.groups, workspace, input.context);
    if (!group || group.empty_reason === "organization_access_denied") return false;
    const orgInfo = findOrg(group.org);
    const isOrg = isOrganizationScope({
      org: group.org,
      personal: group.personal,
      type: group.org_type ?? orgInfo?.type ?? null,
      plan: group.plan ?? orgInfo?.plan ?? null,
    });
    const role = group.role ?? orgInfo?.role ?? null;
    return isOrg && isHarnessAdminRole(role);
  }

  if (Array.isArray(input.groups)) return false;

  if (input.webGroup && (!input.context || !input.webGroup.context || input.webGroup.context === input.context)) {
    const orgInfo = findOrg(input.webGroup.org);
    const isOrg = isOrganizationScope({
      org: input.webGroup.org,
      personal: input.webGroup.personal,
      type: orgInfo?.type ?? null,
      plan: input.webGroup.plan ?? orgInfo?.plan ?? null,
    });
    const role = input.webGroup.role ?? orgInfo?.role ?? null;
    return isOrg && isHarnessAdminRole(role);
  }

  if (input.activeOrganizationId && input.organizations?.length) {
    const orgInfo = findOrg(input.activeOrganizationId);
    if (!orgInfo) return false;
    return (
      isOrganizationScope({
        org: orgInfo.id,
        type: orgInfo.type ?? null,
        plan: orgInfo.plan ?? null,
      }) && isHarnessAdminRole(orgInfo.role)
    );
  }

  return false;
}
