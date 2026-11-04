import { For, Show, Suspense, createEffect, createSignal, lazy, on, onCleanup, onMount, splitProps, type JSX } from "solid-js";
import { invoke } from "../../lib/invoke.ts";
import { open } from "@tauri-apps/plugin-dialog";
import Cloud from "lucide-solid/icons/cloud";
import ImagePlus from "lucide-solid/icons/image-plus";
import Laptop from "lucide-solid/icons/laptop";
import Pencil from "lucide-solid/icons/pencil";
import Plus from "lucide-solid/icons/plus";
import Trash2 from "lucide-solid/icons/trash-2";
import { Button } from "../../ui/Button";
import { Input } from "../../ui/Input";
import type { Project } from "../../lib/model";
import { PROJECT_NAME_MAX_LENGTH } from "../../lib/projectNames";
import { FailureNote, asFailure, type Failure } from "../../ui/Failure";
import { SettingsRow } from "./layout";
import { Skeleton } from "../../ui/Skeleton";
import { enfocar, enfocarYSeleccionar } from "../../lib/focus";
import { t } from "../../lib/i18n";
import { cn } from "../../lib/utils";
import { MarcaDeWorkspace } from "../shell/WorkspaceColumn";
import { LogoCrop } from "./LogoCrop";
import { imagenInerte } from "../../lib/links";
import {
  anunciarMudanza,
  anunciarRenombrado,
  createWorkspaces,
  type Workspace,
} from "./workspaces-store";
import { capabilities } from "../../lib/platform";
import { elegirArchivoDeImagen } from "../../lib/pick-image";
import { blobToDataUrl } from "./account-profile";
import WorkspaceDirectoryMenu from "../shell/WorkspaceDirectoryMenu";

// Chunk aparte: la cuenta de Danil del workspace solo pesa al abrir esta pantalla.
const WorkspaceAccount = lazy(() => import("./WorkspaceAccount"));

// ------------------------------------------------ la fila de la lista

/**
 * Fila de lista con la gramática de selección de `styles/selection.css`
 * (`marca-seleccion`): plana en reposo, `surface-muted` al hover, y la
 * seleccionada levantada con superficie + sombra + barra de acento. La barra
 * existe por contraste: `surface-raised` sobre `surface` da 1,00:1 en claro y
 * ningún relleno del sistema llega al 3:1 de WCAG 2.2 § 1.4.11; la barra da
 * 6,07:1. La disposición —rejilla, padding— la pone quien la usa, vía `class`.
 */
/**
 * La plantilla `glifo | texto | meta` que usan casi todas las listas de dominio.
 * Un solo dueño: tocar aquí el gap mueve todas las listas a la vez. Una lista
 * con forma genuinamente distinta se queda con su propia `class`.
 */
export const NAV_LIST_ROW_TRIPLE_LAYOUT =
  "grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-2.5 py-2";

export function navigationListRowClass(opciones: {
  interactive?: boolean;
  class?: string;
} = {}) {
  return cn(
    "marca-seleccion w-full rounded-md border-0 bg-transparent text-left transition-colors",
    opciones.interactive ?? true
      ? "cursor-pointer hover:bg-surface-muted"
      : "cursor-default",
    "aria-[current=true]:bg-surface-raised aria-[current=true]:shadow-sm",
    opciones.class,
  );
}

export type NavigationListRowProps =
  JSX.ButtonHTMLAttributes<HTMLButtonElement> & {
    /** Pinta la fila como la selección actual. Pone `aria-current`. */
    selected?: boolean;
    /** `false` = fila de solo lectura: sin cursor ni superficie de hover. */
    interactive?: boolean;
  };

export function NavigationListRow(props: NavigationListRowProps) {
  const [propios, resto] = splitProps(props, [
    "selected",
    "interactive",
    "class",
    "type",
  ]);

  return (
    <button
      type={propios.type ?? "button"}
      aria-current={propios.selected ? true : undefined}
      class={navigationListRowClass({
        interactive: propios.interactive,
        class: propios.class,
      })}
      {...resto}
    />
  );
}

/** De dónde sale el workspace: la máquina o un proveedor. */
function GlifoDeWorkspace(props: { w: Workspace }) {
  return (
    <Show
      when={props.w.git_host}
      fallback={<Laptop size={15} class="shrink-0 text-neutral-500" />}
    >
      <Cloud size={15} class="shrink-0 text-neutral-500" />
    </Show>
  );
}

