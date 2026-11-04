import { listen } from "../../lib/serviceEvents";
import { createEffect, createRoot, createSignal, on } from "solid-js";
import { t } from "../../lib/i18n";
import { invoke } from "../../lib/invoke.ts";
import { createPref } from "../../lib/prefs";
import { huecoLibre, moviendoHueco, zonasEncima, type Hueco } from "../../lib/sites";

/** `environment/typst.rs` · `Diagnostico`. */
export type DiagnosticoTypst = {
  severity: "error" | "warning";
  /** Relativa al árbol, con `/`; `null` si el error no tiene lugar en la fuente. */
  path: string | null;
  /** Desde 1. */
  line: number | null;
  /** Desde 1, en unidades UTF-16, como las posiciones de CodeMirror. */
  column: number | null;
  message: string;
};

/** `environment/typst_live.rs` · `VistaViva`. */
type VistaViva = { estado: "sin_typst" | "sin_tinymist" | "lista"; key: string; puerto: number; main: string };

/** `environment/typst.rs` · `Exportacion`. */
export type ExportacionTypst = { pdf: string | null; diagnostics: DiagnosticoTypst[] };

/** `environment/typst_live.rs` · `Aviso`, el evento `typst-live`. */
type AvisoTypst = {
  key: string;
  kind: "diagnostics" | "status" | "jump";
  path: string | null;
  line: number | null;
  column: number | null;
  diagnostics: DiagnosticoTypst[];
  status: "compiling" | "compileSuccess" | "compileError" | null;
  pages: number | null;
};

export { esTypst } from "./typstScope";

/** Si el plugin Typst está activo en este workspace: sin él, un `.typ` es un archivo de texto más. */
const [pluginTypst, setPluginTypst] = createSignal(false);

/** Si esta ventana registra `typst_live_*`; `null` hasta saberlo, y entonces no hay vista que ofrecer. */
const [servida, setVistaServida] = createSignal<boolean | null>(null);
export const vistaServida = () => servida() === true;

/** El ojo y el PDF al lado: el plugin activo y una ventana que sirve la vista. */
export const conVistaTypst = () => pluginTypst() && vistaServida();

/**
 * Sin Tinymist en la ventana (la web), el PDF al lado sale de exportar en la
 * máquina de la tarea (`tree_typst_export`) cada vez que el documento cambia.
 */
export const conVistaExportada = () => pluginTypst() && servida() === false;

/** Al montar la ventana: suelta los Tinymist que dejó una recarga y, de paso, sabe si la vista existe. */
export function soltarVistasHuerfanas() {
  // `typst_live_stop` no devuelve error: si se rechaza, es que la ventana no lo registra.
  void invoke("typst_live_stop", { key: null, session: null }).then(
    () => setVistaServida(true),
    () => setVistaServida(false),
  );
}

let consultado = false;
/** Desactivar y reactivar seguido cruza dos consultas: solo cuenta la última que se pidió. */
let consulta = 0;
async function consultarPlugin() {
  const n = ++consulta;
  const activo = await invoke<{ plugins: { id: string; enabled: boolean }[] }>("list_integrations").then(
    (catalogo) => catalogo.plugins.some((p) => p.id === "typst" && p.enabled),
    () => false,
  );
  if (n === consulta) setPluginTypst(activo);
}

/** Pide el estado una vez y lo sigue con cada cambio de plugins o de workspace. */
export function seguirPluginTypst() {
  if (consultado) return;
  consultado = true;
  void consultarPlugin();
  void listen("integrations-changed", () => void consultarPlugin());
  window.addEventListener("harness:workspace", () => void consultarPlugin());
}

/** El principal que eligió la persona con el ojo del árbol, por proyecto: sirve a todas sus tareas. */
const [principales, guardarPrincipales] = createPref<Record<string, string>>("typst.main", {});

export const principalElegido = (project: string): string | null => principales()[project] ?? null;

/** `null` quita la elección: el proyecto vuelve a abrir sus archivos como siempre. */
export function elegirPrincipal(project: string, ruta: string | null) {
  const { [project]: _, ...resto } = principales();
  guardarPrincipales(ruta === null ? resto : { ...resto, [project]: ruta });
}

const claveDe = (session: string, arbol: string) => `${session}\n${arbol}`;

