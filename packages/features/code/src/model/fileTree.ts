import type { JSX } from "solid-js";
import type { Failure } from "../../../../ui/src/Failure";
import type { Carpeta } from "./tree";

const SANGRIA = 12;
const CHEVRON = 13;

export type Tipo = "archivo" | "carpeta";

/** Una página de una carpeta plegada. `development::PaginaDeCarpeta`. */
type Pagina = { paths: string[]; folders: Carpeta[]; next: number | null; total: number };
type Plegada = Pagina & { cargando: boolean; fallo: Failure | null };

const padreDe = (ruta: string) => ruta.slice(0, Math.max(0, ruta.lastIndexOf("/")));
const nombreDe = (ruta: string) => ruta.slice(ruta.lastIndexOf("/") + 1);
const unir = (padre: string, nombre: string) => (padre ? `${padre}/${nombre}` : nombre);
const debajoDe = (ruta: string, raiz: string) => ruta === raiz || ruta.startsWith(`${raiz}/`);

export type ArbolProps = {
project: string;
session: string;
arbol: string;
kind: "git" | "folder" | "kn";
visible: boolean;
/** Acciones del árbol entero (guardar en la carpeta), junto a la búsqueda: el nombre de la carpeta ya lo dice la barra de la tarea. */
acciones?: JSX.Element;
/** Sin tarea aún, lee el commit de la rama base en lugar de una copia. */
preview?: { baseRef?: string };
/**
 * En la vista previa, crear lo nuevo en una tarea que nace vacía para eso.
 * Sin él, la vista previa no ofrece crear.
 */
crearSinTarea?: (tipo: Tipo, ruta: string) => Promise<void>;
onAbrir: (ruta: string, cambiado: boolean) => void;
/** Double click: the file stays open instead of being the preview. */
onAbrirFijo?: (ruta: string, cambiado: boolean) => void;
/** Un archivo o una carpeta cambió de ruta desde aquí: sus pestañas la siguen. */
onMovido?: (desde: string, hasta: string) => void;
/** Se borró desde aquí: sus pestañas ya no tienen qué enseñar. */
onBorrado?: (ruta: string) => void;
};

export { CHEVRON, debajoDe, nombreDe, padreDe, SANGRIA, unir };
export type { Pagina, Plegada };
