import { Channel } from "@tauri-apps/api/core";
import { invoke } from "../../lib/invoke.ts";
import { open } from "@tauri-apps/plugin-dialog";
import { Show, createEffect, createMemo, createSignal, on } from "solid-js";
import { type ProjectRepository } from "../../lib/projectRepositories";
import { Button } from "../../ui/Button";
import { Dialog, DialogContent, DialogTitle } from "../../ui/Dialog";
import { FailureNote, asFailure, type Failure } from "../../ui/Failure";
import { Input } from "../../ui/Input";
import { ProgressBar } from "../../ui/ProgressBar";
import { enfocar } from "../../lib/focus";
import { t } from "../../lib/i18n";
import { capabilities } from "../../lib/platform";
import { leerPref } from "../../lib/prefs";
import type { Project } from "../../lib/model";
import { LazyPart, retryableLazy } from "../../ui/LazyPart";
import { machineName, machines, runOn } from "../machines/store";

const RepositoryPicker = retryableLazy(() => import("./RepositoryPicker"));

/**
 * El clon que corre ahora mismo, tal y como lo pinta el riel.
 *
 * Hasta que `git clone` termina no hay proyecto que listar: el backend escribe
 * `project.json` con el árbol ya en disco. Esto es lo único que el riel puede
 * enseñar mientras tanto.
 */
export type ClonEnCurso = {
  /** El id con el que se cancela. `null` es un clon que ya falló. */
  operation: string | null;
  /** Cómo se va a llamar la carpeta: lo escrito, o el final de la dirección. */
  name: string;
  /** La fase que reporta git, sin traducir. Ver [`faseDeClon`]. */
  phase: string | null;
  percent: number | null;
  failed: boolean;
};

/** Un clon en otra máquina que puede seguir tras recargar (`remoteClone.ts`). */
export type RemoteClone = { operation: string; machine: string; workspace: string; name: string };
export const REMOTE_CLONES = "projects.remote_clones";

/** Por dónde abre el diálogo cuando se pide desde el menú «Nueva carpeta» del riel. */
export type InicioDeCarpeta = "carpeta" | "vacia" | "clonar";

/** Cómo se lee la fase que git reporta. La comparten el diálogo y el riel. */
export function faseDeClon(phase: string | null | undefined) {
  switch (phase) {
    case "counting":
      return t("projects.add.counting");
    case "compressing":
      return t("projects.add.compressing");
    case "receiving":
      return t("projects.add.receiving");
    case "resolving":
      return t("projects.add.resolving");
    case "checkout":
      return t("projects.add.checkout");
    default:
      return t("projects.add.waiting");
  }
}

/**
 * Añadir una carpeta de trabajo: la que ya está en el disco, una clonada de un
 * repositorio, o una vacía.
 *
 * Los tres caminos existían y solo se ofrecía uno: el diálogo proponía una ruta
 * bajo Documentos y un botón de elegir. Quien trae un repositorio tenía que
 * clonarlo fuera y volver.
 */
