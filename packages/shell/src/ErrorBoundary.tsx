import { ErrorBoundary as SolidErrorBoundary, type JSX, type ParentProps } from "solid-js";
import { Button, FailureNote, asFailure } from "@danil/ui";

export function RailErrorBoundary(props: ParentProps): JSX.Element {
  return (
    <SolidErrorBoundary
      fallback={(err, reset) => (
        <div class="flex flex-col items-center gap-2 p-2 text-center text-xs text-error">
          <span title={String(err)}>⚠</span>
          <Button size="compact" variant="secondary" onClick={reset}>
            Reintentar
          </Button>
        </div>
      )}
    >
      {props.children}
    </SolidErrorBoundary>
  );
}

export function MainErrorBoundary(props: ParentProps): JSX.Element {
  return (
    <SolidErrorBoundary
      fallback={(err, reset) => (
        <div class="flex h-full w-full flex-col items-center justify-center gap-4 bg-bg p-8 text-center text-neutral-950 dark:text-neutral-100">
          <FailureNote f={asFailure(err)} />
          <Button onClick={reset}>
            Reintentar
          </Button>
        </div>
      )}
    >
      {props.children}
    </SolidErrorBoundary>
  );
}
