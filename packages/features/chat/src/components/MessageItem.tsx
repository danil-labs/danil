/**
 * Renderizado de un turno de mensaje y sus piezas causales (B-015, B-016).
 * Paridad visual con apps/desktop/src/features/chat/Chat.tsx:3487-3500 y Timeline.tsx:27.
 */

import { For, Show } from "solid-js";
import type { ChatTurnView, TurnPiece } from "../model.ts";
import { ReasoningBlock } from "./ReasoningBlock.tsx";
import { ToolPermissionCard } from "./ToolPermissionCard.tsx";

export interface MessageItemProps {
  turn: ChatTurnView;
  onPermissionDecide?: (requestId: string, decision: "allow" | "deny") => void;
}

export function MessageItem(props: MessageItemProps) {
  const isUser = () => props.turn.role === "user";

  const renderPiece = (piece: TurnPiece) => {
    switch (piece.kind) {
      case "reasoning":
        return <ReasoningBlock piece={piece} />;

      case "permission":
        return (
          <ToolPermissionCard
            permission={piece}
            onDecide={(reqId, decision) => props.onPermissionDecide?.(reqId, decision)}
          />
        );

      case "tool":
        return (
          <div class="my-1 min-w-0 ml-2.5 border-l border-border pl-1.5 py-1 text-xs text-neutral-500 flex items-center justify-between gap-2">
            <div class="flex items-center gap-1.5 min-w-0">
              <span class="font-mono text-neutral-700 dark:text-neutral-300 font-medium">⚡ {piece.name}</span>
              <Show when={piece.target}>
                <span class="font-mono text-neutral-400 truncate max-w-sm">{piece.target}</span>
              </Show>
            </div>
            <span class="text-2xs font-mono shrink-0">
              {piece.status === "running" && <span class="text-warning-strong">ejecutando...</span>}
              {piece.status === "completed" && <span class="text-success-strong">✓</span>}
              {piece.status === "error" && <span class="text-error-strong">✗</span>}
            </span>
          </div>
        );

      case "shell":
        return (
          <div class="my-2 grid min-h-0 min-w-0 overflow-hidden rounded-md bg-terminal text-terminal-text text-xs">
            <div class="flex items-center gap-2 bg-terminal-bar px-3 py-1.5 text-xs text-terminal-muted border-b border-border/20 font-mono">
              <span>$ {piece.command}</span>
            </div>
            <Show when={piece.output}>
              <pre class="m-0 min-h-0 overflow-auto p-3 font-mono text-xs leading-5 break-words whitespace-pre-wrap outline-none text-terminal-text">
                {piece.output}
              </pre>
            </Show>
          </div>
        );

      case "delta":
        return (
          <div class="text-sm text-neutral-900 dark:text-neutral-100 whitespace-pre-wrap leading-relaxed py-1">
            {piece.text}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <article
      class="group/mensaje col-start-1 min-w-0 max-w-full py-2.5 transition-colors"
    >
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
          <div class="text-sm text-neutral-900 dark:text-neutral-100 whitespace-pre-wrap leading-relaxed py-1">
            {props.turn.text}
          </div>
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
