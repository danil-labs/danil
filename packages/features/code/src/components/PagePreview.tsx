import { convertFileSrc } from "@tauri-apps/api/core";
import { SANDBOX_ARTEFACTO } from "../../../artifacts/src/model/sandbox";

/**
 * La dirección de un `.html` de la tarea en `terminus-page` (`page_preview.rs`),
 * que lo sirve de su carpeta con sus archivos relativos. `null` sin esa esquema:
 * la web no la tiene y ahí sigue el marco de los artefactos.
 */
export function direccionDePagina(project: string, session: string, arbol: string, ruta: string, version: number): string | null {
  const base = convertFileSrc("", "terminus-page");
  if (!base || !session) return null;
  const tramos = [project, session, arbol, ...ruta.split(/[\\/]/).filter(Boolean)];
  return `${base.replace(/\/*$/, "/")}${tramos.map(encodeURIComponent).join("/")}?v=${version}`;
}

/**
 * Un `.html` como en el navegador: a todo el ancho, con sus scripts y lo que cargue
 * de su carpeta. El mismo sandbox que los artefactos (origen opaco, sin la app);
 * la red la acota la política que manda la esquema.
 */
export default function PaginaEnVivo(props: { url: string; nombre: string }) {
  return (
    <iframe
      class="min-h-0 w-full flex-1 border-0 bg-surface-raised"
      title={props.nombre}
      sandbox={SANDBOX_ARTEFACTO}
      allow="fullscreen; autoplay"
      src={props.url}
    />
  );
}
