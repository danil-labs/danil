import { temaPintado } from "./lib/theme";
import { DIBUJOS, EN_CLARO } from "./file-icons";
import { iconoDe } from "./lib/icons";

/**
 * El icono de un archivo, pintado. Sin icono en el catálogo pinta el genérico
 * (`file` de lucide): un hueco vacío desalinearía el nombre y la fila se
 * leería rota.
 */
export function IconoDeArchivo(props: {
  ruta: string;
  size?: number;
  class?: string;
}) {
  const id = () => {
    const base = iconoDe(props.ruta);
    if (!base) return null;
    return (temaPintado() === "light" && EN_CLARO[base]) || base;
  };
  const dibujo = () => {
    const i = id();
    return i ? DIBUJOS[i] : undefined;
  };

  return (
    <svg
      viewBox={dibujo()?.viewBox ?? GENERICO.viewBox}
      width={props.size ?? 13}
      height={props.size ?? 13}
      class={props.class}
      aria-hidden="true"
      // El SVG sale del catálogo generado en el build (`scripts/icons.mjs`);
      // ningún dato de fuera entra a este innerHTML.
      innerHTML={dibujo()?.cuerpo ?? GENERICO.cuerpo}
    />
  );
}

/**
 * El icono de lo que no está en el catálogo: `file` de lucide copiado a mano,
 * para que la caja sea siempre el mismo elemento. `currentColor` lo deja gris
 * como el resto de la fila en los dos temas.
 */
const GENERICO = {
  viewBox: "0 0 24 24",
  cuerpo:
    '<g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/>' +
    '<path d="M14 2v4a2 2 0 0 0 2 2h4"/></g>',
};
