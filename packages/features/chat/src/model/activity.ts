import { observedActivityUpdate, type ActivityObservationKind, type ObservedTurnActivity as TurnActivity } from "./activityObservation.ts";
import type { Msg } from "./messageTypes.ts";
import { ActivityAnchor, savedActivityTurn as savedTurn } from "./activityAnchor.ts";
import type { TurnOutcome } from "./turnActivity.ts";
export type { TurnActivity, TurnOutcome } from "./turnActivity.ts";
type RecordOfActivity = { key: string; active: boolean; outcome: TurnOutcome; startConfirmed: boolean; startedAt: number | null; saved: Set<string>; baseline: readonly string[] | null; lastObserved: Msg | null; lastObservedKind: ActivityObservationKind | null; anchor: ActivityAnchor; shown: readonly Msg[]; alias?: RecordOfActivity };
const scopeKey = (workspace: string | null, session: string) => JSON.stringify([workspace, session]);
const epoch = (value: number | null) => value !== null && Number.isFinite(value) && value > 0 ? value : null;
const isInterruption = (m: Msg) =>
  m.role === "system" && m.meta === "fallo" && (m.text === "Interrumpido." || m.text === "chat.turn.cancelled" || m.text.startsWith("Turno interrumpido."));
const isFailure = (m: Msg) => m.role === "system" && m.meta === "fallo" && !isInterruption(m);
const isRealWork = (m: Msg) =>
  !m.shell && Boolean(m.paso || m.permission || (m.role === "system" && m.meta === "usó") || m.razonamiento?.length);
const isAgentOutput = (m: Msg) =>
  m.role === "agent" && Boolean(m.text.trim() || m.images?.length || m.preguntas?.length || m.historyRefs?.length);
