import type { EdgeTransport, OrganizationSelection } from "@terminus/computers";
import type { GroupAccount } from "../lib/group-account.ts";
import { activeWorkspaceContext } from "../lib/workspace-context.ts";
import type { WebSessionCommands, WebSessionStatus } from "./web-session-contexts.ts";

/**
 * La organización de la ventana es la del workspace abierto (`activeWorkspaceContext`), no un
 * estado del servidor. Antes de abrir uno, la personal del primer correo. Así `me`, créditos,
 * billing y credenciales llevan siempre su `X-Danil-Session` (plan web varias sesiones W3).
 */
export function windowActiveContext(sessions: Pick<WebSessionCommands, "last">) {
  const groups = (status: WebSessionStatus | null = sessions.last()): (GroupAccount & { personal: boolean; sub: string; email: string | null })[] =>
    status?.sessions.flatMap((f) => f.contexts.map((c) => ({ context: c.context_id, org: c.org, name: c.org_name ?? c.org, plan: c.plan, role: c.role ?? undefined, personal: c.personal === true, sub: f.sub, email: f.email }))) ?? [];
  const current = () => {
    const all = groups();
    const open = activeWorkspaceContext();
    return all.find((g) => g.context === open) ?? all.find((g) => g.personal) ?? all[0] ?? null;
  };
  /** El transporte de la ventana: toda llamada sin contexto propio lleva el del workspace abierto. */
  const scoped = (transport: EdgeTransport): EdgeTransport => {
    const withContext = (init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      const context = current()?.context;
      if (context && !headers.has("X-Danil-Session")) headers.set("X-Danil-Session", context);
      return { ...init, headers };
    };
    return { call: (path, init) => transport.call(path, withContext(init)), mutation: (path, init) => transport.mutation(path, withContext(init)) };
  };
  /** Lo que aún pide un selector de organización (billing al volver del pago) sin escribir nada global. */
  const organizations = (): OrganizationSelection => {
    const state = () => ({ kind: "ready" as const, items: groups().map((g) => ({ id: g.org, name: g.name, plan: g.plan ?? "", role: g.role ?? "" })), active: current()?.org ?? null });
    return { state, load: async () => {}, choose: async () => {}, subscribe: () => () => {}, needed: () => false, report: () => false, dismiss: () => {}, stop: () => {} } as unknown as OrganizationSelection;
  };
  return { groups, current, scoped, organizations };
}
