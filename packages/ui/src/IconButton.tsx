// port: nuevo — botón de ícono compartido: unifica los <button class="grid size-5|6|7 place-items-center rounded-sm …"> crudos de apps/desktop (ui-inventory.md)
import { type JSX, splitProps } from "solid-js";
import { cn } from "./lib/utils.ts";

const TAMANO = { xs: "size-5", sm: "size-6", md: "size-7" } as const;

/** Botón cuadrado de un solo ícono. `label` es obligatorio: es el aria-label y el title (el texto lo pone el llamador con t()). */
export function IconButton(props: JSX.ButtonHTMLAttributes<HTMLButtonElement> & { label: string; size?: keyof typeof TAMANO }) {
  const [propios, resto] = splitProps(props, ["class", "type", "label", "size"]);
  return (
    <button
      type={propios.type ?? "button"}
      aria-label={propios.label}
      title={propios.label}
      class={cn(
        "grid shrink-0 cursor-pointer place-items-center rounded-sm text-neutral-500 outline-none hover:bg-surface-muted hover:text-neutral-950 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:pointer-events-none disabled:opacity-60",
        TAMANO[propios.size ?? "sm"],
        propios.class,
      )}
      {...resto}
    />
  );
}
