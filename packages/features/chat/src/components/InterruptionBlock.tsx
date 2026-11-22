import type { JSX } from "solid-js";
import { cn } from "../../../../../apps/desktop/src/lib/utils";

/** El sitio común de una interrupción. El borde conserva la diferencia entre
 * aclarar y autorizar: compartir posición no convierte una en la otra. */
export default function BloqueDeInterrupcion(props: {
  kind: "question" | "permission";
  children: JSX.Element;
  class?: string;
  onKeyDown?: JSX.EventHandlerUnion<HTMLElement, KeyboardEvent>;
  ref?: (el: HTMLElement) => void;
  /** `-1` lo hace enfocable sin meterlo en el orden del tabulador. */
  tabIndex?: number;
}) {
  return (
    <section
      class={cn(
        // `minmax(0,1fr)` y `min-w-0`: sin ellos la columna crece hasta el
        // contenido más ancho —una tira de pestañas, una ruta larga— y el
        // bloque se sale por la derecha en vez de ceñirse a su caja.
        "grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 overflow-hidden rounded-lg border bg-surface-raised shadow-sm outline-none",
        props.kind === "permission"
          ? "border-warning/60 ring-1 ring-warning/15"
          : "border-border-strong",
        props.class,
      )}
      data-interruption={props.kind}
      onKeyDown={props.onKeyDown}
      ref={props.ref}
      tabIndex={props.tabIndex}
    >
      {props.children}
    </section>
  );
}
