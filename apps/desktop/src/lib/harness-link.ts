import { canRedeemPromo } from "./promo-role.ts";

/**
 * El portal de administración (Danil Harness) de cada web. Solo beta tiene uno
 * hoy; en otra web, o en la ventana, no se ofrece el enlace.
 */
const HARNESS_BY_WEB: Record<string, string> = {
  "beta.danil.ai": "https://harness.danil.ai",
};

/**
 * «Administrar organización»: solo owner y admin, y no en la cuenta personal
 * (Harness no la admite todavía, decisión M1 de identity). El enlace entra por
 * el login de Harness con la organización, así WorkOS no vuelve a pedir correo.
 */
export function harnessAdminUrl(host: string, group: { org: string; role?: string | null; plan: string | null }): string | null {
  const base = HARNESS_BY_WEB[host];
  if (!base || !canRedeemPromo(group.role) || group.plan === "free") return null;
  return `${base}/auth/identity/login?${new URLSearchParams({ organization: group.org })}`;
}
