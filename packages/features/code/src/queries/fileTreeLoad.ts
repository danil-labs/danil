import {
  knStatus,
  previewTreeFiles,
  previewTreeFolder,
  treeFiles,
  treeFolder,
  treeGitStatus,
  treeSummary,
} from "../queries";
import { machineOf } from "../../../../host/src/machine";
import { createEffect, createMemo, createSignal, on, onCleanup, onMount } from "solid-js";
import { asFailure, type Failure } from "../../../../ui/src/Failure";
import { publicarLocales } from "./localStatus";
import { alMoverseElArbol, avisarDeIdos, idos } from "./refresh";
import { crearLector, esTransitorio } from "../model/treeLoader";
import {
  type CambioKn,
  type Carpeta,
  construir,
  type EstadoGit,
  type EstadoLocal,
  filtrar,
  localesDeGit,
  localesDeKn,
  type Resumen,
  rutasDeCarpetas,
} from "../model/tree";
import type { ArbolProps, Pagina, Plegada } from "../model/fileTree";

/** Lo que el árbol lee: la lista de archivos, su estado local y las carpetas plegadas abiertas. */
export function createCargaDelArbol(props: ArbolProps) {
  const ids = () => ({ project: props.project, session: props.session, tree: props.arbol });

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
      return previewTreeFiles<Archivos>({ project: props.project, baseRef: props.preview.baseRef });
    }
    return treeFiles<Archivos>({ project: props.project, session: props.session, tree: props.arbol }, machineOf(props.session));
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
        ? localesDeKn(await knStatus<CambioKn[]>({
          project: props.project,
          session: props.session,
        }, machineOf(props.session)))
        : localesDeGit(await treeGitStatus<EstadoGit[]>({
          project: props.project,
          session: props.session,
          tree: props.arbol,
        }, machineOf(props.session)));
      if (!vigente()) return;
      fijarLocales(leidos);
      setFalloEstado(null);
      if (props.kind !== "kn") {
        const c = await treeSummary<Resumen>({
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
      ? previewTreeFolder<Pagina>({ project: props.project, path: ruta, offset: desde })
      : treeFolder<Pagina>({ ...ids(), path: ruta, offset: desde }, machineOf(props.session));

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

  return {
    locales, falloEstado, leyendoEstado, paths, recortado, cargando, fallo, abiertas, setAbiertas,
    busca, setBusca, plegadas, visibles, abiertasAhora, falloTransitorio, lector, cargar, cargarPlegada,
    alternar, ids,
  };
}

export type CargaDelArbol = ReturnType<typeof createCargaDelArbol>;
