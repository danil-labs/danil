import type {
  Me as PlatformMe,
  OrganizationRef as PlatformOrganizationRef,
} from "@danil/platform-client";

export type Profile = PlatformMe;
export type Organization = PlatformOrganizationRef;

export interface ProfileData {
  me: Profile;
  activeOrganization: Organization | null;
  planLabel: string;
}

/**
 * Devuelve el nombre del plan para la visualización.
 * La interfaz muestra el nombre del plan («Personal», «Team», «Enterprise»)
 * y nunca la palabra genérica «Organización» (B-008).
 */
export function getPlanLabel(org?: PlatformOrganizationRef | null): string {
  if (!org) return "Personal";
  const typeOrPlan = (org as { plan?: string; type?: string }).plan ?? org.type;
  if (typeOrPlan === "enterprise") return "Enterprise";
  if (typeOrPlan === "team") return "Team";
  if (typeOrPlan === "personal") return "Personal";
  if (typeOrPlan) return typeOrPlan.charAt(0).toUpperCase() + typeOrPlan.slice(1);
  if (org.name) return org.name;
  return "Personal";
}
