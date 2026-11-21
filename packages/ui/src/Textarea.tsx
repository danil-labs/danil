import { cva, type VariantProps } from "class-variance-authority";
import { splitProps, type JSX } from "solid-js";
import { cn } from "./lib/utils";

const textareaVariants = cva(
  // El tamaño en rem sigue ⌘+/⌘−; en px el campo se queda. `font-family:
  // inherit` le gana al control nativo, que si no cae a la letra del sistema.
  "w-full min-w-0 rounded-md border border-border-strong bg-surface text-neutral-950 text-ui [font-family:inherit] outline-none transition-[border-color,background-color] duration-150 ease-out placeholder:text-neutral-500 focus-visible:border-primary focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-60 disabled:cursor-not-allowed",
  {
    variants: {
      variant: {
        default: "min-h-[72px] px-[11px] py-[7px] leading-[1.45] resize-y",
        ghost:
          "min-h-9 p-0 resize-none border-transparent bg-transparent focus-visible:border-transparent focus-visible:outline-none",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export type TextareaProps = JSX.TextareaHTMLAttributes<HTMLTextAreaElement> &
  VariantProps<typeof textareaVariants>;

/**
 * `ref` es una prop normal: `<Textarea ref={caja} />` funciona porque `resto`
 * la reenvía al `<textarea>`.
 */
export function Textarea(props: TextareaProps) {
  const [propios, resto] = splitProps(props, ["class", "variant"]);

  return (
    <textarea
      class={cn(
        textareaVariants({ variant: propios.variant ?? "default" }),
        propios.class,
      )}
      {...resto}
    />
  );
}
