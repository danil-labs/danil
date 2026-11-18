import type { Computer } from "@terminus/computers";
import { createCloudMachines, EDGE_ENDPOINT } from "./cloud-machines.ts";

type Invoke = (command: string, args?: Record<string, unknown>) => Promise<unknown>;
type Context = { context_id: string; org: string };
type Status = { state?: string; sessions?: { contexts: Context[] }[] };
export type ContextComputer = Computer & { context?: string };

/** Una máquina repetida pertenece al contexto de su organización; sin coincidencia conserva el primero. */
export function mergeContextMachines(groups: { context: Context; computers: Computer[] }[]): ContextComputer[] {
  const rows = new Map<string, ContextComputer>();
  for (const { context, computers } of groups) for (const row of computers) {
    const previous = rows.get(row.computer_id);
    if (!previous || (row.organization_id === context.org && previous.organization_id !== groups.find((g) => g.context.context_id === previous.context)?.context.org)) rows.set(row.computer_id, { ...row, context: context.context_id });
  }
  return [...rows.values()];
}

export function createSessionCloud(invoke: Invoke, onProblem?: (error: unknown) => void, endpoint = EDGE_ENDPOINT) {
  const legacy = createCloudMachines(invoke, onProblem, endpoint);
  let clients = new Map<string, ReturnType<typeof createCloudMachines>>();
  let current = new Map<string, ContextComputer>();
  let contexts: Set<string> | null = null;
  let epoch = 0;
  let unsupported = false;
  const child = (context: string) => {
    let client = clients.get(context);
    if (!client) {
      client = createCloudMachines(async (_command, args) => {
        try { return await invoke("danil_edge_fetch", { ...args, context }); }
        catch (error) {
          if ((error as { detail?: string } | null)?.detail === "session_echo_mismatch") unsupported = true;
          throw error;
        }
      }, onProblem, endpoint);
      clients.set(context, client);
    }
    return client;
  };
  const target = (id: string, context?: string) => {
    if (context) {
      if (!contexts?.has(context) || current.get(id)?.context !== context) throw { detail: "no_session" };
      return child(context).client;
    }
    if (contexts !== null) throw { detail: "no_session" };
    return legacy.client;
  };
  return {
    client: {
      admission: (id: string, context?: string) => target(id, context).admission(id),
      start: (id: string) => target(id, current.get(id)?.context).start(id),
    },
    async rows() {
      const version = ++epoch;
      unsupported = false;
      let status: Status;
      try { status = await invoke("danil_session_status") as Status; }
      catch { return { state: "retrying" as const }; }
      if (version !== epoch) return { state: "retrying" as const };
      if (!Array.isArray(status.sessions)) {
        contexts = null;
        clients.clear();
        current.clear();
        return status.state === "disconnected" ? { state: "ready" as const, computers: [], renewInChannel: false } : legacy.rows();
      }
      const list = [...new Map(status.sessions.flatMap((s) => s.contexts).map((c) => [c.context_id, c])).values()];
      contexts = new Set(list.map((c) => c.context_id));
      clients = new Map([...clients].filter(([id]) => contexts?.has(id)));
      const answers = await Promise.all(list.map(async (context) => ({ context, answer: await child(context.context_id).rows() })));
      if (version !== epoch) return { state: "retrying" as const };
      if (unsupported) {
        contexts = null;
        current.clear();
        return legacy.rows();
      }
      const rows = mergeContextMachines(answers.flatMap(({ context, answer }) => answer.state === "ready" ? [{ context, computers: answer.computers }] : []));
      current = new Map(rows.map((r) => [r.computer_id, r]));
      // Se quita lo denegado de inmediato; una familia no puede conservar datos de otra.
      return { state: "ready" as const, computers: rows, retrying: answers.some(({ answer }) => answer.state === "retrying" || answer.state === "unavailable"), renewInChannel: answers.length > 0 && answers.every(({ answer }) => answer.state === "ready" && answer.renewInChannel) };
    },
  };
}