/**
 * Dónde nacen los árboles de las tareas nuevas de este workspace
 * (`workspaces::Workspace::worktrees_root`). Vacío es la carpeta de datos de la
 * app. Cambiarlo no mueve los árboles que ya existen.
 */
function CarpetaDeCopias(props: { workspace: Workspace; onCambio: () => void }) {
  const [guardando, setGuardando] = createSignal(false);
  const [fallo, setFallo] = createSignal<Failure | null>(null);

  async function cambiar(restablecer: boolean) {
    setGuardando(true);
    setFallo(null);
    try {
      const root = restablecer
        ? null
        : await open({
            directory: true,
            multiple: false,
            defaultPath: props.workspace.worktrees_root ?? undefined,
            title: t("settings.workspaces.worktrees_root.title"),
          });
      if (!restablecer && typeof root !== "string") return;
      await invoke("set_workspace_worktrees_root", { id: props.workspace.id, root });
      props.onCambio();
    } catch (e) {
      setFallo(asFailure(e));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div class="grid gap-1 pl-[27px] text-xs">
      <span class="text-neutral-500">{t("settings.workspaces.worktrees_root.title")}</span>
      <p class="m-0 break-all font-mono text-neutral-500">
        {props.workspace.worktrees_root ?? t("settings.workspaces.worktrees_root.default")}
      </p>
      <div class="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={guardando()}
          onClick={() => void cambiar(false)}
        >
          {t("settings.workspaces.worktrees_root.change")}
        </Button>
        <Show when={props.workspace.worktrees_root}>
          <Button
            size="sm"
            variant="ghost"
            disabled={guardando()}
            onClick={() => void cambiar(true)}
          >
            {t("settings.workspaces.worktrees_root.reset")}
          </Button>
        </Show>
      </div>
      <Show when={fallo()}>{(f) => <FailureNote f={f()} />}</Show>
    </div>
  );
}

const IMAGENES_DE_LOGO = ["png", "jpg", "jpeg", "webp"];

const pngDeBase64 = (base64: string) => new Blob([Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))], { type: "image/png" });

/**
 * El logo que pinta la columna y el menú del nombre. Se copia dentro del
 * workspace: la carpeta elegida puede no estar mañana. `fila` es la de Estilo;
 * sin ella va metida en la tarjeta del workspace. En la web, el de un
 * workspace de la cuenta se elige con el selector de la página y se guarda en
 * la cuenta (`capabilities().accountAssets`).
 */
