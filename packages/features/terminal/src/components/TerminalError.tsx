import { Button } from "@danil/ui";

export interface TerminalErrorProps {
  message: string;
  onRetry: () => void;
}

/**
 * Componente de visualización de errores con botón de reintento.
 * Paridad visual con apps/desktop/src/ui/Failure.tsx.
 */
export function TerminalError(props: TerminalErrorProps) {
  return (
    <div class="flex items-center justify-between gap-3 bg-surface-raised border border-border rounded px-3 py-2 text-caption text-error-strong m-2">
      <div class="flex items-center gap-2 min-w-0">
        <span class="font-bold">Error:</span>
        <span class="truncate font-mono">{props.message}</span>
      </div>
      <Button
        type="button"
        variant="secondary"
        size="compact"
        onClick={() => props.onRetry()}
      >
        Reintentar
      </Button>
    </div>
  );
}
