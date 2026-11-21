import {} from "@danil/ui";

export interface TerminalErrorProps {
  message: string;
  onRetry: () => void;
}

/**
 * Componente de visualización de errores con botón de reintento.
 * Cumple con la regla de mostrar errores de API explícitamente con acción de reintento.
 */
export function TerminalError(props: TerminalErrorProps) {
  return (
    <div class="flex items-center justify-between gap-3 bg-red-950/40 border border-red-800/60 rounded px-3 py-2 text-xs text-red-200 m-2">
      <div class="flex items-center gap-2 min-w-0">
        <span class="text-red-400 font-bold">Error:</span>
        <span class="truncate">{props.message}</span>
      </div>
      <button
        type="button"
        onClick={() => props.onRetry()}
        class="shrink-0 px-2.5 py-1 rounded bg-red-800/80 hover:bg-red-700 text-white font-medium transition-colors"
      >
        Reintentar
      </button>
    </div>
  );
}
