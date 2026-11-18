import type { HistoryPager, Msg, Session } from "../chat/index.ts";
import { conservarEnOrden, conservarPorClave } from "../../lib/sessionRefresh.ts";

type Optimistic = { original: Msg; row: Msg; acknowledged?: number };
export type OptimisticHistoryState = { optimistic?: Optimistic[]; readRevision?: number };
type HistoryState = OptimisticHistoryState & { base: Msg[]; vivo: Msg[] };
type ReadProvenance = { id: string; generation: number; revision: number };

/** Owns send identity and the causal frontier required to replace it with durable history. */
export function createOptimisticHistory<T extends HistoryState>(deps: {
  current: () => Record<string, T>;
  update: (fn: (all: Record<string, T>) => Record<string, T>) => void;
  settle: (fn: (all: Record<string, T>) => Record<string, T>) => void;
  generation: () => number;
  writeBase: (session: string, fn: (base: Msg[]) => Msg[]) => void;
  writeLive: (session: string, fn: (live: Msg[]) => Msg[]) => void;
  disposed: () => boolean;
}) {
  let revision = 0;
  const reads = new WeakMap<Session, ReadProvenance>();
  function appendOptimistic(session: string, messages: Msg[]) {
    if (deps.disposed() || !messages.length) return;
    deps.writeLive(session, before => [...before, ...messages]);
    deps.update(all => ({ ...all, [session]: { ...all[session], optimistic: [
      ...(all[session].optimistic ?? []), ...messages.map(row => ({ original: row, row })),
    ] } }));
  }
  function acknowledgeOptimistic(session: string, messages: Msg[]) {
    if (deps.disposed()) return;
    const acknowledged = ++revision;
    const acknowledge = (all: Record<string, T>) => {
      const thread = all[session];
      if (!thread?.optimistic?.some(entry => messages.includes(entry.original))) return all;
      return { ...all, [session]: { ...thread, optimistic: thread.optimistic.map(entry =>
        messages.includes(entry.original) ? { ...entry, acknowledged } : entry) } };
    };
    deps.settle(acknowledge);
  }

  function reviseOptimistic(session: string, target: Msg, patch: Pick<Msg, "respuestas" | "author">) {
    if (deps.disposed()) return;
    const entry = deps.current()[session]?.optimistic?.find(row => row.original === target);
    const previous = entry?.row ?? target, next = { ...previous, ...patch };
    if (entry) entry.row = next;
    if (!deps.disposed()) (entry ? deps.writeLive : deps.writeBase)(session, before => before.map(row => row === previous ? next : row));
  }
  function rejectOptimistic(session: string, messages: Msg[]) {
    if (deps.disposed()) return;
    const reject = (all: Record<string, T>) => {
      const thread = all[session];
      if (!thread) return all;
      const rejected = thread.optimistic?.filter(entry => messages.includes(entry.original)) ?? [];
      const keep = (row: Msg) => !messages.includes(row) && !rejected.some(entry => entry.row === row);
      const base = thread.base.filter(keep), vivo = thread.vivo.filter(keep);
      if (base.length === thread.base.length && vivo.length === thread.vivo.length && !rejected.length) return all;
      return { ...all, [session]: { ...thread, base, vivo, optimistic: thread.optimistic?.filter(entry => !rejected.includes(entry)) } };
    };
    deps.settle(reject);
  }

  function accepts(id: string, session: Session, generation: number) {
    const read = reads.get(session), thread = deps.current()[id];
    if (read && (read.id !== id || read.generation !== generation || read.revision < (thread?.readRevision ?? 0))) return false;
    // The ACK does not carry a durable ID. A read begun after every pending ACK
    // is the only evidence that all accepted inputs are present in its tail.
    return !(thread?.optimistic ?? []).some(entry => entry.acknowledged === undefined || !read || read.revision <= entry.acknowledged);
  }
  function reconcile(previous: T | undefined, incoming: Msg[], persistedIds: ReadonlySet<string>, prepend: boolean, readRevision?: number) {
    const optimistic = (previous?.optimistic ?? []).filter(entry =>
      !(entry.row.turno && persistedIds.has(entry.row.turno)) &&
      !(entry.acknowledged !== undefined && readRevision !== undefined && readRevision > entry.acknowledged));
    const persisted = (prepend ? conservarPorClave : conservarEnOrden)(previous?.base ?? [], incoming);
    return { base: persisted, optimistic,
      readRevision: readRevision ?? previous?.readRevision };
  }
  const operations = new WeakMap<HistoryPager<Session["turns"][number]>, { recovery?: Session }>();
  async function readPage(pager: HistoryPager<Session["turns"][number]>, before: number | null, read: () => Promise<Session>) {
    const operation = operations.get(pager), result = await read();
    // The pager must not apply a fallback tail before causal admission by its owner.
    if (before === null && operation && operations.get(pager) === operation && !deps.disposed() && reads.get(result)?.generation === deps.generation()) {
      operation.recovery = result; pager.close();
    }
    return result;
  }
  async function older(pager: HistoryPager<Session["turns"][number]>, paint: (prepend: boolean) => void, accept: (session: Session, generation: number) => void): Promise<(() => void) | null> {
    if (pager.older === "loading") return null;
    const operation: { recovery?: Session } = {}, generation = deps.generation();
    operations.set(pager, operation);
    const apply = await pager.fetchOlder();
    const current = () => !deps.disposed() && generation === deps.generation() && operations.get(pager) === operation;
    if (!current()) return null;
    if (operation.recovery) { accept(operation.recovery, generation); return null; }
    paint(false);
    if (!apply) return null;
    return () => { if (current()) { apply(); paint(true); } };
  }
  async function read(project: string, id: string, request: () => Promise<Session>) {
    if (deps.disposed()) throw new DOMException("Conversation disposed", "AbortError");
    const provenance = { id, generation: deps.generation(), revision: ++revision };
    const session = await request(); reads.set(session, provenance);
    if (session.history?.version === 1) session.turns = session.turns.map(turn => ({ ...turn,
      history_refs: turn.history_refs?.map(ref => ({ ...ref, project, session: id })),
    }));
    return session;
  }
  return { appendOptimistic, acknowledgeOptimistic, reviseOptimistic, rejectOptimistic, accepts, reconcile, readPage, older, read,
    close: (pager: HistoryPager<Session["turns"][number]>) => { operations.delete(pager); pager.close(); },
    provenance: (session: Session) => reads.get(session) };
}
