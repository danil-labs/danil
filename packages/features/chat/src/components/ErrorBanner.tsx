/**
 * Banner de error con botón de reintento para fallos de la API.
 * Paridad visual con apps/desktop/src/ui/Failure.tsx.
 */

import { Show } from "solid-js";
import { FailureNote, asFailure, Button } from "@danil/ui";

export interface ErrorBannerProps {
  message: string;
  onRetry?: () => void;
  isRetrying?: boolean;
}

export function ErrorBanner(props: ErrorBannerProps) {
  return (
    <div class="m-4 flex items-start justify-between gap-3 rounded-lg border border-border bg-surface-raised p-4">
      <FailureNote f={asFailure(props.message)} />
      <Show when={props.onRetry}>
        <Button
          type="button"
          variant="secondary"
          size="compact"
          disabled={props.isRetrying}
          onClick={() => props.onRetry?.()}
          class="shrink-0"
        >
          {props.isRetrying ? "Reintentando..." : "Reintentar"}
        </Button>
      </Show>
    </div>
  );
}
