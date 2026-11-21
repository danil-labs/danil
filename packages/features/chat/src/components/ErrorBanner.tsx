/**
 * Banner de error con botón de reintento para fallos de la API.
 */

import { Show } from "solid-js";

export interface ErrorBannerProps {
  message: string;
  onRetry?: () => void;
  isRetrying?: boolean;
}

export function ErrorBanner(props: ErrorBannerProps) {
  return (
    <div class="m-4 p-4 rounded-lg border border-rose-800/40 bg-rose-950/20 text-stone-200">
      <div class="flex items-start justify-between gap-3">
        <div class="flex items-start gap-2">
          <span class="text-rose-400 font-bold text-base leading-none">⚠</span>
          <div>
            <h4 class="font-medium text-rose-300 text-sm">Error al cargar o sincronizar</h4>
            <p class="text-xs text-stone-300 mt-1">{props.message}</p>
          </div>
        </div>
        <Show when={props.onRetry}>
          <button
            type="button"
            disabled={props.isRetrying}
            onClick={() => props.onRetry?.()}
            class="px-3 py-1.5 rounded bg-rose-700 hover:bg-rose-600 text-white text-xs font-medium transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            {props.isRetrying ? "Reintentando..." : "Reintentar"}
          </button>
        </Show>
      </div>
    </div>
  );
}
