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

function cleanPlanText(text: string): string {
  const cleaned = text
    .replace(/\b(organización|organizacion|organization|org)\b/gi, "")
    .trim();
  if (!cleaned) return "Personal";
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

/**
 * Devuelve el nombre del plan para la visualización.
 * La interfaz muestra el nombre del plan («Personal», «Team», «Enterprise»)
 * y nunca la palabra genérica «Organización» (B-008, P11).
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
