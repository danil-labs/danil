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

function cleanPlanName(str: string): string {
  const c = str.replace(/\b(organización|organizacion|organization|org)\b/gi, "").trim();
  return c ? `${c.charAt(0).toUpperCase()}${c.slice(1)}` : "Personal";
}

/**
 * Devuelve el nombre del plan para la visualización (B-008, P11).
 * La interfaz habla siempre de planes («Personal», «Team», «Enterprise»)
 * y nunca expone la palabra «organización» de cara a la persona.
 */
export function getPlanLabel(org?: PlatformOrganizationRef | null): string {
  if (!org) return "Personal";
  const t = (org.type ?? "").toLowerCase();
  if (t === "enterprise") return "Enterprise";
  if (t === "team" || t === "teams") return "Team";
  if (t === "personal" || t === "free") return "Personal";

  const p = typeof org.plan === "string" ? org.plan.trim() : "";
  if (p) {
    const lp = p.toLowerCase();
    if (lp === "enterprise") return "Enterprise";
    if (lp === "team" || lp === "teams") return "Team";
    if (lp === "personal" || lp === "free") return "Personal";
    return cleanPlanName(p);
  }

  return org.name && org.name.trim() ? cleanPlanName(org.name) : "Personal";
}
