/**
 * Bloque visual para el razonamiento / pensamiento profundo del agente (B-015).
 * Paridad visual con apps/desktop/src/features/chat/Reasoning.tsx y TurnActivity.tsx.
 */

import { createSignal, Show } from "solid-js";
import type { ReasoningPiece } from "../model.ts";

function ChevronRight(props: { size?: number; class?: string }) {
  return (
    <svg
      width={props.size ?? 13}
      height={props.size ?? 13}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
      class={props.class}
      aria-hidden="true"
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

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
    <div class="my-1.5 min-w-0">
      <button
        type="button"
        onClick={() => setIsExpanded((prev) => !prev)}
        class="inline-flex min-w-0 max-w-full items-center gap-2 rounded-sm py-1.5 text-left text-ui font-normal text-neutral-500 hover:text-neutral-950 dark:hover:text-neutral-100 outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary"
        aria-expanded={isExpanded()}
      >
        <ChevronRight
          size={13}
          class={`shrink-0 transition-transform motion-reduce:transition-none ${isExpanded() ? "rotate-90" : ""}`}
        />
        <span class="inline-flex min-w-0 items-center gap-1.5">
          <Show
            when={!props.piece.completed}
            fallback={<span class="inline-block w-1.5 h-1.5 rounded-full bg-neutral-400" />}
          >
            <span class="inline-block w-1.5 h-1.5 rounded-full bg-warning-strong animate-pulse" />
          </Show>
          <span class="text-xs">{props.piece.completed ? "Razonamiento" : "Pensando..."}</span>
          <Show when={formattedDuration()}>
            <span class="text-caption text-neutral-400 font-mono">({formattedDuration()})</span>
          </Show>
        </span>
      </button>

      <Show when={isExpanded()}>
        <div
          class="min-w-0 ml-2.5 border-l border-border pl-1.5 mb-2"
          data-reasoning-content=""
        >
          <div class="text-caption whitespace-pre-wrap text-neutral-500 select-text leading-relaxed font-mono px-1 py-1">
            {props.piece.text || "..."}
          </div>
        </div>
      </Show>
    </div>
  );
}
