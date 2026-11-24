import {
  cloneProject,
  cancelProjectClone,
  createProject,
  getProjectDirectory,
  reuseProject,
} from "../queries";
import { open } from "@tauri-apps/plugin-dialog";
import { createEffect, createMemo, createSignal, on } from "solid-js";
import { type ProjectRepository } from "../model/projectRepositories";
import { asFailure, type Failure } from "../../../../ui/src/Failure";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import { capabilities } from "../../../../host/src/platform";
import { leerPref } from "../../../../../apps/desktop/src/lib/prefs";
import type { Project } from "../../../../ui/src/lib/model";
import { REMOTE_CLONES, faseDeClon, type AnadirCarpetaProps, type RemoteClone } from "./add-workdir-model";

export function createAnadirCarpeta(props: AnadirCarpetaProps) {
  const [camino, setCamino] = createSignal<"clonar" | "vacia" | null>(null);
  const [directorio, setDirectorio] = createSignal<string | null>(null);
  const [destino, setDestino] = createSignal<string | null>(null);
  const [eligiendo, setEligiendo] = createSignal(false);
  // Abrir una carpeta desde el menú no enseña el diálogo detrás del selector del sistema.
  const [escondido, setEscondido] = createSignal(false);
  const [url, setUrl] = createSignal("");
  const [provider, setProvider] = createSignal<string | null>(null);
  const [repositoryName, setRepositoryName] = createSignal("");
  const [nombre, setNombre] = createSignal("");
  const [fallo, setFallo] = createSignal<Failure | null>(null);
  const [trabajando, setTrabajando] = createSignal(false);
  const [operation, setOperation] = createSignal<string | null>(null);
  const [progress, setProgress] = createSignal<{ phase: string; percent: number | null } | null>(null);
  const [cancelling, setCancelling] = createSignal(false);
  const [clonEnOtra, setClonEnOtra] = createSignal<RemoteClone | null>(null);
  const [nombreClon, setNombreClon] = createSignal("");
  // En otra máquina no hay diálogo de carpetas: la ruta sería de esta.
  // Se relee al abrir: el escritorio instala sus máquinas después de montar esto.
  const remota = createMemo(() => {
    void props.abierto;
    props.runOn(props.workspace);
    props.machines();
    return capabilities().remoteCreate?.(props.workspace) ?? null;
  });
  const enRemota = () => (remota() ? { headers: { "x-terminus-machine": remota()?.machine as string } } : undefined);
  /** La máquina elegida en «Creado en», también esta: sin la cabecera la orden iría a la del workspace. */
  const enElegida = () => enRemota() ?? (aqui() ? { headers: { "x-terminus-machine": aqui() as string } } : undefined);
  const aqui = () => props.machines().find((m) => m.local)?.id ?? null;
  const spaceAlli = () => (remota() && !remota()?.lead ? undefined : (props.space ?? undefined));
  // Un fallo del formulario —la dirección vacía— no es un clon fallido. Sin
  // esto el riel pintaría una fila por cada intento que no llegó a git.
  const [intentado, setIntentado] = createSignal(false);
  const phase = () => faseDeClon(progress()?.phase);
  const etiqueta = () =>
    nombre().trim() ||
    url()
      .trim()
      .replace(/\/+$/, "")
      .split("/")
      .pop()
      ?.replace(/\.git$/, "") ||
    "";

  createEffect(() => {
    const op = operation();
    const fallado = intentado() && fallo() !== null;
    props.onClon(
      op || fallado
        ? {
            operation: op,
            name: nombreClon() || etiqueta(),
            phase: progress()?.phase ?? null,
            percent: progress()?.percent ?? null,
            failed: !op && fallado,
          }
        : null,
    );
  });

  createEffect(on(() => remota()?.machine ?? null, () => {
    if (!camino() || operation() || trabajando()) return;
    setDestino(null);
    void elegirCamino(camino() as "clonar" | "vacia");
  }, { defer: true }));

  createEffect(on(() => props.workspace, () => {
    if (operation()) return;
    limpiar();
    setTrabajando(false);
    const pendiente = leerPref<RemoteClone[]>(REMOTE_CLONES, []).find((c) => c.workspace === props.workspace);
    if (pendiente) void seguirEnOtra(pendiente, null);
  }));

  createEffect(on(() => props.abierto, (abierto) => {
    if (!abierto || operation() || trabajando()) return;
    if (props.inicio === "vacia") void elegirCamino("vacia");
    else if (props.inicio === "carpeta" && !remota()) void abrirCarpetaSola();
  }, { defer: true }));

  async function seguirEnOtra(clon: RemoteClone, start: Record<string, unknown> | null) {
    setOperation(clon.operation);
    setClonEnOtra(clon);
    setNombreClon(clon.name);
    setProgress(null);
    setCancelling(false);
    setIntentado(true);
    const { followClone } = await import("../queries/remoteClone");
    await terminar(followClone(clon, start, (value) => { if (operation() === clon.operation) setProgress(value); }));
    setOperation(null);
    setClonEnOtra(null);
    setNombreClon("");
  }

  async function clone() {
    if (trabajando() || !props.workspace) return;
    const id = crypto.randomUUID();
    const otra = remota();
    if (otra) {
      const workspace = props.workspace;
      await seguirEnOtra({ operation: id, machine: otra.machine, workspace, name: etiqueta() }, {
        url: url(), name: nombre(), operation: id, workspace, gitHost: provider(), space: spaceAlli(),
      });
      return;
    }
    setOperation(id);
    setProgress(null);
    setCancelling(false);
    setIntentado(true);
    await terminar(cloneProject({
      url: url(), name: nombre(), directory: destino(), operation: id,
      workspace: props.workspace, gitHost: provider(), space: props.space ?? undefined,
    }, value => {
      if (operation() === id) setProgress(value);
    }, enElegida()));
    setOperation(null);
  }

  async function cancelClone() {
    const id = operation();
    if (!id || cancelling()) return;
    setCancelling(true);
    const otra = clonEnOtra();
    try {
      if (otra) await (await import("../queries/remoteClone")).cancelClone(otra);
      else await cancelProjectClone(id);
    } catch (error) {
      setFallo(asFailure(error));
      setCancelling(false);
    }
  }

  function limpiar() {
    setCamino(null);
    setDirectorio(null);
    setDestino(null);
    setUrl("");
    setProvider(null);
    setRepositoryName("");
    setNombre("");
    setFallo(null);
    setIntentado(false);
    setProgress(null);
  }

  function alCambiar(abierto: boolean) {
    if (abierto || eligiendo()) return;
    // Escondido, no cancelado: el clon sigue, la fila del riel lo dice y lo
    // escrito queda intacto para cuando se vuelva a abrir desde ahí.
    if (operation()) {
      props.onCerrar();
      return;
    }
    if (trabajando()) return;
    limpiar();
    props.onCerrar();
  }

  async function terminar(hecho: Promise<Project>) {
    const workspace = props.workspace;
    setTrabajando(true);
    setFallo(null);
    try {
      const p = await hecho;
      if (workspace === props.workspace) await props.onHecho(p, props.abierto);
      limpiar();
      props.onCerrar();
    } catch (e) {
      setFallo(asFailure(e));
    } finally {
      setTrabajando(false);
    }
  }

  async function explorar() {
    const workspace = props.workspace;
    const dir = await open({
      directory: true,
      multiple: false,
      title: t("projects.add.browse"),
    });
    if (typeof dir !== "string" || workspace !== props.workspace) return false;
    // Sin nombre, Rust usa el de la carpeta y lo recorta al tope (`projects::crear`).
    await terminar(
      createProject({ name: "", workingDirectory: dir, space: props.space ?? undefined }, enElegida()),
    );
    return true;
  }

  async function abrirCarpetaSola() {
    setEscondido(true);
    try {
      if (!(await explorar())) props.onCerrar();
    } catch (e) {
      setFallo(asFailure(e));
    } finally {
      setEscondido(false);
    }
  }

  async function elegirCamino(value: "clonar" | "vacia") {
    const workspace = props.workspace;
    setTrabajando(true);
    setFallo(null);
    try {
      const directory = await getProjectDirectory(enElegida());
      if (workspace !== props.workspace) return;
      setDirectorio(directory);
      setCamino(value);
    } catch (e) {
      if (workspace === props.workspace) setFallo(asFailure(e));
    } finally {
      if (workspace === props.workspace) setTrabajando(false);
    }
  }

  async function elegirDestino() {
    setEligiendo(true);
    setFallo(null);
    try {
      const dir = await open({
        directory: true,
        multiple: false,
        defaultPath: destino() ?? directorio() ?? undefined,
        title: t("projects.add.clone_directory"),
      });
      if (typeof dir === "string") setDestino(dir);
    } catch (e) {
      setFallo(asFailure(e));
    } finally {
      setEligiendo(false);
    }
  }

  async function chooseRepository(repo: ProjectRepository) {
    // Ya clonado en la máquina elegida: se abre ese. La lista sale de la máquina
    // del workspace; en otra elegida se clona ahí.
    const deLaElegida = remota() ? remota()?.lead === true : props.machines().find((m) => m.local)?.hosts !== false;
    if (repo.project && props.workspace && deLaElegida) {
      await terminar(reuseProject({
        workspace: props.workspace, project: repo.project, space: props.space ?? undefined,
      }));
      return;
    }
    setUrl(repo.url);
    setProvider(repo.git_host);
    setRepositoryName(repo.name);
    await elegirCamino("clonar");
  }

  return { escondido, alCambiar, trabajando, explorar, remota, elegirCamino, setProvider, setRepositoryName, chooseRepository, camino, clone, repositoryName, url, setUrl, destino, directorio, eligiendo, elegirDestino, fallo, provider, operation, phase, progress, cancelling, cancelClone, limpiar, terminar, nombre, setNombre, spaceAlli, enElegida };
}
