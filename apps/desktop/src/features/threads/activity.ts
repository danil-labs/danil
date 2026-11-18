import type { Msg } from "../chat/index.ts";

import type { TurnActivity } from "../../lib/turnActivity.ts";
export type { TurnActivity } from "../../lib/turnActivity.ts";

type RecordOfActivity = { key: string; active: boolean; startedAt: number | null; saved: Set<string>; baseline: readonly string[] | null; alias?: RecordOfActivity };
const scopeKey = (workspace: string | null, session: string) => JSON.stringify([workspace, session]);
// `transcripcion` assigns every persisted piece `${turn id}:${piece}`.
const savedTurn = (message: Msg) => {
  const separator = message.clave?.lastIndexOf(":") ?? -1;
  return separator > 0 ? message.clave!.slice(0, separator) : message.avanceDe || message.turno;
};
const epoch = (value: number | null) => value !== null && Number.isFinite(value) && value > 0 ? value : null;

/** Projection provenance, never execution state: only explicit lifecycle facts open/close it. */
export function createActivityProjection() {
  let serial = 0;
  const records = new Map<string, RecordOfActivity[]>();
  const owners = new WeakMap<Msg, RecordOfActivity>();
  const list = (workspace: string | null, session: string) => records.get(scopeKey(workspace, session)) ?? [];
  const current = (workspace: string | null, session: string) => list(workspace, session).at(-1);
  function begin(workspace: string | null, session: string, startedAt: number | null, before: readonly Msg[] | null = null) {
    const previous = current(workspace, session);
    if (previous?.active) {
      if (previous.startedAt !== null || epoch(startedAt) === null) return false;
      previous.startedAt = epoch(startedAt);
      return true;
    }
    const key = scopeKey(workspace, session);
    const known = before?.map(savedTurn).filter((id): id is string => Boolean(id));
    const baseline = before === null || (before.length > 0 && !known?.length) ? null : known ?? [];
    records.set(key, [...list(workspace, session), { key: `${key}:activity:${++serial}`, active: true, startedAt: epoch(startedAt), saved: new Set(), baseline }]);
    return true;
  }
  function observe(workspace: string | null, session: string, before: readonly Msg[], after: readonly Msg[]) {
    const active = current(workspace, session);
    const positions = new Map(before.map((message, index) => [message, index]));
    after.forEach((message, index) => {
      // Existing objects keep their owner even when deletion shifts their index.
      if (owners.has(message)) return;
      const previous = before[index];
      const inherited = before.length === after.length && !positions.has(message) && previous ? owners.get(previous) : undefined;
      const owner = inherited ?? (active?.active ? active : undefined);
      if (!owner || positions.has(message)) return;
      owners.set(message, owner);
      if (message.tramo) owner.saved.add(message.tramo);
      if (message.turno) owner.saved.add(message.turno);
    });
  }
  function finish(workspace: string | null, session: string) {
    const activity = current(workspace, session);
    if (!activity?.active) return false;
    activity.active = false;
    return true;
  }
  function reconcile(workspace: string | null, session: string, _before: readonly Msg[], after: readonly Msg[], closed: boolean) {
    const latest = current(workspace, session);
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
      const messages = visible.filter(message => { const owner = owners.get(message); return (owner?.alias ?? owner) === record; });
      const output = messages.find(message => message.role !== "user");
      if (!record.active && !output) return [];
      const duration = [...messages].reverse().find(message => message.role === "agent" && message.duration_ms !== undefined)?.duration_ms;
      return [{ key: record.key, anchor: output ?? null, anchorIndex: output ? visible.indexOf(output) : visible.length,
        active: record.active, startedAt: record.startedAt, durationMs: duration ?? null, messages }];
    });
  }
  function adopt(workspace: string | null, from: string, to: string) {
    const previous = list(workspace, from);
    if (!previous.length) return;
    const existing = list(workspace, to);
    const draft = previous.at(-1), running = existing.at(-1);
    if (draft?.active && running?.active) {
      running.alias = draft;
      for (const id of running.saved) draft.saved.add(id);
      records.set(scopeKey(workspace, to), [...previous, ...existing.filter(record => record !== running)]);
    } else records.set(scopeKey(workspace, to), [...previous, ...existing]);
    records.delete(scopeKey(workspace, from));
  }
  return { begin, observe, finish, reconcile, project, adopt,
    drop: (workspace: string | null, session: string) => records.delete(scopeKey(workspace, session)),
    clear: () => records.clear() };
}

export { activityElapsed } from "../../lib/turnActivity.ts";
