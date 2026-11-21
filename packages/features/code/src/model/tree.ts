/** Lo que el backend dice de un archivo que cambió. `development::FileChange`. */
export type Cambio = {
  path: string;
  added: number;
  removed: number;
  status: string;
};

export type Resumen = {
  base: string;
  files: Cambio[];
  added: number;
  removed: number;
};

/**
 * Una carpeta que el backend nombra aparte de sus archivos: una vacía, un
 * repositorio anidado, que lleva su icono, o una plegada (`lazy`): lo de
 * dentro se pide al abrirla con `tree_folder`. `development::CarpetaDelArbol`.
 */
export type Carpeta = { path: string; repo: boolean; lazy?: boolean; ignored?: boolean };

export type Nodo =
  | {
      tipo: "carpeta";
      /** Lo que se lee: puede ser `src/features/code` de una sola pieza. */
      nombre: string;
      /** La ruta completa desde la raíz del árbol. Es la clave de la fila. */
      ruta: string;
      hijos: Nodo[];
      /** Cuántos archivos cambiados cuelgan de aquí, a cualquier profundidad. */
      cambiados: number;
      /** Es un repositorio git anidado: se pinta con su icono y no se compacta. */
      repo: boolean;
      /** Dependencias o lo que git ignora: lo de dentro llega al abrirla, por páginas. */
      plegada: boolean;
      /** Git la ignora, a ella o a una de arriba. */
      ignorada: boolean;
    }
  | {
      tipo: "archivo";
      nombre: string;
      ruta: string;
      /** Ausente si el agente no lo tocó. */
      cambio?: Cambio;
      local?: EstadoLocal;
      /** Sigue en la nube o bajó después del último turno: la copia no lo tiene. */
      nube?: true;
    };

type Rama = {
  hijas: Map<string, Rama>;
  archivos: { nombre: string; ruta: string; nube?: true }[];
  repo: boolean;
  plegada: boolean;
  ignorada: boolean;
};

function rama(): Rama {
  return { hijas: new Map(), archivos: [], repo: false, plegada: false, ignorada: false };
}

/**
 * **Las carpetas antes que los archivos, y cada grupo por nombre.** Es el orden
 * de cualquier explorador; con el de git —alfabético y todo mezclado— una
 * carpeta queda entre dos archivos y la estructura deja de leerse.
 */
const porNombre = (a: string, b: string) =>
  a.localeCompare(b, "es", { numeric: true, sensitivity: "base" });

/**
 * **Una cadena de carpetas con una sola hija se junta en una fila.**
 * `src` → `features` → `codigo` son tres filas y tres clics para llegar a lo
 * mismo que dice `src/features/code`. Es lo que hacen los editores, y aquí
 * pesa más porque la columna es estrecha: cada nivel se lleva sangría que le
 * falta al nombre del archivo.
 */
function compactar(nodo: Nodo): Nodo {
  if (nodo.tipo === "archivo") return nodo;
  let actual = nodo;
  const nombres = [nodo.nombre];
  // Un repositorio anidado se queda en su propia fila, con su icono: fundido
  // en `carpeta/repo` el icono diría que la carpeta de fuera es el repositorio.
  // Una plegada tampoco: cada una carga lo suyo al abrirse.
  while (
    !actual.repo &&
    !actual.plegada &&
    actual.hijos.length === 1 &&
    actual.hijos[0].tipo === "carpeta" &&
    !actual.hijos[0].repo &&
    !actual.hijos[0].plegada
  ) {
    actual = actual.hijos[0];
    nombres.push(actual.nombre);
  }
  return {
    ...actual,
    nombre: nombres.join("/"),
    hijos: actual.hijos.map(compactar),
  };
}

