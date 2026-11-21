import { cva, type VariantProps } from "class-variance-authority";
import { splitProps, type JSX } from "solid-js";
import { cn } from "../lib/utils";

/**
 * Estado breve. El tono comunica consecuencia; `active` comunica presencia.
 *
 * La forma dice de quién es el texto: `etiqueta` para lo que alguien escribió,
 * `dato` para lo que dijo la máquina. Un identificador en la tipografía de
 * interfaz se lee como prosa.
 */
const badgeVariants = cva("inline-flex items-center gap-1.5 whitespace-nowrap border", {
  variants: {
    forma: {
      etiqueta: "rounded-full px-2.5 py-0.5 text-xs font-[560]",
      dato: "rounded-sm px-1.5 py-0.5 font-mono text-caption",
    },
    tone: {
      neutral: "text-neutral-700",
      active: "border-transparent bg-neutral-200 text-neutral-950",
      info: "border-transparent bg-info/15 text-info-strong",
      success: "border-current text-success-strong",
      warning: "border-current text-warning-strong",
      danger: "border-current text-error-strong",
      // El modo de la caja con `!`. 18,53:1 en claro y 16,60:1 en oscuro.
      terminal: "border-transparent bg-neutral-950 text-neutral-50",
    },
  },
  compoundVariants: [
    // La forma de dato se queda en el borde solo: un bloque detrás de cada
    // identificador llena la fila de rectángulos.
    { forma: "etiqueta", tone: "neutral", class: "border-border bg-surface-muted" },
    { forma: "dato", tone: "neutral", class: "border-border text-neutral-500" },
  ],
  defaultVariants: { forma: "etiqueta", tone: "neutral" },
});

export type BadgeProps = JSX.HTMLAttributes<HTMLSpanElement> &
  VariantProps<typeof badgeVariants>;

export function Badge(props: BadgeProps) {
  const [propios, resto] = splitProps(props, ["class", "tone", "forma"]);
  return (
    <span
      class={cn(badgeVariants({ tone: propios.tone, forma: propios.forma }), propios.class)}
      {...resto}
    />
  );
}
