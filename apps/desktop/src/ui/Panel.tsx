import { Show, splitProps, type JSX } from "solid-js";
import { cn } from "../lib/utils";
import { SectionLabel } from "./SectionLabel";

/**
 * Una sección de página sobre el área de trabajo. El fondo es sólido porque
 * ahí puede haber una imagen: el contraste del texto no depende de ella.
 */
export const PANEL = "rounded-md border border-border bg-surface";

export function Panel(
  props: Omit<JSX.HTMLAttributes<HTMLElement>, "title"> & {
    title: JSX.Element;
    action?: JSX.Element;
  },
) {
  const [propios, resto] = splitProps(props, ["title", "action", "class", "children"]);
  return (
    <section class={cn(PANEL, "min-w-0", propios.class)} {...resto}>
      <header class="grid min-h-10 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-3 py-1">
        <SectionLabel>{propios.title}</SectionLabel>
        <Show when={propios.action}>{propios.action}</Show>
      </header>
      {propios.children}
    </section>
  );
}
