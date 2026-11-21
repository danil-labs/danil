/**
 * Hooks y consultas reactivas hacia el motor danil-engine.
 *
 * Único archivo de la feature que invoca directamente a @danil/engine-client.
 */

import { createResource, createSignal, createEffect, onCleanup, type Accessor, type Resource } from "solid-js";
import type { EngineClient } from "@danil/engine-client";
import { transcribeSessionTurns, type ChatTurnView, type ChatStreamEvent } from "./model.ts";
import { subscribeToChatEvents } from "./stream/subscription.ts";
import type { StreamCursor } from "./stream/cursor.ts";

export interface SendMessageOptions {
  sessionId: string;
  prompt: string;
  project?: string;
  provider?: string;
  model?: string | null;
  effort?: string | null;
  permissionMode?: string | null;
  attachments?: string[] | null;
}

export interface StopTurnOptions {
  sessionId: string;
  project?: string;
}

export interface RespondPermissionOptions {
  sessionId: string;
  requestId: string;
  allow: boolean;
  revision?: number | null;
}

export interface AnswerQuestionOptions {
  sessionId: string;
  requestId: string;
  answers: unknown[];
  revision?: number | null;
}

/**
 * Consulta del historial de la sesión mediante load_session.
 * Los fallos de la API se preservan como error del recurso para permitir reintento.
 */
export function useSessionHistory(
  client: EngineClient,
  sessionId: Accessor<string>,
  project: Accessor<string | undefined> = () => "",
  onLoaded?: (turns: ChatTurnView[]) => void,
): [Resource<ChatTurnView[]>, { refetch: () => void; mutate: (v: ChatTurnView[]) => void }] {
  const [history, { refetch, mutate }] = createResource(sessionId, async (id) => {
    if (!id) return [];
    const res = await client.load_session({
      project: project() ?? "",
      id,
    });
    const turns = transcribeSessionTurns(res);
    onLoaded?.(turns);
    return turns;
  });

  return [history, { refetch, mutate }];
}

/**
 * Suscripción reactiva a eventos de streaming del motor con cursor.
 */
export function useChatStream(
  client: EngineClient,
  sessionId: Accessor<string>,
  cursor: StreamCursor,
  onEvent: (event: ChatStreamEvent) => void,
): void {
  createEffect(() => {
    const sid = sessionId();
    if (!sid) return;

    const unsubscribe = subscribeToChatEvents({
      source: client,
      sessionId: sid,
      cursor,
      onEvent,
    });

    onCleanup(() => {
      unsubscribe();
    });
  });
}

/**
 * Envío de mensajes al motor.
 */
export function useSendMessage(client: EngineClient) {
  const [isSending, setIsSending] = createSignal(false);
  const [sendError, setSendError] = createSignal<string | null>(null);

  const sendMessage = async (options: SendMessageOptions): Promise<void> => {
    setIsSending(true);
    setSendError(null);
    try {
      await client.send_message({
        provider: options.provider ?? "default",
        project: options.project ?? "",
        session: options.sessionId,
        prompt: options.prompt,
        model: options.model,
        effort: options.effort,
        permissionMode: options.permissionMode,
        attachments: options.attachments,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error al enviar mensaje";
      setSendError(msg);
      throw err;
    } finally {
      setIsSending(false);
    }
  };

  return { sendMessage, isSending, sendError };
}

/**
 * Detención del turno activo en el motor.
 */
export function useStopTurn(client: EngineClient) {
  const [isStopping, setIsStopping] = createSignal(false);

  const stopTurn = async (options: StopTurnOptions): Promise<void> => {
    setIsStopping(true);
    try {
      await client.stop_turn({
        project: options.project ?? "",
        session: options.sessionId,
      });
    } finally {
      setIsStopping(false);
    }
  };

  return { stopTurn, isStopping };
}

/**
 * Respuesta a solicitudes de confirmación / permisos de seguridad.
 */
export function useRespondPermission(client: EngineClient) {
  const [isResponding, setIsResponding] = createSignal(false);

  const respondPermission = async (options: RespondPermissionOptions): Promise<void> => {
    setIsResponding(true);
    try {
      await client.respond_permission({
        session: options.sessionId,
        requestId: options.requestId,
        allow: options.allow,
        revision: options.revision,
      });
    } finally {
      setIsResponding(false);
    }
  };

  return { respondPermission, isResponding };
}

/**
 * Respuesta a preguntas formuladas por el agente.
 */
export function useAnswerQuestion(client: EngineClient) {
  const answerQuestion = async (options: AnswerQuestionOptions): Promise<void> => {
    await client.answer_question({
      session: options.sessionId,
      requestId: options.requestId,
      respuestas: options.answers,
      revision: options.revision,
    });
  };

  return { answerQuestion };
}
