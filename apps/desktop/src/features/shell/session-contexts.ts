import { createSessionEmptyState, type EmptyReply, type RemovedContext, refusalEmptyReason } from "./session-empty.ts";

export type SessionContext = { context_id: string; org: string; org_name: string | null; plan: string | null; workspaces?: "all" | "later" };
export type SessionFamily = { family: string; email: string | null; contexts: SessionContext[]; available_contexts?: number };
export type ContextGroup = SessionContext & { family: string; email: string | null; available_contexts?: number };
export type SessionStatus = { state: string; sessions?: SessionFamily[]; default_context?: string | null; empty_reason?: string | null; removed?: RemovedContext[] };
export type ContextReply = EmptyReply;
export type ContextInvoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

export function contextGroups(status: SessionStatus | null): ContextGroup[] | null {
  if (!status || !Array.isArray(status.sessions)) return null;
  const seen = new Set<string>();
  return status.sessions.flatMap((s) => s.contexts.flatMap((c) => {
    if (!c.context_id || !c.org || seen.has(c.context_id)) return [];
    seen.add(c.context_id);
    return [{ ...c, family: s.family, email: s.email, available_contexts: s.available_contexts }];
  }));
}

/** El portador se queda en Rust; una lectura vieja nunca repone un contexto cerrado. */
export function createSessionContexts(invoke: ContextInvoke, changed: () => void) {
  let groups: ContextGroup[] | null = null;
  let families: SessionFamily[] = [];
  let epoch = 0;
  let unsupported = false;
  let ready = false;
  let defaultContext: string | null = null;
  let connected = false;
  const empty = createSessionEmptyState();
  const notify = () => changed();
  async function refresh() {
    const read = ++epoch;
    try {
      const status = await invoke<SessionStatus>("danil_session_status");
      if (read !== epoch) return;
      ready = true;
      defaultContext = status.default_context ?? null;
      connected = status.state === "connected";
      if (unsupported && status.sessions?.some((f) => f.contexts.length)) {
        const context = status.sessions.flatMap((f) => f.contexts)[0].context_id;
        await invoke("danil_edge_fetch", { method: "GET", path: "/v1/identity/me", context });
        if (read !== epoch) return;
      }
      families = status.sessions ?? [];
      empty.update({ ...status, removed: status.removed?.map((item) => ({ ...item, org: groups?.find((g) => g.context_id === item.context_id)?.org_name ?? item.org })) });
      groups = contextGroups(status)?.filter((g) => !empty.excludes(g.context_id)) ?? null;
      unsupported = false;
      notify();
    } catch { if (read === epoch) { ready = true; notify(); } }
  }
  const send = async (context: string, method: string, path: string, body?: unknown, idempotencyKey?: string, optionalRoute = false): Promise<ContextReply> => {
    if (unsupported) throw { detail: "session_echo_mismatch" };
    const group = groups?.find((g) => g.context_id === context);
    if (!group) throw { detail: "session_not_in_set" };
    try {
      const reply = await invoke<ContextReply>("danil_edge_fetch", { method, path, context, ...(body === undefined ? {} : { body }), ...(method === "GET" ? {} : { idempotencyKey: idempotencyKey ?? crypto.randomUUID() }) });
      if (!groups?.some((g) => g.context_id === context)) throw { detail: "session_not_in_set" };
      if (empty.note(context, reply)) notify();
      return empty.reason(context) ? { ...reply, body: undefined, empty_reason: empty.reason(context) } : reply;
    } catch (e) {
      const reason = refusalEmptyReason(e);
      if (reason) {
        const reply = { status: reason === "organization_access_denied" ? 403 : 200, empty_reason: reason };
        if (empty.note(context, reply)) notify();
        return reply;
      }
      if (!optionalRoute && (e as { detail?: string } | null)?.detail === "session_echo_mismatch") {
        unsupported = true;
        notify();
      }
      throw e;
    }
  };
  async function close(target: { context: string } | { family: string }) {
    await invoke("danil_sign_out", target);
    ++epoch;
    groups = groups?.filter((g) => "context" in target ? g.context_id !== target.context : g.family !== target.family) ?? null;
    families = families.map((f) => ({ ...f, contexts: f.contexts.filter((c) => groups?.some((g) => g.context_id === c.context_id)) }));
    notify();
    await refresh();
  }
  return {
    refresh, send, close,
    sendOptional: (context: string, method: string, path: string, body?: unknown, key?: string) => send(context, method, path, body, key, true),
    defaultContext: () => defaultContext,
    noteOrganizationProblem: (context: string) => { if (empty.note(context, { status: 403, empty_reason: "organization_selection_required" })) notify(); },
    closeEmail: async (email: string | null, fallbackFamily: string) => {
      const ids = email ? families.filter((f) => f.email?.trim().toLowerCase() === email.trim().toLowerCase()).map((f) => f.family) : [fallbackFamily];
      for (const family of ids) await close({ family });
    },
    ready: () => ready, connected: () => connected,
    groups: () => unsupported ? null : groups,
    families: () => families,
    emptyReason: empty.reason, removed: empty.removed, dismissRemoved: (context: string) => { empty.dismiss(context); changed(); },
    addAccount: async () => {
      let result: { error?: string | null };
      try { result = await invoke("danil_sign_in", { mode: "add" }); }
      catch (e) {
        const refusal = e as { detail?: string; status?: number } | null;
        if (refusal?.detail !== "not_available_yet" && refusal?.status !== 404 && refusal?.status !== 501) throw e;
        result = await invoke("danil_sign_in");
      }
      await refresh();
      if (result.error) throw { detail: result.error };
    },
  };
}
