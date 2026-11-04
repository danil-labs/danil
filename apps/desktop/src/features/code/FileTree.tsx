import { invoke } from "../../lib/invoke.ts";
import { machineOf } from "../machines/store";
import ChevronDown from "lucide-solid/icons/chevron-down";
import ChevronRight from "lucide-solid/icons/chevron-right";
import Cloud from "lucide-solid/icons/cloud";
import Eye from "lucide-solid/icons/eye";
import EyeClosed from "lucide-solid/icons/eye-closed";
import FilePlus from "lucide-solid/icons/file-plus";
import Folder from "lucide-solid/icons/folder";
import FolderOpen from "lucide-solid/icons/folder-open";
import FolderPlus from "lucide-solid/icons/folder-plus";
import Search from "lucide-solid/icons/search";
import {
  createEffect,
  createMemo,
  createSignal,
  For,
  type JSX,
  on,
  onCleanup,
  onMount,
  Show,
} from "solid-js";
import { t } from "../../lib/i18n";
import { cn } from "../../lib/utils";
import { HEADER_HEIGHT } from "../../lib/window";
import { Button } from "../../ui/Button";
import { Input } from "../../ui/Input";
import { asFailure, type Failure, FailureNote } from "../../ui/Failure";
import { ITEM_DE_MENU, Popover, PopoverContent } from "../../ui/Popover";
import { IconoDeArchivo } from "./FileIcon";
import { colorDeMarca, describirEstado, publicarLocales } from "./localStatus";
import { alMoverseElArbol, avisarDeIdos, avisarDeLosArboles, idos } from "./refresh";
import { crearLector, esTransitorio } from "./treeLoader";
import {
  arrastrarRuta,
  conVistaTypst,
  editorTypst,
  elegirPrincipal,
  esTypst,
  fueArrastreDeRuta,
  pedirInsercionDeRuta,
  principalElegido,
  rutaEnVuelo,
  seguirPluginTypst,
} from "./typst";
import {
  type CambioKn,
  type Carpeta,
  construir,
  type EstadoGit,
  type EstadoLocal,
  filtrar,
  localesDeGit,
  localesDeKn,
  type Nodo,
  type Resumen,
  rutasDeCarpetas,
} from "./tree";

const SANGRIA = 12;
const CHEVRON = 13;

const HuecoDeChevron = () => (
  <span class="shrink-0" style={{ width: `${CHEVRON}px` }} aria-hidden="true" />
);

export type Tipo = "archivo" | "carpeta";

/** Una página de una carpeta plegada. `development::PaginaDeCarpeta`. */
type Pagina = { paths: string[]; folders: Carpeta[]; next: number | null; total: number };
type Plegada = Pagina & { cargando: boolean; fallo: Failure | null };

const padreDe = (ruta: string) => ruta.slice(0, Math.max(0, ruta.lastIndexOf("/")));
const nombreDe = (ruta: string) => ruta.slice(ruta.lastIndexOf("/") + 1);
const unir = (padre: string, nombre: string) => (padre ? `${padre}/${nombre}` : nombre);
const debajoDe = (ruta: string, raiz: string) => ruta === raiz || ruta.startsWith(`${raiz}/`);

