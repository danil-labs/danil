import type { Machine, machinesClient } from "@terminus/computers";
import type { Fleet } from "@terminus/fleet";
import type { GroupAccount } from "../lib/group-account.ts";
import type { WebSessionCommands, WebSessionStatus } from "./web-session-contexts.ts";

type Client = ReturnType<typeof machinesClient>;
type Answer = Awaited<ReturnType<Client["list"]>>;
/** Las lecturas que el motor responde por workspace (tareas, proyectos, cuentas, modelos). */
const OF_THE_WORKSPACE = new Set(["list_live_sessions", "list_projects", "list_portfolios", "list_spaces", "list_accounts", "account_status", "list_models", "list_providers", "list_surfaces", "list_agents"]);
export type ContextRow = { machine: Machine; group: GroupAccount };

/**
 * Todas las organizaciones del conjunto a la vez (plan web varias sesiones § 2.1): cada una con su
 * cliente de máquinas, su `X-Danil-Session` y su eco. La organización de la ventana es la del
 * workspace abierto (`active`), nunca un contexto por omisión del servidor.
 */
export function windowContext(options: { factory: (context: string) => Client; sessions: Pick<WebSessionCommands, "handle">; groups: () => readonly GroupAccount[]; fallback: () => string | null; active: () => string | null; fleet: () => Fleet; revision: () => unknown; onContextsSettled?: (contexts: readonly string[]) => void; onContextState?: (context: string, expired: boolean) => void }) {
  const clients = new Map<string, Client>();
  /** Los workspaces del motor que viven en la máquina de su organización, según `GET /v1/workspaces` de cada contexto. */
  let hostedWorkspaces = new Set<string>();
  const groups = options.groups;
  const info = (context: string) => groups().find((g) => g.context === context) ?? null;
  function client(context?: string | null): Client {
    if (!context) throw new Error("session_selection_required");
    let found = clients.get(context);
    if (!found) { found = options.factory(context); clients.set(context, found); }
    return found;
  }
  return {
    client, info, groups,
    organizationMachine: (workspace: string) => hostedWorkspaces.has(workspace),
    /**
     * Lo que el router sabe de un contexto. En la web no hay «esta computadora»: una organización
     * Free la sirven sus máquinas conectadas, como cualquier otra (no `localOnly`).
     */
    routing: (context: string) => { const group = info(context); return group ? { ...group, plan: group.plan === "free" ? null : group.plan } : null; },
    /**
     * En la web, una máquina inscrita en la organización del contexto la sirve, aunque sea la Mac de la
     * persona (`kind: personal`, conectada a esa organización): el router por contexto solo usa máquinas
     * `organization` de su organización, y sin esto la personal Free se queda sin máquina («local»).
     */
    fleetKind: (machine: Machine, group: GroupAccount) => (machine.organization_id === group.org ? "organization" as const : "personal" as const),
    /** La misma computadora inscrita en dos organizaciones se distingue por su organización. */
    machineName: (machine: Machine, group: GroupAccount, rows: readonly ContextRow[]) => {
      const name = machine.name || machine.machine_id;
      return rows.some((row) => row.group.context !== group.context && (row.machine.name || row.machine.machine_id) === name) ? `${name} · ${group.name}` : name;
    },
    current: () => { options.revision(); const active = options.active(); return active ? info(active) : null; },
    /** Cada orden va al contexto del workspace abierto; la atención del riel, a todos. */
    /**
     * Cada orden va al contexto del workspace abierto; la atención del riel, a todos. Por el relay, el motor
     * exige el workspace de cada lectura del workspace: si aún no hay uno abierto (el arranque), esas órdenes
     * esperan a que el riel abra uno, hasta 10 s, en vez de salir sin workspace.
     */
    engine<T extends { handle: (command: string, args?: Record<string, unknown>, options?: { headers?: HeadersInit }) => Promise<unknown>; activeWorkspace?: () => string | null }>(engine: T) {
      return { handle: async (command: string, args?: Record<string, unknown>, init?: { headers?: HeadersInit }) => {
        const headers = new Headers(init?.headers);
        if (OF_THE_WORKSPACE.has(command) && !headers.has("x-terminus-workspace"))
          for (let waited = 0; !engine.activeWorkspace?.() && waited < 10_000; waited += 100) await new Promise((resolve) => setTimeout(resolve, 100));
        if (command !== "list_workspace_attention" && !headers.has("x-danil-context")) headers.set("x-danil-context", options.active() ?? options.fallback() ?? "");
        return engine.handle(command, args, { ...init, headers });
      } };
    },
    /** Las máquinas de cada organización con su propio contexto; una que falla no borra las demás. */
    async inventory(): Promise<{ answer: Answer; rows: ContextRow[] } | null> {
      const status = await options.sessions.handle("danil_session_status").catch(() => null) as WebSessionStatus | null;
      if (!status || status.state !== "connected") return null;
      const settled = groups();
      const ids = settled.map((g) => g.context);
      for (const id of [...clients.keys()]) if (!ids.includes(id)) clients.delete(id);
      options.fleet().pruneContexts(ids);
      options.onContextsSettled?.(ids);
      const [answers] = await Promise.all([
        Promise.all(settled.map(async (group) => ({ group, answer: await client(group.context).list().catch(() => ({ kind: "unavailable", status: 0 }) as Answer) }))),
        Promise.all(settled.map((group) => options.sessions.handle("danil_edge_fetch", { method: "GET", path: "/v1/workspaces", context: group.context }).catch(() => null))).then((replies) => {
          const next = new Set<string>();
          for (const reply of replies as ({ status: number; body?: { items?: { engine_workspace_id?: unknown; placement?: { kind?: unknown } }[] } } | null)[])
            for (const row of reply?.status === 200 ? reply.body?.items ?? [] : []) if (row.placement?.kind === "organization_machine" && typeof row.engine_workspace_id === "string") next.add(row.engine_workspace_id);
          hostedWorkspaces = next;
        }),
      ]);
      // Un 401 de un contexto marca solo su grupo; uno que vuelve a contestar se desmarca.
      for (const { group, answer } of answers) if (answer.kind === "ok" || answer.kind === "unauthorized") options.onContextState?.(group.context, answer.kind === "unauthorized");
      const ok = answers.filter((a) => a.answer.kind === "ok");
      if (!ok.length && answers.length) return { answer: answers[0].answer, rows: [] };
      const rows = ok.flatMap(({ group, answer }) => (answer.kind === "ok" ? answer.value : []).filter((row) => row.organization_id === group.org).map((machine) => ({ machine, group })));
      return { answer: { kind: "ok", value: rows.map((r) => r.machine) } as Answer, rows };
    },
  };
}
