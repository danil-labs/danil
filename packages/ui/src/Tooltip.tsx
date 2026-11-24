import { Tooltip as Kobalte } from "@kobalte/core/tooltip";
import { splitProps, type ComponentProps } from "solid-js";
import { cn } from "./lib/utils";

/**
 * Tooltip común sobre `@kobalte/core` **0.13.13**. Esta versión no tiene un
 * `Provider`; si una posterior lo añade, hay que revisar el retardo compartido.
 *
 * El retardo es por instancia. `RETARDO` lo mantiene en un solo número para
 * que no se desvíe tooltip a tooltip.
 *
 * Por ello, recorrer varios tooltips no comparte el estado «ya abierto».
 */
export const RETARDO_TOOLTIP = 180;

export const TooltipRoot = Kobalte;
export const TooltipTrigger = Kobalte.Trigger;

export function TooltipContent(props: ComponentProps<typeof Kobalte.Content>) {
  const [propios, resto] = splitProps(props, ["class"]);

  return (
    <Kobalte.Portal>
      <Kobalte.Content
        class={cn(
          "z-[80] max-w-[280px] rounded-sm bg-neutral-950/[0.92] px-2.5 py-1.5 text-[0.78rem] leading-[1.25] font-semibold text-neutral-50 shadow-md",
          propios.class,
        )}
        {...resto}
      />
    </Kobalte.Portal>
  );
}
