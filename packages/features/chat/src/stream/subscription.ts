/**
 * Gestor de suscripción a eventos de streaming con cursor (B-014).
 *
 * Despacha eventos 'chat' al consumidor actualizando el cursor de forma segura.
 */

import { parseChatEvent, type ChatStreamEvent } from "../model.ts";
import { updateCursorWithEvent, type StreamCursor } from "./cursor.ts";

export interface EventStreamSource {
  subscribe(event: string, cb: (payload: unknown) => void): () => void;
}

export interface StreamSubscriptionOptions {
  source: EventStreamSource;
  sessionId: string;
  cursor: StreamCursor;
  onEvent: (event: ChatStreamEvent) => void;
  onError?: (err: Error) => void;
}

export function subscribeToChatEvents(options: StreamSubscriptionOptions): () => void {
  const { source, sessionId, cursor, onEvent, onError } = options;

  try {
    const unsubscribe = source.subscribe("chat", (rawPayload) => {
      try {
        const parsed = parseChatEvent(rawPayload);
        if (!parsed) return;
        if (parsed.session !== sessionId) return;

        updateCursorWithEvent(cursor, parsed);
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
