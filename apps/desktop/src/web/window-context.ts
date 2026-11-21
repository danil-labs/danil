import type { Machine, machinesClient } from "@terminus/computers";
import type { Fleet } from "@terminus/fleet";
import type { GroupAccount } from "../lib/group-account.ts";
import type { WebSessionCommands, WebSessionStatus } from "./web-session-contexts.ts";

type Client = ReturnType<typeof machinesClient>;
type Answer = Awaited<ReturnType<Client["list"]>>;
export type ContextRow = { machine: Machine; group: GroupAccount };

const groupsOf = (status: WebSessionStatus | null): GroupAccount[] =>
  status?.sessions.flatMap((family) => family.contexts.map((c) => ({ context: c.context_id, org: c.org, name: c.org_name ?? c.org, plan: c.plan, role: c.role ?? undefined }))) ?? [];

/**
 * Todas las organizaciones del conjunto a la vez (plan web varias sesiones § 2.1): cada una con su
 * cliente de máquinas, su `X-Danil-Session` y su eco. La organización de la ventana es la del
 * workspace abierto (`active`), nunca un contexto por omisión del servidor.
 */
export function windowContext(options: { factory: (context: string) => Client; sessions: Pick<WebSessionCommands, "handle" | "last">; active: () => string | null; fleet: () => Fleet; revision: () => unknown; onContextsSettled?: (contexts: readonly string[]) => void }) {
  const clients = new Map<string, Client>();
  const groups = () => groupsOf(options.sessions.last());
  const info = (context: string) => groups().find((g) => g.context === context) ?? null;
  function client(context?: string | null): Client {
    if (!context) throw new Error("session_selection_required");
    let found = clients.get(context);
    if (!found) { found = options.factory(context); clients.set(context, found); }
    return found;
  }
  return {
    client, info, groups,
    current: () => { options.revision(); const active = options.active(); return active ? info(active) : null; },
    /** Cada orden va al contexto del workspace abierto; la atención del riel, a todos. */
    engine<T extends { handle: (command: string, args?: Record<string, unknown>, options?: { headers?: HeadersInit }) => Promise<unknown> }>(engine: T) {
      return { handle: (command: string, args?: Record<string, unknown>, init?: { headers?: HeadersInit }) => {
        const headers = new Headers(init?.headers);
        if (command !== "list_workspace_attention" && !headers.has("x-danil-context")) headers.set("x-danil-context", options.active() ?? groups()[0]?.context ?? "");
        return engine.handle(command, args, { ...init, headers });
      } };
    },
    /** Las máquinas de cada organización con su propio contexto; una que falla no borra las demás. */
    async inventory(): Promise<{ answer: Answer; rows: ContextRow[] } | null> {
      const status = await options.sessions.handle("danil_session_status").catch(() => null) as WebSessionStatus | null;
      if (!status || status.state !== "connected") return null;
      const settled = groupsOf(status);
      const ids = settled.map((g) => g.context);
      for (const id of [...clients.keys()]) if (!ids.includes(id)) clients.delete(id);
      options.fleet().pruneContexts(ids);
      options.onContextsSettled?.(ids);
      const answers = await Promise.all(settled.map(async (group) => ({ group, answer: await client(group.context).list().catch(() => ({ kind: "unavailable", status: 0 }) as Answer) })));
      const ok = answers.filter((a) => a.answer.kind === "ok");
      if (!ok.length && answers.length) return { answer: answers[0].answer, rows: [] };
      const rows = ok.flatMap(({ group, answer }) => (answer.kind === "ok" ? answer.value : []).filter((row) => row.kind === "personal" || row.organization_id === group.org).map((machine) => ({ machine, group })));
      return { answer: { kind: "ok", value: rows.map((r) => r.machine) } as Answer, rows };
    },
  };
}
