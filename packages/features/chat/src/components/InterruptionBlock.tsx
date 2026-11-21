import type { JSX } from "solid-js";

/**
 * El sitio común de una interrupción.
 * Paridad con apps/desktop/src/features/chat/InterruptionBlock.tsx.
 */
export function BloqueDeInterrupcion(props: {
  kind: "question" | "permission";
  children: JSX.Element;
  class?: string;
  onKeyDown?: JSX.EventHandlerUnion<HTMLElement, KeyboardEvent>;
  ref?: (el: HTMLElement) => void;
  tabIndex?: number;
}) {
  const borderClasses = () =>
    props.kind === "permission"
      ? "border-warning/60 ring-1 ring-warning/15"
      : "border-border-strong";

  return (
    <section
      class={`grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 overflow-hidden rounded-lg border bg-surface-raised shadow-sm outline-none ${borderClasses()} ${props.class ?? ""}`}
      data-interruption={props.kind}
      onKeyDown={props.onKeyDown}
      ref={props.ref}
      tabIndex={props.tabIndex}
    >
      {props.children}
    </section>
  );
}

export default BloqueDeInterrupcion;
