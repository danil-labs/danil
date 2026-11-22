import type { HistoryChunk, HistoryRef } from "../../protocol/src/types.ts";
import type { HistoryRead } from "./history.ts";

const WHOLE_DETAIL_BYTES = 2 * 1024 * 1024;

type RefTurn = { id?: string | null; history_refs?: HistoryRef[] | null };

/**
 * The reference for the same field after the file changed. The engine resolves it by position
 * alone, so the turn is read again and its `id` proves it is still this one; a turn without
 * `id` cannot be proved and stays unread.
 */
export async function currentRef<T extends RefTurn>(read: (before: number) => Promise<HistoryRead<T>>, ref: HistoryRef, turnId: string | null | undefined): Promise<HistoryRef | null> {
  if (!turnId) return null;
  const page = await read(ref.turn + 1);
  const turn = page.turns[ref.turn - (page.history?.start ?? 0)];
  if (turn?.id !== turnId) return null;
  return turn.history_refs?.find(candidate => candidate.pointer === ref.pointer) ?? null;
}

/** All of a field, one piece after the other: `null` when it is over `limit` and must be opened in pieces. */
export async function readWholeDetail(part: (ref: HistoryRef, offset: number) => Promise<HistoryChunk>, ref: HistoryRef, limit = WHOLE_DETAIL_BYTES): Promise<unknown> {
  if (ref.bytes > limit) return null;
  let text = "", offset = 0;
  for (;;) {
    const chunk = await part(ref, offset);
    if (chunk.version !== 1 || chunk.offset !== offset || chunk.revision !== ref.revision || (!chunk.done && chunk.next <= offset)) throw new Error("invalid history chunk");
    text += chunk.text;
    if (chunk.done) return JSON.parse(text);
    offset = chunk.next;
  }
}

const DETAIL_ATTEMPTS = 5;
const DETAIL_RETRY_MS = 150;
let queue: Promise<unknown> = Promise.resolve();

export type DetailReader<T extends RefTurn> = {
  part: (ref: HistoryRef, offset: number) => Promise<HistoryChunk>;
  turns: (before: number) => Promise<HistoryRead<T>>;
};

/**
 * A field as text, retrying around a task that keeps writing. `null`: too large for one read.
 * One at a time: the relay bounds concurrent history reads. Rejects if the turn is no longer this one.
 */
export function readDetailText<T extends RefTurn>(read: DetailReader<T>, ref: HistoryRef, turnId: string | null | undefined): Promise<string | null> {
  const run = async () => {
    let current = ref;
    for (let attempt = 0; ; attempt++) {
      try {
        const whole = await readWholeDetail(read.part, current);
        return whole === null ? null : typeof whole === "string" ? whole : JSON.stringify(whole, null, 2);
      } catch (error) {
        if (attempt >= DETAIL_ATTEMPTS) throw error;
        await new Promise(done => setTimeout(done, DETAIL_RETRY_MS * attempt));
        const fresh = await currentRef(read.turns, ref, turnId).catch(() => undefined);
        if (fresh === null) throw new Error("history_detail_changed");
        if (fresh) current = { ...current, ...fresh };
      }
    }
  };
  const next = queue.then(run, run);
  queue = next.catch(() => {});
  return next;
}
