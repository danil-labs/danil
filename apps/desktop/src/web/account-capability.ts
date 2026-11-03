import { createSupportAccess, isManager } from "../../../../packages/attention/src/support-access.ts";
import type { InboxSession } from "../../../../packages/attention/src/inbox.ts";
import { HARNESS_URL } from "../lib/harness-url.ts";

const api = (session: InboxSession) => createSupportAccess(session, fetch, `${import.meta.env.BASE_URL}alpha-api`);

export type AccountKind = "personal" | "teams" | "enterprise";

/**
 * Solo un dato explícito hace personal a una cuenta: el plan Personal o `personal` (el BFF dijo que no tiene organización).
 * Si el BFF no manda ninguno, tratarla así dejaría sin Harness a una organización.
 */
export function accountKind(account: { plan: string | null; personal?: boolean }): AccountKind {
  const plan = account.plan?.toLowerCase() ?? "";
  if (plan.includes("enterprise")) return "enterprise";
  if (plan.includes("personal") || account.personal === true) return "personal";
  return "teams";
}

/** El enlace al Harness en Configuración: solo owner y admin de una organización. */
export function adminPageCapability(session: InboxSession, href = HARNESS_URL) {
  return {
    href,
    allowed: async () => (await api(session).memberships()).some((m) => isManager(m.role) && accountKind(m) !== "personal"),
  };
}

/** Una cuenta personal ve lo suyo en Configuración; consumo y plan aún no tienen fuente real. */
export function personalAccountCapability(session: InboxSession) {
  return {
    isPersonal: async () => {
      const rows = await api(session).memberships();
      return rows.length > 0 && rows.every((m) => accountKind(m) === "personal");
    },
  };
}
