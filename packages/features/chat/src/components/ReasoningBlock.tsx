/**
 * Bloque visual para el razonamiento / pensamiento profundo del agente (B-015).
 *
 * Mantiene la visibilidad del pensamiento durante y después del cierre del turno.
 */

import { createSignal, Show } from "solid-js";
import type { ReasoningPiece } from "../model.ts";

export interface ReasoningBlockProps {
  piece: ReasoningPiece;
  defaultExpanded?: boolean;
}

export function ReasoningBlock(props: ReasoningBlockProps) {
  const [isExpanded, setIsExpanded] = createSignal(props.defaultExpanded ?? !props.piece.completed);

  const formattedDuration = () => {
    if (props.piece.durationMs == null) return null;
    const sec = (props.piece.durationMs / 1000).toFixed(1);
    return `${sec}s`;
  };

  return (
    <div class="my-2 rounded border border-stone-800 bg-stone-900/60 overflow-hidden text-xs">
      <button
        type="button"
        onClick={() => setIsExpanded((prev) => !prev)}
        class="w-full flex items-center justify-between px-3 py-2 text-stone-400 hover:text-stone-200 hover:bg-stone-800/40 transition-colors"
      >
        <div class="flex items-center gap-2">
          <Show
            when={!props.piece.completed}
            fallback={
              <span class="inline-block w-2 h-2 rounded-full bg-emerald-500/70" />
            }
          >
            <span class="inline-block w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
          </Show>
          <span class="font-medium text-stone-300">
            {props.piece.completed ? "Razonamiento" : "Pensando..."}
          </span>
          <Show when={formattedDuration()}>
            <span class="text-stone-500 text-[10px]">({formattedDuration()})</span>
          </Show>
        </div>
        <span class="text-stone-500 transform transition-transform text-[10px]">
          {isExpanded() ? "▲ Ocultar" : "▼ Ver"}
        </span>
      </button>

      <Show when={isExpanded()}>
        <div class="px-3 py-2 border-t border-stone-800/80 bg-stone-950/40 font-mono text-stone-400 whitespace-pre-wrap leading-relaxed select-text">
          {props.piece.text || "..."}
        </div>
      </Show>
    </div>
  );
}
