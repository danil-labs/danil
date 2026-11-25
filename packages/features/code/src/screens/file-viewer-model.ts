import { type JSX } from "solid-js";
import { createPref, hayPref } from "../../../../session/src/prefs";
import type { LeerParte } from "../../../../host/src/tree-download";

/** Los visores de pdf, imagen, tabla y medio los compone el shell. */
export type Visores = {
  pdf: (props: { base64: string; name: string }) => JSX.Element;
  imagen: (props: { src: string; alt: string }) => JSX.Element;
  tabla: (props: { text: string; delim: string }) => JSX.Element;
  medio: (props: { ruta: string; tipo: "video" | "audio"; leer: LeerParte }) => JSX.Element;
};

/**
 * Un archivo de un árbol de la tarea, en una sola barra: dónde está, qué se
 * puede hacer con él y cómo se ve. En una carpeta de código todo texto abre en
 * el editor; en una documental, Markdown y HTML abren en su vista previa
 * (`workdirKind.ts` · `esDeCodigo`). Las líneas salen de `Changes.tsx`, el
 * Markdown de `ui/Markdown.tsx` y el HTML del marco de `artifacts/Document.tsx`,
 * que llevan el filtro de URLs y el sandbox que vigila el guarda `csp`.
 */

/** `delivery/development/` · `Contenido`. */
type Contenido = {
  /** `"text"` | `"image"` | `"pdf"` | `"binary"`. */
  kind: string;
  text: string;
  data_url: string | null;
  /** Bytes del PDF en base64, solo con `kind: "pdf"`. */
  pdf: string | null;
  bytes: number;
  truncated: boolean;
};

type Disposicion = "codigo" | "lado" | "previa";

const [disposicionGuardada, recordarDisposicion] = createPref<Disposicion>("file.layout", "codigo");
const disposicionRecordada = (): Disposicion => {
  const d = disposicionGuardada();
  return d === "lado" || d === "previa" ? d : "codigo";
};

/** Un documento Typst abre lado a lado mientras nadie haya elegido otra cosa: su PDF es para lo que se abre. */
const disposicionTypstRecordada = (): Disposicion =>
  hayPref("file.layout") && disposicionRecordada() === "codigo" ? "codigo" : "lado";

/** Cuánto del ancho se lleva el código con la vista lado a lado; doble clic en el divisor vuelve a la mitad. */
const [repartoGuardado, recordarReparto] = createPref<number>("file.split", 0.5);
const reparto = () => Math.min(0.8, Math.max(0.2, Number(repartoGuardado()) || 0.5));

/** Cuánto espera la vista previa a que se deje de teclear: cada cambio recarga el marco entero. */
const PAUSA_DE_LA_PREVIA = 250;

/** Cuánto espera, sin teclear, el guardado de un `.typ` en vivo: pone al día el disco, el índice y los cambios. */
const PAUSA_DEL_INDICE = 1500;

/** Cuánto se espera a releer un archivo que no está: reescribirlo puede ser borrarlo y crearlo. */
const ESPERA_DEL_BORRADO = 600;

/** Qué extensiones pinta `remark-gfm` como documento y no como código. */
const MARKDOWN = ["md", "markdown"];

/** Qué extensiones se pintan en el contenedor de los artefactos. */
const HTML = ["html", "htm"];

const extension = (ruta: string) => {
  const punto = ruta.lastIndexOf(".");
  return punto > 0 ? ruta.slice(punto + 1).toLowerCase() : "";
};

export function esMarkdown(ruta: string) {
  return MARKDOWN.includes(extension(ruta));
}

export function esHtml(ruta: string) {
  return HTML.includes(extension(ruta));
}

const IMAGES = ["png", "jpg", "jpeg", "gif", "webp", "svg", "ico"];

/** Las que el visor pinta como imagen; un PDF tiene su propio visor. */
export function isImage(path: string) {
  return IMAGES.includes(extension(path));
}

export type VisorProps = {
  project: string;
  /** Vacía mientras la tarea no existe: entonces se lee `base`. */
  session: string;
  /** La rama base, cuando lo que se lee es el commit y no una copia viva. */
  base?: string;
  /** La clave del árbol de la tarea (`development::Arbol::clave`). */
  arbol: string;
  ruta: string;
  /**
   * La ruta es absoluta y cae fuera de los árboles de la tarea: se lee con
   * `preview_file`, en solo lectura, sin cambios ni refresco.
   */
  suelto?: boolean;
  /** Si el agente lo cambió al abrirlo: es el valor de partida de [`hayCambios`]. */
  cambiado: boolean;
  /** Opens straight in the changes view. */
  enCambios?: boolean;
  /** Si esta pestaña es la que se está mirando. Las de detrás siguen montadas: ver `refresh.ts`. */
  visible: boolean;
  readOnly?: boolean;
  /** Guardar lo convierte en un archivo cambiado, y eso lo tiene que saber el panel. */
  onGuardado: () => void;
  /** Abre otro archivo del mismo árbol en su pestaña: ahí lleva un error de Typst. */
  onAbrirOtro?: (ruta: string) => void;
  /** Si hay algo escrito que no está en disco: lo pinta la pestaña. */
  onSucio: (sucio: boolean) => void;
  /** El archivo se borró y no había nada escrito, o se eligió cerrar: la pestaña se va sin preguntar. */
  onBorrado?: () => void;
  /** Cómo guardar desde fuera, para cerrar la pestaña guardando. `null` al desmontarse. */
  onGuardador: (guardar: (() => Promise<boolean>) | null) => void;
  visores: Visores;
};

export type { Contenido, Disposicion };
export { recordarDisposicion, disposicionRecordada, disposicionTypstRecordada, recordarReparto, reparto };
export { PAUSA_DE_LA_PREVIA, PAUSA_DEL_INDICE, ESPERA_DEL_BORRADO, extension };