export function LogoDelWorkspace(props: {
  workspace: Workspace;
  onCambio: () => void;
  fila?: boolean;
}) {
  const [guardando, setGuardando] = createSignal(false);
  const [fallo, setFallo] = createSignal<Failure | null>(null);
  const [recorte, setRecorte] = createSignal<string | null>(null);
  const cuenta = capabilities().accountAssets;
  const [version, setVersion] = createSignal(0);
  /* Sin `createResource`: suspendería el panel de Estilo entero, y en la web
     cada relectura de `/v1/computers` trae otro objeto del workspace y lo
     dejaría en blanco. Se relee solo si cambia el id o se guardó un logo. */
  const [logoDeLaCuenta, setLogoDeLaCuenta] = createSignal<string | null | undefined>();
  createEffect(
    on([() => props.workspace.id, version], ([id]) => {
      if (!cuenta) return;
      let vivo = true;
      onCleanup(() => {
        vivo = false;
      });
      void cuenta.read(id, "logo").then(
        (logo) => vivo && setLogoDeLaCuenta(logo),
        () => vivo && setLogoDeLaCuenta(undefined),
      );
    }),
  );
  const tieneLogo = () => !!props.workspace.logo || !!logoDeLaCuenta();
  const cambiado = () => {
    setVersion((n) => n + 1);
    anunciarRenombrado();
    props.onCambio();
  };

  async function quitar() {
    setGuardando(true);
    setFallo(null);
    try {
      if (!(cuenta && (await cuenta.remove(props.workspace.id, "logo"))))
          await invoke("set_workspace_logo", { id: props.workspace.id, source: null });
      cambiado();
    } catch (e) {
      setFallo(asFailure(e));
    } finally {
      setGuardando(false);
    }
  }

  async function usar(pngBase64: string) {
    setGuardando(true);
    setFallo(null);
    try {
      if (!(cuenta && (await cuenta.put(props.workspace.id, "logo", pngDeBase64(pngBase64)))))
        await invoke("set_workspace_logo_png", { id: props.workspace.id, pngBase64 });
      setRecorte(null);
      cambiado();
    } catch (e) {
      setFallo(asFailure(e));
    } finally {
      setGuardando(false);
    }
  }

  async function elegir() {
    if (cuenta) {
      const file = await elegirArchivoDeImagen(IMAGENES_DE_LOGO);
      if (!file) return;
      setFallo(null);
      const src = imagenInerte(await blobToDataUrl(file).catch(() => null));
      if (!src) return setFallo({ what: "settings.workspaces.logo.unreadable", detail: "" });
      setRecorte(src);
      return;
    }
    const chosen = await open({
      multiple: false,
      directory: false,
      title: t("settings.workspaces.logo.title"),
      filters: [{ name: t("settings.workspaces.logo.images"), extensions: IMAGENES_DE_LOGO }],
    });
    if (typeof chosen !== "string") return;
    setGuardando(true);
    setFallo(null);
    try {
      const visto = await invoke<{ data_url: string | null }>("preview_file", {
        path: chosen,
        rel: chosen,
      });
      const src = imagenInerte(visto.data_url);
      if (!src) {
        setFallo({ what: "settings.workspaces.logo.unreadable", detail: "" });
        return;
      }
      setRecorte(src);
    } catch (e) {
      setFallo(asFailure(e));
    } finally {
      setGuardando(false);
    }
  }

  const marca = (tamano: string) => (
    <span
      aria-hidden="true"
      class={`relative grid shrink-0 place-items-center overflow-hidden rounded-lg border border-border bg-surface font-semibold text-neutral-700 ${tamano}`}
    >
      <MarcaDeWorkspace id={props.workspace.id} name={props.workspace.name} logo={props.workspace.logo} />
    </span>
  );
  const acciones = (
    <>
      <Button size="sm" variant="outline" disabled={guardando()} onClick={() => void elegir()}>
        <ImagePlus size={14} />
        {tieneLogo()
          ? t("settings.workspaces.logo.change")
          : t("settings.workspaces.logo.pick")}
      </Button>
      <Show when={tieneLogo()}>
        <Button size="sm" variant="ghost" disabled={guardando()} onClick={() => void quitar()}>
          {t("settings.workspaces.logo.clear")}
        </Button>
      </Show>
    </>
  );
  const dialogo = (
    <LogoCrop
      src={recorte()}
      saving={guardando()}
      onCancel={() => setRecorte(null)}
      onUse={(png) => void usar(png)}
    />
  );

  return (
    <Show
      when={props.fila}
      fallback={
        <div class="grid gap-1 pl-[27px] text-xs">
          <span class="text-neutral-500">{t("settings.workspaces.logo.title")}</span>
          <div class="flex items-center gap-2">
            {marca("size-10 text-body")}
            {acciones}
          </div>
          <p class="m-0 text-neutral-500">{t("settings.workspaces.logo.hint")}</p>
          <Show when={fallo()}>{(f) => <FailureNote f={f()} />}</Show>
          {dialogo}
        </div>
      }
    >
      <SettingsRow
        lead={marca("size-8 text-label")}
        label={t("settings.workspaces.logo.title")}
        description={t("settings.workspaces.logo.hint")}
      >
        <div class="flex flex-col items-end gap-1">
          <div class="flex items-center gap-2">{acciones}</div>
          <Show when={fallo()}>{(f) => <FailureNote f={f()} />}</Show>
        </div>
        {dialogo}
      </SettingsRow>
    </Show>
  );
}