/** Un cambio que no llegó a Tinymist pide reabrir la vista de su árbol; la vuelven a pedir sus visores. */
const [reaperturas, setReaperturas] = createSignal<Record<string, number>>({});
export const reaperturaDe = (session: string, arbol: string) => reaperturas()[claveDe(session, arbol)] ?? 0;
export function pedirReapertura(session: string, arbol: string) {
  const clave = claveDe(session, arbol);
  setReaperturas((r) => ({ ...r, [clave]: (r[clave] ?? 0) + 1 }));
}

/** La vista viva de cada árbol de tarea: la arranca el primer visor y la comparten los demás. */
const [vivas, setVivas] = createSignal<Record<string, VistaViva>>({});

/** Lo que dijo Tinymist de cada vista: errores por archivo, que cada aviso reemplaza, y su estado. */
type Compilacion = {
  porArchivo: Record<string, DiagnosticoTypst[]>;
  status: AvisoTypst["status"];
  pages: number | null;
};
const [compilaciones, setCompilaciones] = createSignal<Record<string, Compilacion>>({});

/** Fuera de la carpeta, como un paquete: la clave que no puede ser una ruta. */
const SIN_ARCHIVO = "\u0000";

/** El doble clic en la vista de Tinymist: lo consume el visor visible de ese árbol. */
const [saltoDeLaVista, setSaltoDeLaVista] = createSignal<{ key: string; path: string; line: number; column: number; n: number } | null>(null);
export { saltoDeLaVista };

let escuchando = false;
function escuchar() {
  if (escuchando) return;
  escuchando = true;
  void listen<AvisoTypst>("typst-live", (e) => {
    const a = e.payload;
    if (a.kind === "jump") {
      if (a.path && a.line) setSaltoDeLaVista({ key: a.key, path: a.path, line: a.line, column: a.column ?? 1, n: ++saltos });
      return;
    }
    setCompilaciones((c) => {
      const previa = c[a.key] ?? { porArchivo: {}, status: null, pages: null };
      if (a.kind === "status") return { ...c, [a.key]: { ...previa, status: a.status, pages: a.pages ?? previa.pages } };
      const archivo = a.path ?? SIN_ARCHIVO;
      return { ...c, [a.key]: { ...previa, porArchivo: { ...previa.porArchivo, [archivo]: a.diagnostics } } };
    });
  });
}

const usos = new Map<string, number>();
const apagados = new Map<string, ReturnType<typeof setTimeout>>();
/** Cambiar de pestaña desmonta y monta el visor: la vista espera un poco antes de apagarse. */
const ESPERA_DEL_APAGADO = 5000;

/** Arranca (o comparte) la vista del árbol con el principal elegido. Cada llamada pide su `soltarVista`. */
export async function abrirVista(project: string, session: string, arbol: string, ruta: string): Promise<VistaViva> {
  escuchar();
  const clave = claveDe(session, arbol);
  clearTimeout(apagados.get(clave));
  const viva = await invoke<VistaViva>("typst_live_open", {
    project,
    session,
    tree: arbol,
    path: ruta,
    main: principalElegido(project),
  });
  const previa = vivas()[clave];
  if (previa && (previa.puerto !== viva.puerto || previa.main !== viva.main)) {
    setCompilaciones((c) => ({ ...c, [viva.key]: { porArchivo: {}, status: null, pages: null } }));
  }
  setVivas((v) => ({ ...v, [clave]: viva }));
  return viva;
}

export function tomarVista(session: string, arbol: string) {
  const clave = claveDe(session, arbol);
  clearTimeout(apagados.get(clave));
  usos.set(clave, (usos.get(clave) ?? 0) + 1);
}

export function soltarVista(session: string, arbol: string) {
  const clave = claveDe(session, arbol);
  const quedan = Math.max(0, (usos.get(clave) ?? 1) - 1);
  usos.set(clave, quedan);
  if (quedan > 0) return;
  apagados.set(
    clave,
    setTimeout(() => {
      if ((usos.get(clave) ?? 0) > 0) return;
      const viva = vivas()[clave];
      setVivas(({ [clave]: _, ...resto }) => resto);
      cerrarCapa(clave);
      if (!viva) return;
      setCompilaciones(({ [viva.key]: _, ...resto }) => resto);
      void invoke("typst_live_stop", { key: viva.key, session: null }).catch(() => {});
    }, ESPERA_DEL_APAGADO),
  );
}

