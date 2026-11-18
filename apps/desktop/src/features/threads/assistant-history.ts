import { hasRecentGap, transcripcion, type Msg, type Session, type Turn } from "../chat/index.ts";

export const idsDeTurnos = (turns: readonly Turn[]) => new Set(turns.flatMap(turn => turn.id ? [turn.id] : []));

type Loaded = { turns: Session["turns"]; start: number; total: number };
/** A new durable assistant segment cannot replace live rows until its marker binds their IDs. */
export function createAssistantHistory(scope: { workspace: () => string | null; generation: () => number }) {
  const pending = new Map<string, ReadonlySet<string>>();
  const replayIds = new Map<string, string>();
  const replaying = new Set<string>();
  const baselines = new Map<string, ReadonlySet<string>>();
  const key = (id: string) => JSON.stringify([scope.workspace(), scope.generation(), id]);
  const durableOf = (row: Msg) => row.clave?.slice(0, row.clave.lastIndexOf(":")) || row.turno || row.avanceDe;
  const represented = (base: readonly Msg[]) => new Set(base.flatMap(row => { const id = durableOf(row); return id ? [id] : []; }));
  function prepare(id: string, loaded: Loaded, base: readonly Msg[], live: readonly Msg[], clear: boolean) {
    const known = represented(base);
    if (clear) { replaying.delete(key(id)); baselines.delete(key(id)); }
    const unbound = live.some(row => !row.turno && !row.tramo && (row.role === "agent" || row.meta === "usó"));
    const hidden = new Set(!clear && unbound ? loaded.turns.flatMap(turn =>
      turn.role === "agent" && turn.id && !known.has(turn.id) ? [turn.id] : []) : []);
    if (hidden.size) pending.set(key(id), hidden); else pending.delete(key(id));
  }
  function paint(id: string, loaded: Loaded) {
    const hidden = pending.get(key(id));
    const transcript = transcripcion(loaded.turns, loaded.start);
    const rows = hidden?.size ? transcript.filter(row => { const id = durableOf(row); return !id || !hidden.has(id); }) : transcript;
    if (hasRecentGap(loaded)) rows.push({ role: "system", text: "", meta: "history_gap", clave: "history_gap" });
    return rows;
  }
  function segment(id: string, durable: string, base: readonly Msg[]) {
    const hidden = pending.get(key(id)), deferred = hidden?.has(durable) ?? false;
    if (deferred) {
      const rest = new Set(hidden); rest.delete(durable);
      if (rest.size) pending.set(key(id), rest); else pending.delete(key(id));
    }
    const baseline = baselines.get(key(id));
    // A segment first observed after this run began can precede its live deltas.
    return deferred || replaying.has(key(id)) || !represented(base).has(durable) || (baseline !== undefined && !baseline.has(durable));
  }
  const detach = () => { pending.clear(); replaying.clear(); baselines.clear(); };
  return { prepare, paint, segment, detach,
    replay: (id: string, messages: Msg[], workspace: string | null, replayId?: string, retained?: ReadonlySet<Msg>) => {
      const replayKey = JSON.stringify([workspace, id]);
      if (workspace === scope.workspace()) replaying.add(key(id));
      if (replayId && replayIds.get(replayKey) === replayId) return messages;
      if (replayId) replayIds.set(replayKey, replayId);
      const kept = messages.filter(row => row.role === "user" || retained?.has(row));
      return kept.length === messages.length ? messages : kept;
    },
    begin: (id: string, base: readonly Msg[]) => {
      replaying.delete(key(id));
      if (!baselines.has(key(id))) baselines.set(key(id), new Set([...represented(base), ...(pending.get(key(id)) ?? [])]));
    },
    finish: (id: string) => { replaying.delete(key(id)); baselines.delete(key(id)); },
    drop: (id: string) => { replayIds.delete(JSON.stringify([scope.workspace(), id])); pending.delete(key(id)); replaying.delete(key(id)); baselines.delete(key(id)); },
    clear: () => { replayIds.clear(); detach(); } };
}
