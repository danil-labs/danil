import { clsx, type ClassValue } from "clsx";
import { TEXT_STEPS } from "../index.ts";
import { extendTailwindMerge } from "tailwind-merge";

// Sin esto `text-caption` se lee como color y borra el `text-*` de color de al lado.
const twMerge = extendTailwindMerge({ extend: { theme: { text: TEXT_STEPS } } });

/**
 * Compone clases resolviendo conflictos: la última gana. Sin esto,
 * `<Button class="px-4">` no le gana al `px-2` del átomo: quedan las dos
 * clases y decide el orden del CSS, no el de la llamada.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
