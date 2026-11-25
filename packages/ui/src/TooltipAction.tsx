import type { JSX } from "solid-js";
import { Pressable } from "./Pressable";
import { RETARDO_TOOLTIP, TooltipContent, TooltipRoot, TooltipTrigger } from "./Tooltip";

/** Un botón de icono con su globo; cada sitio pone sus clases. */
export function TooltipAction(props2: {
  class: string;
  etiqueta: string;
  onClick: () => void;
  disabled?: boolean;
  children: JSX.Element;
}) {
  return (
    <TooltipRoot openDelay={RETARDO_TOOLTIP} placement="bottom">
      <TooltipTrigger
        as={(p: object) => (
          <Pressable
            {...p}
            type="button"
            class={props2.class}
            disabled={props2.disabled}
            aria-label={props2.etiqueta}
            // Reenvía el clic del disparador antes de hacer lo suyo: Kobalte
            // no compone manejadores como hacía Radix con `asChild`, así que
            // un `onClick` encima del `{...p}` borra el que cierra el globo.
            // Lo comprueba `tests/unit/triggers.test.mjs`.
            onClick={(e: MouseEvent) => {
              (p as { onClick?: (e: MouseEvent) => void }).onClick?.(e);
              props2.onClick();
            }}
          >
            {props2.children}
          </Pressable>
        )}
      />
      <TooltipContent class="whitespace-nowrap">
        {props2.etiqueta}
      </TooltipContent>
    </TooltipRoot>
  );
}
