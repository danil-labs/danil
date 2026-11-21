/**
 * Renderizado de un turno de mensaje y sus piezas causales (B-015, B-016).
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
          <div class="my-1.5 px-3 py-2 rounded border border-stone-800 bg-stone-900/40 text-xs flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="font-mono text-stone-400">⚡ {piece.name}</span>
              <Show when={piece.target}>
                <span class="font-mono text-stone-500 truncate max-w-xs">{piece.target}</span>
              </Show>
            </div>
            <span class="text-[10px]">
              {piece.status === "running" && <span class="text-amber-400">ejecutando...</span>}
              {piece.status === "completed" && <span class="text-emerald-400">✓ listo</span>}
              {piece.status === "error" && <span class="text-rose-400">✗ error</span>}
            </span>
          </div>
        );

      case "shell":
        return (
          <div class="my-2 rounded border border-stone-800 bg-stone-950 p-2 font-mono text-xs overflow-x-auto">
            <div class="text-stone-400">$ {piece.command}</div>
            <Show when={piece.output}>
              <pre class="text-stone-500 mt-1 whitespace-pre-wrap">{piece.output}</pre>
            </Show>
          </div>
        );

      case "delta":
        return (
          <div class="text-sm text-stone-100 whitespace-pre-wrap leading-relaxed py-1">
            {piece.text}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div
      class={`p-4 border-b border-stone-900/80 transition-colors ${
        isUser() ? "bg-stone-900/30" : "bg-transparent"
      }`}
    >
      <div class="max-w-4xl mx-auto flex flex-col gap-1">
        <div class="flex items-center justify-between text-xs text-stone-400 mb-1">
          <div class="flex items-center gap-2">
            <span class="font-semibold text-stone-300">
              {isUser() ? "Tú" : props.turn.author?.label ?? "Agente"}
            </span>
            <Show when={props.turn.reportedModel ?? props.turn.model}>
              <span class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-stone-800 text-stone-400">
                {props.turn.reportedModel ?? props.turn.model}
              </span>
            </Show>
          </div>

          <Show when={props.turn.status === "streaming"}>
            <span class="text-amber-400 text-[10px] animate-pulse">en curso...</span>
          </Show>
        </div>

        {/* Piezas ordenadas causalmente */}
        <Show
          when={props.turn.pieces.length > 0}
          fallback={
            <div class="text-sm text-stone-100 whitespace-pre-wrap leading-relaxed">
              {props.turn.text}
            </div>
          }
        >
          <For each={props.turn.pieces}>{(piece) => renderPiece(piece)}</For>
        </Show>

        <Show when={props.turn.error}>
          <div class="text-rose-400 text-xs mt-2 italic">⚠ {props.turn.error}</div>
        </Show>
      </div>
    </div>
  );
}
