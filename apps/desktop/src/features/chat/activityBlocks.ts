import type { TurnActivity } from "../../lib/turnActivity.ts";
import type { Paso } from "../../lib/steps.ts";

type LiveMessage = { nativeMessageId?: string; turno?: string; duration_ms?: number; preguntas?: unknown[] };
export type ActivityChunk<M> = { pasos: Paso[]; msg: M; outside?: true };
export type ActivityBlock<M> =
  | { tipo: "msg"; msg: M; i: number }
  | { tipo: "pasos"; pasos: Paso[]; i: number; avance?: ActivityChunk<M>[] }
  | { tipo: "trabajo"; pasos: Paso[]; msg: M; i: number; avance?: ActivityChunk<M>[] };

/** Stream message IDs identify live progress; completed or unknown history stays separate. */
export function coalesceLiveActivity<M extends LiveMessage>(blocks: ActivityBlock<M>[], active: boolean): ActivityBlock<M>[] {
  if (!active) return blocks;
  const last = blocks.at(-1);
  const live = (message: M) => Boolean(message.nativeMessageId && (!message.turno || Boolean(message.preguntas?.length)) && message.duration_ms === undefined);
  if (!last || last.tipo === "msg" || (last.tipo === "trabajo" && !live(last.msg))) return blocks;
  let first = blocks.length - 1;
  const progress: ActivityChunk<M>[] = [];
  for (let previous = blocks[first - 1]; previous?.tipo === "trabajo" && live(previous.msg); previous = blocks[first - 1]) {
    progress.unshift(...(previous.avance ?? []), { pasos: previous.pasos, msg: previous.msg, outside: true });
    first--;
  }
  if (first === blocks.length - 1) return blocks;
  return [...blocks.slice(0, first), { ...last, i: blocks[first].i, avance: [...progress, ...(last.avance ?? [])] }];
}

/** Only visible answers are searchable; historical explicit progress stays in its fold. */
export function visibleActivityMessages<M>(block: ActivityBlock<M>): M[] {
  return [...(block.tipo === "msg" ? [] : block.avance?.filter(chunk => chunk.outside).map(chunk => chunk.msg) ?? []), ...(block.tipo === "pasos" ? [] : [block.msg])];
}

export type PresentedActivityBlock<M> = ActivityBlock<M> & { activity?: TurnActivity<M>; responseOnly?: boolean };
/** Interleave a semantic activity anchor; response objects and their order never change. */
export function placeActivities<M>(blocks: PresentedActivityBlock<M>[], activities: readonly TurnActivity<M>[]): PresentedActivityBlock<M>[] {
  const pending = [...activities].sort((a, b) => a.anchorIndex - b.anchorIndex);
  const result: PresentedActivityBlock<M>[] = [];
  let next = 0;
  for (const block of blocks) {
    while (next < pending.length && pending[next].anchorIndex <= block.i) {
      const activity = pending[next++]; result.push({ tipo: "pasos", pasos: [], i: activity.anchorIndex, activity });
    }
    result.push(block);
  }
  for (; next < pending.length; next++) { const activity = pending[next]; result.push({ tipo: "pasos", pasos: [], i: activity.anchorIndex, activity }); }
  return result;
}

/** A manual shell card is its own output, even when it also carries a step. */
export function isActivityOnlyMessage(message: { shell?: unknown; paso?: unknown; permission?: unknown; role?: string; meta?: string }): boolean {
  return !message.shell && Boolean(message.paso || message.permission || (message.role === "system" && message.meta === "usó"));
}
