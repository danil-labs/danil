import { Show, splitProps, type JSX } from "solid-js";
import { cn } from "./lib/utils";

/**
 * El hueco de una lista vacía. El borde discontinuo lo separa de una tarjeta
 * con contenido: en sólido se lee como un dato más de la lista.
 */
export type EmptyStateProps = Omit<
  JSX.HTMLAttributes<HTMLDivElement>,
  "title"
> & {
  /** Qué falta, en una línea. Ya traducido. */
  title: JSX.Element;
  /** Qué hacer para que deje de faltar. Ya traducido. */
  description?: JSX.Element;
};

export function EmptyState(props: EmptyStateProps) {
  const [propios, resto] = splitProps(props, [
    "title",
    "description",
    "class",
  ]);

  return (
    <div
      class={cn(
        "rounded-md border border-dashed border-border-strong px-4 py-[22px] text-center",
        propios.class,
      )}
      {...resto}
    >
      <p class="font-display font-bold text-neutral-950">{propios.title}</p>
      <Show when={propios.description}>
        <p class="mt-1 text-sm text-neutral-500">{propios.description}</p>
      </Show>
    </div>
  );
}
