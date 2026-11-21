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

export interface WorkspaceSelectionState {
  activeWorkspaceId: string | null;
  activeOrganizationId: string | null;
}

function cleanPlanText(text: string): string {
  const cleaned = text
    .replace(/\b(organización|organizacion|organization|org)\b/gi, "")
    .trim();
  if (!cleaned) return "Personal";
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

/**
 * Devuelve el nombre del plan para la visualización (B-008, P11).
 * La interfaz habla siempre de planes («Personal», «Team», «Enterprise»)
 * y nunca expone la palabra «organización» de cara a la persona.
 */
export function getPlanLabel(org?: PlatformOrganizationRef | null): string {
  if (!org) return "Personal";
  const type = org.type?.toLowerCase();
  if (type === "enterprise") return "Enterprise";
  if (type === "team" || type === "teams") return "Team";
  if (type === "personal" || type === "free") return "Personal";

  const rawPlan = org.plan;
  if (typeof rawPlan === "string" && rawPlan.trim()) {
    const p = rawPlan.toLowerCase().trim();
    if (p === "enterprise") return "Enterprise";
    if (p === "team" || p === "teams") return "Team";
    if (p === "personal" || p === "free") return "Personal";
    return cleanPlanText(rawPlan);
  }

  if (typeof org.name === "string" && org.name.trim()) {
    return cleanPlanText(org.name);
  }
  return "Personal";
}
