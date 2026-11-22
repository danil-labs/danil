import type { JSX } from "solid-js";
import { cn } from "../../../../../apps/desktop/src/lib/utils";

const FILA =
  "relative flex min-h-9 w-full items-center gap-2 rounded-md border px-2.5 py-1.5 text-left text-sm";

/** El círculo de la derecha: el número que la elige, o el lápiz de «Otra». */
function Insignia(props: { puesta: boolean; children: JSX.Element }) {
  return (
    <span
      aria-hidden="true"
      class={cn(
        "inline-flex size-5 shrink-0 items-center justify-center rounded-full border text-caption font-semibold tabular-nums transition-colors duration-150 ease-out",
        props.puesta
          ? "border-neutral-950 bg-neutral-950 text-surface-raised"
          : "border-border-strong text-neutral-500",
      )}
    >
      {props.children}
    </span>
  );
}

export { FILA, Insignia };