export default function Workspaces() {
  const ws = createWorkspaces();

  const [editando, setEditando] = createSignal<string | null>(null);
  const [borrador, setBorrador] = createSignal("");
  const [porBorrar, setPorBorrar] = createSignal<string | null>(null);
  const [agregandoExistente, setAgregandoExistente] = createSignal(false);

  function empezarARenombrar(w: Workspace) {
    setPorBorrar(null);
    setBorrador(w.name);
    setEditando(w.id);
  }

  async function guardar(w: Workspace) {
    const name = borrador().trim();
    setEditando(null);
    if (!name || name === w.name) return;
    try {
      await invoke("rename_workspace", { id: w.id, name });
      // Se relee en vez de parchear la fila: el conteo de tareas se deriva del
      // disco.
      await ws.cargar();
      anunciarRenombrado();
    } catch (e) {
      ws.setFallo(asFailure(e));
    }
  }

  /**
   * El campo del renombrado en línea. Cancelar cancela: Escape y salir del
   * campo cierran sin guardar, y guardar es Enter.
   */
  const CampoDeNombre = (props: { w: Workspace }) => (
    <Input
      ref={enfocarYSeleccionar}
      class="min-h-8 flex-1"
      data-owns-escape
      value={borrador()}
      aria-label={t("settings.workspaces.rename_label", { name: props.w.name })}
      onInput={(e) => setBorrador(e.currentTarget.value)}
      onBlur={() => setEditando(null)}
      onKeyDown={(e) => {
        if (e.key === "Enter") void guardar(props.w);
        if (e.key === "Escape") {
          // Kobalte cierra el diálogo con el Escape que escucha en `document`:
          // sin frenarlo aquí, cancelar el nombre cierra Configuración entera.
          e.stopImmediatePropagation();
          setEditando(null);
        }
      }}
    />
  );

  const BotonDeRenombrar = (props: { w: Workspace }) => (
    <Button
      variant="ghost"
      size="icon"
      class="size-8 shrink-0"
      onClick={() => empezarARenombrar(props.w)}
      aria-label={t("settings.workspaces.rename", { name: props.w.name })}
      title={t("settings.workspaces.rename_title")}
    >
      <Pencil size={15} />
    </Button>
  );

  /* Aquí se elegía la fuente de contexto del workspace, y se fue a
     **Configuración → General → Contexto**. Esta pantalla administra los
     espacios de trabajo de esta máquina —cuáles hay, cómo se llaman, cuál se
     borra—; con qué material trabaja el activo es una preferencia suya, no una
     propiedad de la lista. */

  async function borrar(id: string) {
    setPorBorrar(null);
    try {
      await invoke("remove_workspace", { id });
      await ws.cargar();
      anunciarMudanza();
    } catch (e) {
      ws.setFallo(asFailure(e));
    }
  }

  return (
    <Show when={!ws.cargando()} fallback={<Skeleton filas={3} />}>
      <Show
        when={!(ws.fallo() && !ws.lista())}
        fallback={<FailureNote f={ws.fallo()!} />}
      >
        <div class="grid gap-2">
          <ul class="m-0 grid list-none gap-0.5 p-0">
            <For each={ws.lista() ?? []}>
              {(w) => (
                <Show
                  when={w.id === ws.activo()}
                  fallback={
                    // Sin seleccionar: pulsar la fila cambia a ella, y
                    // renombrarla es el botón de al lado — dos gestos que no
                    // pueden compartir el mismo clic.
                    <li class="flex items-center gap-1">
                      <Show
                        when={editando() === w.id}
                        fallback={
                          <NavigationListRow
                            class={`${NAV_LIST_ROW_TRIPLE_LAYOUT} min-w-0 flex-1`}
                            onClick={() => {
                              setEditando(null);
                              setPorBorrar(null);
                              void ws.cambiarA(w.id);
                            }}
                          >
                            <GlifoDeWorkspace w={w} />
                            {/* Sin contador de tareas. Administrar un espacio es
                                renombrarlo, cambiar a él o borrarlo, y cuántas
                                tareas guarda no cambia ninguna de las tres. Donde sí cambia la
                                decisión es antes de borrar, y ahí sigue. */}
                            <span class="min-w-0 truncate text-left">{w.name}</span>
                          </NavigationListRow>
                        }
                      >
                        <div class="flex min-w-0 flex-1 items-center gap-3 px-2.5 py-2">
                          <GlifoDeWorkspace w={w} />
                          <CampoDeNombre w={w} />
                        </div>
                      </Show>
                      <BotonDeRenombrar w={w} />
                    </li>
                  }
                >
                  {/* Seleccionado: la misma tarjeta que levanta la selección en
                      el sistema visual, con sus proyectos dentro. */}
                  <li class="grid gap-1 rounded-md bg-surface-raised px-2.5 py-2 shadow-sm">
                    <div class="flex items-center gap-3">
                      <GlifoDeWorkspace w={w} />
                      <Show
                        when={editando() === w.id}
                        fallback={
                          <span class="min-w-0 flex-1 truncate px-1 py-1">
                            {w.name}
                          </span>
                        }
                      >
                        <CampoDeNombre w={w} />
                      </Show>
                      <BotonDeRenombrar w={w} />
                      <Show
                        when={porBorrar() === w.id}
                        fallback={
                          <Button
                            variant="ghost"
                            size="icon"
                            class="size-8 shrink-0 text-error-strong"
                            disabled={ws.turnosVivos() > 0}
                            onClick={() => setPorBorrar(w.id)}
                            aria-label={t("settings.workspaces.delete")}
                            title={
                              ws.bloqueado() ?? t("settings.workspaces.delete_title")
                            }
                          >
                            <Trash2 size={15} />
                          </Button>
                        }
                      >
                        <Button
                          variant="danger"
                          size="sm"
                          class="shrink-0"
                          onClick={() => void borrar(w.id)}
                        >
                          {w.sessions === 0
                            ? t("settings.workspaces.delete_now")
                            : t("settings.workspaces.delete_with", {
                                count: w.sessions,
                              })}
                        </Button>
                      </Show>
                    </div>

                    {/* Qué se lleva, dicho antes y no después. Borrar un
                        workspace no es quitar una entrada de una lista: se va la
                        carpeta del cliente con todo dentro, y el token del
                        llavero con ella. Un contador de tareas no lo dice —lo
                        que más duele perder suele ser lo que no se contó—. */}
                    <Show when={porBorrar() === w.id}>
                      <p class="m-0 pl-[27px] text-xs text-error-strong">
                        {t("settings.workspaces.delete_warning", {
                          sole:
                            (ws.lista()?.length ?? 0) <= 1
                              ? ` ${t("settings.workspaces.delete_sole")}`
                              : "",
                        })}
                      </p>
                    </Show>

                    <LogoDelWorkspace workspace={w} onCambio={() => void ws.cargar()} />

                    <CarpetaDeCopias workspace={w} onCambio={() => void ws.cargar()} />

                    <Show when={capabilities().danilAccount}>
                      <Suspense fallback={null}>
                        <WorkspaceAccount workspace={w.id} name={w.name} />
                      </Suspense>
                    </Show>

                    {/* Sus proyectos. Aquí y no en el selector de la caja porque
                        son dos actos distintos: elegir con cuál trabajar es de
                        todos los días y está a un clic; renombrar y borrar es de
                        una vez y va detrás de la puerta que le toca — el mismo
                        reparto que el workspace de arriba. */}
                    <Proyectos
                      onCambio={async () => {
                        await ws.cargar();
                        // **Y avisar fuera, que es lo que faltaba.** Sin esto,
                        // borrar un proyecto lo quita del disco y lo deja en el
                        // historial de la ventana de atrás, con sus tareas y
                        // todo: se puede abrir una que ya no existe.
                        anunciarMudanza();
                      }}
                    />
                  </li>
                </Show>
              )}
            </For>
          </ul>

          {/* Agregar un workspace **corre el alta entera**, la misma del primer
              arranque: nombre, proveedores de IA y source control. Aquí había un
              formulario de una línea, y se quedaba corto desde que las cuentas
              cuelgan del workspace — el segundo cliente nace sin ninguna, y con
              solo un campo de nombre eso no se ve hasta que se intenta preguntar
              algo.

              Lo monta `App.tsx`, que es quien tiene la ventana entera; esta
              pantalla solo lo pide, como todo lo demás que hace. */}
          <div class="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                window.dispatchEvent(new CustomEvent("harness:new-workspace"))
              }
            >
              <Plus size={15} />
              {t("settings.workspaces.add")}
            </Button>
            <Show when={capabilities().workspaceDirectory}>
              <Button
                variant="outline"
                size="sm"
                aria-expanded={agregandoExistente()}
                onClick={() => setAgregandoExistente((value) => !value)}
                data-workspaces-add-existing=""
              >
                {t("settings.workspaces.add_existing")}
              </Button>
            </Show>
          </div>

          <Show when={agregandoExistente()}>
            <div class="max-w-md rounded-md border border-border bg-surface p-2" data-workspaces-directory="">
              <WorkspaceDirectoryMenu localOnly onClose={() => setAgregandoExistente(false)} />
            </div>
          </Show>

          <Show when={ws.fallo()}>{(f) => <FailureNote f={f()} />}</Show>

          {/* Lo que una migración no pudo mover **no se pinta aquí**, y se quitó
              después de verlo en uso. La idea era buena —perder una tarea en
              silencio no es una opción— y aun así el resultado era un recuadro
              rojo permanente sobre algo ocurrido meses antes, que declaraba en
              su propio texto que nada se había perdido y no dejaba nada por
              hacer. El dueño del producto abrió la pantalla y preguntó qué era:
              esa es la medida de que sobra. El historial vive en
              `migrations.json`, que se sigue escribiendo. */}
        </div>
      </Show>
    </Show>
  );
}

