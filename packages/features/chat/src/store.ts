/**
 * Store reactivo para la sesión de chat y orquestación de turnos.
 *
 * Integra la máquina de estados de turno (B-015) y el cursor de streaming (B-014)
 * en un único estado reactivo predecible.
 */

import { createStore } from "solid-js/store";
import type { ChatTurnView, ChatStreamEvent } from "./model.ts";
import {
  createInitialTurnState,
  turnReducer,
  type TurnState,
  type TurnEvent,
} from "./turns/machine.ts";
import {
  createStreamCursor,
  reconcileHistoryWithMemory,
  type StreamCursor,
} from "./stream/cursor.ts";

export interface ChatStoreState {
  sessionId: string;
  history: ChatTurnView[];
  activeTurn: TurnState;
  cursor: StreamCursor;
  error: string | null;
}

export function createChatStore(sessionId: string) {
  const [state, setState] = createStore<ChatStoreState>({
    sessionId,
    history: [],
    activeTurn: createInitialTurnState(),
    cursor: createStreamCursor(sessionId),
    error: null,
  });

  /**
   * Reconcilia el historial persistido con el estado vivo en memoria (B-014).
   */
  const setHistory = (persistedTurns: ChatTurnView[]) => {
    const { turns, activeStillRunning } = reconcileHistoryWithMemory(
      persistedTurns,
      state.activeTurn,
      state.cursor,
    );

    setState("history", turns);
    if (!activeStillRunning && state.activeTurn.status === "settled") {
      setState("activeTurn", createInitialTurnState());
    }
  };

  /**
   * Despacha un evento de streaming hacia la máquina de turnos (B-015).
   */
  const handleStreamEvent = (event: ChatStreamEvent) => {
    let turnEvent: TurnEvent | null = null;

    switch (event.kind) {
      case "started":
        turnEvent = { type: "START", turnId: event.id, model: event.model ?? undefined };
        break;

      case "reasoning":
        turnEvent = {
          type: "REASONING",
          text: event.text,
          messageId: event.message_id,
          durationMs: event.duration_ms ?? undefined,
          requestId: event.request_id ?? undefined,
        };
        break;

      case "delta":
        turnEvent = {
          type: "DELTA",
          text: event.text,
          messageId: event.message_id,
          startsMessage: event.starts_message,
          requestId: event.request_id ?? undefined,
        };
        break;

      case "tool":
        turnEvent = {
          type: "TOOL_START",
          id: event.id ?? event.request_id ?? `tool_${Date.now()}`,
          name: event.text || "tool",
          target: event.target,
          detail: event.detail,
          requestId: event.request_id ?? undefined,
        };
        break;

      case "tool_done":
        turnEvent = {
          type: "TOOL_DONE",
          id: event.id ?? event.request_id ?? "",
          ok: event.ok ?? null,
          detail: event.detail,
          requestId: event.request_id ?? undefined,
        };
        break;

      case "shell_started":
        turnEvent = {
          type: "SHELL_START",
          id: event.id ?? `shell_${Date.now()}`,
          command: event.text,
        };
        break;

      case "shell_output":
        turnEvent = {
          type: "SHELL_OUTPUT",
          id: event.id ?? "",
          text: event.text,
        };
        break;

      case "shell_done":
        turnEvent = {
          type: "SHELL_DONE",
          id: event.id ?? "",
          exitCode: event.ok ? 0 : 1,
        };
        break;

      case "permission":
        turnEvent = {
          type: "PERMISSION_REQUEST",
          requestId: event.request_id ?? `req_${Date.now()}`,
          toolName: event.text,
          target: event.target,
        };
        break;

      case "permission_resolved":
        turnEvent = {
          type: "PERMISSION_RESOLVE",
          requestId: event.request_id ?? "",
          decision: event.ok ? "allow" : "deny",
        };
        break;

      case "question":
        turnEvent = {
          type: "QUESTION_REQUEST",
          requestId: event.request_id ?? `q_${Date.now()}`,
          text: event.text,
          questions: event.questions ?? (Array.isArray(event.detail) ? event.detail : undefined),
        };
        break;

      case "question_answered":
        turnEvent = {
          type: "QUESTION_ANSWER",
          requestId: event.request_id ?? "",
          answers: event.answers ?? (Array.isArray(event.detail) ? event.detail : []),
        };
        break;

      case "done":
        turnEvent = { type: "FINISH", ok: event.ok ?? true };
        break;

      default:
        break;
    }

    if (turnEvent) {
      const nextTurnState = turnReducer(state.activeTurn, turnEvent);
      setState("activeTurn", nextTurnState);

      // Si el turno ha terminado, lo archivamos en el historial consolidado
      if (nextTurnState.status === "settled" && nextTurnState.pieces.length > 0) {
        const settledTurn: ChatTurnView = {
          id: nextTurnState.turnId ?? `turn_${Date.now()}`,
          role: "agent",
          text: nextTurnState.pieces
            .filter((p) => p.kind === "delta")
            .map((p) => (p as { text: string }).text)
            .join(""),
          pieces: nextTurnState.pieces,
          status: "completed",
          model: nextTurnState.model,
          timestamp: Date.now(),
        };

        setState("history", (prev) => [...prev, settledTurn]);
        setState("activeTurn", createInitialTurnState());
      }
    }
  };

  /**
   * Añade el mensaje optimista del usuario al historial.
   */
  const addUserMessage = (text: string, turnId?: string) => {
    const userTurn: ChatTurnView = {
      id: turnId ?? `user_turn_${Date.now()}`,
      role: "user",
      text,
      pieces: [
        {
          id: `delta_${Date.now()}`,
          kind: "delta",
          text,
        },
      ],
      timestamp: Date.now(),
      status: "completed",
    };

    setState("history", (prev) => [...prev, userTurn]);
    setState("activeTurn", createInitialTurnState());
  };

  const resolvePermission = (requestId: string, decision: "allow" | "deny") => {
    const nextTurnState = turnReducer(state.activeTurn, {
      type: "PERMISSION_RESOLVE",
      requestId,
      decision,
    });
    setState("activeTurn", nextTurnState);
  };

  const answerQuestion = (requestId: string, answers: unknown[]) => {
    const nextTurnState = turnReducer(state.activeTurn, {
      type: "QUESTION_ANSWER",
      requestId,
      answers,
    });
    setState("activeTurn", nextTurnState);
  };

  const setError = (error: string | null) => {
    setState("error", error);
  };

  const reset = () => {
    setState("history", []);
    setState("activeTurn", createInitialTurnState());
    setState("cursor", createStreamCursor(sessionId));
    setState("error", null);
  };

  return {
    state,
    setHistory,
    handleStreamEvent,
    addUserMessage,
    resolvePermission,
    answerQuestion,
    setError,
    reset,
  };
}
