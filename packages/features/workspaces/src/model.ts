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

/**
 * Devuelve el nombre del plan para la visualización (B-008).
 * La interfaz muestra el nombre del plan («Personal», «Team», «Enterprise»)
 * y nunca la palabra de agrupación de cuenta.
 */
export function getPlanLabel(org?: PlatformOrganizationRef | null): string {
  if (!org) return "Personal";
  if (org.plan && typeof org.plan === "string") return org.plan;
  if (org.type === "enterprise") return "Enterprise";
  if (org.type === "team") return "Team";
  if (org.type === "personal") return "Personal";
  if (org.name && typeof org.name === "string") return org.name;
  return "Personal";
}
