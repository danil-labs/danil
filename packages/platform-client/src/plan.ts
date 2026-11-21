import type { OrganizationRef } from "./generated/types.ts";

/**
 * El nombre de plan que ve la persona (Personal, Team, Enterprise). Única regla
 * del front (RV1 #26, RV2 #24): nunca cae al nombre de la organización ni muestra
 * la palabra «Organización» (P11).
 */
export function planLabel(org?: Pick<OrganizationRef, "type" | "plan"> | string | null): string {
  const raw = typeof org === "string" ? org : (org?.plan ?? org?.type ?? "");
  const p = String(raw ?? "").trim().toLowerCase();
  if (p === "enterprise") return "Enterprise";
  if (p === "team" || p === "teams") return "Team";
  return "Personal";
}
