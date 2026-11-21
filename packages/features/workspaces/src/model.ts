import type {
  OrganizationRef as PlatformOrganizationRef,
  Workspace as PlatformWorkspace,
} from "@danil/platform-client";

export type Workspace = PlatformWorkspace;

export type Organization = PlatformOrganizationRef & {
  planLabel: string;
};

export interface WorkspaceGroup {
  organization: Organization;
  workspaces: Workspace[];
}

/**
 * Devuelve el nombre del plan para la visualización (B-008, P11).
 * La interfaz habla siempre de planes («Personal», «Team», «Enterprise»)
 * y nunca expone la palabra «organización» ni cae al nombre de la organización (P11, RV1 #26, RV2 #24).
 */
export function planLabel(
  org?: { type?: string | null; plan?: string | null } | null | string,
): string {
  if (!org) return "Personal";
  if (typeof org === "string") {
    const p = org.trim().toLowerCase();
    if (p === "enterprise") return "Enterprise";
    if (p === "team" || p === "teams") return "Team";
    return "Personal";
  }

  const type = org.type?.toLowerCase().trim();
  if (type === "enterprise") return "Enterprise";
  if (type === "team" || type === "teams") return "Team";
  if (type === "personal" || type === "free") return "Personal";

  const rawPlan = org.plan;
  if (typeof rawPlan === "string" && rawPlan.trim()) {
    const p = rawPlan.toLowerCase().trim();
    if (p === "enterprise") return "Enterprise";
    if (p === "team" || p === "teams") return "Team";
    if (p === "personal" || p === "free") return "Personal";
  }

  return "Personal";
}

export const getPlanLabel = planLabel;
