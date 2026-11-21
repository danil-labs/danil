import { batch, createEffect, createSignal, on, untrack } from "solid-js";
import { despachable, esDeLaTerminal, guardable, retencionAlCargar, siguienteLote, sueltaElBorrador, type Encolado, type RazonDeRetencion } from "../chat/index.ts";
import { editMentions, type TaskMention } from "../../lib/taskMentions.ts";
export type QueueScope = { workspace: string | null; generation: number; session: string | null; project: string };
type Saved = { project: string; items: Encolado[]; retained: RazonDeRetencion | null };
type Rules = { busy: boolean; waiting: boolean; editing?: boolean; shellOnly?: boolean };
export type HiddenQueueBatch = { session: string; project: string; scope: QueueScope; epoch: number; batch: Encolado[]; message: Omit<Encolado, "id"> };
type Dependencies = {
  scope: () => QueueScope;
  readQueue: (scope: QueueScope & { session: string }) => Promise<Encolado[]>;
  writeQueue: (scope: QueueScope & { session: string }, items: Encolado[]) => Promise<unknown>;
  onSaveFailure: (error: unknown, scope: QueueScope & { session: string }) => void;
};
/** Owns the queue in hand, its per-task copies and retained disk drafts. */
export function createTaskQueues(deps: Dependencies) {
  const [items, setItems] = createSignal<Encolado[]>([]);
  const [owner, setOwner] = createSignal<string | null>(null);
  const [retained, setRetained] = createSignal<RazonDeRetencion | null>(null);
  const [editing, setEditing] = createSignal(false);
  const saved = new Map<string, Saved>();
  const retentions = new Map<string, Map<string, RazonDeRetencion | null>>();
  const draining = new Set<string>();
  const writes = new Map<string, Promise<unknown>>();
  let diskDraft: string | null = null, epoch = 0, readRevision = 0, disposed = false;
  const currentScope = () => untrack(deps.scope);
  const current = (scope: QueueScope) => {
    const now = currentScope();
    return !disposed && now.workspace === scope.workspace && now.generation === scope.generation;
  };
  function persist(scope: QueueScope & { session: string }, queued: Encolado[]) {
    if (disposed) return Promise.resolve();
    const key = JSON.stringify([scope.workspace, scope.project, scope.session]);
    const snapshot = queued.slice();
    const run = () => deps.writeQueue(scope, snapshot);
    const previous = writes.get(key);
    const promise = previous ? previous.then(run, run) : run();
    writes.set(key, promise);
    void promise.finally(() => { if (writes.get(key) === promise) writes.delete(key); }).catch(() => {});
    return promise;
  }
  function write(scope: QueueScope & { session: string }, queued: Encolado[]) {
    if (disposed) return Promise.resolve();
    return persist(scope, queued).catch(error => { if (current(scope)) deps.onSaveFailure(error, scope); });
  }
  createEffect(on([items, owner, retained], ([queued, id, reason]) => {
    const scope = currentScope();
    if (!disposed && id && id === scope.session) saved.set(id, { project: scope.project, items: queued, retained: reason });
  }));
  createEffect(on([items, owner], ([queued, id], before) => {
    const scope = currentScope();
    if (disposed || !guardable(id, scope.session)) return;
    if (before && before[0] === queued && queued.length === 0) return;
    void write({ ...scope, session: id }, queued);
  }));
  async function openSession(session: string, project: string, isCurrent: () => boolean = () => true, fromEngine = false) {
    const scope = { ...currentScope(), session, project }, requestEpoch = epoch, revision = ++readRevision;
    try {
      const cached = fromEngine ? undefined : saved.get(session);
      const queued = cached?.items ?? await deps.readQueue(scope);
      if (!current(scope) || currentScope().session !== session || currentScope().project !== project || requestEpoch !== epoch || revision !== readRevision || !isCurrent()) return;
      const restored = fromEngine ? undefined : saved.get(session);
      const kept = retentions.get(scope.workspace ?? "")?.get(session);
      retentions.get(scope.workspace ?? "")?.delete(session);
      const reason = fromEngine ? (queued.some(item => item.held) ? "motor" : null) : restored ? restored.retained : retencionAlCargar(queued.length, kept);
      diskDraft = !restored && kept === undefined && reason === "borrador" ? session : null;
      batch(() => { setItems(restored?.items ?? queued); setOwner(session); setRetained(reason); });
    } catch (error) {
      if (current(scope) && currentScope().session === session && currentScope().project === project && requestEpoch === epoch && revision === readRevision && isCurrent()) setOwner(session);
      throw error;
    }
  }
  function detach() {
    readRevision++;
    batch(() => { setOwner(null); setItems([]); setRetained(null); setEditing(false); });
  }
  function retain(reason: RazonDeRetencion | null, session = currentScope().session) {
    if (session === currentScope().session) setRetained(reason);
    if (diskDraft === session) diskDraft = null;
    if (session) { const queue = saved.get(session); if (queue) saved.set(session, { ...queue, retained: reason }); }
  }
  function remove(id: string, session = currentScope().session) {
    if (session) { const queue = saved.get(session); if (queue) saved.set(session, { ...queue, items: queue.items.filter(item => item.id !== id) }); }
    if (session === currentScope().session) setItems(queued => queued.filter(item => item.id !== id));
  }
  function next(rules: Rules) {
    const scope = currentScope();
    if (!despachable({ pendientes: items().length, de: owner(), mirando: scope.session, ocupado: rules.busy,
      editando: rules.editing ?? editing(), retenida: retained(), esperando: rules.waiting })) return null;
    const { mensaje, lote, resto } = siguienteLote(items());
    if (!mensaje || (rules.shellOnly && !esDeLaTerminal(lote[0]))) return null;
    if (esDeLaTerminal(lote[0])) return { kind: "shell" as const, item: lote[0] };
    setItems(resto);
    return { kind: "message" as const, message: mensaje, itemIds: lote.map(item => item.id) };
  }
  function beginHidden(session: string, blocked: boolean): HiddenQueueBatch | null {
    const queue = saved.get(session);
    if (blocked || session === currentScope().session || draining.has(session) || !queue?.items.length ||
      (queue.retained && queue.retained !== "session")) return null;
    const { mensaje, lote, resto } = siguienteLote(queue.items);
    if (!mensaje || esDeLaTerminal(lote[0])) return null;
    draining.add(session);
    saved.set(session, { ...queue, items: resto, retained: null });
    return { session, project: queue.project, scope: currentScope(), epoch, batch: lote, message: mensaje };
  }
  function restoreHidden(batch: HiddenQueueBatch, reason: RazonDeRetencion) {
    if (!current(batch.scope) || batch.epoch !== epoch) return null;
    const restored = { project: batch.project, items: [...batch.batch, ...(saved.get(batch.session)?.items ?? [])], retained: reason };
    saved.set(batch.session, restored);
    if (batch.session === currentScope().session) batchUpdate(batch.session, restored);
    return restored.items;
  }
  function batchUpdate(session: string, queue: Saved) {
    batch(() => { setRetained(queue.retained); setItems(queue.items); setOwner(session); });
  }

  return {
    items, owner, retained, editing,
    saved: (session: string): Readonly<Saved> | undefined => saved.get(session),
    savedEntries: () => [...saved.entries()],
    draining: (session: string) => draining.has(session),
    openSession, detach, retain, remove, next, beginHidden, restoreHidden,
    endHidden: (session: string) => draining.delete(session),
    persist: (session: string, project: string, queued: Encolado[]) => persist({ ...currentScope(), session, project }, queued),
    persistRestored: (session: string, project: string, queued: Encolado[]) => write({ ...currentScope(), session, project }, queued),
    adopt: (session: string) => setOwner(session),
    editMode: (value: boolean) => setEditing(value),
    enqueue: (message: Encolado, front = false) => setItems(queued => front ? [message, ...queued] : [...queued, message]),
    edit: (id: string, text: string, mentions?: TaskMention[]) => setItems(queued => queued.map(item => item.id === id ? { ...item, text, task_mentions: mentions ?? editMentions(item, text) } : item)),
    prioritize: (id: string) => batch(() => {
      setItems(queued => { const item = queued.find(row => row.id === id); return item ? [item, ...queued.filter(row => row.id !== id)] : queued; }); setRetained(null);
    }),
    prependBusy: (message: Encolado) => batch(() => { setItems(queued => [message, ...queued]); setRetained("session"); }),
    releaseDiskDraft: (session: string, live: boolean) => {
      if (sueltaElBorrador(retained(), live, diskDraft === session)) { diskDraft = null; setRetained(null); }
    },
    turnClosed: (session: string, reason: RazonDeRetencion | null, release: boolean) => {
      if (session === currentScope().session && !release) setRetained(reason);
      if (diskDraft === session) diskDraft = null;
      const queue = saved.get(session); if (queue) saved.set(session, { ...queue, retained: release ? null : reason });
    },
    releaseDraft: (session: string) => {
      if (session === currentScope().session && retained() === "borrador") setRetained(null);
      const queue = saved.get(session); if (queue?.retained === "borrador") saved.set(session, { ...queue, retained: null });
    },
    retainedAt: (workspace: string, session: string) => retentions.get(workspace)?.get(session),
    retainAt: (workspace: string, session: string, reason: RazonDeRetencion | null) => retentions.get(workspace)?.set(session, reason),
    workspaceChanged: (previous: string | null) => {
      if (previous) retentions.set(previous, new Map([...saved].filter(([, queue]) => queue.items.length > 0).map(([session, queue]) => [session, queue.retained])));
      epoch++; saved.clear(); draining.clear();
    },
    dispose: () => { disposed = true; epoch++; draining.clear(); },
  };
}