/** Antes de borrar una tarea: en Windows un Tinymist vivo bloquea su carpeta. */
export async function apagarVistasDe(session: string) {
  for (const clave of Object.keys(vivas())) {
    if (clave.startsWith(`${session}\n`)) usos.set(clave, 0);
  }
  setVivas((v) => Object.fromEntries(Object.entries(v).filter(([c]) => !c.startsWith(`${session}\n`))));
  for (const clave of [...capas.keys()]) if (clave.startsWith(`${session}\n`)) cerrarCapa(clave);
  await invoke("typst_live_stop", { key: null, session }).catch(() => {});
}

export const vivaDe = (session: string, arbol: string): VistaViva | null => vivas()[claveDe(session, arbol)] ?? null;

/** Si la ventana tiene alguna vista viva de esa tarea. */
export const hayVistasDe = (session: string) => Object.keys(vivas()).some((c) => c.startsWith(`${session}\n`));

/** Lo que se añade a la página de Tinymist: el texto no cambia de color al pasar el ratón. */
const ESTILO_DE_LA_VISTA =
  "html .typst-text:hover, html .hover .typst-text { --glyph_fill: initial; --glyph_stroke: initial; }";

/**
 * La capa nativa de la vista de cada árbol. Es una sola y pasa de una pestaña a otra
 * sin volver a dibujarse: se coloca en el hueco del visor visible y se esconde si no hay ninguno.
 */
/** `cola`: las órdenes a la capa salen en fila; una vieja que llegara tarde la dejaría donde no va. */
type Capa = { label: string | null; puerto: number; cola: Promise<unknown>; ultima: string };
const capas = new Map<string, Capa>();
type Ocupante = { visible: boolean; hueco: Hueco };
const ocupantes = new Map<string, Map<number, Ocupante>>();
let siguienteOcupante = 0;
const [capasListas, setCapasListas] = createSignal<Record<string, boolean>>({});
const [zooms, setZooms] = createSignal<Record<string, number>>({});

export const capaLista = (session: string, arbol: string) => capasListas()[claveDe(session, arbol)] === true;
export const zoomDe = (session: string, arbol: string) => zooms()[claveDe(session, arbol)] ?? 1;

let reaccionando = false;
function reaccionar() {
  if (reaccionando) return;
  reaccionando = true;
  createRoot(() => createEffect(on([zonasEncima, moviendoHueco], () => capas.forEach((_, clave) => colocarCapa(clave)))));
}

// Cambiar de pestaña esconde un visor y enseña otro en el mismo cuadro: se junta todo y sale
// solo el estado final, sin esconder la capa por medio.
const porColocar = new Set<string>();
let cuadro = 0;
function colocarCapa(clave: string) {
  porColocar.add(clave);
  if (cuadro) return;
  cuadro = requestAnimationFrame(() => {
    cuadro = 0;
    const claves = [...porColocar];
    porColocar.clear();
    for (const c of claves) colocarAhora(c);
  });
}

function colocarAhora(clave: string) {
  const capa = capas.get(clave);
  if (!capa?.label) return;
  const label = capa.label;
  const visible = [...(ocupantes.get(clave)?.values() ?? [])].find((o) => o.visible && o.hueco.width >= 1);
  const libre = visible && !moviendoHueco() ? huecoLibre(visible.hueco) : null;
  const destino = libre ? JSON.stringify(libre) : "escondida";
  if (destino === capa.ultima) return;
  capa.ultima = destino;
  const orden = libre ? () => invoke("site_place", { label, ...libre }) : () => invoke("site_hide", { label });
  capa.cola = capa.cola.then(orden).catch(() => {});
}

function cerrarCapa(clave: string) {
  const capa = capas.get(clave);
  capas.delete(clave);
  setCapasListas(({ [clave]: _, ...resto }) => resto);
  if (capa?.label) void invoke("site_close", { label: capa.label }).catch(() => {});
}

export function ocuparCapa(session: string, arbol: string): number {
  reaccionar();
  const clave = claveDe(session, arbol);
  const id = ++siguienteOcupante;
  if (!ocupantes.has(clave)) ocupantes.set(clave, new Map());
  ocupantes.get(clave)?.set(id, { visible: false, hueco: { x: 0, y: 0, width: 0, height: 0 } });
  return id;
}

export function moverOcupante(session: string, arbol: string, id: number, ocupante: Ocupante) {
  const clave = claveDe(session, arbol);
  ocupantes.get(clave)?.set(id, ocupante);
  colocarCapa(clave);
}

export function desocuparCapa(session: string, arbol: string, id: number) {
  const clave = claveDe(session, arbol);
  ocupantes.get(clave)?.delete(id);
  colocarCapa(clave);
}

