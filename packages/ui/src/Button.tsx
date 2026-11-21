import { cva, type VariantProps } from "class-variance-authority";
import { splitProps, type JSX, type ValidComponent, type ComponentProps } from "solid-js";
import { Dynamic } from "solid-js/web";
import { cn } from "../lib/utils";

/**
 * Un componente que decide qué elemento renderiza, con las props de ESE
 * elemento: `<Button as="a" href="/x">`. Sustituye al `asChild` de Radix — en
 * Solid no hay descriptor que clonar, así que el átomo renderiza lo que `as`
 * diga y las props se quedan en la llamada. El tipo hace válido `href` con
 * `as="a"` y error sin él.
 */
type Polimorfico<
  T extends ValidComponent,
  Propias extends Record<string, unknown>,
> = Propias & {
  /** El elemento o componente que se renderiza. Por omisión, el del átomo. */
  as?: T;
} & Omit<ComponentProps<T>, keyof Propias | "as">;


/**
 * El botón, con la forma de shadcn. Una variante nueva se añade aquí, para
 * todos los consumidores a la vez.
 *
 * El texto sobre `primary` lo dice `--action-text` (`#ffffff` en claro, 6,07:1;
 * `#070b1c` en oscuro, 12,40:1): en oscuro `primary` es el teal y el texto baja
 * al navy del fondo. Un `dark:text-neutral-*` no vale — la escala de neutros ya
 * se invierte con el tema y se invertiría dos veces.
 */
const buttonVariants = cva(
  // El foco es un contorno sólido de 2 px con offset, y es el indicador ENTERO
  // (`outline-none` anula el de reserva). Cumple los 3:1 de WCAG 2.2 § 1.4.11:
  // 5,77:1 en claro y 17,02:1 en oscuro; un anillo translúcido `ring-primary/40`
  // mide 1,91:1 en claro.
  //
  // `outline-solid` va explícito: `outline-none` deja `--tw-outline-style` en
  // `none` y sin él la utility fija ancho y color de un contorno que no se
  // dibuja.
  "inline-flex shrink-0 items-center justify-center gap-[7px] rounded-md border border-transparent font-semibold whitespace-nowrap transition-[transform,border-color,background-color,box-shadow] duration-150 ease-out outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-60 disabled:pointer-events-none",
  {
    variants: {
      variant: {
        primary:
          "bg-primary text-[var(--action-text)] shadow-sm hover:bg-primary-dark active:scale-[0.98]",
        secondary:
          "border-border-strong bg-surface-raised text-neutral-950 shadow-sm hover:bg-surface-muted active:scale-[0.98]",
        outline:
          "border-border bg-transparent text-neutral-500 shadow-none hover:border-neutral-500 hover:text-neutral-950 disabled:bg-surface-muted disabled:opacity-100",
        ghost: "text-neutral-700 hover:bg-neutral-100 active:scale-[0.98]",
        // El fantasma sobre `surface-muted`, donde `neutral-100` es el mismo color y el hover no se vería.
        chrome: "text-neutral-950 hover:bg-neutral-200 data-[expanded]:bg-neutral-200",
        // `error-strong` + `--action-text` cumplen contraste: 4,83:1 en claro
        // y 6,93:1 en oscuro. `bg-error text-white` mide 3,76:1 en los dos
        // temas — ninguno de esos colores se invierte.
        danger:
          "bg-error-strong text-[var(--action-text)] hover:brightness-95 active:scale-[0.98]",
        // Ejecutar un `!`: no es la acción de preguntar al agente. Texto 18,53:1
        // en claro y 16,60:1 en oscuro; en hover, 17,22:1 y 12,15:1.
        terminal:
          "bg-neutral-950 text-neutral-50 shadow-sm hover:bg-neutral-900 active:scale-[0.98]",
      },
      size: {
        compact: "min-h-6 px-2 text-xs font-medium",
        sm: "min-h-8 px-[11px] text-ui",
        md: "min-h-9 px-[14px] py-[7px] text-ui",
        iconCompact: "size-8 p-0",
        icon: "size-9 p-0",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

/** Lo que este átomo decide. Todo lo demás son props del elemento que renderiza. */
type ButtonPropias = VariantProps<typeof buttonVariants> & {
  class?: string;
  children?: JSX.Element;
};

export type ButtonProps<T extends ValidComponent = "button"> = Polimorfico<
  T,
  ButtonPropias
>;

export function Button<T extends ValidComponent = "button">(
  props: ButtonProps<T>,
) {
  const [propios, resto] = splitProps(props as ButtonProps, [
    "class",
    "variant",
    "size",
    "as",
  ]);

  return (
    <Dynamic
      component={propios.as ?? "button"}
      class={cn(
        buttonVariants({ variant: propios.variant, size: propios.size }),
        propios.class,
      )}
      {...resto}
    />
  );
}
