import { batch, createEffect, createSignal, on, untrack } from "solid-js";
import { guardable, type Encolado } from "../../chat/src/index.ts";
import { editMentions, type TaskMention } from "../../../../apps/desktop/src/lib/taskMentions.ts";
export type QueueScope = { workspace: string | null; generation: number; session: string | null; project: string };
type Saved = { project: string; items: Encolado[] };
type Dependencies = {
  scope: () => QueueScope;
  readQueue: (scope: QueueScope & { session: string }) => Promise<Encolado[]>;
  writeQueue: (scope: QueueScope & { session: string }, items: Encolado[]) => Promise<unknown>;
  onSaveFailure: (error: unknown, scope: QueueScope & { session: string }) => void;
};
/** Owns the queue in hand and its per-task copies. Nothing here sends: the engine or the person does. */
export function createTaskQueues(deps: Dependencies) {
  const [items, setItems] = createSignal<Encolado[]>([]);
  const [owner, setOwner] = createSignal<string | null>(null);
  const [editing, setEditing] = createSignal(false);
  const saved = new Map<string, Saved>();
  const writes = new Map<string, Promise<unknown>>();
  let epoch = 0, readRevision = 0, disposed = false;
  const currentScope = () => untrack(deps.scope);
  const current = (scope: QueueScope) => {
    const now = currentScope();
    return !disposed && now.workspace === scope.workspace && now.generation === scope.generation;
  };
  const keyOf = (scope: QueueScope & { session: string }) => JSON.stringify([scope.workspace, scope.project, scope.session]);
  function persist(scope: QueueScope & { session: string }, queued: Encolado[]) {
    if (disposed) return Promise.resolve();
    const key = keyOf(scope);
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
  createEffect(on([items, owner], ([queued, id], before) => {
    const scope = currentScope();
    if (disposed || !guardable(id, scope.session)) return;
    saved.set(id, { project: scope.project, items: queued });
    if (before && before[0] === queued && queued.length === 0) return;
    void write({ ...scope, session: id }, queued);
  }));
  async function openSession(session: string, project: string, isCurrent: () => boolean = () => true, fromEngine = false) {
    const scope = { ...currentScope(), session, project }, requestEpoch = epoch, revision = ++readRevision;
    const live = () => current(scope) && currentScope().session === session && currentScope().project === project && requestEpoch === epoch && revision === readRevision && isCurrent();
    try {
      const cached = fromEngine ? undefined : saved.get(session);
      // A reread waits for this window's saves, and one started while it reads is newer than what it brings.
      if (fromEngine) await writes.get(keyOf(scope))?.catch(() => {});
      const queued = cached?.items ?? await deps.readQueue(scope);
      if (!live() || (fromEngine && untrack(owner) === session && writes.has(keyOf(scope)))) return;
      const restored = fromEngine ? undefined : saved.get(session);
      batch(() => { setItems(restored?.items ?? queued); setOwner(session); });
    } catch (error) {
      if (live()) setOwner(session);
      throw error;
    }
  }
  function detach() {
    readRevision++;
    batch(() => { setOwner(null); setItems([]); setEditing(false); });
  }
  function remove(id: string, session = currentScope().session) {
    if (session) { const queue = saved.get(session); if (queue) saved.set(session, { ...queue, items: queue.items.filter(item => item.id !== id) }); }
    if (session === currentScope().session) setItems(queued => queued.filter(item => item.id !== id));
  }

  return {
    items, owner, editing,
    saved: (session: string): Readonly<Saved> | undefined => saved.get(session),
    openSession, detach, remove,
    persist: (session: string, project: string, queued: Encolado[]) => persist({ ...currentScope(), session, project }, queued),
    adopt: (session: string) => setOwner(session),
    editMode: (value: boolean) => setEditing(value),
    // What joins a queue the engine holds waits with it (`load_queue` marks it on the next read).
    enqueue: (message: Encolado, front = false) => setItems(queued => {
      const item = queued.some(row => row.held) ? { ...message, held: true } : message;
      return front ? [item, ...queued] : [...queued, item];
    }),
    edit: (id: string, text: string, mentions?: TaskMention[]) => setItems(queued => queued.map(item => item.id === id ? { ...item, text, task_mentions: mentions ?? editMentions(item, text) } : item)),
    prioritize: (id: string) => setItems(queued => { const item = queued.find(row => row.id === id); return item ? [item, ...queued.filter(row => row.id !== id)] : queued; }),
    workspaceChanged: () => { epoch++; saved.clear(); },
    dispose: () => { disposed = true; epoch++; },
  };
}
