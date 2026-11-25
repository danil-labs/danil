import type { ObservedTurnActivity as TurnActivity } from "./activityObservation.ts";
import type { Paso } from "../../../../ui/src/lib/steps.ts";
import type { Razonamiento } from "./messageTypes.ts";

type LiveMessage = {
  role?: string;
  text?: string;
  meta?: string;
  nativeMessageId?: string;
  turno?: string;
  duration_ms?: number;
  preguntas?: unknown[];
  images?: unknown[];
  historyRefs?: unknown[];
  artefactos?: unknown[];
  razonamiento?: Razonamiento[];
  paso?: Paso;
  permission?: unknown;
  respuestas?: unknown[];
  shell?: unknown;
  inyectado?: unknown;
};
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

export type PresentedActivityBlock<M> = ActivityBlock<M> & { activity?: TurnActivity<M>; responseOnly?: boolean; failedBeforeError?: boolean };
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

function hasVisibleAnswer<M extends LiveMessage>(message: M): boolean {
  return Boolean(
    message.text?.trim()
    || message.preguntas?.length
    || message.images?.length
    || message.historyRefs?.length
    || message.artefactos?.length,
  );
}

function hasVisibleOutsideProgress<M extends LiveMessage>(avance: readonly ActivityChunk<M>[] | undefined): boolean {
  return Boolean(avance?.some((chunk) => chunk.outside && hasVisibleAnswer(chunk.msg)));
}

function isTurnBoundary<M extends LiveMessage>(block: PresentedActivityBlock<M>): boolean {
  if (block.activity) return true;
  if (block.tipo !== "msg") return false;
  const m = block.msg;
  return m.role === "user" && !m.permission && !m.respuestas?.length && !m.shell && !m.inyectado;
}

const stepSemanticKey = (step: Paso) =>
  `${step.clase}\u0000${step.nombre}\u0000${step.objetivo ?? ""}`;

function mergeExtraWorkIntoActivity<M extends LiveMessage>(
  activity: TurnActivity<M>,
  extraPasos: readonly Paso[],
  extraReasoning: readonly Razonamiento[],
  extraDurationMs: number | null,
): TurnActivity<M> {
  if (!extraPasos.length && !extraReasoning.length && (extraDurationMs == null || activity.durationMs != null)) {
    return activity;
  }
  const existingIds = new Set<string>();
  const existingSemanticCounts = new Map<string, number>();
  for (const m of activity.messages) {
    if (m.paso) {
      if (m.paso.id) existingIds.add(m.paso.id);
      const key = stepSemanticKey(m.paso);
      existingSemanticCounts.set(key, (existingSemanticCounts.get(key) ?? 0) + 1);
    }
  }
  const seenSemanticCounts = new Map<string, number>();
  const addedMessages: M[] = [];
  for (const step of extraPasos) {
    if (step.id && existingIds.has(step.id)) continue;
    const key = stepSemanticKey(step);
    const seen = (seenSemanticCounts.get(key) ?? 0) + 1;
    seenSemanticCounts.set(key, seen);
    if (seen <= (existingSemanticCounts.get(key) ?? 0)) continue;
    if (step.id) existingIds.add(step.id);
    addedMessages.push({ role: "system", text: step.nombre, meta: "usó", paso: step } as M);
  }
  const existingReasoning = new Set(
    activity.messages.flatMap((m) => (m.razonamiento ?? []).map((r) => r.text.trim())).filter(Boolean),
  );
  const newReasoning = extraReasoning.filter((r) => {
    const key = r.text.trim();
    if (!key || existingReasoning.has(key)) return false;
    existingReasoning.add(key);
    return true;
  });
  if (newReasoning.length > 0) {
    addedMessages.push({ role: "agent", text: "", razonamiento: newReasoning } as M);
  }
  const nextDuration = activity.durationMs ?? extraDurationMs;
  if (addedMessages.length === 0 && nextDuration === activity.durationMs) return activity;
  return {
    ...activity,
    durationMs: nextDuration,
    messages: addedMessages.length > 0 ? [...activity.messages, ...addedMessages] : activity.messages,
  };
}

/**
 * Guarantees a single activity fold per assistant turn span:
 * 1. Consecutive work-only legacy blocks (empty-text thinking/tool turns) fold into one block.
 * 2. Any unowned `pasos` or `trabajo` work headers inside an `activity` span (from mid-turn
 *    `segment_saved` or disk re-reads without WeakMap ownership) are absorbed into that single
 *    `activity` header so a turn never shows duplicate «Trabajo >», «Trabajó durante Xs >» or
 *    a second «Preparando…» spinner.
 */
