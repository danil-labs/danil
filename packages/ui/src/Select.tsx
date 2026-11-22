import { cva, type VariantProps } from "class-variance-authority";
import { splitProps, type JSX } from "solid-js";
import { cn } from "../../../apps/desktop/src/lib/utils";

/**
 * El desplegable, **nativo a propósito**: lo pinta el sistema.
 *
 * **Sin variantes `dark:` sobre la escala de neutros, y eso no es estilo.** Aquí
 * la escala **ya se invierte con el tema** —en claro `neutral-950` es `#0a0d23`
 * y en oscuro `#e9ecf8`—, así que un `dark:` encima la invierte por segunda vez
 * y la deja donde empezó. Esto pintaba `text-neutral-950 dark:text-neutral-50`:
 * en oscuro, **`#000000` sobre fondo casi negro**.
 *
 * Y no se lee como un texto invisible sino como un defecto de hover, que es lo
 * que lo hace difícil de nombrar: el desplegable lo pinta el sistema y ahí sí
 * fuerza blanco, así que las opciones **solo se leen al pasar el ratón** — lo
 * blanco es lo único correcto que se ve.
 *
 * Los tres de la familia dicen lo mismo —`bg-surface` y
 * `text-neutral-950`, sin variante de tema—, porque el token es quien sabe en qué
 * tema está.
 */
const selectVariants = cva(
  // **Las opciones llevan su color escrito, y no es redundante.** El desplegable
  // lo pinta el sistema y hereda del `<select>`; con `variant="ghost"` ese
  // control va a propósito con `bg-transparent`, así que la lista salía con el
  // fondo por omisión —claro— y el texto casi blanco que hereda del tema
  // oscuro: **blanco sobre blanco, ilegible salvo en la fila con el ratón
  // encima**, que es la única que el sistema repinta.
  //
  // Afecta a todos los `<select>` de la app por igual.
  //
  // Se ponen los dos —fondo y texto— y con tokens, que ya se invierten con el
  // tema. Poner solo el fondo dejaría el mismo fallo en claro.
  "w-full min-w-0 min-h-9 px-[11px] rounded-md border border-border-strong bg-surface text-ui [font-family:inherit] text-neutral-950 outline-none transition-[border-color,background-color] duration-150 ease-out focus-visible:border-primary focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-60 disabled:cursor-not-allowed [&>option]:bg-surface [&>option]:text-neutral-950 [&>optgroup]:bg-surface [&>optgroup]:text-neutral-950",
  {
    variants: {
      variant: {
        default: "",
        ghost:
          "border-transparent bg-transparent shadow-none focus-visible:border-transparent focus-visible:outline-none focus-visible:shadow-none",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export type SelectProps = JSX.SelectHTMLAttributes<HTMLSelectElement> &
  VariantProps<typeof selectVariants>;

export function Select(props: SelectProps) {
  const [propios, resto] = splitProps(props, ["class", "variant"]);

  return (
    <select
      class={cn(selectVariants({ variant: propios.variant }), propios.class)}
      {...resto}
    />
  );
}
