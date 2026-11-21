import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// Copia mínima de apps/desktop/src/lib/utils.ts. La escala de texto va inline
// (las claves de TEXT en packages/design/src/scale.ts) para no importar @terminus/design.
const TEXT_STEPS = ["2xs", "caption", "label", "ui", "body", "lead"];

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