/** Abre la capa del árbol en `puerto`, o deja la que ya lo enseña. Otro puerto la rehace. */
export async function asegurarCapa(session: string, arbol: string, puerto: number, hueco: Hueco) {
  const clave = claveDe(session, arbol);
  const actual = capas.get(clave);
  if (actual?.puerto === puerto) return;
  if (actual) cerrarCapa(clave);
  const capa: Capa = { label: null, puerto, cola: Promise.resolve(), ultima: "" };
  capas.set(clave, capa);
  const s = await invoke<{ label: string }>("site_open_local", { port: puerto, css: ESTILO_DE_LA_VISTA, ...hueco });
  if (capas.get(clave) !== capa) return void invoke("site_close", { label: s.label }).catch(() => {});
  capa.label = s.label;
  setCapasListas((l) => ({ ...l, [clave]: true }));
  const zoom = zooms()[clave];
  if (zoom && zoom !== 1) void invoke("site_zoom", { label: s.label, factor: zoom }).catch(() => {});
  colocarCapa(clave);
}

export function cerrarCapaDe(session: string, arbol: string) {
  cerrarCapa(claveDe(session, arbol));
}

export function fijarZoom(session: string, arbol: string, zoom: number) {
  const clave = claveDe(session, arbol);
  setZooms((z) => ({ ...z, [clave]: zoom }));
  const label = capas.get(clave)?.label;
  if (label) void invoke("site_zoom", { label, factor: zoom }).catch(() => {});
}

/** La vista ocupa todo el archivo, por tarea: sigue así al cambiar de archivo. */
const [ampliadas, setAmpliadas] = createSignal<Record<string, boolean>>({});

export const ampliadaDe = (session: string, arbol: string) => ampliadas()[claveDe(session, arbol)] === true;

export function ampliarVista(session: string, arbol: string, ampliada: boolean) {
  setAmpliadas((a) => ({ ...a, [claveDe(session, arbol)]: ampliada }));
}

/** Pide al árbol de archivos de esa tarea que abra las carpetas hasta `ruta` y la marque. */
export function revelarEnElArbol(session: string, arbol: string, ruta: string) {
  window.dispatchEvent(new CustomEvent("harness:revelar-en-arbol", { detail: { session, arbol, ruta } }));
}

export type Compilado = {
  main: string;
  diagnostics: DiagnosticoTypst[];
  status: AvisoTypst["status"];
  pages: number | null;
};

/** Lo último que dijo la vista de cada árbol de tarea: lo leen el editor, la barra y el árbol de archivos. */
export function compiladoDe(session: string, arbol: string): Compilado | null {
  const viva = vivaDe(session, arbol);
  if (!viva || viva.estado !== "lista") return null;
  const c = compilaciones()[viva.key];
  return {
    main: viva.main,
    diagnostics: c ? Object.values(c.porArchivo).flat() : [],
    status: c?.status ?? null,
    pages: c?.pages ?? null,
  };
}

export function diagnosticosDelArchivo(session: string, arbol: string, ruta: string): DiagnosticoTypst[] {
  return compiladoDe(session, arbol)?.diagnostics.filter((d) => d.path === ruta && d.line !== null) ?? [];
}

export type Salto = { session: string; arbol: string; ruta: string; linea: number; columna: number; n: number };

/** Ir a un diagnóstico: lo consume el editor del archivo, también el que se monta después. */
const [salto, setSalto] = createSignal<Salto | null>(null);
let saltos = 0;

export { salto };

export function saltarA(session: string, arbol: string, ruta: string, linea: number, columna: number) {
  setSalto({ session, arbol, ruta, linea, columna, n: ++saltos });
}

export function consumirSalto(n: number) {
  if (salto()?.n === n) setSalto(null);
}

export const lugarDe = (d: DiagnosticoTypst) =>
  d.path === null ? "" : d.line === null ? d.path : `${d.path}:${d.line}:${d.column ?? 1}`;

