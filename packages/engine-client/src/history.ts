/**
 * Which stretch of the whole transcript a client holds, and how pages join it.
 * `revision` hashes the whole saved task: a title or a new turn changes it, so it says
 * "the file changed", never "the transcript was rewritten". Continuity comes from the turns.
 */

import type { HistoryPage } from "../../protocol/src/types.ts";

export type { HistoryPage };

export type LoadedHistory<T> = { revision?: string; start: number; total: number; turns: T[] };

export type HistoryRead<T> = { turns: T[]; history?: HistoryPage | null };

/** Set while someone reads away from the end: a new tail must not take the turns they are reading. */
export type RefreshOptions = { reading?: boolean };

const HISTORY_BYTES = 2 * 1024 * 1024;
const OLDER_ATTEMPTS = 3;
const RETRY_MS = 250;

const endOf = (history: LoadedHistory<unknown>) => history.start + history.turns.length;

/** Newer turns exist that this window does not hold. */
export const hasRecentGap = (history: LoadedHistory<unknown>) => endOf(history) < history.total;

export const hasOlder = (history: LoadedHistory<unknown>) => history.start > 0;

/** The `before` that asks for the page ending in the first held turn: that one turn proves the join. */
export const olderCursor = (history: LoadedHistory<unknown>) => (history.turns.length ? history.start + 1 : history.start);

const turnId = (turn: unknown) => (typeof turn === "object" && turn !== null && "id" in turn ? (turn as { id?: unknown }).id : undefined);

/** A turn without `id`, with the file revision its references carry taken out: that one changes on every write. */
function contentOf(turn: unknown) {
  if (typeof turn !== "object" || turn === null || !("history_refs" in turn) || !Array.isArray(turn.history_refs)) return JSON.stringify(turn);
  return JSON.stringify({ ...turn, history_refs: turn.history_refs.map(({ revision: _revision, ...ref }) => ref) });
}

function sameTurn(a: unknown, b: unknown) {
  const id = turnId(a), other = turnId(b);
  return id !== undefined && id !== null && other !== undefined && other !== null ? id === other : contentOf(a) === contentOf(b);
}

const withRevision = (revision: string | undefined) => (revision ? { revision } : {});

const sizes = <T,>(turns: T[]) => turns.map(turn => new TextEncoder().encode(JSON.stringify(turn)).length);
const sum = (values: number[]) => values.reduce((all, value) => all + value, 0);

function bounded<T>(history: LoadedHistory<T>, version: number | undefined, edge: "head" | "tail"): LoadedHistory<T> {
  if (version !== 1) return history;
  const each = sizes(history.turns);
  let bytes = sum(each);
  let from = 0, end = each.length;
  while (bytes > HISTORY_BYTES && end - from > 1) {
    bytes -= edge === "tail" ? each[from++] : each[--end];
  }
  return from === 0 && end === each.length ? history : { ...history, start: history.start + from, turns: history.turns.slice(from, end) };
}

/**
 * A read of the end. Keeps what was loaded before unless the turns they share differ.
 * A window that left the tail behind stays where it is: it only learns the new total.
 */
export function refreshHistory<T>(previous: LoadedHistory<T> | undefined, turns: T[], page?: HistoryPage | null, options: RefreshOptions = {}): LoadedHistory<T> {
  if (!page) return { start: 0, total: turns.length, turns };
  const revision = withRevision(page.revision);
  const fresh = { ...revision, start: page.start, total: page.total, turns };
  if (!previous) return bounded(fresh, page.version, "tail");
  const held = endOf(previous);
  const from = Math.max(previous.start, page.start);
  const shared = Math.min(held, page.end) - from;
  for (let n = 0; n < shared; n++) {
    if (!sameTurn(previous.turns[from + n - previous.start], turns[from + n - page.start])) return bounded(fresh, page.version, "tail");
  }
  const window = { ...previous, ...revision, total: page.total };
  const away = hasRecentGap(previous) || options.reading;
  // Reads can land out of order and a relay can answer with an older copy: only shared turns prove a join.
  if (shared <= 0) return away ? window : bounded(fresh, page.version, "tail");
  const start = Math.min(previous.start, page.start);
  const merged = { ...revision, start, total: page.total, turns: [...previous.turns.slice(0, Math.max(0, page.start - previous.start)), ...turns] };
  const fits = page.version !== 1 || sum(sizes(merged.turns)) <= HISTORY_BYTES;
  return !fits && away ? window : bounded(merged, page.version, "tail");
}

