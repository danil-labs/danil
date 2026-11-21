/**
 * Compositor de mensajes e instrucciones para el agente.
 * Paridad visual con apps/desktop/src/features/chat/Chat.tsx:2161-2685 y ComposerAction.tsx.
 */

import { createSignal, Show } from "solid-js";
import { ArrowUp, Square } from "./icons.tsx";
import { Button } from "@danil/ui";

export interface ComposerProps {
  onSend: (text: string) => Promise<void> | void;
  onStop?: () => Promise<void> | void;
  isSending?: boolean;
  isTurnRunning?: boolean;
  disabled?: boolean;
}

export function Composer(props: ComposerProps) {
  const [text, setText] = createSignal("");

  const handleSubmit = (e?: Event) => {
    e?.preventDefault();
    const val = text().trim();
    if (!val || props.isSending || props.disabled) return;
    props.onSend(val);
    setText("");
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const isStopAction = () => Boolean(props.isTurnRunning && !text().trim());

  return (
    <div class="border-t border-border bg-background p-3">
      <form
        onSubmit={handleSubmit}
        class="mx-auto max-w-[964px] rounded-lg border border-border-strong bg-surface-raised px-1 pt-0.5 pb-1.5 shadow-md transition-colors"
      >
        <div class="relative min-w-0">
          <textarea
            value={text()}
            onInput={(e) => setText(e.currentTarget.value)}
            onKeyDown={handleKeyDown}
            disabled={props.disabled}
            placeholder="Escribe una instrucción o mensaje para el agente (Enter para enviar, Shift+Enter para salto de línea)..."
            rows={1}
            class="relative block w-full max-h-[11.25rem] min-h-10 overflow-y-auto border border-transparent px-2 py-1.5 text-ui leading-[1.4] [font-family:inherit] [scrollbar-gutter:stable] bg-transparent text-neutral-950 dark:text-neutral-100 placeholder:text-neutral-400 outline-none resize-none"
          />
        </div>

        <div class="flex min-w-0 items-center justify-between gap-1 px-2 pt-1 border-t border-border/40">
          <div class="text-caption text-neutral-500">
            Presiona <kbd class="font-mono bg-surface-muted px-1 py-0.5 rounded text-neutral-600 dark:text-neutral-400 text-2xs">Enter</kbd> para enviar
          </div>

          <div class="flex items-center gap-2">
            <Show
              when={isStopAction()}
              fallback={
                <Button
                  type="submit"
                  size="iconCompact"
                  class="shrink-0 rounded-full"
                  disabled={!text().trim() || props.isSending || props.disabled}
                  title="Enviar mensaje"
                  aria-label="Enviar"
                >
                  <ArrowUp size={16} stroke-width={2.5} />
                </Button>
              }
            >
              <Button
                type="button"
                size="iconCompact"
                class="shrink-0 rounded-full bg-neutral-950 text-neutral-50 hover:bg-neutral-900"
                title="Detener turno"
                aria-label="Detener"
                onClick={() => props.onStop?.()}
              >
                <Square size={10} fill="currentColor" stroke-width={2} />
              </Button>
            </Show>
          </div>
        </div>
      </form>
    </div>
  );
}
