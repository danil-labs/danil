import { batch, createSignal } from "solid-js";

export type ConversationScope = { workspace: string | null; generation: number; project: string; session: string; route?: { headers: Record<string, string> } };
export type HandoffView = { stopping: boolean; pending: { queueItemId: string; phase: "waiting-close" | "submitting" | "awaiting-start" } | null; error: unknown | null; released: boolean };
export type HandoffPresentation = ({ queueItemId: string } & ({ phase: "waiting-close"; pendingMessage: { text: string; attachments?: readonly string[] } }
  | { phase: "submitting" | "awaiting-start" })) | null;
export type HandoffFact = { scope: ConversationScope } & ({ kind: "terminal" | "started" | "accepted" } | { kind: "dispatching"; itemIds: readonly string[] } | { kind: "rejected"; error: unknown } | { kind: "queue-removed"; queueItemId: string });
type Dependencies = {
  current: () => { workspace: string | null; generation: number };
  runtime: { active: (scope: ConversationScope) => boolean; stop: (scope: ConversationScope) => Promise<unknown> };
  queue: { message: (scope: ConversationScope, id: string) => { text: string; attachments?: readonly string[] } | undefined; select: (scope: ConversationScope, id: string) => boolean; release: (scope: ConversationScope, id: string) => void; failed: (scope: ConversationScope, id: string, error: unknown) => void };
};
const EMPTY: HandoffView = { stopping: false, pending: null, error: null, released: false };
type Barrier = { kind: "in-flight"; promise: Promise<void> } | { kind: "acknowledged" | "declined" } | { kind: "failed"; error: unknown };
type Cancelling = { kind: "cancelling"; scope: ConversationScope; barrier: Barrier; terminal: "unseen" | "observed"; queueItemId: string | null };
type Entry = Cancelling | { kind: "ready" | "awaiting-start"; scope: ConversationScope; queueItemId: string }
  | { kind: "submitting"; scope: ConversationScope; queueItemId: string; error: unknown | null };
