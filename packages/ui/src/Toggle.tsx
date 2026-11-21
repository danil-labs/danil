import type { JSX } from "solid-js";
import { splitProps } from "solid-js";
import { cn } from "../../../apps/desktop/src/lib/utils";

export function Toggle(
  props: {
    checked: boolean;
    onChange: (v: boolean) => void;
    /** Qué enciende, para quien no ve la fila. */
    label: string;
    disabled?: boolean;
    class?: string;
  } & Omit<JSX.ButtonHTMLAttributes<HTMLButtonElement>, "onChange" | "class">,
) {
  const [propias, resto] = splitProps(props, [
    "checked",
    "onChange",
    "label",
    "disabled",
    "class",
  ]);

  return (
    <button
      type="button"
      role="switch"
      aria-checked={propias.checked}
      aria-label={propias.label}
      disabled={propias.disabled}
      onClick={() => propias.onChange(!propias.checked)}
      class={cn(
        // Mismo foco que `Button`: contorno sólido de 2 px con offset, que es
        // el indicador entero. Un anillo translúcido no llega a 3:1.
        "inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-transparent p-0.5 transition-colors duration-150 ease-out outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:pointer-events-none disabled:opacity-60",
        propias.checked ? "bg-primary" : "bg-border-strong",
        propias.class,
      )}
      {...resto}
    >
      {/* El pulgar se mueve con `translate` y no cambiando de sitio en el
          árbol: recreado, la transición no tiene entre qué interpolar. */}
      <span
        class={cn(
          "size-4 rounded-full bg-surface-raised shadow-sm transition-transform duration-150 ease-out",
          propias.checked ? "translate-x-4" : "translate-x-0",
        )}
      />
    </button>
  );
}
