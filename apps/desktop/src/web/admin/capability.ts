import { createSupportAccess, isManager } from "../../../../../packages/attention/src/support-access.ts";
import type { InboxSession } from "../../../../../packages/attention/src/inbox.ts";
import { accountKind } from "./sections";

const api = (session: InboxSession) => createSupportAccess(session, fetch, `${import.meta.env.BASE_URL}alpha-api`);

/** El enlace al Harness en Configuración. Un miembro entra en solo lectura, pero sus secciones aún no tienen fuente real: sin ellas no se le ofrece. */
export function adminPageCapability(session: InboxSession, href = `${import.meta.env.BASE_URL}admin`) {
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
