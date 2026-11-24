import { createSignal, onMount } from "solid-js";
import { addFolder, gitHostAreas, gitHostProjects, repoBranches } from "../queries/engine-git";
import { open } from "@tauri-apps/plugin-dialog";
import { asFailure, type Failure } from "../../../../ui/src/Failure";
import { listGitHosts } from "../../../../session/src/gitHosts";
import type { Proveedor, Area, RepoRemoto, ObjetivoRamas, RamasRemotas } from "./MaterialPickerTypes";
import type MaterialPicker from "./MaterialPickerView";

export function createSelectorDeMaterial(props: Parameters<typeof MaterialPicker>[0]) {
  const soloUrl = () => props.modo === "clonar";
  const [proveedores, setProveedores] = createSignal<Proveedor[] | null>(null);
  /** Todos los que el motor sabe conectar, para enseñarlos apagados cuando ninguno lo está. */
  const [sinConectar, setSinConectar] = createSignal<Proveedor[]>([]);
  const [proveedor, setProveedor] = createSignal<string | null>(null);
  const [areas, setAreas] = createSignal<Area[] | null>(null);
  const [area, setArea] = createSignal<string | null>(null);
  const [repos, setRepos] = createSignal<RepoRemoto[] | null>(null);
  const [busca, setBusca] = createSignal("");
  const [url, setUrl] = createSignal("");
  const [elegidas, setElegidas] = createSignal<Record<string, string>>({});
  const [objetivoRamas, setObjetivoRamas] = createSignal<ObjetivoRamas | null>(
    null,
  );
  const [ramas, setRamas] = createSignal<RamasRemotas | null>(null);
  const [buscaRama, setBuscaRama] = createSignal("");
  const [ocupado, setOcupado] = createSignal(false);
  const [fallo, setFallo] = createSignal<Failure | null>(null);

  /**
   * Una carpeta de esta computadora.
   *
   * **No se copia**, al revés que un repositorio clonado: `Source::tree()`
   * devuelve la ruta real que eligió la persona. Eso cambia lo que está en
   * juego si la contención se cae —ahí se tocan sus documentos originales, no
   * una copia de Terminus— y por eso el par `--add-dir` + `deny` sale de una
   * sola fuente de verdad en Rust.
   */
  async function elegirCarpeta() {
    setFallo(null);
    try {
      const ruta = await open({ directory: true, multiple: false });
      if (typeof ruta !== "string") return;
      await traer(() => addFolder<{ id: string }>({ locator: ruta }));
    } catch (e) {
      setFallo(asFailure(e));
    }
  }

  onMount(() => {
    void (async () => {
      try {
        const ps = await listGitHosts();
        setSinConectar(ps);
        // Solo los conectados: uno sin conexión no puede listar nada, y
        // ofrecerlo es un clic que acaba en un error que ya se sabía.
        const vivos = ps.filter((p) => p.connected);
        setProveedores(vivos);
        // Con uno solo no hay nada que elegir: se entra directo a sus
        // organizaciones. Un paso cuya única opción es la siguiente es un paso
        // de más.
        if (vivos.length === 1) void verAreas(vivos[0].id);
      } catch (e) {
        setProveedores([]);
        setFallo(asFailure(e));
      }
    })();
  });

  async function verAreas(id: string) {
    setProveedor(id);
    setAreas(null);
    setArea(null);
    setRepos(null);
    try {
      const as = await gitHostAreas<Area[]>({ id });
      setAreas(as);
      if (as.length === 1) void verRepos(id, as[0].key);
    } catch (e) {
      setFallo(asFailure(e));
    }
  }

  async function verRepos(id: string, a: string) {
    setArea(a);
    setRepos(null);
    setBusca("");
    try {
      setRepos(await gitHostProjects<RepoRemoto[]>({ id, area: a }));
    } catch (e) {
      setFallo(asFailure(e));
    }
  }

  const proveedorActual = () =>
    proveedores()?.find((p) => p.id === proveedor());

  function volverAProveedores() {
    setProveedor(null);
    setAreas(null);
    setArea(null);
    setRepos(null);
  }

  /** Solo hay a dónde volver si hubo más de una cuenta para elegir: con una
   *  sola, el paso de cuentas nunca se pintó. */
  const puedeVolverDesdeAreas = () => (proveedores()?.length ?? 0) > 1;

  /** Con una sola organización el paso de organizaciones tampoco se pintó
   *  (`verAreas` lo salta), así que volver desde repos va directo a cuentas. */
  const puedeVolverDesdeRepos = () =>
    (areas()?.length ?? 0) > 1 || (proveedores()?.length ?? 0) > 1;

  function volverDesdeRepos() {
    if ((areas()?.length ?? 0) > 1) {
      setArea(null);
      setRepos(null);
    } else {
      volverAProveedores();
    }
  }

  async function traer(fn: () => Promise<{ id: string }>) {
    setOcupado(true);
    setFallo(null);
    try {
      const s = await fn();
      await props.onListo(s.id);
    } catch (e) {
      setFallo(asFailure(e));
    } finally {
      setOcupado(false);
    }
  }

  async function verRamas(objetivo: ObjetivoRamas) {
    setObjetivoRamas(objetivo);
    setRamas(null);
    setBuscaRama("");
    setFallo(null);
    try {
      setRamas(
        await repoBranches<RamasRemotas>({
          cloneUrl: objetivo.cloneUrl,
          gitHost: objetivo.provider,
          defaultBranch: objetivo.defaultBranch,
        }),
      );
    } catch (e) {
      setObjetivoRamas(null);
      setFallo(asFailure(e));
    }
  }

  /** Filtra por lo escrito, sin distinguir mayúsculas. Una lista de doscientos
   *  repos no se recorre a ojo, y el nombre es lo único que se recuerda. */
  const visibles = () => {
    const lista = repos();
    if (!lista) return null;
    const q = busca().trim().toLowerCase();
    if (!q) return lista;
    return lista.filter(
      (r) =>
        r.name.toLowerCase().includes(q) || r.slug.toLowerCase().includes(q),
    );
  };

  const ramasVisibles = () => {
    const rs = ramas();
    if (!rs) return null;
    const q = buscaRama().trim().toLowerCase();
    return q ? rs.branches.filter((b) => b.toLowerCase().includes(q)) : rs.branches;
  };

  const ramaDe = (repo: RepoRemoto) => elegidas()[repo.clone_url] ?? repo.branch;
  return {
    traer, url, elegidas, setUrl, ocupado, verRamas, objetivoRamas, soloUrl, elegirCarpeta,
    setObjetivoRamas, ramas, buscaRama, setBuscaRama, ramasVisibles, setElegidas, proveedores, sinConectar,
    proveedor, area, areas, verAreas, proveedorActual, puedeVolverDesdeAreas, volverAProveedores, verRepos,
    puedeVolverDesdeRepos, volverDesdeRepos, busca, setBusca, visibles, ramaDe, fallo,
  };
}