export default function ArbolDeArchivos(props: {
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
}) {
  const [cambios, setCambios] = createSignal<Resumen | null>(null);
  const [locales, setLocales] = createSignal<Map<string, EstadoLocal>>(new Map());
  const fijarLocales = (leidos: Map<string, EstadoLocal>) => {
    setLocales(leidos);
    publicarLocales(props.project, props.session, props.arbol, leidos);
  };
  const [falloEstado, setFalloEstado] = createSignal<Failure | null>(null);
  const [leyendoEstado, setLeyendoEstado] = createSignal(false);
  let lectura = 0;
  const [paths, setPaths] = createSignal<string[]>([]);
  const [carpetas, setCarpetas] = createSignal<Carpeta[]>([]);
  const [nube, setNube] = createSignal<string[]>([]);
  const [recortado, setRecortado] = createSignal(false);
  const [cargando, setCargando] = createSignal(true);
  const [fallo, setFallo] = createSignal<Failure | null>(null);
  const [abiertas, setAbiertas] = createSignal<Set<string>>(new Set());
  const [busca, setBusca] = createSignal("");
  // Lo cargado de cada carpeta plegada que se abrió, por su ruta.
  const [plegadas, setPlegadas] = createSignal<Map<string, Plegada>>(new Map());
  const cargadas = createMemo(() => {
    const rutas: string[] = [];
    const subcarpetas: Carpeta[] = [];
    for (const p of plegadas().values()) {
      for (const r of p.paths) rutas.push(r);
      for (const c of p.folders) subcarpetas.push(c);
    }
    return { rutas, subcarpetas };
  });

  const nodos = createMemo(() =>
    construir(
      [...paths(), ...cargadas().rutas],
      cambios()?.files ?? [],
      [...carpetas(), ...cargadas().subcarpetas],
      locales(),
      nube(),
    ),
  );
  const visibles = createMemo(() => filtrar(nodos(), busca()));
  const abiertasAhora = createMemo(() =>
    busca().trim() ? rutasDeCarpetas(visibles()) : abiertas(),
  );

  type Archivos = {
    paths: string[];
    folders: Carpeta[];
    truncated: boolean;
    cloud_only?: string[];
  };

  // La lista de archivos va por `crearLector` (`treeLoader.ts`): una a la vez,
  // reintentos solos tras un fallo del transporte y lo último bueno en pantalla
  // mientras tanto. El estado local y el resumen salen detrás de cada lista buena.
  function leerArchivos() {
    if (props.preview) {
      return invoke<Archivos>("preview_tree_files", { project: props.project, baseRef: props.preview.baseRef });
    }
    return invoke<Archivos>("tree_files", { project: props.project, session: props.session, tree: props.arbol }, machineOf(props.session));
  }

  async function aplicarArchivos(f: Archivos) {
    const turno = ++lectura;
    const vigente = () => turno === lectura;
    if (!props.preview && !recortado() && !f.truncated) {
      const fuera = idos(paths(), f.paths);
      if (fuera.length > 0) avisarDeIdos(props.session, props.arbol, fuera);
    }
    setPaths(f.paths);
    setCarpetas(f.folders);
    setNube(f.cloud_only ?? []);
    setRecortado(f.truncated);
    setCargando(false);
    setFallo(null);
    void refrescarPlegadas();
    if (props.kind === "folder" || props.preview) {
      fijarLocales(new Map());
      setCambios(null);
      setFalloEstado(null);
      return;
    }

    setLeyendoEstado(true);
    try {
      const leidos = props.kind === "kn"
        ? localesDeKn(await invoke<CambioKn[]>("kn_status", {
          project: props.project,
          session: props.session,
        }, machineOf(props.session)))
        : localesDeGit(await invoke<EstadoGit[]>("tree_git_status", {
          project: props.project,
          session: props.session,
          tree: props.arbol,
        }, machineOf(props.session)));
      if (!vigente()) return;
      fijarLocales(leidos);
      setFalloEstado(null);
      if (props.kind !== "kn") {
        const c = await invoke<Resumen>("tree_summary", {
          project: props.project,
          session: props.session,
          tree: props.arbol,
        }, machineOf(props.session));
        if (!vigente()) return;
        setCambios(c);
      } else {
        setCambios(null);
      }
    } catch (e) {
      // Los archivos ya están en pantalla: lo que falló es el estado, y se dice
      // en su sitio, con su «Reintentar», sin tapar el árbol.
      if (!vigente()) return;
      setFalloEstado(asFailure(e));
    } finally {
      if (vigente()) setLeyendoEstado(false);
    }
  }

  const [falloTransitorio, setFalloTransitorio] = createSignal(false);
  const lector = crearLector<Archivos>({
    leer: leerArchivos,
    aplicar: (f) => void aplicarArchivos(f),
    fallar: (e) => {
      setFallo(asFailure(e));
      setFalloTransitorio(esTransitorio(e));
      setCargando(false);
    },
  });
  const cargar = () => lector.pedir();

  onCleanup(() => {
    lectura++;
    lector.soltar();
  });

  // Volver a la ventana o a esta pestaña con un fallo a medias pide otra vez.
  onMount(() => {
    const alVolver = () => {
      if (props.visible && document.visibilityState === "visible" && lector.pendiente()) lector.pedir();
    };
    window.addEventListener("focus", alVolver);
    document.addEventListener("visibilitychange", alVolver);
    onCleanup(() => {
      window.removeEventListener("focus", alVolver);
      document.removeEventListener("visibilitychange", alVolver);
    });
  });
  createEffect(on(() => props.visible, (visible) => {
    if (visible && lector.pendiente()) lector.pedir();
  }, { defer: true }));

  const pedirPagina = (ruta: string, desde: number): Promise<Pagina> =>
    props.preview
      ? invoke("preview_tree_folder", { project: props.project, path: ruta, offset: desde })
      : invoke("tree_folder", { ...ids(), path: ruta, offset: desde }, machineOf(props.session));

  function fijarPlegada(ruta: string, cambio: (antes: Plegada) => Plegada | null) {
    setPlegadas((prev) => {
      const m = new Map(prev);
      const antes = m.get(ruta) ?? { paths: [], folders: [], next: null, total: 0, cargando: false, fallo: null };
      const despues = cambio(antes);
      if (despues) m.set(ruta, despues);
      else m.delete(ruta);
      return m;
    });
  }

  /** La primera página al abrir una carpeta plegada; con `desde`, la siguiente. */
  async function cargarPlegada(ruta: string, desde = 0) {
    fijarPlegada(ruta, (p) => ({ ...p, cargando: true, fallo: null }));
    try {
      const pagina = await pedirPagina(ruta, desde);
      fijarPlegada(ruta, (p) => ({
        paths: desde === 0 ? pagina.paths : [...p.paths, ...pagina.paths],
        folders: desde === 0 ? pagina.folders : [...p.folders, ...pagina.folders],
        next: pagina.next,
        total: pagina.total,
        cargando: false,
        fallo: null,
      }));
    } catch (e) {
      fijarPlegada(ruta, (p) => ({ ...p, cargando: false, fallo: asFailure(e) }));
    }
  }

  // Al moverse el árbol, lo abierto se vuelve a leer hasta donde se había
  // llegado; lo cerrado se suelta y se pide de nuevo al abrirlo.
  async function refrescarPlegadas() {
    for (const [ruta, p] of plegadas()) {
      if (p.cargando) continue;
      if (!abiertas().has(ruta)) {
        fijarPlegada(ruta, () => null);
        continue;
      }
      const hasta = Math.max(1, p.paths.length + p.folders.length);
      const leida: Pagina = { paths: [], folders: [], next: 0, total: 0 };
      try {
        while (leida.next !== null && leida.paths.length + leida.folders.length < hasta) {
          const pagina = await pedirPagina(ruta, leida.next);
          leida.paths.push(...pagina.paths);
          leida.folders.push(...pagina.folders);
          leida.next = pagina.next;
          leida.total = pagina.total;
        }
        fijarPlegada(ruta, () => ({ ...leida, cargando: false, fallo: null }));
      } catch {
        fijarPlegada(ruta, () => null);
      }
    }
  }

  onMount(() => {
    if (!props.preview) void cargar();
  });

  createEffect(() => {
    if (props.preview) {
      props.preview.baseRef;
      void cargar();
    }
  });

  alMoverseElArbol(
    () => props.session,
    () => props.visible,
    () => void cargar(),
    true,
  );

  function alternar(ruta: string) {
    const abiertas_ = new Set(abiertas());
    const abre = !abiertas_.delete(ruta);
    if (abre) abiertas_.add(ruta);
    // Abrir una carpeta que falló la vuelve a pedir, y con el árbol a medias
    // también la lista: abrir y cerrar no deja un error viejo puesto.
    if (abre && plegadas().get(ruta)?.fallo) fijarPlegada(ruta, () => null);
    if (abre && lector.pendiente()) lector.pedir();
    setAbiertas(abiertas_);
  }

  // La vista previa lee un commit: ahí no hay árbol que escribir. Crear sí,
  // en la tarea que nace para eso (`crearSinTarea`).
  const editable = () => !props.preview;
  const creable = () => editable() || Boolean(props.crearSinTarea);
  seguirPluginTypst();
  const conOjo = (ruta: string) => !props.preview && conVistaTypst() && esTypst(ruta);
  const [seleccion, setSeleccion] = createSignal<{ ruta: string; tipo: Tipo } | null>(null);

  // Un archivo que se abrió desde fuera del árbol (el doble clic en la vista de Typst) se enseña aquí.
  onMount(() => {
    const revelar = (e: Event) => {
      const d = (e as CustomEvent<{ session: string; arbol: string; ruta: string }>).detail;
      if (d.session !== props.session || d.arbol !== props.arbol) return;
      const carpetas: string[] = [];
      for (let p = padreDe(d.ruta); p; p = padreDe(p)) carpetas.push(p);
      setBusca("");
      setAbiertas(new Set([...abiertas(), ...carpetas]));
      setSeleccion({ ruta: d.ruta, tipo: "archivo" });
      requestAnimationFrame(() =>
        document.querySelector(`[data-ruta="${CSS.escape(d.ruta)}"]`)?.scrollIntoView({ block: "nearest" }),
      );
    };
    window.addEventListener("harness:revelar-en-arbol", revelar);
    onCleanup(() => window.removeEventListener("harness:revelar-en-arbol", revelar));
  });
  const [nuevo, setNuevo] = createSignal<{ padre: string; tipo: Tipo } | null>(null);
  const [renombrando, setRenombrando] = createSignal<string | null>(null);
  const [menu, setMenu] = createSignal<{
    nodo: Nodo | null;
    x: number;
    y: number;
    borrando: boolean;
  } | null>(null);
  const [falloOp, setFalloOp] = createSignal<Failure | null>(null);
  let filaDelMenu: HTMLElement | undefined;
  let raiz: HTMLDivElement | undefined;
  let lista: HTMLDivElement | undefined;

  // Sin selección, lo nuevo se crea en la raíz: es la única salida de una
  // carpeta seleccionada.
  const enElVacio = (e: Event) => e.target === raiz || e.target === lista;

  const ids = () => ({ project: props.project, session: props.session, tree: props.arbol });

  async function operar(comando: () => Promise<unknown>): Promise<boolean> {
    setFalloOp(null);
    try {
      await comando();
      avisarDeLosArboles(props.session);
      return true;
    } catch (e) {
      setFalloOp(asFailure(e));
      return false;
    }
  }

  // Una barra haría de un nombre una ruta, y la carpeta intermedia no existe.
  function nombreInvalido(nombre: string) {
    if (!/[\\/]/.test(nombre)) return false;
    setFalloOp({ what: t("code.tree.name.invalid"), detail: nombre });
    return true;
  }

  function empezarNuevo(tipo: Tipo, padre?: string) {
    const s = seleccion();
    const donde = padre ?? (s ? (s.tipo === "carpeta" ? s.ruta : padreDe(s.ruta)) : "");
    setMenu(null);
    setRenombrando(null);
    setFalloOp(null);
    setBusca("");
    if (donde) setAbiertas(new Set([...abiertas(), donde]));
    setNuevo({ padre: donde, tipo });
  }

  async function crear(nombre: string): Promise<boolean> {
    const n = nuevo();
    if (!n || nombreInvalido(nombre)) return false;
    const path = unir(n.padre, nombre);
    const sinTarea = props.preview ? props.crearSinTarea : undefined;
    const hecho = await operar(() =>
      sinTarea
        ? sinTarea(n.tipo, path)
        : n.tipo === "archivo"
          ? invoke("tree_create_file", { ...ids(), path }, machineOf(props.session))
          : invoke("tree_create_folder", { ...ids(), path }, machineOf(props.session)),
    );
    if (!hecho) return false;
    setNuevo(null);
    // La tarea que nació abre su árbol y el archivo.
    if (sinTarea) return true;
    setSeleccion({ ruta: path, tipo: n.tipo });
    if (n.tipo === "archivo") props.onAbrir(path, false);
    return true;
  }

  function empezarARenombrar(ruta: string) {
    setMenu(null);
    setNuevo(null);
    setFalloOp(null);
    setRenombrando(ruta);
  }

  async function renombrar(desde: string, nombre: string): Promise<boolean> {
    if (nombreInvalido(nombre)) return false;
    const hasta = unir(padreDe(desde), nombre);
    const hecho = await operar(() => invoke("tree_rename", { ...ids(), from: desde, to: hasta }, machineOf(props.session)));
    if (!hecho) return false;
    setRenombrando(null);
    const s = seleccion();
    if (s && debajoDe(s.ruta, desde)) setSeleccion({ ...s, ruta: hasta + s.ruta.slice(desde.length) });
    props.onMovido?.(desde, hasta);
    return true;
  }

  async function borrar(nodo: Nodo) {
    setMenu(null);
    const hecho = await operar(() => invoke("tree_delete", { ...ids(), path: nodo.ruta }, machineOf(props.session)));
    if (!hecho) return;
    const s = seleccion();
    if (s && debajoDe(s.ruta, nodo.ruta)) setSeleccion(null);
    props.onBorrado?.(nodo.ruta);
  }

  // Lo que git ignora no entra en la cuenta; el aviso de una carpeta lo dice aparte.
  const archivosBajo = (ruta: string) =>
    [...new Set([...paths(), ...locales().keys()])].filter((p) => debajoDe(p, ruta));

  // Sin el estado local leído no se sabe qué está sin guardar, y se afirma el peor caso.
  function comoSeRecupera(nodo: Nodo): string {
    if (props.kind === "folder") return t("code.tree.delete.lost");
    const intacto =
      !falloEstado() &&
      !leyendoEstado() &&
      archivosBajo(nodo.ruta).every((p) => !locales().has(p));
    if (props.kind === "kn")
      return intacto ? t("code.tree.delete.kn_restorable") : t("code.tree.delete.kn_partial");
    return intacto ? t("code.tree.delete.git_restorable") : t("code.tree.delete.git_partial");
  }

  function preguntaDeBorrado(nodo: Nodo): string {
    const count = nodo.tipo === "carpeta" ? archivosBajo(nodo.ruta).length : 0;
    return count > 0
      ? t("code.tree.delete.folder", { name: nombreDe(nodo.ruta), count })
      : t("code.tree.delete.file", { name: nombreDe(nodo.ruta) });
  }

  // Con el teclado (Mayús+F10, la tecla de menú, Supr) el evento no trae
  // coordenadas: el menú sale pegado a la fila que tiene el foco.
  /** El editor de Typst a la vista, si es de este árbol: recibe rutas arrastradas o del menú. */
  const editorTypstAqui = () => {
    const e = editorTypst();
    return e && e.session === props.session && e.arbol === props.arbol ? e : null;
  };

  function abrirMenu(e: MouseEvent | KeyboardEvent, nodo: Nodo | null, borrando = false) {
    if (!editable()) return;
    e.preventDefault();
    e.stopPropagation();
    const fila = e.currentTarget as HTMLElement;
    filaDelMenu = fila;
    const r = fila.getBoundingClientRect();
    const raton = e instanceof MouseEvent && (e.clientX !== 0 || e.clientY !== 0);
    if (nodo) setSeleccion({ ruta: nodo.ruta, tipo: nodo.tipo });
    setMenu({
      nodo,
      x: raton ? e.clientX : r.left + 24,
      y: raton ? e.clientY : r.bottom,
      borrando,
    });
  }

  function teclaDeFila(e: KeyboardEvent, nodo: Nodo) {
    if (!editable()) return;
    if (e.key === "F2") {
      e.preventDefault();
      empezarARenombrar(nodo.ruta);
    } else if (e.key === "Delete") {
      abrirMenu(e, nodo, true);
    }
  }

  function CampoNuevo(p: { hondura: number }) {
    return (
      <Show when={nuevo()}>
        {(n) => (
          <CampoDeNombre
            inicial=""
            sangria={`${p.hondura * SANGRIA + 12}px`}
            etiqueta={n().tipo === "archivo" ? t("code.tree.name.new_file") : t("code.tree.name.new_folder")}
            icono={
              n().tipo === "archivo"
                ? <FilePlus size={13} class="shrink-0 text-neutral-500" aria-hidden="true" />
                : <Folder size={13} class="shrink-0 text-info-strong" aria-hidden="true" />
            }
            onConfirmar={crear}
            onCancelar={() => setNuevo(null)}
          />
        )}
      </Show>
    );
  }

  /** El documento Typst que se compila en esta tarea: el que resolvió la última compilación. */
  /** El ojo abierto es la elección de la persona; sin ella, la vista compila el `main.typ` más cercano. */
  const principalTypst = () => principalElegido(props.project);

  /** Lo que falta de una carpeta plegada abierta: cargando, vacía o «Mostrar más». */
  function PieDePlegada(p: { ruta: string; hondura: number }) {
    const estado = () => plegadas().get(p.ruta);
    const sangria = () => `${p.hondura * SANGRIA + 12 + CHEVRON + 6}px`;
    const nota = "m-0 py-1 pr-3 text-caption text-neutral-500";
    createEffect(() => {
      if (!plegadas().has(p.ruta)) void cargarPlegada(p.ruta);
    });
    return (
      <Show when={estado()}>
        {(e) => (
          <>
            <Show when={e().fallo}>
              {(f) => (
                <div class="py-1 pr-3" style={{ "padding-left": sangria() }} role="alert">
                  <p class="m-0 text-xs text-error-strong">{t("code.tree.folded.failed")}</p>
                  <FailureNote f={f()} />
                </div>
              )}
            </Show>
            <Show when={e().cargando}>
              <p class={nota} style={{ "padding-left": sangria() }}>{t("code.tree.folded.loading")}</p>
            </Show>
            <Show when={!e().cargando && !e().fallo && e().total === 0}>
              <p class={nota} style={{ "padding-left": sangria() }}>{t("code.tree.folded.empty")}</p>
            </Show>
            <Show when={!e().cargando && e().next !== null ? e().next : null}>
              {(desde) => (
                <button
                  type="button"
                  class="w-full py-1 pr-3 text-left text-caption text-primary outline-none hover:underline focus-visible:outline-2 focus-visible:outline-primary"
                  style={{ "padding-left": sangria() }}
                  onClick={() => void cargarPlegada(p.ruta, desde())}
                >
                  {t("code.tree.folded.more", { count: e().total - desde() })}
                </button>
              )}
            </Show>
          </>
        )}
      </Show>
    );
  }

  function Fila(p: { nodo: Nodo; hondura: number }) {
    const sangria = () => `${p.hondura * SANGRIA + 12}px`;
    const carpeta = () => (p.nodo.tipo === "carpeta" ? p.nodo : null);
    const archivo = () => (p.nodo.tipo === "archivo" ? p.nodo : null);
    const abierta = (ruta: string) => abiertasAhora().has(ruta);
    const clasesDeFila = () =>
      cn(
        "flex w-full items-center gap-1.5 py-1 pr-3 text-left text-label outline-none hover:bg-surface-muted focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
        seleccion()?.ruta === p.nodo.ruta && "bg-surface-muted",
      );
    const campoDeRenombre = (icono: JSX.Element) => (
      <CampoDeNombre
        inicial={nombreDe(p.nodo.ruta)}
        sangria={sangria()}
        etiqueta={t("code.tree.name.rename", { name: nombreDe(p.nodo.ruta) })}
        icono={icono}
        onConfirmar={(nombre) => renombrar(p.nodo.ruta, nombre)}
        onCancelar={() => setRenombrando(null)}
      />
    );

    return (
      <>
        <Show when={carpeta()}>
          {(c) => (
            <>
              <Show
                when={renombrando() !== c().ruta}
                fallback={campoDeRenombre(
                  <Folder size={13} class="shrink-0 text-info-strong" aria-hidden="true" />,
                )}
              >
                <button
                  class={cn(clasesDeFila(), c().plegada || c().ignorada ? "opacity-60" : undefined)}
                  style={{ "padding-left": sangria() }}
                  title={
                    c().ignorada
                      ? t("code.tree.folded.ignored")
                      : c().plegada
                        ? t("code.tree.folded.dependencies")
                        : undefined
                  }
                  aria-expanded={abierta(c().ruta)}
                  onClick={() => {
                    setSeleccion({ ruta: c().ruta, tipo: "carpeta" });
                    alternar(c().ruta);
                  }}
                  onContextMenu={(e) => abrirMenu(e, c())}
                  onKeyDown={(e) => teclaDeFila(e, c())}
                >
                  {abierta(c().ruta) ? (
                    <ChevronDown size={CHEVRON} class="shrink-0 text-neutral-500" />
                  ) : (
                    <ChevronRight size={CHEVRON} class="shrink-0 text-neutral-500" />
                  )}
                  {abierta(c().ruta) ? (
                    <FolderOpen size={13} class="shrink-0 text-info-strong" aria-hidden="true" />
                  ) : (
                    <Folder size={13} class="shrink-0 text-info-strong" aria-hidden="true" />
                  )}

                  <span
                    class={cn(
                      "min-w-0 flex-1 truncate font-mono",
                      c().cambiados > 0 ? "font-semibold" : "text-neutral-500",
                    )}
                    title={c().nombre}
                  >
                    {c().nombre}
                  </span>
                  <Show when={c().cambiados > 0}>
                    <span
                      class="size-1.5 shrink-0 rounded-full bg-neutral-500"
                      role="img"
                      title={t("code.tree.local.descendants")}
                      aria-label={t("code.tree.local.descendants")}
                    />
                  </Show>
                </button>
              </Show>
              <Show when={abierta(c().ruta)}>
                <Show when={nuevo()?.padre === c().ruta}>
                  <CampoNuevo hondura={p.hondura + 1} />
                </Show>
                <For each={c().hijos}>
                  {(h) => <Fila nodo={h} hondura={p.hondura + 1} />}
                </For>
                <Show when={c().plegada && !busca().trim()}>
                  <PieDePlegada ruta={c().ruta} hondura={p.hondura + 1} />
                </Show>
              </Show>
            </>
          )}
        </Show>

        <Show when={archivo()}>
          {(a) => (
            <Show
              when={!a().nube}
              fallback={
                <div
                  class="flex w-full cursor-default items-center gap-1.5 py-1 pr-3 text-label opacity-60"
                  style={{ "padding-left": sangria() }}
                  title={t("code.tree.cloud")}
                  aria-disabled="true"
                >
                  <HuecoDeChevron />
                  <IconoDeArchivo ruta={a().ruta} size={13} class="shrink-0 text-neutral-500" />
                  <span class="min-w-0 flex-1 truncate font-mono text-neutral-500" title={a().nombre}>{a().nombre}</span>
                  <Cloud size={11} class="shrink-0 text-neutral-500" role="img" aria-label={t("code.tree.cloud")} />
                </div>
              }
            >
              <Show
                when={renombrando() !== a().ruta}
                fallback={campoDeRenombre(
                  <IconoDeArchivo ruta={a().ruta} size={13} class="shrink-0 text-neutral-500" />,
                )}
              >
                <div class="group/fila relative">
                <button
                  data-ruta={a().ruta}
                  class={cn(clasesDeFila(), conOjo(a().ruta) && "pr-7")}
                  style={{ "padding-left": sangria() }}
                  onPointerDown={(e) => {
                    if (editorTypstAqui()) arrastrarRuta(e, props.session, props.arbol, a().ruta);
                  }}
                  onClick={() => {
                    if (fueArrastreDeRuta()) return;
                    setSeleccion({ ruta: a().ruta, tipo: "archivo" });
                    props.onAbrir(a().ruta, Boolean(a().cambio));
                  }}
                  onDblClick={() => props.onAbrirFijo?.(a().ruta, Boolean(a().cambio))}
                  onContextMenu={(e) => abrirMenu(e, a())}
                  onKeyDown={(e) => teclaDeFila(e, a())}
                >
                  <HuecoDeChevron />
                  <IconoDeArchivo
                    ruta={a().ruta}
                    size={13}
                    class="shrink-0 text-neutral-500"
                  />
                  <span
                    class={cn(
                      "min-w-0 flex-1 truncate font-mono",
                      a().local ? "font-semibold" : "text-neutral-500",
                      a().local?.marca === "D" && "line-through",
                    )}
                    title={a().nombre}
                  >
                    {a().nombre}
                  </span>
                  <Show when={a().local}>
                    {(estado) => (
                      <span
                        class={cn(
                          "shrink-0 font-mono text-2xs font-semibold",
                          colorDeMarca(estado().marca),
                        )}
                        role="img"
                        title={describirEstado(estado())}
                        aria-label={describirEstado(estado())}
                      >
                        {estado().marca}
                      </span>
                    )}
                  </Show>
                </button>
                <Show when={conOjo(a().ruta)}>
                  <button
                    type="button"
                    class={cn(
                      "absolute top-1/2 right-1.5 flex size-5 -translate-y-1/2 items-center justify-center rounded-sm outline-none hover:bg-neutral-200 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-primary",
                      principalTypst() === a().ruta ? "text-primary" : "text-neutral-500 hover:text-neutral-950",
                    )}
                    aria-pressed={principalTypst() === a().ruta}
                    aria-label={
                      principalTypst() === a().ruta
                        ? t("code.typst.main.current", { name: a().nombre })
                        : t("code.typst.main.choose", { name: a().nombre })
                    }
                    title={
                      principalTypst() === a().ruta
                        ? t("code.typst.main.current", { name: a().nombre })
                        : t("code.typst.main.choose", { name: a().nombre })
                    }
                    onClick={() => elegirPrincipal(props.project, principalTypst() === a().ruta ? null : a().ruta)}
                  >
                    {principalTypst() === a().ruta ? (
                      <Eye size={12} aria-hidden="true" />
                    ) : (
                      <EyeClosed size={12} aria-hidden="true" />
                    )}
                  </button>
                </Show>
                </div>
              </Show>
            </Show>
          )}
        </Show>
      </>
    );
  }

  return (
    <div
      ref={raiz}
      class="grid flex-1 grid-cols-1 content-start"
      onClick={(e) => {
        if (enElVacio(e)) setSeleccion(null);
      }}
      onContextMenu={(e) => {
        if (enElVacio(e)) abrirMenu(e, null);
      }}
      onKeyDown={(e) => {
        if (e.key !== "Escape" || !seleccion()) return;
        e.stopPropagation();
        setSeleccion(null);
      }}
    >
      <Show when={!cargando()}>
        <div class={cn("sticky top-0 z-10 flex items-center gap-1 border-b border-border bg-surface px-2", HEADER_HEIGHT)}>
          <label class="flex min-w-0 flex-1 items-center gap-1.5">
            <Search size={13} class="shrink-0 text-neutral-500" aria-hidden="true" />
            <Input
              variant="ghost"
              type="search"
              value={busca()}
              onInput={(e) => setBusca(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape" && busca()) {
                  e.stopPropagation();
                  setBusca("");
                }
              }}
              placeholder={t("code.tree.search")}
              aria-label={t("code.tree.search")}
              class="min-h-7 px-0 py-0 text-xs"
            />
          </label>
          {props.acciones}
          <Show when={creable()}>
            <Button
              variant="ghost"
              size="iconCompact"
              class="size-6 text-neutral-500"
              aria-label={t("code.tree.new_file")}
              title={editable() ? t("code.tree.new_file") : t("code.tree.new_file.empty_task")}
              onClick={() => empezarNuevo("archivo")}
            >
              <FilePlus size={14} />
            </Button>
            <Button
              variant="ghost"
              size="iconCompact"
              class="size-6 text-neutral-500"
              aria-label={t("code.tree.new_folder")}
              title={editable() ? t("code.tree.new_folder") : t("code.tree.new_folder.empty_task")}
              onClick={() => empezarNuevo("carpeta")}
            >
              <FolderPlus size={14} />
            </Button>
          </Show>
        </div>
        <Show when={falloOp()}>
          {(f) => (
            <div class="px-3 pt-2" role="alert">
              <FailureNote f={f()} />
            </div>
          )}
        </Show>
        <Show when={falloEstado()}>
          {(f) => (
            <div class="px-3" role="alert">
              <p class="m-0 text-xs text-error-strong">
                {t("code.tree.local.failed")}
              </p>
              <FailureNote f={f()} />
              <Button
                variant="ghost"
                size="compact"
                disabled={leyendoEstado()}
                onClick={() => void cargar()}
              >
                {t("code.tree.local.retry")}
              </Button>
            </div>
          )}
        </Show>
        <div ref={lista} class="grid grid-cols-1 content-start py-1">
          <Show when={nuevo()?.padre === ""}>
            <CampoNuevo hondura={0} />
          </Show>
          <Show
            when={visibles().length > 0}
            fallback={
              <Show when={busca().trim()}>
                <p class="m-0 px-3 py-2 text-caption text-neutral-500">
                  {t("code.tree.search.empty", { query: busca().trim() })}
                </p>
              </Show>
            }
          >
            <For each={visibles()}>
              {(n) => <Fila nodo={n} hondura={0} />}
            </For>
          </Show>
        </div>

        <Show when={recortado()}>
          <p class="m-0 px-3 py-2 text-caption text-neutral-500">
            {t("code.tree.truncated")}
          </p>
        </Show>
      </Show>

      <Show when={fallo()}>
        {(f) => (
          <div class="px-3 pb-3">
            {/* Un plazo vencido no es «reinicia la app»: se dice qué pasó y se ofrece otra vez. */}
            <Show when={falloTransitorio()} fallback={<FailureNote f={f()} />}>
              <p class="m-0 py-3 text-ui text-error-strong">{t("code.tree.failed.slow")}</p>
            </Show>
            <Button variant="ghost" size="compact" onClick={() => lector.reintentar()}>
              {t("code.tree.retry")}
            </Button>
          </div>
        )}
      </Show>

      <Show when={rutaEnVuelo()}>
        {(v) => (
          <div
            class="pointer-events-none fixed z-[90] max-w-64 truncate rounded-md border border-border bg-surface-raised px-2 py-1 font-mono text-xs text-neutral-950 shadow-md"
            style={{ left: `${v().x + 12}px`, top: `${v().y + 10}px` }}
            aria-hidden="true"
          >
            {nombreDe(v().ruta)}
          </div>
        )}
      </Show>

      <Popover
        open={menu() !== null}
        onOpenChange={(abierto) => {
          if (!abierto) setMenu(null);
        }}
        getAnchorRect={() => {
          const m = menu();
          return m ? { x: m.x, y: m.y, width: 0, height: 0 } : undefined;
        }}
        placement="bottom-start"
        gutter={2}
      >
        <PopoverContent
          role={menu()?.borrando ? "alertdialog" : "menu"}
          aria-label={menu()?.borrando ? t("code.tree.delete") : undefined}
          class={menu()?.borrando ? "w-72 p-3" : "w-52 p-1"}
          onCloseAutoFocus={(e: Event) => {
            e.preventDefault();
            if (!renombrando() && !nuevo()) filaDelMenu?.focus({ preventScroll: true });
          }}
        >
          <Show when={menu()}>
            {(m) => (
              <Show
                when={m().borrando && m().nodo}
                fallback={
                  <>
                    <Show when={m().nodo?.tipo !== "archivo"}>
                      <button
                        role="menuitem"
                        class={ITEM_DE_MENU}
                        onClick={() => empezarNuevo("archivo", m().nodo?.ruta ?? "")}
                      >
                        {t("code.tree.new_file")}
                      </button>
                      <button
                        role="menuitem"
                        class={ITEM_DE_MENU}
                        onClick={() => empezarNuevo("carpeta", m().nodo?.ruta ?? "")}
                      >
                        {t("code.tree.new_folder")}
                      </button>
                    </Show>
                    <Show when={m().nodo}>
                      {(nodo) => (
                        <>
                          <Show when={nodo().tipo === "carpeta"}>
                            <span class="my-1 block h-px bg-border" />
                          </Show>
                          <Show when={nodo().tipo === "archivo" && editorTypstAqui()?.ruta !== nodo().ruta && editorTypstAqui()}>
                            {(editor) => (
                              <button
                                role="menuitem"
                                class={ITEM_DE_MENU}
                                onClick={() => {
                                  setMenu(null);
                                  pedirInsercionDeRuta({
                                    session: props.session,
                                    arbol: props.arbol,
                                    editor: editor().ruta,
                                    destino: nodo().ruta,
                                  });
                                }}
                              >
                                {t("code.tree.insert_path")}
                              </button>
                            )}
                          </Show>
                          <button
                            role="menuitem"
                            class={ITEM_DE_MENU}
                            onClick={() => empezarARenombrar(nodo().ruta)}
                          >
                            {t("code.tree.rename")}
                          </button>
                          <button
                            role="menuitem"
                            class={`${ITEM_DE_MENU} text-error-strong`}
                            onClick={() => setMenu({ ...m(), borrando: true })}
                          >
                            {t("code.tree.delete.ask")}
                          </button>
                        </>
                      )}
                    </Show>
                  </>
                }
              >
                {(nodo) => (
                  <div class="min-w-0">
                    <p class="m-0 break-words text-xs font-semibold text-neutral-950">
                      {preguntaDeBorrado(nodo())}
                    </p>
                    <p class="m-0 mt-1 text-xs leading-[1.4] text-neutral-500">
                      {comoSeRecupera(nodo())}
                    </p>
                    <Show when={nodo().tipo === "carpeta" && props.kind !== "folder"}>
                      <p class="m-0 mt-1 text-xs leading-[1.4] text-neutral-500">
                        {t("code.tree.delete.hidden")}
                      </p>
                    </Show>
                    <div class="mt-2 flex gap-1.5">
                      <Button
                        variant="danger"
                        size="compact"
                        ref={(el: HTMLElement) =>
                          queueMicrotask(() => el.focus({ preventScroll: true }))
                        }
                        onClick={() => void borrar(nodo())}
                      >
                        {t("code.tree.delete")}
                      </Button>
                      <Button variant="outline" size="compact" onClick={() => setMenu(null)}>
                        {t("code.tree.delete.keep")}
                      </Button>
                    </div>
                  </div>
                )}
              </Show>
            )}
          </Show>
        </PopoverContent>
      </Popover>
    </div>
  );
}