/** El árbol de una copia de trabajo, con lo que cambió ya marcado. */
export function construir(
  paths: string[],
  cambios: Cambio[],
  carpetas: Carpeta[] = [],
  locales: Map<string, EstadoLocal> = new Map(),
  nube: string[] = [],
): Nodo[] {
  const porRuta = new Map(cambios.map((c) => [c.path, c]));
  const raiz = rama();
  const bajar = (partes: string[]): Rama => {
    let donde = raiz;
    for (const parte of partes) {
      let hija = donde.hijas.get(parte);
      if (!hija) {
        hija = rama();
        donde.hijas.set(parte, hija);
      }
      donde = hija;
    }
    return donde;
  };
  for (const carpeta of carpetas) {
    const partes = carpeta.path.split("/").filter(Boolean);
    if (partes.length === 0) continue;
    const r = bajar(partes);
    r.repo = carpeta.repo;
    r.plegada ||= Boolean(carpeta.lazy);
    r.ignorada ||= Boolean(carpeta.ignored);
  }
  const conocidas = new Set([...paths, ...locales.keys()]);
  for (const ruta of conocidas) {
    const partes = ruta.split("/").filter(Boolean);
    const nombre = partes.pop();
    if (!nombre) continue;
    bajar(partes).archivos.push({ nombre, ruta });
  }
  for (const ruta of nube) {
    if (conocidas.has(ruta)) continue;
    const partes = ruta.split("/").filter(Boolean);
    const nombre = partes.pop();
    if (!nombre) continue;
    bajar(partes).archivos.push({ nombre, ruta, nube: true });
  }

  const armar = (r: Rama, prefijo: string, ignorada: boolean): Nodo[] => {
    const carpetas: Nodo[] = [...r.hijas.entries()]
      .sort(([a], [b]) => porNombre(a, b))
      .map(([nombre, hija]) => {
        const ruta = prefijo ? `${prefijo}/${nombre}` : nombre;
        const ignoradaAqui = ignorada || hija.ignorada;
        const hijos = armar(hija, ruta, ignoradaAqui);
        return {
          tipo: "carpeta" as const,
          nombre,
          ruta,
          hijos,
          cambiados: hijos.reduce(
            (n, h) =>
              n + (h.tipo === "carpeta" ? h.cambiados : h.local ? 1 : 0),
            0,
          ),
          repo: hija.repo,
          plegada: hija.plegada,
          ignorada: ignoradaAqui,
        };
      });
    const archivos: Nodo[] = r.archivos
      .sort((a, b) => porNombre(a.nombre, b.nombre))
      .map((a) => ({
        tipo: "archivo" as const,
        nombre: a.nombre,
        ruta: a.ruta,
        cambio: porRuta.get(a.ruta),
        local: locales.get(a.ruta),
        ...(a.nube ? { nube: true as const } : {}),
      }));
    return [...carpetas, ...archivos];
  };

  return armar(raiz, "", false).map(compactar);
}

function plano(s: string) {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

function coincide(nombre: string, ruta: string, q: string) {
  return plano(nombre).includes(q) || plano(ruta).includes(q);
}

/** El subárbol que responde a la consulta. Una carpeta que casa se queda entera. */
export function filtrar(nodos: Nodo[], query: string): Nodo[] {
  const q = plano(query.trim());
  if (!q) return nodos;
  const out: Nodo[] = [];
  for (const n of nodos) {
    if (n.tipo === "archivo") {
      if (coincide(n.nombre, n.ruta, q)) out.push(n);
      continue;
    }
    if (coincide(n.nombre, n.ruta, q)) {
      out.push(n);
      continue;
    }
    const hijos = filtrar(n.hijos, query);
    if (hijos.length) out.push({ ...n, hijos });
  }
  return out;
}

/** Las carpetas de un árbol, para abrirlas todas al buscar. */
export function rutasDeCarpetas(nodos: Nodo[]): Set<string> {
  const out = new Set<string>();
  const andar = (ns: Nodo[]) => {
    for (const n of ns) {
      if (n.tipo !== "carpeta") continue;
      out.add(n.ruta);
      andar(n.hijos);
    }
  };
  andar(nodos);
  return out;
}

export type EstadoGit = { path: string; index: string; worktree: string };
export type MarcaLocal = "U" | "M" | "A" | "D" | "R" | "C" | "T" | "!";
export type EstadoLocal = {
  marca: MarcaLocal;
  index?: MarcaLocal;
  worktree?: MarcaLocal;
  /** Medido contra la carpeta del proyecto, no contra un índice: una copia kn. */
  kn?: true;
};

/** Lo que Guardar llevaría a la carpeta del proyecto. `kn::Pendiente`. */
export type CambioKn = { path: string; kind: string };

export function localesDeGit(estados: EstadoGit[]): Map<string, EstadoLocal> {
  const locales = new Map<string, EstadoLocal>();
  for (const e of estados) {
    const local = estadoLocal(e);
    if (local) locales.set(e.path, local);
  }
  return locales;
}

function marcaKn(kind: string): MarcaLocal {
  if (kind === "added") return "A";
  if (kind === "deleted") return "D";
  return "M";
}

export function localesDeKn(cambios: CambioKn[]): Map<string, EstadoLocal> {
  return new Map(
    cambios.map((c): [string, EstadoLocal] => [
      c.path,
      { marca: marcaKn(c.kind), kn: true },
    ]),
  );
}

function marcaDe(codigo: string): MarcaLocal | undefined {
  switch (codigo) {
    case "M":
    case "A":
    case "D":
    case "R":
    case "C":
    case "T":
      return codigo;
    default:
      return undefined;
  }
}

export function estadoLocal(estado: EstadoGit): EstadoLocal | undefined {
  const xy = estado.index + estado.worktree;
  if (xy === "??") return { marca: "U" };
  if (["DD", "AU", "UD", "UA", "DU", "AA", "UU"].includes(xy)) {
    return { marca: "!" };
  }
  const index = marcaDe(estado.index);
  const worktree = marcaDe(estado.worktree);
  const marca = index ?? worktree;
  return marca ? { marca, index, worktree } : undefined;
}