export default function AnadirCarpeta(props: {
  abierto: boolean;
  workspace: string | null;
  /** El escritorio activo: la carpeta nueva queda fijada en él. */
  space?: string | null;
  onCerrar: () => void;
  /** El camino ya elegido; sin él, el diálogo ofrece los tres. */
  inicio?: InicioDeCarpeta | null;
  /** Recarga la lista. Rechaza si el backend no aceptó, con su motivo. */
  onHecho: (p: Project, activate: boolean) => Promise<void> | void;
  /** Lo que el riel enseña del clon. `null` es que no hay ninguno. */
  onClon: (clon: ClonEnCurso | null) => void;
}) {
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
    runOn(props.workspace);
    machines();
    return capabilities().remoteCreate?.(props.workspace) ?? null;
  });
  const enRemota = () => (remota() ? { headers: { "x-terminus-machine": remota()?.machine as string } } : undefined);
  /** La máquina elegida en «Creado en», también esta: sin la cabecera la orden iría a la del workspace. */
  const enElegida = () => enRemota() ?? (aqui() ? { headers: { "x-terminus-machine": aqui() as string } } : undefined);
  const aqui = () => machines().find((m) => m.local)?.id ?? null;
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
    const { followClone } = await import("./remoteClone");
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
    await terminar(invoke<Project>("clone_project", {
      url: url(), name: nombre(), directory: destino(), operation: id,
      workspace: props.workspace, gitHost: provider(), space: props.space ?? undefined,
      progress: new Channel<{ phase: string; percent: number | null }>(value => {
        if (operation() === id) setProgress(value);
      }),
    }, enElegida()));
    setOperation(null);
  }

  async function cancelClone() {
    const id = operation();
    if (!id || cancelling()) return;
    setCancelling(true);
    const otra = clonEnOtra();
    try {
      if (otra) await (await import("./remoteClone")).cancelClone(otra);
      else await invoke("cancel_project_clone", { operation: id });
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
      invoke<Project>("create_project", { name: "", workingDirectory: dir, space: props.space ?? undefined }, enElegida()),
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
      const directory = await invoke<string>("get_project_directory", {}, enElegida());
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
    const deLaElegida = remota() ? remota()?.lead === true : machines().find((m) => m.local)?.hosts !== false;
    if (repo.project && props.workspace && deLaElegida) {
      await terminar(invoke<Project>("reuse_project", {
        workspace: props.workspace, project: repo.project, space: props.space ?? undefined,
      }));
      return;
    }
    setUrl(repo.url);
    setProvider(repo.git_host);
    setRepositoryName(repo.name);
    await elegirCamino("clonar");
  }

  return (
    <Dialog open={props.abierto && !escondido()} onOpenChange={alCambiar}>
      <DialogContent class="max-w-[560px]">
        <DialogTitle class="m-0 text-lead font-semibold">
          {t("projects.add.title")}
        </DialogTitle>
        {capabilities().machineOnCreate?.(props.workspace)}

        <div class="grid gap-2 pt-3">
          <Show when={camino() === null}>
            <Show when={props.abierto ? props.workspace : null} keyed>{workspace =>
              <LazyPart fallback={<p role="status" class="m-0 text-xs text-neutral-500">{t("projects.add.loading_repositories")}</p>}>
                <RepositoryPicker workspace={workspace} disabled={trabajando()}
                  onUrl={() => { setProvider(null); setRepositoryName(""); void elegirCamino("clonar"); }}
                  onFolder={remota() ? undefined : () => void explorar()} onEmpty={() => void elegirCamino("vacia")}
                  onRepository={repo => void chooseRepository(repo)} />
              </LazyPart>
            }</Show>
          </Show>

          <Show when={camino() === "clonar"}>
            <form
              class="grid gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void clone();
              }}
            >
              <Show when={repositoryName()}><p class="m-0 text-ui font-medium">{repositoryName()}</p></Show>
              <label class="grid gap-1 text-ui">
                <span class="text-neutral-500">
                  {t("projects.add.clone_url")}
                </span>
                <Input
                  ref={enfocar}
                  class="font-mono text-xs"
                  placeholder="https://github.com/organizacion/repo"
                  value={url()}
                  disabled={trabajando()}
                  onInput={(e) => { setUrl(e.currentTarget.value); setProvider(null); setRepositoryName(""); }}
                />
              </label>
              <div class="grid gap-1">
                <span class="text-ui text-neutral-500">{t("projects.add.clone_directory")}</span>
                <p class="m-0 break-all font-mono text-xs">{destino() ?? directorio()}</p>
                <Show when={remota()}>{(m) => <p class="m-0 text-xs text-neutral-500">{t("projects.add.remote_directory", { name: machineName(m().machine) })}</p>}</Show>
                <Show when={!remota()}><Button
                  type="button"
                  variant="outline"
                  size="sm"
                  class="justify-self-start"
                  disabled={trabajando() || eligiendo()}
                  onClick={() => void elegirDestino()}
                >
                  {t("projects.add.change_directory")}
                </Button></Show>
              </div>
              <Show when={fallo()}>{(f) => <FailureNote f={f()} />}</Show>
              <Show when={fallo() && remota() && provider()}>
                <p class="m-0 text-xs text-neutral-500" data-git-host-hint="">{t("projects.add.remote_git_host", { name: machineName(remota()?.machine as string) })}</p>
              </Show>
              <Show when={operation()}>
                <div class="grid gap-2">
                  <p class="text-xs text-neutral-500" role="status">{phase()}</p>
                  <Show when={progress()?.percent != null}>
                    <ProgressBar value={progress()?.percent ?? 0} max={100} label={phase()} />
                    <span class="text-xs text-neutral-500">{t("projects.add.percent", { percent: progress()?.percent ?? 0 })}</span>
                  </Show>
                  <div class="flex justify-end gap-2">
                    <Button type="button" variant="ghost" size="sm" onClick={() => alCambiar(false)}>{t("projects.add.hide")}</Button>
                    <Button type="button" variant="outline" size="sm" disabled={!progress() || cancelling()} onClick={() => void cancelClone()}>
                      {cancelling() ? t("projects.add.cancelling") : t("projects.new.cancel")}
                    </Button>
                  </div>
                </div>
              </Show>
              <div class="flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={trabajando()}
                  onClick={limpiar}
                >
                  {t("projects.add.back")}
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={!url().trim() || trabajando() || eligiendo()}
                >
                  {trabajando()
                    ? t("projects.add.cloning")
                    : t("projects.add.clone_do")}
                </Button>
              </div>
            </form>
          </Show>

          <Show when={camino() === "vacia"}>
            <form
              class="grid gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void terminar(
                  invoke<Project>("create_project", {
                    name: nombre(), space: spaceAlli(), directory: remota() ? undefined : (destino() ?? undefined),
                  }, enElegida()),
                );
              }}
            >
              <label class="grid gap-1 text-ui">
                <span class="text-neutral-500">
                  {t("projects.add.empty_name")}
                </span>
                <Input
                  ref={enfocar}
                  placeholder={t("projects.new.placeholder")}
                  value={nombre()}
                  disabled={trabajando()}
                  onInput={(e) => setNombre(e.currentTarget.value)}
                />
              </label>
              <div class="grid gap-1">
                <span class="text-ui text-neutral-500">{t("projects.add.clone_directory")}</span>
                <p class="m-0 break-all font-mono text-xs">{destino() ?? directorio()}</p>
                <Show when={remota()}>{(m) => <p class="m-0 text-xs text-neutral-500">{t("projects.add.remote_directory", { name: machineName(m().machine) })}</p>}</Show>
                <Show when={!remota()}><Button
                  type="button"
                  variant="outline"
                  size="sm"
                  class="justify-self-start"
                  disabled={trabajando() || eligiendo()}
                  onClick={() => void elegirDestino()}
                >
                  {t("projects.add.change_directory")}
                </Button></Show>
              </div>
              <Show when={fallo()}>{(f) => <FailureNote f={f()} />}</Show>
              <div class="flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={trabajando()}
                  onClick={limpiar}
                >
                  {t("projects.add.back")}
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={!nombre().trim() || trabajando()}
                >
                  {t("projects.add.create")}
                </Button>
              </div>
            </form>
          </Show>

          <Show when={camino() === null && fallo()}>
            {(f) => <FailureNote f={f()} />}
          </Show>
        </div>
      </DialogContent>
    </Dialog>
  );
}
