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

function sanitizePlan(raw: string): string {
  const stripped = raw.replace(/\b(organización|organizacion|organization|org)\b/gi, "").trim();
  return stripped ? stripped.charAt(0).toUpperCase() + stripped.slice(1) : "Personal";
}

/**
 * Devuelve el nombre del plan para la visualización.
 * La interfaz muestra el nombre del plan («Personal», «Team», «Enterprise»)
 * y nunca la palabra genérica «Organización» (B-008, P11).
 */
export function getPlanLabel(org?: PlatformOrganizationRef | null): string {
  if (!org) return "Personal";
  const tier = ((org as { plan?: string; type?: string }).plan ?? org.type ?? "").toLowerCase();
  if (tier === "enterprise") return "Enterprise";
  if (tier === "team" || tier === "teams") return "Team";
  if (tier === "personal" || tier === "free") return "Personal";
  if (org.name) return sanitizePlan(org.name);
  return "Personal";
}
