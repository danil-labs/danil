import {
  For,
  Show,
  Suspense,
  createEffect,
  createMemo,
  createResource,
  createSignal,
  lazy,
  on,
  onCleanup,
  untrack,
  type JSX,
} from "solid-js";
import { invoke } from "../../lib/invoke.ts";
import { machineOf } from "../machines/store";
import Navegador from "lucide-solid/icons/external-link";
import IconoCodigo from "lucide-solid/icons/code";
import IconoLado from "lucide-solid/icons/columns-2";
import IconoPrevia from "lucide-solid/icons/eye";
import IconoCambios from "lucide-solid/icons/git-compare";
import { Button } from "../../ui/Button";
import { FailureNote, asFailure, type Failure } from "../../ui/Failure";
import { Markdown } from "../../ui/Markdown";
import Documento from "../artifacts/Document";
import type { Preview } from "../artifacts/Preview";
import { formaDe } from "../artifacts/sandbox";
import { cn } from "../../lib/utils";
import { HEADER_HEIGHT } from "../../lib/window";
import { t } from "../../lib/i18n";
import { createPref, hayPref } from "../../lib/prefs";
import { ariaDeAtajo, textoDeAtajo } from "../../lib/shortcuts";
import { peso } from "../../lib/format";
import { comoDiff, parsearDiff, type ArchivoDiff } from "./diff";
import { CuerpoDeArchivo, SelectorDeDisposicion } from "./Changes";
import { IDOS, alMoverseElArbol, comoEntra, esBorrado, type DetalleDeIdos } from "./refresh";
import { setMoviendoHueco } from "../../lib/sites";
import { cargarEditor } from "./editorLoad";
import { alternarAjuste, esAtajoDeAjuste } from "../../lib/wrap";
import { gramaticaDe, nombreDeLenguaje } from "./languages";
import { sangriaDe } from "./indent";
import { IconoDeArchivo } from "./FileIcon";
import { esArbolDeCodigo } from "./treeKind";
import PaginaEnVivo, { direccionDePagina } from "./PagePreview";
import { delimiterFor } from "../viewers/csv";
import {
  type DiagnosticoTypst,
  ampliadaDe,
  ampliarVista,
  compiladoDe,
  conVistaTypst,
  consumirSalto,
  diagnosticosDelArchivo,
  esTypst,
  pedirArreglo,
  revelarEnElArbol,
  seguirPluginTypst,
  salto,
  saltarA,
  pedirReapertura,
  vivaDe,
  mirarEditorTypst,
  dejarDeMirarEditorTypst,
} from "./typst";
import { llevaVistaTypst } from "./typstScope";

const EditorDeCodigo = lazy(cargarEditor);
const VistaPreviaTypst = lazy(() => import("./TypstPreview"));
/** Los visores de lo que no se edita bajan solo al abrirse: `pdfjs-dist` no entra en el arranque. */
const PdfDocument = lazy(() => import("../viewers/Pdf"));
const ZoomableImage = lazy(() => import("../viewers/ImageViewer"));
const DelimitedTable = lazy(() => import("../viewers/CsvTable"));

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

