import { createSignal } from "solid-js";
import {
  getRepoBranches,
  getGitHostAreas,
  getGitHostProjects,
  attachRepo,
  addRepoUrl,
  addFolder,
  type RepoRemoto,
  type Area,
} from "../queries";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import { open } from "@tauri-apps/plugin-dialog";
import { listGitHosts } from "../../../../../apps/desktop/src/lib/gitHosts";
import type { Source } from "../../../../ui/src/lib/model";
import { prosaDe } from "../../../../ui/src/Failure";
import type { AlcanceProps, Paso, Proveedor } from "./scope-types";

export function createAlcance(props: AlcanceProps) {
  const [eligiendo, setEligiendo] = createSignal<Source | null>(null);
  const [ramas, setRamas] = createSignal<string[] | null>(null);
  const [paso, setPaso] = createSignal<Paso | null>(null);
  const [proveedores, setProveedores] = createSignal<Proveedor[] | null>(null);
  const [areas, setAreas] = createSignal<Area[] | null>(null);
  const [repos, setRepos] = createSignal<RepoRemoto[] | null>(null);
  const [url, setUrl] = createSignal("");
  const [busca, setBusca] = createSignal("");
  const [fallo, setFallo] = createSignal<string | null>(null);
  const [ocupado, setOcupado] = createSignal(false);

  const decir = (e: unknown) => setFallo(prosaDe(e));

  function cerrar() {
    setPaso(null);
    setEligiendo(null);
    setFallo(null);
    setBusca("");
  }

  // ------------------------------------------------------------------ ramas

  async function abrirRamas(f: Source) {
    // Sin alternar: el disparador del popover ya lo hace. Tenerlo aquí además
    // era cerrar dos veces y volver a abrir.
    cerrar();
    setEligiendo(f);
    setRamas(null);
    try {
      const r = await getRepoBranches(f.location);
      setRamas(r.branches);
    } catch (e) {
      // Sin red o sin permiso no hay lista que enseñar, y callarlo dejaría un
      // panel vacío que se lee como «este repo no tiene ramas».
      decir(e);
    }
  }

  /**
   * Cambiar de rama es **sustituir la fuente**, y eso puede fallar a mitad: la
   * nueva rama se trae del remoto. Se trata como traer material —el panel se
   * queda abierto con el motivo— porque es lo mismo con otro nombre.
   */
  async function cambiarDeRama(f: Source, rama: string) {
    setOcupado(true);
    setFallo(null);
    try {
      await props.onCambiarRama(f, rama);
      cerrar();
    } catch (e) {
      decir(e);
    } finally {
      setOcupado(false);
    }
  }

  // ------------------------------------------------------------------ añadir

  /** Un paso cuya única opción es la siguiente es un paso de más. */
  function saltarSiUnico(ps: Proveedor[]) {
    if (ps.length === 1) void verAreas(ps[0].id);
  }

  // **Sin alternar, y eso además arregla el botón «Volver».** El paso
  // «Dirección o ruta» vuelve llamando aquí, y con el `if (paso()) return
  // cerrar()` de antes el botón rotulado *Volver* cerraba el panel entero.
  async function abrirAnadir() {
    cerrar();
    setPaso({ que: "proveedores" });
    const ya = proveedores();
    if (ya) return saltarSiUnico(ya);
    try {
      const ps = await listGitHosts();
      // Solo los conectados: uno sin conexión no puede listar nada, y ofrecerlo
      // es un clic que acaba en un error que ya se sabía.
      const vivos = ps.filter((p) => p.connected);
      setProveedores(vivos);
      saltarSiUnico(vivos);
    } catch (e) {
      setProveedores([]);
      decir(e);
    }
  }

  async function verAreas(proveedor: string) {
    setPaso({ que: "areas", proveedor });
    setAreas(null);
    setBusca("");
    try {
      const as = await getGitHostAreas(proveedor);
      setAreas(as);
      if (as.length === 1) void verRepos(proveedor, as[0].key);
    } catch (e) {
      decir(e);
    }
  }

  async function verRepos(proveedor: string, area: string) {
    setPaso({ que: "repos", proveedor, area });
    setRepos(null);
    setBusca("");
    try {
      setRepos(
        await getGitHostProjects(proveedor, area),
      );
    } catch (e) {
      decir(e);
    }
  }

  /**
   * Todo lo que trae material acaba aquí: se trae, se avisa y se cierra.
   *
   * **El panel se cierra solo si se pudo.** Traerlo son dos actos —darlo de alta
   * en el workspace y traerlo a la tarea— y el segundo puede fallar solo: si el
   * repositorio ya no está en el disco, si la copia no se pudo clonar. Cerrando
   * a ciegas, ese fallo se leía como que había funcionado.
   */
  async function traer(fn: () => Promise<{ id: string }>, target = props.materialTarget) {
    setOcupado(true);
    setFallo(null);
    try {
      if (!props.materialAvailable) throw { what: t("projects.context.task_unavailable") };
      const s = await fn();
      if (target !== props.materialTarget) throw { what: t("projects.context.target_changed") };
      await props.onTraer(s.id);
      cerrar();
    } catch (e) {
      decir(e);
    } finally {
      setOcupado(false);
    }
  }

  const traerRepo = (proveedor: string, r: RepoRemoto) =>
    void traer(() =>
      attachRepo({
        project: "",
        gitHost: proveedor,
        cloneUrl: r.clone_url,
        // **La principal, y sin preguntar.** La rama se cambia después desde su
        // chip; preguntarla aquí sería decidir dos veces lo mismo.
        branch: r.branch || undefined,
        name: r.name,
      }, props.materialOptions),
    );

  /**
   * Una dirección de repositorio **o** una ruta de carpeta, en el mismo campo.
   *
   * Se decide por la forma y no se pregunta: quien pega algo sabe qué pegó, y
   * obligarle a decir de qué tipo es antes de pegarlo es un paso que solo existe
   * para el programa. Una URL va por `add_repo_url` —que además resuelve solo si
   * es público o privado— y cualquier otra cosa se trata como ruta.
   */
  const esDireccionWeb = (t: string) =>
    /^(https?:\/\/|git@|ssh:\/\/)/i.test(t.trim());

  const traerEscrito = () => {
    const t = url().trim();
    if (!t) return;
    const options = props.materialOptions;
    if (esDireccionWeb(t)) {
      return void traer(() =>
        addRepoUrl({ cloneUrl: t }, options),
      );
    }
    void traer(() => addFolder({ locator: t }, options));
  };

  async function traerCarpeta() {
    const target = props.materialTarget;
    const options = props.materialOptions;
    setFallo(null);
    try {
      if (!props.materialAvailable) throw { what: t("projects.context.task_unavailable") };
      const ruta = await open({ directory: true, multiple: false });
      if (typeof ruta !== "string") return;
      if (target !== props.materialTarget) throw { what: t("projects.context.target_changed") };
      await traer(() => addFolder({ locator: ruta }, options), target);
    } catch (e) {
      decir(e);
    }
  }

  // ------------------------------------------------------------------ filtro

  const coincide = (t: string) => {
    const q = busca().trim().toLowerCase();
    return !q || t.toLowerCase().includes(q);
  };
  const ramasVisibles = () => ramas()?.filter(coincide) ?? null;
  const reposVisibles = () =>
    repos()?.filter((r) => coincide(r.name) || coincide(r.slug)) ?? null;
  return { eligiendo, paso, setPaso, proveedores, areas, url, setUrl, busca, setBusca, fallo, ocupado, cerrar, abrirRamas, cambiarDeRama, abrirAnadir, verAreas, verRepos, traerRepo, traerEscrito, traerCarpeta, coincide, ramasVisibles, reposVisibles };
}