/** Lo que recibe el agente al pulsar «Que lo arregle el agente»: el principal y cada error con su lugar. */
export function mensajeDeArreglo(main: string, errores: DiagnosticoTypst[]): string {
  // El mensaje puede venir del documento (`panic`): sin comillas triples no cierra el bloque.
  const lista = errores
    .map((d) => `- ${lugarDe(d) ? `${lugarDe(d)}: ` : ""}${d.message.replaceAll("```", "'''")}`)
    .join("\n");
  // La cerca va fuera del catálogo: el catálogo cambia las comillas invertidas por saltillo.
  return `${t("code.typst.fix.message", { count: errores.length, main })}\n\`\`\`text\n${lista}\n\`\`\``;
}

/** Lo manda la ventana como si la persona lo hubiera escrito (`App.tsx`), a la tarea de este árbol. */
export function pedirArreglo(project: string, session: string, main: string, errores: DiagnosticoTypst[]) {
  if (errores.length === 0) return;
  window.dispatchEvent(
    new CustomEvent("harness:pedir-al-agente", {
      detail: { project, session, texto: mensajeDeArreglo(main, errores) },
    }),
  );
}

/** El editor de Typst que se está mirando: el menú del árbol de esa tarea le ofrece meter rutas. */
type EditorTypst = { session: string; arbol: string; ruta: string };
const [editorTypst, setEditorTypst] = createSignal<EditorTypst | null>(null);
export { editorTypst };

export function mirarEditorTypst(e: EditorTypst) {
  setEditorTypst(e);
}

export function dejarDeMirarEditorTypst(e: EditorTypst) {
  const actual = editorTypst();
  if (actual && actual.session === e.session && actual.arbol === e.arbol && actual.ruta === e.ruta) setEditorTypst(null);
}

/** `harness:insertar-ruta`: `destino` entra en el editor de `editor`; con `x` e `y`, donde se soltó. */
export type InsercionDeRuta = { session: string; arbol: string; editor: string; destino: string; x?: number; y?: number };

export function pedirInsercionDeRuta(p: InsercionDeRuta) {
  window.dispatchEvent(new CustomEvent("harness:insertar-ruta", { detail: p }));
}

/** Un archivo del árbol en la mano, camino de un editor de Typst. */
const [rutaEnVuelo, setRutaEnVuelo] = createSignal<{ ruta: string; x: number; y: number } | null>(null);
export { rutaEnVuelo };

let rutaRecienSoltada = false;
/** El gesto que terminó fue un arrastre: el clic que lo sigue no abre el archivo. */
export const fueArrastreDeRuta = () => rutaRecienSoltada;

const UMBRAL_DEL_ARRASTRE = 5;

/**
 * Arrastrar una ruta del árbol a un editor de Typst, desde `pointerdown`. Con eventos de
 * puntero por lo mismo que `lib/drag.ts`: con `dragDropEnabled`, WebView2 no entrega el HTML5.
 */
export function arrastrarRuta(inicio: PointerEvent, session: string, arbol: string, ruta: string) {
  if (inicio.button !== 0) return;
  const x0 = inicio.clientX;
  const y0 = inicio.clientY;
  let activo = false;
  const limpiar = () => {
    window.removeEventListener("pointermove", mover);
    window.removeEventListener("pointerup", soltar);
    window.removeEventListener("pointercancel", cancelar);
    window.removeEventListener("keydown", alTeclear, true);
    setRutaEnVuelo(null);
    if (activo) document.body.style.userSelect = "";
  };
  const marcarArrastre = () => {
    rutaRecienSoltada = true;
    setTimeout(() => (rutaRecienSoltada = false));
  };
  const mover = (e: PointerEvent) => {
    if (!activo) {
      if (Math.hypot(e.clientX - x0, e.clientY - y0) < UMBRAL_DEL_ARRASTRE) return;
      activo = true;
      document.body.style.userSelect = "none";
    }
    setRutaEnVuelo({ ruta, x: e.clientX, y: e.clientY });
  };
  const soltar = (e: PointerEvent) => {
    const eraArrastre = activo;
    limpiar();
    if (!eraArrastre) return;
    marcarArrastre();
    const editor = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-typst-editor]");
    const destino = editor?.dataset.typstEditor;
    if (destino) pedirInsercionDeRuta({ session, arbol, editor: destino, destino: ruta, x: e.clientX, y: e.clientY });
  };
  const cancelar = () => {
    const eraArrastre = activo;
    limpiar();
    if (eraArrastre) marcarArrastre();
  };
  const alTeclear = (e: KeyboardEvent) => {
    if (e.key !== "Escape" || !activo) return;
    e.stopPropagation();
    cancelar();
  };
  window.addEventListener("pointermove", mover);
  window.addEventListener("pointerup", soltar);
  window.addEventListener("pointercancel", cancelar);
  window.addEventListener("keydown", alTeclear, true);
}