/** Projection provenance, never execution state: only explicit lifecycle facts open/close it. */
export function createActivityProjection() {
  let serial = 0;
  const records = new Map<string, RecordOfActivity[]>();
  const owners = new WeakMap<Msg, RecordOfActivity>();
  const list = (workspace: string | null, session: string) => records.get(scopeKey(workspace, session)) ?? [];
  const current = (workspace: string | null, session: string) => list(workspace, session).at(-1);
  function begin(workspace: string | null, session: string, startedAt: number | null, before: readonly Msg[] | null = null, startConfirmed = false) {
    const previous = current(workspace, session);
    if (previous?.active) {
      const confirmed = startConfirmed && !previous.startConfirmed;
      const timed = previous.startedAt === null && epoch(startedAt) !== null;
      if (confirmed) previous.startConfirmed = true;
      if (timed) previous.startedAt = epoch(startedAt);
      return confirmed || timed;
    }
    const key = scopeKey(workspace, session);
    const known = before?.map(savedTurn).filter((id): id is string => Boolean(id));
    const baseline = before === null || (before.length > 0 && !known?.length) ? null : known ?? [];
    records.set(key, [...list(workspace, session), { key: `${key}:activity:${++serial}`, active: true, outcome: "running", startConfirmed, startedAt: epoch(startedAt), saved: new Set(), baseline, lastObserved: null, lastObservedKind: null, anchor: new ActivityAnchor(before), shown: [] }]);
    return true;
  }
  function observe(workspace: string | null, session: string, before: readonly Msg[], after: readonly Msg[]) {
    const active = current(workspace, session);
    const saved = new Map(list(workspace, session).flatMap(record => [...record.saved].map(id => [id, record] as const)));
    const positions = new Map(before.map((message, index) => [message, index]));
    after.forEach((message, index) => {
      // Existing objects keep their owner even when deletion shifts their index.
      if (owners.has(message)) return;
      const previous = before[index];
      const inherited = before.length === after.length && !positions.has(message) && previous ? owners.get(previous) : undefined;
      const known = (message.tramo ? saved.get(message.tramo) : undefined) ?? (message.turno ? saved.get(message.turno) : undefined);
      const assigned = known ?? inherited;
      const owner = assigned?.alias ?? assigned ?? (active?.active ? active : undefined);
      if (!owner || positions.has(message)) return;
      owners.set(message, owner);
      if (owner.active) owner.anchor.observe(message, previous);
      const kind = observedActivityUpdate(message, previous);
      if (owner.active && kind) { owner.lastObserved = message; owner.lastObservedKind = kind; }
      else if (owner.lastObserved === previous) owner.lastObserved = message;
      if (message.tramo) owner.saved.add(message.tramo);
      if (message.turno) owner.saved.add(message.turno);
    });
  }
  function finish(workspace: string | null, session: string, outcome: Exclude<TurnOutcome, "running"> = "done") {
    const activity = current(workspace, session);
    if (!activity) return false;
    if (!activity.active) {
      if (outcome !== "done" && activity.outcome !== outcome) {
        activity.outcome = outcome;
        return true;
      }
      return false;
    }
    activity.active = false;
    activity.outcome = outcome;
    return true;
  }
  function reconcile(workspace: string | null, session: string, _before: readonly Msg[], after: readonly Msg[], closed: boolean, prepend = false) {
    const latest = current(workspace, session);
    if (latest?.active) latest.anchor.reconcile(after, prepend);
    if (closed && latest && !latest.active && latest.baseline !== null) {
      const frontier = latest.baseline.at(-1);
      let boundary = -1;
      if (frontier) for (let index = after.length - 1; index >= 0; index--) {
        if (savedTurn(after[index]) === frontier) { boundary = index; break; }
      }
      // Prepending history cannot turn older, previously unseen IDs into this run.
      if (!frontier || boundary >= 0) for (const message of after.slice(boundary + 1)) {
        const id = savedTurn(message);
        if (id && !latest.baseline.includes(id)) latest.saved.add(id);
      }
    }
    const saved = new Map(list(workspace, session).flatMap(record => [...record.saved].map(id => [id, record] as const)));
    for (const message of after) {
      const id = savedTurn(message), owner = id ? saved.get(id) : undefined;
      if (owner) owners.set(message, owner);
    }
  }
  function project(workspace: string | null, session: string, visible: readonly Msg[]): TurnActivity<Msg>[] {
    return list(workspace, session).flatMap(record => {
      const fresh = visible.filter(message => { const owner = owners.get(message); return (owner?.alias ?? owner) === record; });
      // **Un turno conserva lo que ya mostró.** Releer el disco, sellar lo vivo o
      // adoptar un borrador sustituye los objetos del hilo: el dueño se resuelve
      // por identidad y por los ids guardados, y mientras ese enlace falta la
      // lista quedaría vacía. La cabecera caía entonces en «Pensando…» y las
      // herramientas ya vistas desaparecían en mitad del turno. Lo que el turno
      // ya mostró es un hecho de presentación: no se pierde.
      if (fresh.some(isRealWork)) record.shown = fresh;
      const messages = fresh.some(isRealWork) || record.shown.length === 0 ? fresh : record.shown;
      const hasWork = messages.some(isRealWork);
      const hasResponse = messages.some(isAgentOutput);
      const outcome: TurnOutcome = record.active
        ? "running"
        : messages.some(isInterruption)
          ? "interrupted"
          : record.outcome === "failed" || messages.some(isFailure)
            ? "failed"
            : "done";
      // El ancla se busca entre los mensajes frescos: uno recordado puede no estar
      // ya en el hilo y colocaba la fila en el índice -1.
      const output = fresh.find(message => message.role !== "user") ?? messages.find(message => message.role !== "user");
      const anchor = record.anchor.before(visible) ?? output;
      const duration = [...messages].reverse().find(message => message.role === "agent" && message.duration_ms !== undefined)?.duration_ms;
      if (!record.active) {
        // Error o interrupción sin herramientas ni razonamiento previo: se oculta
        // por completo «Trabajo / Trabajó» y solo queda el error o marcador.
        if ((outcome === "failed" || outcome === "interrupted") && !hasWork) return [];
        if (outcome === "done" && !hasWork && !hasResponse && duration === undefined) return [];
      }
      const at = anchor ? visible.indexOf(anchor) : visible.length;
      return [{ key: record.key, anchor: anchor ?? null, anchorIndex: at < 0 ? visible.length : at,
        active: record.active, outcome, startConfirmed: record.startConfirmed, startedAt: record.startedAt, durationMs: duration ?? null, messages, observation: record.lastObserved && record.lastObservedKind ? { message: record.lastObserved, kind: record.lastObservedKind } : null }];
    });
  }
  function adopt(workspace: string | null, from: string, to: string) {
    const previous = list(workspace, from);
    if (!previous.length) return;
    const existing = list(workspace, to);
    const draft = previous.at(-1), running = existing.at(-1);
    if (draft?.active && running?.active) {
      running.alias = draft;
      draft.startConfirmed ||= running.startConfirmed;
      draft.anchor.inherit(running.anchor);
      if (running.lastObserved) { draft.lastObserved = running.lastObserved; draft.lastObservedKind = running.lastObservedKind; }
      for (const id of running.saved) draft.saved.add(id);
      records.set(scopeKey(workspace, to), [...existing.filter(record => record !== running), ...previous]);
    } else records.set(scopeKey(workspace, to), draft?.active || !running?.active ? [...existing, ...previous] : [...previous, ...existing]);
    records.delete(scopeKey(workspace, from));
  }
  return { begin, observe, finish, reconcile, project, adopt,
    drop: (workspace: string | null, session: string) => records.delete(scopeKey(workspace, session)),
    clear: () => records.clear() };
}
export { activityElapsed } from "./turnActivity.ts";
