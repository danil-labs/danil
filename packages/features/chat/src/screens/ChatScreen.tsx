/**
 * Pantalla principal del Chat y orquestación de turnos del agente.
 */

import { createEffect, For, Show } from "solid-js";
import type { EngineClient } from "@danil/engine-client";
import { createChatStore } from "../store.ts";
import {
  useSessionHistory,
  useChatStream,
  useSendMessage,
  useStopTurn,
  useRespondPermission,
} from "../queries.ts";
import { MessageItem } from "../components/MessageItem.tsx";
import { Composer } from "../components/Composer.tsx";
import { ErrorBanner } from "../components/ErrorBanner.tsx";
import type { ChatTurnView } from "../model.ts";

export interface ChatScreenProps {
  conn: EngineClient;
  sessionId: string;
  project?: string;
}

export function ChatScreen(props: ChatScreenProps) {
  const store = createChatStore(props.sessionId);

  // Consulta del historial de la sesión
  const [historyResource, { refetch }] = useSessionHistory(
    props.conn,
    () => props.sessionId,
    () => props.project,
  );

  // Sincronizar el historial persistido con el store (B-014)
  createEffect(() => {
    const data = historyResource();
    if (data) {
      store.setHistory(data);
    }
  });

  // Suscripción de streaming reactiva con cursor
  useChatStream(
    props.conn,
    () => props.sessionId,
    store.state.cursor,
    (ev) => {
      store.handleStreamEvent(ev);
    },
  );

  const { sendMessage, isSending, sendError } = useSendMessage(props.conn);
  const { stopTurn, isStopping } = useStopTurn(props.conn);
  const { respondPermission, isResponding } = useRespondPermission(props.conn);

  const handleSend = async (prompt: string) => {
    try {
      store.addUserMessage(prompt);
      await sendMessage({
        sessionId: props.sessionId,
        prompt,
        project: props.project,
      });
    } catch {
      // El error se gestiona mediante sendError reactivo
    }
  };

  const handleStop = async () => {
    await stopTurn({
      sessionId: props.sessionId,
      project: props.project,
    });
  };

  const handlePermissionDecide = async (requestId: string, decision: "allow" | "deny") => {
    try {
      store.resolvePermission(requestId, decision);
      await respondPermission({
        sessionId: props.sessionId,
        requestId,
        allow: decision === "allow",
      });
    } catch {
      // Revertir o reportar si falla
    }
  };

  // Convertir el turno en vuelo en vista de turno si está activo
  const activeTurnView = (): ChatTurnView | null => {
    const at = store.state.activeTurn;
    if (at.status === "idle" || at.pieces.length === 0) return null;
    return {
      id: at.turnId ?? "active_turn",
      role: "agent",
      text: at.pieces
        .filter((p) => p.kind === "delta")
        .map((p) => (p as { text: string }).text)
        .join(""),
      pieces: at.pieces,
      status: "streaming",
      model: at.model,
      error: at.error,
    };
  };

  const isTurnRunning = () =>
    store.state.activeTurn.status === "running" ||
    store.state.activeTurn.status === "waiting_permission";

  return (
    <div class="flex flex-col h-full w-full bg-stone-950 text-stone-100 overflow-hidden">
      {/* Barra superior de estado */}
      <header class="px-4 py-2 border-b border-stone-800/80 bg-stone-900/40 flex items-center justify-between text-xs">
        <div class="flex items-center gap-2">
          <span class="w-2 h-2 rounded-full bg-emerald-500" />
          <span class="font-mono text-stone-400 truncate max-w-sm">
            Sesión: {props.sessionId}
          </span>
        </div>
        <Show when={isTurnRunning()}>
          <div class="flex items-center gap-1.5 text-amber-400">
            <span class="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
            <span>Turno activo</span>
          </div>
        </Show>
      </header>

      {/* Área scrollable de mensajes */}
      <main class="flex-1 overflow-y-auto">
        <Show when={historyResource.error}>
          <ErrorBanner
            message={
              historyResource.error instanceof Error
                ? historyResource.error.message
                : "No se pudo cargar la conversación"
            }
            onRetry={refetch}
            isRetrying={historyResource.loading}
          />
        </Show>

        <Show when={sendError()}>
          <ErrorBanner message={sendError()!} />
        </Show>

        <Show
          when={!historyResource.loading || store.state.history.length > 0}
          fallback={
            <div class="p-8 text-center text-stone-500 text-sm">
              Cargando historial de la sesión...
            </div>
          }
        >
          <For each={store.state.history}>
            {(turn) => (
              <MessageItem
                turn={turn}
                onPermissionDecide={handlePermissionDecide}
              />
            )}
          </For>

          <Show when={activeTurnView()}>
            {(at) => (
              <MessageItem
                turn={at()}
                onPermissionDecide={handlePermissionDecide}
              />
            )}
          </Show>
        </Show>
      </main>

      {/* Compositor de entrada */}
      <Composer
        onSend={handleSend}
        onStop={handleStop}
        isSending={isSending()}
        isTurnRunning={isTurnRunning() || isStopping()}
        disabled={isResponding()}
      />
    </div>
  );
}