export default function VisorDeArchivo(props: {
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
}) {
  // El editor y su gramática se piden a la vez y al abrir la pestaña, no uno detrás de otro.
  void cargarEditor();
  void gramaticaDe(props.ruta);
  /** Sin copia de trabajo detrás no hay dónde escribir ni con qué comparar. */
  const previa = () => props.session === "" || Boolean(props.suelto);
  const [contenido, setContenido] = createSignal<Contenido | null>(null);
  const [diff, setDiff] = createSignal<ArchivoDiff | null>(null);
  const [leyendo, setLeyendo] = createSignal(false);
  const [comparando, setComparando] = createSignal(false);
  const [fallo, setFallo] = createSignal<Failure | null>(null);
  /** Lo escrito en el editor. `null` es «no se ha tocado»: el editor enseña el disco. */
  const [borrador, setBorrador] = createSignal<string | null>(null);
  const [guardando, setGuardando] = createSignal(false);
  /** El archivo cambió en disco con algo escrito sin guardar. Guardar o descartar lo resuelven. */
  const [desincronizado, setDesincronizado] = createSignal(false);
  /** Se borró con algo escrito: se avisa y se deja guardarlo de nuevo o cerrar. */
  const [borrado, setBorrado] = createSignal(false);
  /** Aparte de `fallo`, que tapa el archivo entero. */
  const [falloAfuera, setFalloAfuera] = createSignal<Failure | null>(null);

  /**
   * Si hoy tiene diff. Arranca en el `cambiado` del árbol y después lo decide el
   * patch: un archivo que el turno reescriba gana su vista de cambios sin
   * reabrir la pestaña, y uno que el agente revierta la pierde.
   */
  const [hayCambios, setHayCambios] = createSignal(props.cambiado);
  createEffect(on(() => props.cambiado, setHayCambios, { defer: true }));

  /** `null` mientras no se sabe: se pinta como código, que es lo que abre casi siempre. */
  const [deCodigo, setDeCodigo] = createSignal<boolean | null>(props.suelto ? true : null);
  createEffect(
    on([() => props.session, () => props.arbol], ([session, arbol]) => {
      if (props.suelto) return;
      let vivo = true;
      onCleanup(() => {
        vivo = false;
      });
      esArbolDeCodigo(props.project, session, arbol).then(
        (si) => vivo && setDeCodigo(si),
        () => vivo && setDeCodigo(true),
      );
    }),
  );

  /** Un archivo recortado se guardaría recortado, y eso borra lo que no llegó a cruzar. */
  const editable = () => {
    const c = contenido();
    return Boolean(c && c.kind === "text" && !c.truncated && !previa());
  };
  const esTexto = () => contenido()?.kind === "text";
  const sucio = () => borrador() !== null && borrador() !== contenido()?.text;
  const textoActual = () => borrador() ?? contenido()?.text ?? "";

  seguirPluginTypst();
  const typst = () => esTypst(props.ruta) && !previa();
  /**
   * Un `.typ` se ve junto al PDF de su documento: el principal del ojo o, sin él, el `main.typ`
   * más cercano. Otro archivo abierto en la misma pestaña usa su propia previa o se queda en código.
   */
  const vistaTypst = () => conVistaTypst() && !previa() && llevaVistaTypst(props.ruta);
  /** El tiempo real, las marcas y el guardado solo: un `.typ` con la vista encendida. */
  const typstVivo = () => typst() && vistaTypst();
  const conPrevia = () =>
    vistaTypst() ||
    (esTexto() && !typst() && (esMarkdown(props.ruta) || esHtml(props.ruta) || delimiterFor(props.ruta) !== null));
  // The diff covers the code side, so a tab opened for its changes starts there whatever layout is remembered.
  const [elegida, setElegida] = createSignal<Disposicion | null>(props.enCambios ? "codigo" : null);
  const disposicion = (): Disposicion => {
    if (!conPrevia()) return "codigo";
    // Con Typst, «Vista previa» es el ampliar de la tarea: lo comparten sus archivos y Esc lo deshace.
    if (vistaTypst()) {
      if (ampliadaDe(props.session, props.arbol)) return "previa";
      const d = elegida() ?? disposicionTypstRecordada();
      return d === "previa" ? "lado" : d;
    }
    return elegida() ?? (deCodigo() === false ? "previa" : disposicionRecordada());
  };
  const ladoCodigo = () => disposicion() !== "previa";
  const ladoPrevia = () => disposicion() !== "codigo";
  function fijar(d: Disposicion) {
    setElegida(d);
    if (vistaTypst()) ampliarVista(props.session, props.arbol, d === "previa");
  }
  function elegir(d: Disposicion) {
    fijar(d);
    // Lo que se elige en una carpeta documental no cambia cómo abren los archivos de código.
    if (deCodigo() !== false) recordarDisposicion(d);
  }

  /** Cuenta los guardados: una relectura que se cruzó con uno no pisa el editor con lo de antes. */
  let escrituras = 0;

  const marcas = () =>
    typstVivo()
      ? diagnosticosDelArchivo(props.session, props.arbol, props.ruta).map((d) => ({
          linea: d.line ?? 1,
          columna: d.column ?? 1,
          severidad: d.severity,
          mensaje: d.message,
          accion:
            d.severity === "error"
              ? { nombre: t("code.typst.fix.one"), aplicar: () => arreglarUno(d) }
              : undefined,
        }))
      : undefined;
  function arreglarUno(d: DiagnosticoTypst) {
    const main = compiladoDe(props.session, props.arbol)?.main ?? props.ruta;
    pedirArreglo(props.project, props.session, main, [d]);
  }
  const irA = () => {
    const s = salto();
    return s && s.session === props.session && s.arbol === props.arbol && s.ruta === props.ruta ? s : null;
  };
  createEffect(() => {
    if (irA() && disposicion() === "previa") untrack(() => fijar("lado"));
  });
  function irAlDiagnostico(d: DiagnosticoTypst) {
    if (d.path === null || d.line === null) return;
    ampliarVista(props.session, props.arbol, false);
    if (d.path !== props.ruta) {
      props.onAbrirOtro?.(d.path);
      revelarEnElArbol(props.session, props.arbol, d.path);
    }
    saltarA(props.session, props.arbol, d.path, d.line, d.column ?? 1);
  }

  let fila: HTMLDivElement | undefined;
  const partida = () => ladoCodigo() && ladoPrevia();

  /** Un `.html` de la tarea se ve servido de su carpeta, y se recarga con cada lectura del disco. */
  const [lecturas, setLecturas] = createSignal(0);
  createEffect(on(contenido, () => setLecturas((n) => n + 1), { defer: true }));
  const pagina = () =>
    esHtml(props.ruta) && !previa() && props.arbol !== "terminus-chat-visuals"
      ? direccionDePagina(props.project, props.session, props.arbol, props.ruta, lecturas())
      : null;

  /** Los cambios se piden al mirarlos y tapan el lado del código; la vista previa sigue a su lado. */
  const [verCambios, setVerCambios] = createSignal(Boolean(props.enCambios));
  const mostrarCambios = () => verCambios() && hayCambios() && !previa();
  function alternarCambios() {
    const ver = !verCambios();
    setVerCambios(ver);
    if (ver && disposicion() === "previa") fijar("codigo");
  }

  const [cursor, setCursor] = createSignal<{ linea: number; columna: number } | null>(null);
  const [lenguaje, setLenguaje] = createSignal<string | null>(null);
  createEffect(
    on(
      () => props.ruta,
      (ruta) => {
        let vivo = true;
        onCleanup(() => {
          vivo = false;
        });
        nombreDeLenguaje(ruta).then(
          (n) => vivo && setLenguaje(n),
          () => vivo && setLenguaje(null),
        );
      },
    ),
  );

  /** `false` si no se pudo: el fallo se pinta y el borrador sigue en el editor. */
  async function guardar(): Promise<boolean> {
    const texto = borrador();
    if (texto === null || !sucio()) return true;
    if (guardando() || props.readOnly) return false;
    setGuardando(true);
    setFallo(null);
    try {
      await invoke("tree_write", {
        project: props.project,
        session: props.session,
        tree: props.arbol,
        path: props.ruta,
        text: texto,
      }, machineOf(props.session));
      // Sin tirar el diff cacheado, la vista de cambios seguiría enseñando el de antes de escribir.
      setContenido({ ...contenido()!, text: texto });
      setDiff(null);
      setHayCambios(true);
      setDesincronizado(false);
      setBorrado(false);
      // Lo tecleado mientras viajaba el guardado no está en disco: soltarlo lo borraría del editor.
      if (borrador() === texto) setBorrador(null);
      escrituras++;
      props.onGuardado();
      return true;
    } catch (e) {
      setFallo(asFailure(e));
      return false;
    } finally {
      setGuardando(false);
    }
  }

  createEffect(() => props.onSucio(sucio()));
  props.onGuardador(guardar);
  onCleanup(() => {
    props.onGuardador(null);
    props.onSucio(false);
  });

  /** La salida usa lo que hay en disco, no lo escrito sin guardar. */
  const canOpenExternal = () => !conGuardadoManual() && (props.suelto || props.session !== "") && !machineOf(props.session);

  async function openExternal() {
    setFalloAfuera(null);
    try {
      if (props.suelto) {
        await invoke("open_file_external", { target: props.ruta });
      } else {
        await invoke("tree_open_external", {
          project: props.project,
          session: props.session,
          tree: props.arbol,
          path: props.ruta,
        });
      }
    } catch (e) {
      setFalloAfuera(asFailure(e));
    }
  }

  /** El editor se monta la primera vez que se mira el código, y se queda: desmontarlo tira el deshacer. */
  const [conEditor, setConEditor] = createSignal(false);
  createEffect(() => {
    if (props.visible && ladoCodigo() && !mostrarCambios() && editable()) setConEditor(true);
  });

  // El PDF de un documento de Office; sin archivo en disco (una rama base) no hay.
  function pedirOffice(): Promise<Preview> | null {
    if (props.suelto) return invoke<Preview>("office_preview", { path: props.ruta }, machineOf(props.session));
    if (props.session === "") return null;
    return invoke<Preview>("tree_office_preview", {
      project: props.project,
      session: props.session,
      tree: props.arbol,
      path: props.ruta,
    }, machineOf(props.session));
  }

  const pedirContenido = async (): Promise<Contenido> => {
    if (props.suelto) {
      const p = await invoke<Preview>("preview_file", { path: props.ruta, rel: props.ruta }, machineOf(props.session));
      return {
        kind: p.kind === "html" ? "text" : p.kind,
        text: p.text ?? "",
        data_url: p.data_url,
        pdf: p.pdf,
        bytes: p.bytes,
        truncated: p.truncated,
      };
    }
    return props.session === ""
      ? invoke<Contenido>("preview_tree_show", {
          project: props.project,
          baseRef: props.base,
          path: props.ruta,
        })
      : invoke<Contenido>("tree_show", {
          project: props.project,
          session: props.session,
          tree: props.arbol,
          path: props.ruta,
        }, machineOf(props.session));
  };

  /** Su diff con el archivo entero de contexto (`tree_patch`, `-U100000`). Vacío = no cambió. */
  const pedirDiff = () =>
    previa()
      ? Promise.resolve(null)
      : invoke<string>("tree_patch", {
          project: props.project,
          session: props.session,
          tree: props.arbol,
          path: props.ruta,
        }, machineOf(props.session)).then((patch) => parsearDiff(patch)[0] ?? null);

  // Siempre y no solo al mirarlo: sin saber si es texto no se sabe si se puede escribir.
  createEffect(
    on([() => props.ruta, () => props.arbol], async () => {
      setLeyendo(true);
      try {
        setContenido(await pedirContenido());
      } catch (e) {
        if (esBorrado(e)) void alBorrarse();
        else setFallo(asFailure(e));
      } finally {
        setLeyendo(false);
      }
    }),
  );

  // Una sola vez: cambiar de vista y volver no lo vuelve a pedir.
  createEffect(
    on([mostrarCambios, () => props.ruta, () => props.arbol], async ([ver]) => {
      if (!ver || diff() !== null) return;
      setComparando(true);
      try {
        setDiff(await pedirDiff());
      } catch (e) {
        setFallo(asFailure(e));
      } finally {
        setComparando(false);
      }
    }),
  );

  /**
   * Volver a leer el archivo porque el árbol se movió (`refresh.ts`). Pide
   * también el patch: sin él, la vista de cambios seguiría lo que dijo el árbol
   * la última vez. Con el borrador tocado no entra encima: enciende el aviso.
   */
  async function refrescar() {
    if (props.suelto) return;
    const vista = escrituras;
    try {
      // En serie: leer el contenido pone al día el índice del que sale el diff.
      const c = await pedirContenido();
      const d = await pedirDiff();
      if (escrituras !== vista) return;
      setDiff(d);
      setHayCambios(d !== null);
      // El disco dice lo que ya se sabía: lo guardó esta pestaña o cambió otro archivo de la tarea.
      // Tocar el editor ahí borraría lo tecleado desde entonces.
      // Con el peso: de un archivo recortado solo cruzan sus primeros 400 KB.
      if (c.kind === contenido()?.kind && c.text === contenido()?.text && c.bytes === contenido()?.bytes) return;
      const entrada = comoEntra(borrador() !== null, sucio());
      if (entrada === "avisa") {
        setDesincronizado(true);
        return;
      }
      setContenido(c);
      if (entrada === "arrastra") setBorrador(c.text);
    } catch (e) {
      if (esBorrado(e)) void alBorrarse();
      else setFallo(asFailure(e));
    }
  }

  alMoverseElArbol(
    () => props.session,
    () => props.visible,
    () => void refrescar(),
  );

  /**
   * El archivo ya no está en el disco. Se mira otra vez tras una pausa: quien lo reescribe
   * borrándolo y creándolo no cierra la pestaña. Sin nada escrito se cierra; con algo, avisa.
   */
  let confirmando = false;
  async function alBorrarse() {
    if (confirmando || props.suelto || previa()) return;
    confirmando = true;
    try {
      await new Promise((listo) => setTimeout(listo, ESPERA_DEL_BORRADO));
      await pedirContenido();
      setBorrado(false);
      void refrescar();
    } catch (e) {
      if (!esBorrado(e)) return void setFallo(asFailure(e));
      if (sucio()) setBorrado(true);
      else props.onBorrado?.();
    } finally {
      confirmando = false;
    }
  }

  // Escondida también: el árbol avisa de lo que dejó de listar y solo esa pestaña lee.
  const alIrse = (e: Event) => {
    const d = (e as CustomEvent<DetalleDeIdos>).detail;
    if (d.session === props.session && d.arbol === props.arbol && d.rutas.includes(props.ruta)) void alBorrarse();
  };
  window.addEventListener(IDOS, alIrse);
  onCleanup(() => window.removeEventListener(IDOS, alIrse));

  function descartar() {
    if (props.readOnly) return;
    // Con el archivo movido por debajo, lo que está en la mano es lo de antes: hay que traer lo del agente.
    const traer = desincronizado();
    setFallo(null);
    setBorrador(null);
    setDesincronizado(false);
    if (traer) void refrescar();
  }

  const [textoDeLaPrevia, setTextoDeLaPrevia] = createSignal("");
  createEffect(
    on(textoActual, (texto) => {
      if (borrador() === null) return void setTextoDeLaPrevia(texto);
      const espera = setTimeout(() => setTextoDeLaPrevia(texto), PAUSA_DE_LA_PREVIA);
      onCleanup(() => clearTimeout(espera));
    }),
  );

  // El texto del editor es la única fuente de un `.typ` abierto: viaja entero a Tinymist en
  // cada cambio, uno a la vez y sin pasos intermedios. El disco lo escribe el guardado, al dejar de teclear.
  const vivaDelArbol = () => (typstVivo() ? vivaDe(props.session, props.arbol) : null);
  let enviando = false;
  let porEnviar: { key: string; texto: string } | null = null;
  let abiertoEn: { key: string; path: string } | null = null;
  async function enviar(key: string, texto: string) {
    porEnviar = { key, texto };
    if (enviando) return;
    enviando = true;
    while (porEnviar) {
      const envio: { key: string; texto: string } = porEnviar;
      porEnviar = null;
      try {
        const path = props.ruta;
        await invoke("typst_live_change", { key: envio.key, path, text: envio.texto });
        abiertoEn = { key: envio.key, path };
      } catch {
        // Sin reabrir, los errores que se ven son los de un texto que ya no es: la vista nueva lo vuelve a mandar.
        pedirReapertura(props.session, props.arbol);
      }
    }
    enviando = false;
  }
  createEffect(() => {
    const viva = vivaDelArbol();
    const texto = borrador() ?? contenido()?.text ?? null;
    if (viva?.estado !== "lista" || texto === null) return;
    void enviar(viva.key, texto);
  });
  onCleanup(() => {
    // Sin `props.ruta`: al desmontar puede venir de un `<Show>` que ya no se cumple y lanzar «Stale read».
    if (abiertoEn) void invoke("typst_live_close_doc", abiertoEn).catch(() => {});
  });

  // El panel de «@» y las rutas pide a la vista de este árbol; sin ella, el editor no propone nada.
  const dondeTypst = () => {
    const viva = vivaDelArbol();
    return {
      project: props.project,
      session: props.session,
      arbol: props.arbol,
      ruta: props.ruta,
      key: viva?.estado === "lista" ? viva.key : null,
    };
  };
  createEffect(() => {
    if (!props.visible || !typst() || !editable()) return;
    const editor = { session: props.session, arbol: props.arbol, ruta: props.ruta };
    mirarEditorTypst(editor);
    onCleanup(() => dejarDeMirarEditorTypst(editor));
  });

  function mostrarEnLaVista(linea: number, columna: number) {
    const viva = vivaDelArbol();
    if (viva?.estado !== "lista") return;
    void invoke("typst_live_reveal", { key: viva.key, path: props.ruta, line: linea, column: columna }).catch(() => {});
  }

  let guardadoEnEspera: ReturnType<typeof setTimeout> | undefined;
  onCleanup(() => clearTimeout(guardadoEnEspera));
  createEffect(
    on(borrador, () => {
      clearTimeout(guardadoEnEspera);
      if (!typstVivo() || !editable() || !sucio() || desincronizado() || borrado()) return;
      guardadoEnEspera = setTimeout(() => {
        if (sucio() && !desincronizado() && !borrado()) void guardar();
      }, PAUSA_DEL_INDICE);
    }),
  );

  /** Con el plugin, el archivo se guarda solo en la copia: Guardar y Descartar sobran salvo ante un cambio ajeno. */
  const conGuardadoManual = () => sucio() && (!typstVivo() || !editable() || desincronizado());

  return (
    <div
      tabindex="-1"
      classList={{ "outline-none": true }}
      onKeyDown={(e) => {
        // Desde la vista previa el editor está escondido y su Mod-s no oye nada.
        if (!e.defaultPrevented && (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s" && editable()) {
          e.preventDefault();
          void guardar();
          return;
        }
        if (!esAtajoDeAjuste(e)) return;
        e.preventDefault();
        alternarAjuste();
      }}
      class="@container flex h-full min-h-0 flex-col"
    >
      {/* Los controles de escritura van en esta fila: es la única que está siempre. */}
      <div class={cn("flex shrink-0 items-center gap-2 border-b border-border pr-1.5 pl-2.5", HEADER_HEIGHT)}>
        <Migas ruta={props.ruta}>
          <Show when={sucio() || guardando()}>
            <span
              title={
                desincronizado()
                  ? t("code.file.save.over_agent")
                  : typstVivo() && editable()
                    ? t("code.typst.autosave.title")
                    : t("code.file.save.title")
              }
              class="shrink-0 text-caption text-warning-strong"
            >
              ●
            </span>
          </Show>
        </Migas>

        <span aria-live="polite" class="sr-only">
          {guardando() ? t("code.file.saving") : ""}
        </span>

        <Show when={conGuardadoManual()}>
          <Button
            variant="ghost"
            size="compact"
            class="shrink-0"
            disabled={guardando() || props.readOnly}
            onClick={descartar}
            title={desincronizado() ? t("code.file.discard.keep_agent") : t("code.file.discard.leave")}
          >
            {t("code.file.discard")}
          </Button>
          <Button
            variant="secondary"
            size="compact"
            class="shrink-0"
            disabled={guardando() || props.readOnly}
            onClick={() => void guardar()}
            aria-keyshortcuts={ariaDeAtajo("saveFile")}
            title={
              desincronizado()
                ? t("code.file.save.over_agent")
                : `${t("code.file.save.title")} (${textoDeAtajo("saveFile")})`
            }
          >
            {t("code.file.save")}
          </Button>
        </Show>

        <Show when={hayCambios() && !previa()}>
          <BotonDeBarra
            pulsado={verCambios()}
            titulo={t("code.file.changes.title")}
            onClick={alternarCambios}
          >
            <IconoCambios size={13} aria-hidden="true" />
            <span class="sr-only">{t("code.file.view.changes")}</span>
          </BotonDeBarra>
        </Show>
        <Show when={mostrarCambios()}>
          <div class="flex @max-[560px]:hidden"><SelectorDeDisposicion /></div>
        </Show>

        <Show when={conPrevia()}>
          <div role="group" aria-label={t("code.file.layout.label")} class="flex shrink-0 gap-0.5">
            <BotonDeBarra pulsado={disposicion() === "codigo"} onClick={() => elegir("codigo")} titulo={t("code.file.layout.code")}>
              <IconoCodigo size={13} aria-hidden="true" />
              <span class="sr-only">{t("code.file.layout.code")}</span>
            </BotonDeBarra>
            <BotonDeBarra pulsado={disposicion() === "lado"} onClick={() => elegir("lado")} titulo={t("code.file.layout.split.title")} class="@max-[560px]:hidden">
              <IconoLado size={13} aria-hidden="true" />
              <span class="sr-only">{t("code.file.layout.split")}</span>
            </BotonDeBarra>
            <BotonDeBarra pulsado={disposicion() === "previa"} onClick={() => elegir("previa")} titulo={t("code.file.view.preview")}>
              <IconoPrevia size={13} aria-hidden="true" />
              <span class="sr-only">{t("code.file.view.preview")}</span>
            </BotonDeBarra>
          </div>
        </Show>

        {/* Los scripts se muestran en su carpeta; no se ejecutan al abrirlos. */}
        <Show when={canOpenExternal()}>
          <Button
            variant="ghost"
            size="compact"
            class="shrink-0 gap-1.5 text-neutral-500"
            title={t("code.file.open_external.title")}
            onClick={() => void openExternal()}
          >
            <Navegador size={13} aria-hidden="true" />
            <span class="sr-only">{CON_SU_APP.includes(extension(props.ruta)) ? t("code.file.open_with_app") : t("code.file.open_external")}</span>
          </Button>
        </Show>
      </div>

      <Show when={borrado()}>
        <div class="flex shrink-0 items-center gap-2 border-b border-border bg-surface-raised px-3 py-1.5">
          <p class="m-0 min-w-0 flex-1 text-caption text-warning-strong">{t("code.file.deleted")}</p>
          <Button variant="ghost" size="compact" class="shrink-0" disabled={guardando() || props.readOnly} onClick={() => props.onBorrado?.()}>
            {t("code.file.deleted.close")}
          </Button>
          <Button variant="secondary" size="compact" class="shrink-0" disabled={guardando() || props.readOnly} onClick={() => void guardar()}>
            {t("code.file.deleted.save")}
          </Button>
        </div>
      </Show>

      {/* Sin este aviso, guardar pisaba el turno del agente en silencio. */}
      <Show when={desincronizado()}>
        <p class="m-0 border-b border-border bg-surface-raised px-3 py-2 text-caption text-warning-strong">
          {t("code.file.raced")}
        </p>
      </Show>

      <Show when={falloAfuera()}>
        {(f) => (
          <div class="border-b border-border p-3">
            <FailureNote f={f()} />
          </div>
        )}
      </Show>

      <Show when={fallo()}>
        {(f) => (
          <div class="p-3">
            <FailureNote f={f()} />
          </div>
        )}
      </Show>

      {/* Solo el lado del código espera al archivo: el panel de la vista existe desde que se abre la pestaña. */}
      <div ref={fila} class="flex min-h-0 min-w-0 flex-1">
        <div
          class={cn("min-h-0 min-w-0 flex-col", ladoCodigo() ? "flex" : "hidden", !partida() && "flex-1")}
          style={partida() ? { flex: `0 0 ${reparto() * 100}%` } : undefined}
        >
          <Show
            when={contenido()}
            fallback={
              <Show when={!fallo()}>
                <p class="m-0 p-3 text-xs text-neutral-500">
                  {leyendo() ? t("code.file.opening") : t("code.file.unreadable")}
                </p>
              </Show>
            }
          >
            {(c) => (
              <>
                <Show when={mostrarCambios()}>
                  <Show
                    when={diff()}
                    fallback={
                      <p class="m-0 p-3 text-xs text-neutral-500">
                        {comparando() ? t("code.comparing") : t("code.file.gone_from_diff")}
                      </p>
                    }
                  >
                    {(d) => (
                      <div data-select-scope class="min-h-0 min-w-0 flex-1 overflow-hidden bg-surface-muted">
                        {/* Ya llega con el archivo entero de contexto: no hay tramo que traer. */}
                        <CuerpoDeArchivo archivo={d()} onDesplegar={() => {}} llena />
                      </div>
                    )}
                  </Show>
                </Show>

                <Show when={!mostrarCambios() && !editable()}>
                  <div data-select-scope class="min-h-0 min-w-0 flex-1 overflow-y-auto bg-surface-muted">
                    <Cuerpo contenido={c()} ruta={props.ruta} onOpenExternal={() => void openExternal()} pedirOffice={pedirOffice} />
                  </div>
                </Show>

                {/* Montado mientras se pueda escribir, también escondido o con un fallo encima. */}
                <Show when={conEditor() && editable()}>
                  <div class={cn("min-h-0 min-w-0 flex-1 flex-col", mostrarCambios() ? "hidden" : "flex")}>
                    <Suspense
                      fallback={<CuerpoDeArchivo archivo={comoDiff(props.ruta, c().text)} onDesplegar={() => {}} />}
                    >
                      <EditorDeCodigo
                        ruta={props.ruta}
                        texto={borrador() ?? c().text}
                        readOnly={props.readOnly}
                        onEscribir={text => { if (!props.readOnly) setBorrador(text); }}
                        onGuardar={() => void guardar()}
                        onCursor={(linea, columna) => setCursor({ linea, columna })}
                        onClic={mostrarEnLaVista}
                        marcas={marcas()}
                        irA={irA()}
                        onIdoA={consumirSalto}
                        typst={typst() && editable() ? dondeTypst : undefined}
                      />
                    </Suspense>
                  </div>
                </Show>
              </>
            )}
          </Show>
        </div>

        <Show when={partida()}>
          <Divisor fila={() => fila} />
        </Show>

        {/* Con «Código» la vista de Typst se esconde sin desmontarse: soltarla apagaría Tinymist y sus marcas. */}
        <Show when={ladoPrevia() || vistaTypst()}>
          <div
            data-select-scope
            class={cn(
              "min-h-0 min-w-0 flex-1 flex-col",
              ladoPrevia() ? "flex" : "hidden",
              !vistaTypst() && "overflow-y-auto",
              ladoCodigo() && "border-l border-border",
            )}
          >
            <Show
              when={vistaTypst()}
              fallback={
                <Show
                  when={pagina()}
                  fallback={<Previa texto={textoDeLaPrevia()} ruta={props.ruta} aSangre={deCodigo() !== false} />}
                >
                  {(url) => <PaginaEnVivo url={url()} nombre={props.ruta} />}
                </Show>
              }
            >
              <Suspense fallback={<p class="m-0 p-3 text-xs text-neutral-500">{t("code.file.opening")}</p>}>
                <VistaPreviaTypst
                  project={props.project}
                  session={props.session}
                  arbol={props.arbol}
                  ruta={props.ruta}
                  visible={props.visible && ladoPrevia()}
                  onIrA={irAlDiagnostico}
                />
              </Suspense>
            </Show>
          </div>
        </Show>
      </div>

      {/* Con la vista de Typst la barra existe desde que abre la pestaña: aparecer al cargar encogería el hueco del PDF. */}
      <Show when={esTexto() || vistaTypst()}>
        <BarraDeEstado
          cursor={ladoCodigo() && !mostrarCambios() && editable() ? cursor() : null}
          texto={textoActual()}
          lenguaje={lenguaje()}
        />
      </Show>
    </div>
  );
}

/** El tirador entre el código y la vista previa. Con el puntero capturado, el PDF o el marco de al lado no se lo quedan. */
function Divisor(props: { fila: () => HTMLDivElement | undefined }) {
  const mover = (fraccion: number) => recordarReparto(Math.min(0.8, Math.max(0.2, fraccion)));
  return (
    <div
      role="separator"
      tabindex={0}
      aria-label={t("code.file.layout.resize")}
      aria-orientation="vertical"
      aria-valuemin={20}
      aria-valuemax={80}
      aria-valuenow={Math.round(reparto() * 100)}
      class="group/divisor relative z-10 w-0 shrink-0 cursor-col-resize outline-none"
      onPointerDown={(e) => {
        const caja = props.fila()?.getBoundingClientRect();
        if (!caja || caja.width === 0) return;
        e.preventDefault();
        const tirador = e.currentTarget;
        tirador.setPointerCapture(e.pointerId);
        setMoviendoHueco(true);
        const seguir = (ev: PointerEvent) => mover((ev.clientX - caja.left) / caja.width);
        const soltar = () => {
          setMoviendoHueco(false);
          tirador.removeEventListener("pointermove", seguir);
          tirador.removeEventListener("pointerup", soltar);
          tirador.removeEventListener("pointercancel", soltar);
        };
        tirador.addEventListener("pointermove", seguir);
        tirador.addEventListener("pointerup", soltar);
        tirador.addEventListener("pointercancel", soltar);
      }}
      onDblClick={() => mover(0.5)}
      onKeyDown={(e) => {
        const paso = e.key === "ArrowRight" ? 0.02 : e.key === "ArrowLeft" ? -0.02 : 0;
        if (!paso) return;
        e.preventDefault();
        mover(reparto() + paso);
      }}
    >
      <span
        aria-hidden="true"
        class="absolute inset-y-0 -left-[3px] w-[7px] transition-colors duration-150 ease-out group-hover/divisor:bg-primary/40 group-focus-visible/divisor:bg-primary/40"
      />
    </div>
  );
}

/** La ruta partida en carpetas y el nombre. Las carpetas se recortan por la izquierda: lo cercano al archivo es lo que distingue. */
function Migas(props: { ruta: string; children: JSX.Element }) {
  const partes = () => props.ruta.split(/[/\\]/).filter(Boolean);
  const nombre = () => partes().at(-1) ?? props.ruta;
  const carpetas = () => partes().slice(0, -1);
  return (
    <nav aria-label={t("code.file.path")} title={props.ruta} class="flex min-w-0 flex-1 items-center gap-1 text-xs text-neutral-500">
      <Show when={carpetas().length > 0}>
        <span dir="rtl" class="min-w-0 truncate text-left">
          <bdi>
            <For each={carpetas()}>
              {(carpeta) => (
                <>
                  {carpeta}
                  <span aria-hidden="true" class="px-1 opacity-70">›</span>
                </>
              )}
            </For>
          </bdi>
        </span>
      </Show>
      <span class="inline-flex shrink-0 items-center gap-1.5 font-medium text-neutral-950">
        <IconoDeArchivo ruta={props.ruta} class="shrink-0" />
        {nombre()}
      </span>
      {props.children}
    </nav>
  );
}

/** Lo pulsado se marca como el conmutador Agentes · Tareas: `secondary` pulsado, `ghost` suelto. */
function BotonDeBarra(props: { pulsado: boolean; titulo: string; onClick: () => void; class?: string; children: JSX.Element }) {
  return (
    <Button
      variant={props.pulsado ? "secondary" : "ghost"}
      size="compact"
      aria-pressed={props.pulsado}
      title={props.titulo}
      onClick={() => props.onClick()}
      class={cn("shrink-0 gap-1.5", !props.pulsado && "text-neutral-500 hover:text-neutral-950", props.class)}
    >
      {props.children}
    </Button>
  );
}

/** Lo que se ve del archivo: una tabla si es tabular, su HTML en el marco de los artefactos o su Markdown pintado. */
function Previa(props: { texto: string; ruta: string; aSangre: boolean }) {
  const delim = () => delimiterFor(props.ruta);
  return (
    <Show
      when={delim()}
      fallback={
        <Show
          when={esHtml(props.ruta)}
          fallback={
            <div class="p-4">
              <Markdown>{props.texto}</Markdown>
            </div>
          }
        >
          <div
            class={cn(
              "flex min-h-0 flex-1 flex-col",
              !props.aSangre && formaDe(props.texto) !== "web" && "px-4 py-3",
            )}
          >
            <Documento html={props.texto} nombre={props.ruta} onFilas={() => {}} aSangre={props.aSangre} />
          </div>
        </Show>
      }
    >
      {(d) => (
        <Suspense fallback={<p class="m-0 p-3 text-xs text-neutral-500">{t("code.file.opening")}</p>}>
          <DelimitedTable text={props.texto} delim={d()} />
        </Suspense>
      )}
    </Show>
  );
}

function BarraDeEstado(props: {
  cursor: { linea: number; columna: number } | null;
  texto: string;
  lenguaje: string | null;
}) {
  const sangria = createMemo(() => sangriaDe(props.texto));
  const finDeLinea = () => (props.texto.includes("\r\n") ? "CRLF" : "LF");
  return (
    <div
      role="group"
      aria-label={t("code.status.label")}
      class="flex h-6 shrink-0 items-center justify-end gap-3 border-t border-border px-3 text-caption text-neutral-500"
    >
      <Show when={props.cursor}>
        {(c) => <span class="font-mono tabular-nums">{t("code.status.position", { linea: c().linea, columna: c().columna })}</span>}
      </Show>
      <span>
        {sangria() === "\t"
          ? t("code.status.indent.tab")
          : t("code.status.indent.spaces", { count: sangria().length })}
      </span>
      <span>UTF-8</span>
      <span>{finDeLinea()}</span>
      <span>{props.lenguaje ?? t("code.status.plain")}</span>
    </div>
  );
}

/**
 * Lo que hay dentro de un archivo que no se escribe aquí. El texto pasa por
 * `comoDiff` para que lo pinte el mismo componente que el diff: mismos números,
 * misma letra y mismo desplazamiento.
 */
/** Lo que `env::resolve_file_target` abre con su aplicación en vez de mostrar su carpeta. */
const CON_SU_APP = [
  "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "odt", "ods", "odp", "rtf", "txt", "md", "csv", "tsv",
  "png", "jpg", "jpeg", "gif", "webp", "bmp", "tif", "tiff", "heic", "html", "htm",
];

const OFFICE = ["doc", "docx", "xls", "xlsx", "ppt", "pptx", "odt", "ods", "odp", "rtf"];

function Cuerpo(props: {
  contenido: Contenido;
  ruta: string;
  onOpenExternal: () => void;
  pedirOffice: () => Promise<Preview> | null;
}) {
  const esOffice = () => props.contenido.kind === "binary" && OFFICE.includes(extension(props.ruta));
  // `office_preview` y `tree_office_preview` rechazan con la cadena sola.
  const [office] = createResource(
    () => (esOffice() ? props.ruta : null),
    async () => {
      const pedido = props.pedirOffice();
      if (!pedido) return { pdf: null, falta: false };
      try {
        return { pdf: (await pedido).pdf, falta: false };
      } catch (e) {
        return { pdf: null, falta: e === "libreoffice_missing" };
      }
    },
  );
  const truncatedNotice = () => {
    if (props.contenido.kind === "text") return t("code.file.too_big");
    return isImage(props.ruta)
      ? t("code.file.image_too_big", { size: peso(props.contenido.bytes) })
      : t("code.file.opaque_big", { size: peso(props.contenido.bytes) });
  };
  return (
    <>
      <Show when={props.contenido.truncated}>
        <p class="m-0 border-b border-border bg-surface-raised px-3 py-2 text-caption text-neutral-500">
          {truncatedNotice()}
        </p>
      </Show>

      <Suspense fallback={<p class="m-0 p-3 text-xs text-neutral-500">{t("code.file.opening")}</p>}>
        <Show when={props.contenido.kind === "image" && props.contenido.data_url}>
          {(source) => <ZoomableImage src={source()} alt={props.ruta} />}
        </Show>
        <Show when={props.contenido.kind === "pdf" && props.contenido.pdf}>
          {(data) => <PdfDocument base64={data()} name={props.ruta} />}
        </Show>
      </Suspense>

      <Show when={esOffice() && (office.loading || office()?.pdf)}>
        <Show
          when={office()?.pdf}
          fallback={<p class="m-0 p-6 text-center text-xs text-neutral-500">{t("code.file.office.converting")}</p>}
        >
          {(data) => (
            <Suspense fallback={<p class="m-0 p-3 text-xs text-neutral-500">{t("code.file.opening")}</p>}>
              <PdfDocument base64={data()} name={props.ruta} />
            </Suspense>
          )}
        </Show>
      </Show>

      {/* Un binario desconocido se muestra en su carpeta; nunca se ejecuta desde aquí. */}
      <Show when={props.contenido.kind === "binary" && !(esOffice() && (office.loading || office()?.pdf))}>
        <div class="flex flex-col items-center gap-3 p-6">
          <Show when={!props.contenido.truncated}>
            <p class="m-0 text-xs text-neutral-500">
              {t("code.file.opaque", { size: peso(props.contenido.bytes) })}
            </p>
          </Show>
          <Show when={office()?.falta}>
            <p class="m-0 text-xs text-neutral-500">{t("code.file.office.missing")}</p>
          </Show>
          <Button variant="primary" size="compact" onClick={props.onOpenExternal}>
            {t("code.file.open_external")}
          </Button>
        </div>
      </Show>

      <Show when={props.contenido.kind === "text"}>
        <CuerpoDeArchivo archivo={comoDiff(props.ruta, props.contenido.text)} onDesplegar={() => {}} />
      </Show>
    </>
  );
}
