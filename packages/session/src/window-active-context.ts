import { EdgeError, type EdgeTransport } from "../../platform-client/src/edge.ts";
import type { OrganizationSelection } from "../../platform-client/src/organizations.ts";
import type { GroupAccount } from "./group-account.ts";
import { activeWorkspaceContext } from "./workspace-context.ts";
import type { WebSessionCommands, WebSessionStatus } from "./web-session-contexts.ts";

/**
 * La organización de la ventana es la del workspace abierto (`activeWorkspaceContext`), no un
 * estado del servidor. Antes de abrir uno, la personal del primer correo. Así `me`, créditos,
 * billing y credenciales llevan siempre su `X-Danil-Session` (plan web varias sesiones W3).
 */
export function windowActiveContext(sessions: Pick<WebSessionCommands, "last">) {
  const groups = (status: WebSessionStatus | null = sessions.last()): (GroupAccount & { personal: boolean; sub: string; email: string | null })[] =>
    status?.sessions.flatMap((f) => f.contexts.map((c) => ({ context: c.context_id, org: c.org, name: c.org_name ?? c.org, plan: c.plan, role: c.role ?? undefined, personal: c.personal === true, sub: f.sub, email: f.email }))) ?? [];
  type Group = ReturnType<typeof groups>[number];
  const current = (): Group | null => {
    const all = groups();
    const open = activeWorkspaceContext();
    return all.find((g) => g.context === open) ?? all.find((g) => g.personal) ?? all[0] ?? null;
  };
  /**
   * El transporte de la ventana: toda llamada sin contexto propio lleva el del workspace abierto (o el
   * de `pick`), y una respuesta correcta solo vale con el eco de ese contexto y su organización.
   */
  const scoped = (transport: EdgeTransport, pick: () => Group | null = current): EdgeTransport => {
    const send = async (method: keyof EdgeTransport, path: string, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      const own = headers.get("X-Danil-Session");
      const group = own ? groups().find((g) => g.context === own) ?? null : pick();
      // Ninguna llamada de la ventana cae en el contexto por omisión: sin grupo, no sale.
      if (!group) throw new EdgeError(428, null, own ? "session_not_in_set" : "session_selection_required"); // nunca 401: no es la cookie muerta
      headers.set("X-Danil-Session", group.context);
      const response = await transport[method](path, { ...init, headers });
      if (response.ok && (response.headers.get("X-Danil-Session-Applied") !== group.context || response.headers.get("X-Danil-Session-Applied-Org") !== group.org)) {
        await response.body?.cancel();
        throw new EdgeError(502, null, "session_echo_mismatch");
      }
      return response;
    };
    return { call: (path, init) => send("call", path, init), mutation: (path, init) => send("mutation", path, init) };
  };
  /** El contexto vigente de una organización del primer correo que la tenga (billing es de su organización, no del workspace abierto). */
  const of = (org: string | null | undefined, sub?: string) => () => groups().find((g) => g.org === org && (!sub || g.sub === sub)) ?? null;
  /** Lo que aún pide un selector de organización (billing al volver del pago) sin escribir nada global. */
  const organizations = (refresh: () => Promise<unknown>): OrganizationSelection => {
    // La vuelta del pago «elige» la organización pagada solo en este cliente: relee el conjunto, donde aparece si es nueva.
    let chosen: string | null = null;
    const state = () => ({ kind: "ready" as const, items: groups().map((g) => ({ id: g.org, name: g.name, plan: g.plan ?? "", role: g.role ?? "" })), active: chosen ?? current()?.org ?? null });
    const choose = async (id: string) => { await refresh(); if (groups().some((g) => g.org === id)) chosen = id; };
    return { state, load: async () => {}, choose, subscribe: () => () => {}, needed: () => false, report: () => false, dismiss: () => {}, stop: () => {} } as unknown as OrganizationSelection;
  };
  /** Billing de una organización con el contexto de esa organización (la vuelta del pago puede ser de otra). */
  const billingFor = (transport: EdgeTransport, sub?: string) => (org: string) => scoped(transport, () => of(org, sub)() ?? of(org)());
  /** El Free router de un workspace del motor: su account de plataforma en el contexto del workspace abierto. */
  const freeRouterIdentity = (accountOf: (context: string, engine: string) => string | null) => async (workspace?: string) => {
    const group = current();
    const account = group && workspace ? accountOf(group.context, workspace) : null;
    return group && account ? { sub: group.sub, list: { active_workspace_id: account, items: [{ id: account, org: group.org }] } } : null;
  };
  return { groups, current, scoped, of, billingFor, freeRouterIdentity, organizations };
}
