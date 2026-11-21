/**
 * Gestor de suscripción a eventos de streaming con cursor (B-014).
 *
 * Despacha eventos 'chat' al consumidor actualizando el cursor de forma segura.
 */

import { parseChatEvent, type ChatStreamEvent } from "../model.ts";
import { updateCursorWithEvent, isDuplicateEvent, createStreamCursor, type StreamCursor } from "./cursor.ts";

export interface EventStreamSource {
  subscribe(event: string, cb: (payload: unknown) => void): () => void;
}

export interface StreamSubscriptionOptions {
  source: EventStreamSource;
  sessionId: string;
  cursor?: StreamCursor;
  onCursorUpdate?: (cursor: StreamCursor) => void;
  onEvent: (event: ChatStreamEvent) => void;
  onError?: (err: Error) => void;
}

export function subscribeToChatEvents(options: StreamSubscriptionOptions): () => void {
  const { source, sessionId, onEvent, onError, onCursorUpdate } = options;
  // B-014 / RV1 #13: el cursor debe ser un objeto plano en memoria, nunca un proxy de Solid
  const cursor = options.cursor ?? createStreamCursor(sessionId);

  try {
    const unsubscribe = source.subscribe("chat", (rawPayload) => {
      try {
        const parsed = parseChatEvent(rawPayload);
        if (!parsed) return;
        if (parsed.session !== sessionId) return;

        // B-014: descarta eventos duplicados retransmitidos durante reconexión
        if (isDuplicateEvent(cursor, parsed)) {
          return;
        }

        updateCursorWithEvent(cursor, parsed);
        onCursorUpdate?.(cursor);
        onEvent(parsed);
      } catch (err) {
        if (onError && err instanceof Error) {
          onError(err);
        }
      }
    });

    return unsubscribe;
  } catch (err) {
    if (onError && err instanceof Error) {
      onError(err);
    }
    return () => {};
  }
}
