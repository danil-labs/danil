/**
 * Renderizado de un turno de mensaje y sus piezas causales (B-015, B-016).
 * Paridad visual con apps/desktop/src/features/chat.
 */

import { For, Show } from "solid-js";
import type { ChatTurnView, TurnPiece, QuestionPiece } from "../model.ts";
import { ToolPermissionCard } from "./ToolPermissionCard.tsx";
import { MessageText } from "./MessageText.tsx";
import { Reasoning } from "./Reasoning.tsx";
import { ShellCard } from "./ShellCard.tsx";
import { Timeline } from "./Timeline.tsx";
import { Questions, type Pregunta } from "./Questions.tsx";

export interface MessageItemProps {
  turn: ChatTurnView;
  onPermissionDecide?: (requestId: string, decision: "allow" | "deny") => void;
  onAnswerQuestion?: (requestId: string, answers: unknown[]) => void;
}

function normalizeQuestions(piece: QuestionPiece): Pregunta[] {
  if (Array.isArray(piece.questions) && piece.questions.length > 0) {
    return piece.questions.map((q, idx) => {
      const qObj = (typeof q === "object" && q !== null ? q : {}) as Record<string, unknown>;
      const rawOptions = Array.isArray(qObj.options) ? qObj.options : [];
      return {
        id: typeof qObj.id === "string" ? qObj.id : `q_${idx}`,
        question:
          typeof qObj.question === "string"
            ? qObj.question
            : typeof qObj.text === "string"
            ? qObj.text
            : piece.text || "",
        header: typeof qObj.header === "string" ? qObj.header : null,
        options: rawOptions.map((opt) => {
          if (typeof opt === "string") {
            return { value: opt, label: opt };
          }
          const o = (typeof opt === "object" && opt !== null ? opt : {}) as Record<string, unknown>;
          return {
            value: String(o.value ?? o.id ?? ""),
            label: String(o.label ?? o.text ?? o.value ?? ""),
            detail: typeof o.detail === "string" ? o.detail : null,
          };
        }),
        multiple: Boolean(qObj.multiple || qObj.is_multi_select),
        free_text: qObj.free_text !== false,
      };
    });
  }

  return [
    {
      id: piece.requestId || "q_0",
      question: piece.text || "Pregunta del agente",
      header: null,
      options: [],
      multiple: false,
      free_text: true,
    },
  ];
}

export function MessageItem(props: MessageItemProps) {
  const isUser = () => props.turn.role === "user";

  const renderPiece = (piece: TurnPiece) => {
    switch (piece.kind) {
      case "reasoning":
        return <Reasoning bloques={[{ text: piece.text, durationMs: piece.durationMs }]} />;

      case "permission":
        return (
          <ToolPermissionCard
            permission={piece}
            onDecide={(reqId, decision) => props.onPermissionDecide?.(reqId, decision)}
          />
        );

      case "tool":
        return <Timeline pieces={[piece]} />;

      case "shell":
        return (
          <ShellCard
            command={piece.command}
            output={piece.output}
            exitCode={piece.exitCode}
            vivo={
              piece.status === "running"
                ? { desde: Date.now(), deteniendo: false, onDetener: () => {} }
                : undefined
            }
          />
        );

      case "delta":
        return <MessageText text={piece.text} incoming={!isUser()} />;

      case "question": {
        if (piece.status === "answered") {
          return (
            <div class="rounded-md border border-border bg-surface-muted px-3 py-2 text-xs text-neutral-600 dark:text-neutral-400">
              <span class="font-medium text-neutral-900 dark:text-neutral-200">Pregunta respondida: </span>
              {piece.text}
            </div>
          );
        }
        return (
          <Questions
            turno={props.turn.id}
            items={normalizeQuestions(piece)}
            onAnswer={async (enviadas) => {
              props.onAnswerQuestion?.(piece.requestId, enviadas);
            }}
          />
        );
      }

      default:
        return null;
    }
  };

  return (
    <article class="group/mensaje col-start-1 min-w-0 max-w-full py-2.5 transition-colors">
      <div class="flex items-center justify-between text-xs text-neutral-500 mb-1">
        <div class="flex items-center gap-2">
          <span class="font-semibold text-neutral-900 dark:text-neutral-200">
            {isUser() ? "Tú" : props.turn.author?.label ?? "Agente"}
          </span>
          <Show when={props.turn.reportedModel ?? props.turn.model}>
            <span class="text-2xs font-mono px-1.5 py-0.5 rounded bg-surface-muted text-neutral-500 border border-border">
              {props.turn.reportedModel ?? props.turn.model}
            </span>
          </Show>
        </div>

        <Show when={props.turn.status === "streaming"}>
          <span class="text-warning-strong text-2xs animate-pulse">en curso...</span>
        </Show>
      </div>

      {/* Piezas ordenadas causalmente */}
      <Show
        when={props.turn.pieces.length > 0}
        fallback={
          <MessageText text={props.turn.text} incoming={!isUser()} />
        }
      >
        <For each={props.turn.pieces}>{(piece) => renderPiece(piece)}</For>
      </Show>

      <Show when={props.turn.error}>
        <div class="text-error-strong text-xs mt-2 font-mono">⚠ {props.turn.error}</div>
      </Show>
    </article>
  );
}

export default MessageItem;