/**
 * El nombre que se escribe en el sitio de la fila. Enter o salir del campo
 * confirman y Escape descarta; un fallo deja el campo abierto con lo escrito.
 */
function CampoDeNombre(props: {
  inicial: string;
  sangria: string;
  etiqueta: string;
  icono: JSX.Element;
  onConfirmar: (nombre: string) => Promise<boolean>;
  onCancelar: () => void;
}) {
  const [valor, setValor] = createSignal(props.inicial);
  // El campo se desmonta al terminar y eso le quita el foco: sin esto el `blur`
  // repetiría la operación que acaba de salir bien.
  let terminado = false;
  let enviando = false;

  const confirmar = async () => {
    if (terminado || enviando) return;
    const nombre = valor().trim();
    if (!nombre || nombre === props.inicial) {
      terminado = true;
      props.onCancelar();
      return;
    }
    enviando = true;
    try {
      terminado = await props.onConfirmar(nombre);
    } finally {
      enviando = false;
    }
  };

  return (
    <form
      class="flex w-full items-center gap-1.5 py-0.5 pr-3"
      style={{ "padding-left": props.sangria }}
      onSubmit={(e) => {
        e.preventDefault();
        void confirmar();
      }}
    >
      <HuecoDeChevron />
      {props.icono}
      <Input
        ref={(el) =>
          queueMicrotask(() => {
            el.focus({ preventScroll: true });
            const punto = props.inicial.lastIndexOf(".");
            el.setSelectionRange(0, punto > 0 ? punto : props.inicial.length);
          })
        }
        class="min-h-6 rounded-sm px-1 py-0 font-mono text-label"
        value={valor()}
        aria-label={props.etiqueta}
        spellcheck={false}
        autocomplete="off"
        onInput={(e) => setValor(e.currentTarget.value)}
        onBlur={() => void confirmar()}
        onKeyDown={(e) => {
          if (e.key !== "Escape") return;
          e.preventDefault();
          e.stopPropagation();
          terminado = true;
          props.onCancelar();
        }}
      />
    </form>
  );
}