/** Local cancellation barriers and queue references; execution remains with the runtime. */
export function createConversationHandoff(deps: Dependencies) {
  const entries = new Map<string, Entry>();
  const [revision, setRevision] = createSignal(0);
  let disposed = false;
  const key = (scope: ConversationScope) => JSON.stringify([scope.workspace, scope.generation, scope.project, scope.session]);
  const current = (scope: ConversationScope) => {
    const now = deps.current();
    return !disposed && now.workspace === scope.workspace && now.generation === scope.generation;
  };
  const publish = () => setRevision(value => value + 1);
  const capture = (scope: ConversationScope): ConversationScope => ({ ...scope, route: scope.route ? { headers: { ...scope.route.headers } } : undefined });
  const live = (entry: Entry) => current(entry.scope) && entries.get(key(entry.scope)) === entry;
  function settle(entry: Cancelling) {
    if (!live(entry) || entry.terminal !== "observed" || (entry.barrier.kind !== "acknowledged" && entry.barrier.kind !== "declined")) return;
    batch(() => {
      if (entry.queueItemId) {
        const next: Entry = { kind: "ready", scope: entry.scope, queueItemId: entry.queueItemId };
        entries.set(key(entry.scope), next); publish(); deps.queue.release(next.scope, next.queueItemId);
      } else { entries.delete(key(entry.scope)); publish(); }
    });
  }
  function beginCancellation(scope: ConversationScope, queueItemId: string | null): Promise<void> {
    let finish!: () => void;
    const promise = new Promise<void>(resolve => { finish = resolve; });
    const previous = entries.get(key(scope));
    const entry: Cancelling = { kind: "cancelling", scope: capture(scope), barrier: { kind: "in-flight", promise }, terminal: "unseen", queueItemId };
    let selected = true;
    batch(() => {
      entries.set(key(scope), entry); publish();
      if (queueItemId && !deps.queue.select(entry.scope, queueItemId)) {
        selected = false; if (previous) entries.set(key(scope), previous); else entries.delete(key(scope)); publish();
      }
    });
    if (!selected) { finish(); return promise; }
    void (async () => {
      try {
        const reply = await deps.runtime.stop(entry.scope);
        if (!live(entry)) return;
        entry.barrier = { kind: reply === false ? "declined" : "acknowledged" }; publish();
        if (reply === false && !entry.queueItemId) { entries.delete(key(entry.scope)); publish(); }
        else settle(entry);
      } catch (error) {
        if (!live(entry)) return;
        entry.barrier = { kind: "failed", error }; publish();
        if (entry.queueItemId) deps.queue.failed(entry.scope, entry.queueItemId, error);
      } finally { finish(); }
    })();
    return promise;
  }
  function requestStop(scope: ConversationScope): Promise<void> {
    if (!current(scope)) return Promise.resolve();
    const entry = entries.get(key(scope));
    if (entry?.kind === "cancelling") {
      if (entry.barrier.kind === "in-flight") return entry.barrier.promise;
      if (entry.barrier.kind === "acknowledged") return Promise.resolve();
    }
    if (!deps.runtime.active(scope)) return Promise.resolve();
    // A dispatched handoff is history, not a replacement for this new stop.
    const queued = entry?.kind === "cancelling" || entry?.kind === "ready" ? entry.queueItemId : null;
    return beginCancellation(scope, queued);
  }
  function replaceWithQueued(scope: ConversationScope, id: string): Promise<void> {
    if (!current(scope)) return Promise.resolve();
    const entry = entries.get(key(scope));
    if (entry?.kind === "cancelling" && entry.barrier.kind !== "failed") {
      const completion = entry.barrier.kind === "in-flight" ? entry.barrier.promise : Promise.resolve();
      if (entry.queueItemId === id) return completion;
      batch(() => { if (deps.queue.select(entry.scope, id)) { entry.queueItemId = id; publish(); settle(entry); } });
      return completion;
    }
    if (entry?.kind !== "cancelling" && entry?.queueItemId === id) return Promise.resolve();
    if (deps.runtime.active(scope)) return beginCancellation(scope, id);
    batch(() => {
      const next: Entry = { kind: "ready", scope: capture(scope), queueItemId: id };
      entries.set(key(scope), next); publish();
      if (deps.queue.select(next.scope, id)) deps.queue.release(next.scope, id);
      else { if (entry) entries.set(key(scope), entry); else entries.delete(key(scope)); publish(); }
    });
    return Promise.resolve();
  }
  function observe(fact: HandoffFact) {
    if (!current(fact.scope)) return;
    const entry = entries.get(key(fact.scope));
    if (!entry) return;
    if (fact.kind === "terminal" && entry.kind === "cancelling") { entry.terminal = "observed"; settle(entry); }
    else if (fact.kind === "terminal" && (entry.kind === "submitting" || entry.kind === "awaiting-start")) { entries.delete(key(entry.scope)); publish(); }
    else if (fact.kind === "dispatching" && entry.kind === "ready" && fact.itemIds.includes(entry.queueItemId)) {
      entries.set(key(entry.scope), { kind: "submitting", scope: entry.scope, queueItemId: entry.queueItemId, error: null }); publish();
    } else if (fact.kind === "accepted" && entry.kind === "submitting") {
      entries.set(key(entry.scope), { kind: "awaiting-start", scope: entry.scope, queueItemId: entry.queueItemId }); publish();
    } else if (fact.kind === "started" && (entry.kind === "submitting" || entry.kind === "awaiting-start")) { entries.delete(key(entry.scope)); publish(); }
    else if (fact.kind === "queue-removed" && entry.queueItemId === fact.queueItemId) {
      if (entry.kind === "cancelling" && entry.barrier.kind !== "failed") { entry.queueItemId = null; settle(entry); }
      else entries.delete(key(entry.scope));
      publish();
    } else if (fact.kind === "rejected" && entry.kind === "submitting" && entry.error === null) {
      entry.error = fact.error; publish(); deps.queue.failed(entry.scope, entry.queueItemId, fact.error);
    }
  }
  function view(scope: ConversationScope): HandoffView {
    revision();
    const entry = current(scope) ? entries.get(key(scope)) : undefined;
    if (!entry) return EMPTY;
    if (entry.kind === "cancelling") return {
      stopping: entry.barrier.kind === "in-flight" || entry.barrier.kind === "acknowledged",
      pending: entry.queueItemId ? { queueItemId: entry.queueItemId, phase: "waiting-close" } : null,
      error: entry.barrier.kind === "failed" ? entry.barrier.error : null, released: false,
    };
    return { stopping: false, pending: { queueItemId: entry.queueItemId, phase: entry.kind === "ready" ? "waiting-close" : entry.kind },
      error: entry.kind === "submitting" ? entry.error : null, released: true };
  }
  function presentation(scope: ConversationScope): HandoffPresentation {
    const state = view(scope), pending = state.pending;
    if (!pending || state.error !== null) return null;
    if (pending.phase !== "waiting-close") return { phase: pending.phase, queueItemId: pending.queueItemId };
    const message = deps.queue.message(scope, pending.queueItemId);
    return message ? { phase: "waiting-close", pendingMessage: message, queueItemId: pending.queueItemId } : null;
  }
  return { requestStop, replaceWithQueued, observe, view, presentation,
    blocked: (scope: ConversationScope) => { const state = view(scope); return state.stopping || !!state.pending && !state.released; },
    reset: () => { entries.clear(); publish(); }, dispose: () => { disposed = true; entries.clear(); publish(); } };
}
