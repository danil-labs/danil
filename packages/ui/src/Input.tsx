import { cva, type VariantProps } from "class-variance-authority";
import { splitProps, type JSX } from "solid-js";
import { cn } from "../../../apps/desktop/src/lib/utils";

/**
 * El campo de texto.
 *
 * Con este átomo se arregló un campo que salía **sin estilo**: el de la
 * carpeta de trabajo. La regla vieja era `input[type="text"]` y ese campo no
 * declara `type`, así que nunca la tocó. Un campo nativo tampoco llama la
 * atención, y por eso nadie lo vio. Aquí no hay selector que fallar: o usas el
 * átomo o no hay campo.
 */
const BASE = "w-full min-w-0 min-h-9 px-[11px] py-[7px] rounded-md border border-border-strong bg-surface text-neutral-950 text-ui [font-family:inherit] outline-none transition-[border-color,background-color] duration-150 ease-out placeholder:text-neutral-500 focus-visible:border-primary focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-60 disabled:cursor-not-allowed";

const inputVariants = cva("", {
  variants: {
    variant: {
      default: BASE,
      ghost: [
        BASE,
        "border-transparent bg-transparent shadow-none focus-visible:border-transparent focus-visible:outline-none",
      ],
      /** El deslizador (`type="range"`): solo el color de acento; el ancho lo pone quien lo usa. */
      range: "accent-primary",
      /** La búsqueda dentro de un selector desplegable, con la lupa a la izquierda. */
      picker: "w-full bg-transparent py-1 pr-2 pl-6 text-caption outline-none",
      /** El `type="file"` oculto que abre un botón visible. */
      filePicker: "hidden",
      /** Sin clases propias: casillas nativas y campos únicos que traen su className exacto (como `Pressable`). */
      plain: "",
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

export type InputProps = JSX.InputHTMLAttributes<HTMLInputElement> &
  VariantProps<typeof inputVariants>;

export function Input(props: InputProps) {
  const [propios, resto] = splitProps(props, ["class", "variant", "type"]);

  return (
    <input
      type={propios.type ?? "text"}
      class={cn(inputVariants({ variant: propios.variant }), propios.class)}
      {...resto}
    />
  );
}