// ----------------------------------------------------------------- proyectos

/**
 * Los proyectos del workspace activo: renombrar y borrar.
 *
 * **Borrar un proyecto se lleva sus tareas y sus artefactos, y no se puede
 * deshacer.** Por eso el botón dice cuántas se lleva en vez de decir «Borrar»:
 * un proyecto con doce tareas y uno vacío se borran con el mismo gesto y no son
 * la misma consecuencia. Las fuentes adjuntas no se tocan — son del workspace y
 * pueden estar en otros proyectos.
 */
function Proyectos(props: { onCambio: () => void }) {
  const [lista, setLista] = createSignal<Project[] | null>(null);
  const [editando, setEditando] = createSignal<string | null>(null);
  const [borrador, setBorrador] = createSignal("");
  const [porBorrar, setPorBorrar] = createSignal<string | null>(null);
  const [fallo, setFallo] = createSignal<Failure | null>(null);

  async function cargar() {
    try {
      setLista(await invoke<Project[]>("list_projects"));
    } catch (e) {
      setFallo(asFailure(e));
    }
  }

  onMount(() => void cargar());

  async function hacer(fn: () => Promise<unknown>) {
    try {
      await fn();
      setEditando(null);
      setPorBorrar(null);
      await cargar();
      // El conteo de tareas del workspace se deriva del disco, así que borrar un
      // proyecto lo cambia.
      props.onCambio();
    } catch (e) {
      setFallo(asFailure(e));
    }
  }

  return (
    <Show when={lista()?.length}>
      <ul class="m-0 grid list-none gap-0.5 p-0 pl-[27px]">
        <For each={lista() ?? []}>
          {(p) => {
            const renombrar = () =>
              void hacer(() =>
                invoke("rename_project", { id: p.id, name: borrador() }),
              );

            return (
              <li class="flex items-center gap-1">
                <Show
                  when={editando() === p.id}
                  fallback={
                    <button
                      class="min-h-8 min-w-0 flex-1 truncate rounded-md px-1 py-1 text-left text-xs hover:bg-surface-muted"
                      onClick={() => {
                        setBorrador(p.name);
                        setEditando(p.id);
                        setPorBorrar(null);
                      }}
                    >
                      {p.name}
                    </button>
                  }
                >
                  <Input
                    ref={enfocar}
                    class="min-h-8 text-xs"
                    maxlength={PROJECT_NAME_MAX_LENGTH}
                    value={borrador()}
                    onInput={(e) => setBorrador(e.currentTarget.value)}
                    onBlur={renombrar}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") renombrar();
                      if (e.key === "Escape") setEditando(null);
                    }}
                  />
                </Show>
                <Show
                  when={porBorrar() === p.id}
                  fallback={
                    <Button
                      variant="ghost"
                      size="icon"
                      class="size-8 shrink-0 text-error-strong"
                      onClick={() => setPorBorrar(p.id)}
                      aria-label={t("settings.projects.delete", { name: p.name })}
                      title={t("settings.projects.delete_title")}
                    >
                      <Trash2 size={14} />
                    </Button>
                  }
                >
                  <Button
                    variant="danger"
                    size="sm"
                    class="shrink-0"
                    onClick={() =>
                      void hacer(() => invoke("delete_project", { id: p.id }))
                    }
                  >
                    {p.sessions === 0
                      ? t("settings.projects.delete_now")
                      : t("settings.projects.delete_with", { count: p.sessions })}
                  </Button>
                </Show>
              </li>
            );
          }}
        </For>
        <Show when={fallo()}>{(f) => <FailureNote f={f()} />}</Show>
      </ul>
    </Show>
  );
}
