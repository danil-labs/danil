import type { machinesClient } from "@terminus/computers";
import type { Fleet } from "@terminus/fleet";
import type { GroupAccount, GroupAccountCapabilities } from "../lib/group-account.ts";

type Client = ReturnType<typeof machinesClient>;
/** Solo publica la organización después de verificar el inventario con su eco. */
export function windowContext(options: { legacy: Client; factory?: (context: string) => Client; account?: GroupAccountCapabilities["groupAccount"]; fleet: () => Fleet; revision: () => unknown; onContextsSettled?: (contexts: readonly string[]) => void }) {
  let verified: GroupAccount | null = null;
  let pending: GroupAccount | null = null;
  const clients = new Map<string, Client>();
  function client(context?: string): Client {
    if (!context) return options.legacy;
    let found = clients.get(context);
    if (!found) {
      if (!options.factory) throw new Error("context_transport_unavailable");
      found = options.factory(context); clients.set(context, found);
    }
    return found;
  }
  return {
    client, current: () => verified,
    info: (context: string) => pending?.context === context ? pending : verified?.context === context ? verified : null,
    async inventory() {
      const group = await options.account?.current(); pending = group ?? null;
      const settled = options.account?.contexts?.();
      if (settled !== undefined && settled !== null) {
        if (verified?.context !== group?.context || verified && !settled.includes(verified.context)) verified = null;
        options.fleet().pruneContexts(settled);
        options.onContextsSettled?.(settled);
      }
      const legacy = !group && (!options.account || options.account.legacy?.());
      if (!legacy && (!group || !options.factory)) { verified = null; return null; }
      const answer = await client(group?.context).list();
      if (answer.kind !== "ok") {
        verified = null; pending = null;
        if (group && (answer.kind === "unavailable" || answer.kind === "error" && answer.code === "session_echo_mismatch")) {
          return { answer: await options.legacy.list(), group: null };
        }
        return { answer, group: null };
      }
      verified = group ?? null;
      const rows = group ? answer.value.filter(row => row.kind === "personal" || row.organization_id === group.org) : answer.value;
      return { answer: { ...answer, value: rows }, group: verified };
    },
    source: {
      group: () => { options.revision(); return verified; },
      workspaces: () => { options.revision(); return verified ? options.fleet().available(verified.org, verified.context) : null; },
    },
    engine<T extends { handle: (command: string, args?: Record<string, unknown>, options?: { headers?: HeadersInit }) => Promise<unknown> }>(engine: T) {
      return { ...engine, handle: (command: string, args?: Record<string, unknown>, init?: { headers?: HeadersInit }) => {
        const headers = new Headers(init?.headers);
        if (!headers.has("x-danil-context")) headers.set("x-danil-context", verified?.context ?? "");
        return engine.handle(command, args, { ...init, headers });
      } };
    },
  };
}