/** An older page in front of what is loaded; `null` if it no longer joins and the tail must be read again. */
export function prependHistory<T>(previous: LoadedHistory<T>, turns: T[], page?: HistoryPage | null): LoadedHistory<T> | null {
  if (!page || !turns.length) return null;
  const overlap = page.end - previous.start;
  if (overlap < 0 || overlap > 1) return null;
  // Without a shared turn only an untouched file proves the join.
  if (overlap === 0 && (page.total < previous.total || (page.revision && page.revision !== previous.revision))) return null;
  if (overlap === 1 && !sameTurn(turns.at(-1), previous.turns[0])) return null;
  const older = overlap ? turns.slice(0, -1) : turns;
  return bounded({ ...withRevision(page.revision ?? previous.revision), start: page.start, total: previous.total, turns: [...older, ...previous.turns] }, page.version, "head");
}

export type OlderState = "idle" | "loading" | "failed";

export type HistoryPagerOptions<T> = {
  read: (before: number | null) => Promise<HistoryRead<T>>;
  /** Something a client paints changed: the window or the state of the older page. */
  onChange?: () => void;
  /** Wait before asking again: a task that is writing fails a read that overlaps its save. */
  retryMs?: number;
};

/**
 * The window of one task and its older page: one request at a time, a tail that lands
 * while it travels does not cost the page, and a failure stays visible until a retry.
 */
export class HistoryPager<T> {
  loaded: LoadedHistory<T> | undefined;
  older: OlderState = "idle";
  private generation = 0;

  private readonly options: HistoryPagerOptions<T>;

  constructor(options: HistoryPagerOptions<T>) {
    this.options = options;
  }

  /** A read of the end, from wherever it came. */
  accept(turns: T[], page?: HistoryPage | null, refresh?: RefreshOptions): LoadedHistory<T> {
    this.loaded = refreshHistory(this.loaded, turns, page, refresh);
    this.options.onChange?.();
    return this.loaded;
  }

  /** Back to the end, on request: what was read stays until the tail arrives, and if it never does. */
  async latest(): Promise<LoadedHistory<T> | undefined> {
    const generation = ++this.generation;
    this.setOlder("idle");
    const read = await this.options.read(null);
    if (generation !== this.generation) return this.loaded;
    this.loaded = undefined;
    return this.accept(read.turns, read.history);
  }

  /**
   * Fetches the page before the window and returns how to put it in, so a list can hold what
   * is being read around it. `null`: nothing to do, a failure (see `older`) or a transcript
   * rewritten under the window, which goes back to the tail. Never ends quietly without progress.
   */
  async fetchOlder(): Promise<(() => void) | null> {
    if (this.older === "loading" || !this.loaded || !hasOlder(this.loaded)) return null;
    const generation = this.generation;
    this.setOlder("loading");
    for (let attempt = 0; attempt < OLDER_ATTEMPTS; attempt++) {
      if (attempt) await new Promise(done => setTimeout(done, this.options.retryMs ?? RETRY_MS));
      if (generation !== this.generation) return null;
      const asked = this.loaded;
      if (!asked || !hasOlder(asked)) return this.settle(generation);
      try {
        const page = await this.options.read(olderCursor(asked));
        if (generation !== this.generation) return null;
        const current = this.loaded;
        if (!current || current.start !== asked.start) continue;
        const merged = prependHistory(current, page.turns, page.history);
        if (!merged) {
          const tail = await this.options.read(null);
          if (generation !== this.generation) return null;
          this.loaded = undefined;
          const fresh = this.accept(tail.turns, tail.history);
          // The same window again means this host will not join: asking again would never end.
          if (fresh.start === asked.start) break;
          return this.settle(generation);
        }
        if (merged.start >= asked.start) continue;
        this.setOlder("idle");
        return () => {
          const now = this.loaded;
          if (generation !== this.generation) return;
          if (now?.start !== asked.start) return this.setOlder("failed");
          // The tail may have moved while the list made room: only the front comes from the page.
          const front = merged.turns.slice(0, asked.start - merged.start);
          this.loaded = bounded({ ...now, start: merged.start, turns: [...front, ...now.turns] }, page.history?.version, "head");
          this.options.onChange?.();
        };
      } catch {
        if (generation !== this.generation) return null;
      }
    }
    this.setOlder("failed");
    return null;
  }

  /** Stop listening: an answer that arrives afterwards changes nothing. */
  close() {
    this.generation++;
    this.setOlder("idle");
  }

  private settle(generation: number) {
    if (generation === this.generation) this.setOlder("idle");
    return null;
  }

  private setOlder(state: OlderState) {
    if (this.older === state) return;
    this.older = state;
    this.options.onChange?.();
  }
}
