/**
 * Compositor de mensajes e instrucciones para el agente.
 */

import { createSignal, Show } from "solid-js";

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

  return (
    <div class="border-t border-stone-800 bg-stone-900/90 p-3">
      <form onSubmit={handleSubmit} class="flex flex-col gap-2 max-w-4xl mx-auto">
        <div class="relative rounded-lg border border-stone-700 bg-stone-950/60 focus-within:border-stone-500 transition-colors">
          <textarea
            value={text()}
            onInput={(e) => setText(e.currentTarget.value)}
            onKeyDown={handleKeyDown}
            disabled={props.disabled}
            placeholder="Escribe una instrucción o mensaje para el agente (Enter para enviar, Shift+Enter para salto de línea)..."
            rows={2}
            class="w-full resize-none bg-transparent p-3 text-sm text-stone-100 placeholder-stone-500 focus:outline-none"
          />

          <div class="flex items-center justify-between px-3 py-2 border-t border-stone-800/60">
            <div class="text-[11px] text-stone-500">
              Presiona <kbd class="font-mono bg-stone-800 px-1 rounded text-stone-400">Enter</kbd> para enviar
            </div>

            <div class="flex items-center gap-2">
              <Show when={props.isTurnRunning && props.onStop}>
                <button
                  type="button"
                  onClick={() => props.onStop?.()}
                  class="px-3 py-1 rounded bg-rose-600/80 hover:bg-rose-500 text-white text-xs font-medium transition-colors"
                >
                  Detener
                </button>
              </Show>

              <button
                type="submit"
                disabled={!text().trim() || props.isSending || props.disabled}
                class="px-3 py-1 rounded bg-stone-100 hover:bg-white text-stone-900 text-xs font-medium transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {props.isSending ? "Enviando..." : "Enviar"}
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