export function consolidateTurnActivities<M extends LiveMessage>(
  blocks: readonly PresentedActivityBlock<M>[],
): PresentedActivityBlock<M>[] {
  // Pass 1: absorb unowned work headers inside each `activity` turn span.
  const absorbed = new Set<number>();
  const updates = new Map<number, PresentedActivityBlock<M>>();
  for (let i = 0; i < blocks.length; i++) {
    const current = blocks[i];
    if (!current.activity) continue;
    const extraPasos: Paso[] = [];
    const extraReasoning: Razonamiento[] = [];
    let extraDurationMs: number | null = null;
    for (let j = i + 1; j < blocks.length; j++) {
      const candidate = blocks[j];
      if (isTurnBoundary(candidate)) break;
      if (candidate.tipo === "pasos" && !candidate.activity) {
        if (candidate.pasos.length) extraPasos.push(...candidate.pasos);
        if (candidate.avance?.length) {
          for (const chunk of candidate.avance) {
            if (chunk.pasos.length) extraPasos.push(...chunk.pasos);
            if (chunk.msg.razonamiento?.length) extraReasoning.push(...chunk.msg.razonamiento);
          }
        }
        if (!hasVisibleOutsideProgress(candidate.avance)) absorbed.add(j);
        continue;
      }
      if (candidate.tipo === "trabajo" && !candidate.responseOnly) {
        if (candidate.pasos.length) extraPasos.push(...candidate.pasos);
        if (candidate.msg.razonamiento?.length) extraReasoning.push(...candidate.msg.razonamiento);
        if (candidate.avance?.length) {
          for (const chunk of candidate.avance) {
            if (chunk.pasos.length) extraPasos.push(...chunk.pasos);
            if (chunk.msg.razonamiento?.length) extraReasoning.push(...chunk.msg.razonamiento);
          }
        }
        if (extraDurationMs == null && candidate.msg.duration_ms !== undefined) {
          extraDurationMs = candidate.msg.duration_ms;
        }
        if (hasVisibleAnswer(candidate.msg) || hasVisibleOutsideProgress(candidate.avance)) {
          updates.set(j, { ...candidate, pasos: [], responseOnly: true });
        } else {
          absorbed.add(j);
        }
      }
    }
    const merged = mergeExtraWorkIntoActivity(current.activity, extraPasos, extraReasoning, extraDurationMs);
    if (merged !== current.activity) updates.set(i, { ...current, activity: merged });
  }

  const afterActivityPass: PresentedActivityBlock<M>[] = [];
  for (let i = 0; i < blocks.length; i++) {
    if (absorbed.has(i)) continue;
    afterActivityPass.push(updates.get(i) ?? blocks[i]);
  }

  // Pass 2: collapse consecutive legacy work-only blocks (e.g. multi-segment persisted turns without prose).
  const result: PresentedActivityBlock<M>[] = [];
  for (const block of afterActivityPass) {
    const prev = result.at(-1);
    const prevIsLegacyPasos = prev && prev.tipo === "pasos" && !prev.activity && !hasVisibleOutsideProgress(prev.avance);
    const prevIsWorkOnlyTrabajo =
      prev && prev.tipo === "trabajo" && !prev.responseOnly && !hasVisibleAnswer(prev.msg) && !hasVisibleOutsideProgress(prev.avance);
    if (block.tipo === "pasos" && !block.activity && !hasVisibleOutsideProgress(block.avance)) {
      if (prevIsLegacyPasos) {
        result[result.length - 1] = {
          ...prev,
          pasos: [...prev.pasos, ...block.pasos],
          failedBeforeError: prev.failedBeforeError || block.failedBeforeError,
        };
        continue;
      }
      if (prevIsWorkOnlyTrabajo) {
        result[result.length - 1] = {
          tipo: "pasos",
          i: prev.i,
          pasos: [...prev.pasos, ...block.pasos],
          avance: [...(prev.avance ?? []), ...(prev.msg.razonamiento?.length ? [{ pasos: [], msg: prev.msg }] : [])],
          failedBeforeError: block.failedBeforeError,
        };
        continue;
      }
    }
    if (block.tipo === "trabajo" && !block.responseOnly) {
      if (prevIsLegacyPasos) {
        result[result.length - 1] = {
          ...block,
          i: prev.i,
          pasos: [...prev.pasos, ...block.pasos],
          avance: [...(prev.avance ?? []), ...(block.avance ?? [])],
        };
        continue;
      }
      if (prevIsWorkOnlyTrabajo) {
        const mergedReasoning = [...(prev.msg.razonamiento ?? []), ...(block.msg.razonamiento ?? [])];
        result[result.length - 1] = {
          ...block,
          i: prev.i,
          pasos: [...prev.pasos, ...block.pasos],
          avance: [...(prev.avance ?? []), ...(block.avance ?? [])],
          msg: mergedReasoning.length ? { ...block.msg, razonamiento: mergedReasoning } : block.msg,
        };
        continue;
      }
    }
    result.push(block);
  }
  return result;
}
