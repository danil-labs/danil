/** KaTeX va en su propio trozo para no pesar en la carga inicial: solo hace falta con una fórmula. */
import katex, { type KatexOptions } from "katex";

/** Sin `trust` no hay `\href`, `\url` ni `\html…`; los topes frenan una fórmula que crece sin fin. */
export const OPCIONES_KATEX = {
  throwOnError: true,
  trust: false,
  strict: "ignore",
  maxSize: 20,
  maxExpand: 1000,
} as const satisfies KatexOptions;

/** Pinta `tex` dentro de `destino` y devuelve el error de KaTeX, o `null` si se pudo. */
export function pintarFormula(tex: string, bloque: boolean, destino: HTMLElement): string | null {
  try {
    katex.render(tex, destino, { ...OPCIONES_KATEX, displayMode: bloque });
    return null;
  } catch (e) {
    destino.textContent = "";
    return (e as Error).message;
  }
}
