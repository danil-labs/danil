/**
 * Cursor de streaming para el canal de chat (B-014).
 *
 * Evita la pérdida o duplicación de deltas tras desconexiones transitorias de red
 * o reinicios del relay. Permite reconciliar el historial persistido con los fragmentos
 * ya renderizados en memoria sin recargar a ciegas.
 */

import type { ChatTurnView, ChatStreamEvent } from "../model.ts";
import type { TurnState } from "../turns/machine.ts";

export interface StreamCursor {
  sessionId: string;
  lastTurnId: string | null;
  lastSegmentId: string | null;
  lastMessageId: string | null;
  deltasReceivedCount: number;
  piecesCount: number;
  lastEventTimestamp: number;
  seenEventIds?: Set<string>;
}

export function createStreamCursor(sessionId: string): StreamCursor {
  return {
    sessionId,
    lastTurnId: null,
    lastSegmentId: null,
    lastMessageId: null,
    deltasReceivedCount: 0,
    piecesCount: 0,
    lastEventTimestamp: Date.now(),
    seenEventIds: new Set<string>(),
  };
}

export function isDuplicateEvent(cursor: StreamCursor, event: ChatStreamEvent): boolean {
  if (!cursor.seenEventIds) return false;
  const eventKey =
    event.segment_id ??
    event.message_id ??
    (event.request_id ? `${event.kind}:${event.request_id}` : null) ??
    (event.kind === "delta" && event.starts_message && event.id ? `start:${event.id}` : null);
  if (!eventKey) return false;
  return cursor.seenEventIds.has(eventKey);
}

export function updateCursorWithEvent(cursor: StreamCursor, event: ChatStreamEvent): void {
  cursor.lastEventTimestamp = Date.now();
  if (!cursor.seenEventIds) {
    cursor.seenEventIds = new Set<string>();
  }
  const eventKey =
    event.segment_id ??
    event.message_id ??
    (event.request_id ? `${event.kind}:${event.request_id}` : null) ??
    (event.kind === "delta" && event.starts_message && event.id ? `start:${event.id}` : null);
  if (eventKey) {
    cursor.seenEventIds.add(eventKey);
    if (cursor.seenEventIds.size > 2000) {
      const iter = cursor.seenEventIds.values();
      for (let i = 0; i < 500; i++) {
        const val = iter.next().value;
        if (val) cursor.seenEventIds.delete(val);
      }
    }
  }
  if (event.segment_id) {
    cursor.lastSegmentId = event.segment_id;
  }
  if (event.message_id) {
    cursor.lastMessageId = event.message_id;
  }
  if (event.kind === "started") {
    cursor.lastTurnId = event.id ?? cursor.lastTurnId;
  }
  if (event.kind === "delta") {
    cursor.deltasReceivedCount += 1;
  }
  if (
    event.kind === "tool" ||
    event.kind === "reasoning" ||
    event.kind === "shell_started" ||
    event.kind === "question"
  ) {
    cursor.piecesCount += 1;
  }
}

/**
 * Reconcilia los turnos persistidos recuperados tras reconexión con el estado
 * vivo en memoria (B-014).
 *
 * Si un turno estaba escribiéndose activamente en memoria:
 * 1. Si el disco ya lo guardó completamente, se usa la versión guardada sin duplicar.
 * 2. Si el disco todavía no lo tiene o lo tiene parcial, se preservan los deltas
 *    en memoria para evitar saltos o pérdida de texto.
 */
export function reconcileHistoryWithMemory(
  persistedTurns: ChatTurnView[],
  activeTurn: TurnState | null,
  cursor: StreamCursor,
): { turns: ChatTurnView[]; activeStillRunning: boolean } {
  if (!activeTurn || activeTurn.pieces.length === 0 || activeTurn.status === "idle") {
    return {
      turns: persistedTurns,
      activeStillRunning: false,
    };
  }

  const activeId = activeTurn.turnId ?? cursor.lastTurnId;
  const matchIndex = activeId ? persistedTurns.findIndex((t) => t.id === activeId) : -1;

  if (matchIndex >= 0) {
    const persisted = persistedTurns[matchIndex];
    // Si la versión persistida ya contiene texto sustancial o está cerrada:
    if (persisted.text.length >= activeTurn.pieces.reduce((acc, p) => acc + (p.kind === "delta" ? p.text.length : 0), 0)) {
      return {
        turns: persistedTurns,
        activeStillRunning: false,
      };
    }

    // Si el turno en memoria tiene más deltas que el guardado parcial:
    const updated = [...persistedTurns];
    updated[matchIndex] = {
      ...persisted,
      pieces: activeTurn.pieces,
      text: activeTurn.pieces
        .filter((p) => p.kind === "delta")
        .map((p) => (p as { text: string }).text)
        .join(""),
      status: activeTurn.status === "settled" ? "completed" : "streaming",
    };
    return {
      turns: updated,
      activeStillRunning: activeTurn.status !== "settled",
    };
  }

  // El turno activo no está todavía en disco: se preserva sin borrarlo
  const activeTurnView: ChatTurnView = {
    id: activeId ?? `turn_active_${Date.now()}`,
    role: "agent",
    text: activeTurn.pieces
      .filter((p) => p.kind === "delta")
      .map((p) => (p as { text: string }).text)
      .join(""),
    pieces: activeTurn.pieces,
    timestamp: cursor.lastEventTimestamp,
    model: activeTurn.model,
    status: activeTurn.status === "settled" ? "completed" : "streaming",
  };

  return {
    turns: [...persistedTurns, activeTurnView],
    activeStillRunning: activeTurn.status !== "settled",
  };
}
