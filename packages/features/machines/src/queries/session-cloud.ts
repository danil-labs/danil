import type { Computer } from "../../../../platform-client/src/api.ts";
import { reportOrganizationProblem } from "../../../../session/src/organization-problems.ts";
import { settledContextIds } from "../../../../session/src/settled-contexts.ts";
import { createCloudMachines, EDGE_ENDPOINT } from "./cloud-machines.ts";

type Invoke = (command: string, args?: Record<string, unknown>) => Promise<unknown>;
type Context = { context_id: string; org: string; plan?: string | null };
type Status = { state?: string; sessions?: { contexts: Context[] }[] };
export type ContextComputer = Computer & { context?: string };

/** Cada identidad conserva su endpoint; una máquina de organización solo sirve a su propia organización. `own`: las inscripciones de esta computadora, que ya es la fila local. */
export function mergeContextMachines(groups: { context: Context; computers: Computer[] }[], own: ReadonlySet<string> = new Set()): ContextComputer[] {
  const rows = new Map<string, ContextComputer>();
  for (const { context, computers } of groups) for (const row of computers) {
    if (row.kind === "organization" && row.organization_id !== context.org) continue;
    if (row.kind === "personal" && own.has(row.computer_id)) continue;
    rows.set(contextMachineKey(row.computer_id, context.context_id), { ...row, context: context.context_id });
  }
  return [...rows.values()];
}

export const contextMachineKey = (machine: string, context?: string) => JSON.stringify([machine, context ?? ""]);

/** `here`: las inscripciones que el motor reporta de esta computadora (`connected-status.ts`). */
export function createSessionCloud(rpc: Invoke, onProblem?: (error: unknown) => void, endpoint = EDGE_ENDPOINT, onContextsSettled?: (contexts: readonly string[]) => void, here?: { read: () => Promise<void>; own: () => ReadonlySet<string> }) {
  const legacy = createCloudMachines(rpc, onProblem, endpoint);
  let clients = new Map<string, ReturnType<typeof createCloudMachines>>();
  let current = new Map<string, ContextComputer>();
  let contexts: Map<string, Context> | null = null;
  let validated: readonly string[] | null = null;
  let epoch = 0;
  let unsupported = false;
  const child = (context: string) => {
    let client = clients.get(context);
    if (!client) {
      client = createCloudMachines(async (_command, args) => {
        try { return await rpc("danil_edge_fetch", { ...args, context }); }
        catch (error) {
          if ((error as { detail?: string } | null)?.detail === "session_echo_mismatch") unsupported = true;
          throw error;
        }
      }, (error) => reportOrganizationProblem(context, error), endpoint);
      clients.set(context, client);
    }
    return client;
  };
  const target = (id: string, context?: string) => {
    if (context) {
      if (!contexts?.has(context) || !current.has(contextMachineKey(id, context))) throw { detail: "no_session" };
      return child(context).client;
    }
    if (contexts !== null) throw { detail: "no_session" };
    return legacy.client;
  };
  return {
    validatedContexts: () => validated,
    contextInfo: (id: string) => contexts?.get(id) ?? null,
    client: {
      admission: (id: string, context?: string) => target(id, context).admission(id),
      start: (id: string, context?: string) => target(id, context).start(id),
      wake: (id: string, context?: string) => target(id, context).wake(id),
    },
    async rows(allowLegacy = true) {
      const version = ++epoch;
      unsupported = false;
      validated = null;
      let status: Status;
      try { status = await rpc("danil_session_status") as Status; }
      catch {
        if (version !== epoch) return { state: "retrying" as const };
        contexts = null; clients.clear(); current.clear();
        return allowLegacy ? legacy.rows() : { state: "denied" as const };
      }
      if (version !== epoch) return { state: "retrying" as const };
      const settled = settledContextIds(status?.sessions);
      if (settled === null) {
        contexts = null;
        clients.clear();
        current.clear();
        return status?.state === "disconnected" || !allowLegacy ? { state: "ready" as const, computers: [], renewInChannel: false } : legacy.rows();
      }
      validated = settled;
      onContextsSettled?.(settled);
      const list = [...new Map(status.sessions!.flatMap((s) => s.contexts).map((c) => [c.context_id, c])).values()];
      contexts = new Map(list.map((c) => [c.context_id, c]));
      clients = new Map([...clients].filter(([id]) => contexts?.has(id)));
      const [answers] = await Promise.all([Promise.all(list.map(async (context) => ({ context, answer: await child(context.context_id).rows() }))), here?.read()]);
      if (version !== epoch) return { state: "retrying" as const };
      if (unsupported) {
        contexts = null;
        current.clear();
        return allowLegacy ? legacy.rows() : { state: "denied" as const };
      }
      const rows = mergeContextMachines(answers.flatMap(({ context, answer }) => answer.state === "ready" ? [{ context, computers: answer.computers }] : []), here?.own());
      current = new Map(rows.map((r) => [contextMachineKey(r.computer_id, r.context), r]));
      // Se quita lo denegado de inmediato; una familia no puede conservar datos de otra.
      return { state: "ready" as const, computers: rows, retrying: answers.some(({ answer }) => answer.state === "retrying" || answer.state === "unavailable"), renewInChannel: answers.length > 0 && answers.every(({ answer }) => answer.state === "ready" && answer.renewInChannel) };
    },
  };
}
