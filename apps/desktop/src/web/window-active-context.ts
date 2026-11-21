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
      if (group && !own) headers.set("X-Danil-Session", group.context);
      const response = await transport[method](path, { ...init, headers });
      if (group && response.ok && (response.headers.get("X-Danil-Session-Applied") !== group.context || response.headers.get("X-Danil-Session-Applied-Org") !== group.org)) {
        await response.body?.cancel();
        throw { code: "session_echo_mismatch", status: 502 };
      }
      return response;
    };
    return { call: (path, init) => send("call", path, init), mutation: (path, init) => send("mutation", path, init) };
  };
  /** El contexto vigente de una organización del primer correo que la tenga (billing es de su organización, no del workspace abierto). */
  const of = (org: string | null | undefined) => () => groups().find((g) => g.org === org) ?? null;
  /** Lo que aún pide un selector de organización (billing al volver del pago) sin escribir nada global. */
  const organizations = (): OrganizationSelection => {
    const state = () => ({ kind: "ready" as const, items: groups().map((g) => ({ id: g.org, name: g.name, plan: g.plan ?? "", role: g.role ?? "" })), active: current()?.org ?? null });
    return { state, load: async () => {}, choose: async () => {}, subscribe: () => () => {}, needed: () => false, report: () => false, dismiss: () => {}, stop: () => {} } as unknown as OrganizationSelection;
  };
  return { groups, current, scoped, of, organizations };
}
