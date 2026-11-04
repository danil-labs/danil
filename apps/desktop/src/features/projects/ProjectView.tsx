import { open } from "@tauri-apps/plugin-dialog";
import Check from "lucide-solid/icons/check";
import ChevronRight from "lucide-solid/icons/chevron-right";
import Copy from "lucide-solid/icons/copy";
import Eye from "lucide-solid/icons/eye";
import FolderOpen from "lucide-solid/icons/folder-open";
import GitBranch from "lucide-solid/icons/git-branch";
import Plus from "lucide-solid/icons/plus";
import SquarePen from "lucide-solid/icons/square-pen";
import X from "lucide-solid/icons/x";
import { createEffect, createMemo, createSignal, createUniqueId, For, lazy, on, onCleanup, Show, Suspense } from "solid-js";
import { rememberRoster } from "../../lib/handlerRoster";
import { createCopied } from "../../lib/clipboard";
import { t } from "../../lib/i18n";
import { invoke } from "../../lib/invoke.ts";
import {
  type Agent,
  carpetaDeTrabajo,
  type HandlerList,
  type Project,
  type Source,
} from "../../lib/model";
import { lineaDeProcedencia, procedencia } from "../../lib/sourceOrigin";
import { cn } from "../../lib/utils";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { EmptyState } from "../../ui/EmptyState";
import { prosaDe } from "../../ui/Failure";
import { Input } from "../../ui/Input";
import { Panel, PANEL } from "../../ui/Panel";
import {
  ITEM_DE_MENU,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../../ui/Popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../ui/Tabs";
import WorkdirIcon from "../code/WorkdirIcon";
import MaterialPicker from "../settings/MaterialPicker";
import { agentsWithDifferentReaders } from "./agentReaders";
import { AstroAvatar } from "./AstroAvatar";
import BaseBranchPicker from "./BaseBranchPicker";
import { watchHandlerStatuses } from "./handlerPresence";
import type { ModelChoices } from "./NewAgent";
import { displayName, notifyProfiles, watchProfiles } from "./profiles";
import Sessions, { type SessionRow } from "./Sessions";
import type { Etapa } from "./TaskStage";
// Solo al crear un encargado: fuera de la carga inicial.
import { LazyPart, retryableLazy } from "../../ui/LazyPart";
import { SectionLabel } from "../../ui/SectionLabel";
const NewAgent = retryableLazy(() => import("./NewAgent"));

// Fuera de la carga inicial: la memoria solo se pinta en Configuración y trae el cliente de la cuenta.
const Memoria = lazy(() => import("./Memoria"));

const FILA = "grid grid-cols-[minmax(6rem,10.5rem)_minmax(0,1fr)] items-start gap-3 px-3 py-2";
const ETIQUETA = "py-1.5 text-xs text-neutral-500";

function SelectorDeRama(props: { project: string; source: Source }) {
  const [abierto, setAbierto] = createSignal(false);
  const [ramas, setRamas] = createSignal<string[] | null>(null);
  const [actualizando, setActualizando] = createSignal(false);
  const [fallo, setFallo] = createSignal<string | null>(null);

  async function abrir() {
    setAbierto(true);
    setRamas(null);
    setFallo(null);
    try {
      setRamas(
        await invoke<string[]>("list_source_branches", {
          source: props.source.id,
        }),
      );
    } catch (error) {
      setFallo(prosaDe(error));
    }
  }

  async function cambiar(branch: string) {
    if (branch === props.source.branch) return;
    setActualizando(true);
    setFallo(null);
    try {
      await invoke("set_source_branch", {
        project: props.project,
        source: props.source.id,
        branch,
      });
      setAbierto(false);
      window.dispatchEvent(new CustomEvent("harness:sources"));
    } catch (error) {
      setFallo(prosaDe(error));
    } finally {
      setActualizando(false);
    }
  }

  return (
    <Show when={props.source.branch}>
      {(branch) => (
        <Popover
          open={abierto()}
          onOpenChange={(open) => {
            if (open) return void abrir();
            setAbierto(false);
          }}
          placement="bottom-end"
          gutter={4}
        >
          <PopoverTrigger
            class="flex max-w-40 items-center gap-1 rounded-sm px-1.5 py-1 font-mono text-2xs text-neutral-500 outline-none hover:bg-surface-muted hover:text-neutral-950 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-wait disabled:opacity-60"
            disabled={actualizando()}
            aria-label={t("projects.view.source_branch_change", {
              name: props.source.name,
            })}
            title={t("projects.view.source_branch_change", {
              name: props.source.name,
            })}
          >
            <GitBranch size={12} aria-hidden="true" />
            <span class="truncate">
              {actualizando()
                ? t("projects.view.source_branch_updating")
                : branch()}
            </span>
          </PopoverTrigger>
          <PopoverContent class="w-72 p-2">
            <p class="m-0 px-1 pb-2 text-caption text-neutral-500">
              {t("projects.view.source_branch_shared")}
            </p>
            <Show
              when={ramas()}
              fallback={
                <p class="m-0 px-1 py-2 text-xs text-neutral-500">
                  {fallo() ?? t("projects.view.source_branch_loading")}
                </p>
              }
            >
              {(items) => (
                <ul class="m-0 grid max-h-56 list-none gap-0.5 overflow-y-auto p-0">
                  <For each={items()}>
                    {(item) => (
                      <li>
                        <button
                          type="button"
                          class="flex w-full items-center gap-2 rounded-sm px-2 py-1 text-left font-mono text-caption hover:bg-surface-muted hover:text-neutral-950 disabled:cursor-default disabled:opacity-60"
                          disabled={item === props.source.branch || actualizando()}
                          onClick={() => void cambiar(item)}
                        >
                          <span class="min-w-0 flex-1 truncate">{item}</span>
                          <Show when={item === props.source.branch}>
                            <span class="font-sans text-2xs">
                              {t("projects.view.source_branch_current")}
                            </span>
                          </Show>
                        </button>
                      </li>
                    )}
                  </For>
                </ul>
              )}
            </Show>
            <Show when={ramas() && fallo()}>
              {(error) => (
                <p class="m-0 border-t border-border px-1 pt-2 text-xs text-error-strong">
                  {error()}
                </p>
              )}
            </Show>
          </PopoverContent>
        </Popover>
      )}
    </Show>
  );
}

/**
 * El proyecto abierto en el panel principal: su carpeta de trabajo, sus fuentes
 * y sus tareas.
 *
 * La carpeta de trabajo es el `cwd` del agente en toda tarea del proyecto: si
 * trae `.git` es un repositorio y el agente trabaja ahí como un desarrollador;
 * si no, es donde queda lo que las tareas produzcan (`projects::Project::working_directory`).
 * Las fuentes son lo que el agente lee además, con `--add-dir`: no forman parte
 * de la carpeta. La raíz de gobierno del workspace se lista y no se quita desde
 * aquí: la leen todos los proyectos y se cambia en Configuración.
 *
 * La vista abre en las tareas, y la configuración de la carpeta va en su propia
 * pestaña: una lista larga de tareas no la deja fuera de alcance ni al revés.
 */
export default function VistaDeProyecto(props: {
  /** El workspace abierto: la memoria de la cuenta y su historial son suyos. */
  workspace?: string | null;
  proyecto: Project;
  /** Llegó desde «Material que lee»: entra por Configuración en vez de por las tareas. */
  materialPedido?: boolean;
  onMaterialVisto?: () => void;
  /** El catálogo del workspace: es quien sabe nombrar y ubicar cada fuente. */
  sources: Source[];
  /** Para nombrar quién escribió una entrada de memoria, por su id. */
  agents: Agent[];
  sessions: SessionRow[];
  current: string | null;
  vivas: string[];
  aprobando: string[];
  /** Los demás proyectos, para el menú de mover de cada tarea. */
  destinos: { id: string; name: string }[];
  onNueva: () => void;
  onAbrir: (id: string) => void;
  onHablarCon: (name: string) => void;
  onDelete: (id: string) => void;
  onMove: (id: string, to: string) => void;
  onEtapa: (id: string, etapa: Etapa | null) => void;
  onRenombrar: (id: string, title: string) => void;
  onPin?: (id: string, pinned: boolean) => void | Promise<void>;
  onAdjuntar: (source: string) => void | Promise<void>;
  onQuitar: (source: string) => void | Promise<void>;
  /**
   * Fija la carpeta de trabajo. Nunca se llama con `null`: el `cwd` no se
   * puede dejar vacío. Quien la recibe recarga los proyectos y el árbol.
   */
  onCarpetaEditable: (dir: string | null) => void | Promise<void>;
  /** Lo que se ofrece como modelo por defecto al crear un agente. */
  modelos: ModelChoices;
}) {
  const [pestana, setPestana] = createSignal("tasks");
  // El cuerpo no se remonta al cambiar de carpeta: cada una abre en sus tareas.
  createEffect(on(() => props.proyecto.id, () => setPestana("tasks"), { defer: true }));
  createEffect(() => {
    if (!props.materialPedido) return;
    setPestana("settings");
    props.onMaterialVisto?.();
  });
  const idPreparacion = createUniqueId();
  const [anadiendo, setAnadiendo] = createSignal(false);
  const [preparacion, setPreparacion] = createSignal("");
  const [falloDePreparacion, setFalloDePreparacion] = createSignal<
    string | null
  >(null);

  const [encargados, setEncargados] = createSignal<HandlerList>({
    agents: [],
    rechazados: [],
  });
  // Quien no aparece en el estado está dormido: la ausencia en los dos
  // registros del backend ES «dormido», no un dato que falte.
  const presencia = watchHandlerStatuses(props.proyecto.id);
  const porNombre = createMemo(() => new Map(presencia().map((f) => [f.name, f.status])));
  const estadoDe = (name: string) => porNombre().get(name) ?? "asleep";

  // Se relee al cambiar de proyecto: el campo es de la carpeta, no de la
  // pantalla, y arrastrar el del anterior lo guardaría en el que se abre.
  createEffect(() => {
    const id = props.proyecto.id;
    void invoke<string | null>("project_setup_command", { project: id })
      .then((c) => setPreparacion(c ?? ""))
      .catch(() => setPreparacion(""));
  });

  const [creando, setCreando] = createSignal(false);

  // Uno propio nace en la app y tiene que aparecer sin cambiar de proyecto.
  // Uno del repositorio lo edita quien quiera, y aparece al volver aquí.
  function releerEncargados() {
    const id = props.proyecto.id;
    void invoke<HandlerList>("list_agents", { project: id })
      .then((listado) => {
        rememberRoster(id, listado.agents);
        setEncargados(listado);
      })
      .catch(() => setEncargados({ agents: [], rechazados: [] }));
  }

  createEffect(on(() => props.proyecto.id, releerEncargados));
  // Borrar u ocultar uno pasa en su perfil, que vive en otra pestaña: sin
  // esto, el que ya no está se sigue listando aquí hasta cambiar de proyecto.
  window.addEventListener("harness:encargados", releerEncargados);
  onCleanup(() => window.removeEventListener("harness:encargados", releerEncargados));

  const perfiles = watchProfiles(props.proyecto.id);
  const oculto = (name: string) => perfiles()[name]?.hidden === true;
  const visibles = createMemo(() => encargados().agents.filter((e) => !oculto(e.name)));
  const ocultos = createMemo(() => encargados().agents.filter((e) => oculto(e.name)));
  const lectoresDistintos = createMemo(() => agentsWithDifferentReaders(visibles()));

  async function mostrar(name: string) {
    try {
      await invoke("set_agent_hidden", { project: props.proyecto.id, name, hidden: false });
      notifyProfiles();
      window.dispatchEvent(new CustomEvent("harness:encargados"));
    } catch {
      // Sin aviso: la fila sigue en «ocultos» y el gesto se repite. Un error
      // en rojo aquí sería más ruido que el botón que no hizo nada.
    }
  }

  async function guardarPreparacion() {
    const command = preparacion().trim();
    setFalloDePreparacion(null);
    try {
      await invoke("set_project_setup_command", {
        project: props.proyecto.id,
        command: command || null,
      });
    } catch (e) {
      setFalloDePreparacion(prosaDe(e));
    }
  }
  const [trayendo, setTrayendo] = createSignal(false);

  /** Con el selector del sistema: una ruta tecleada falla en el turno, no aquí. */
  async function elegirCarpeta() {
    const dir = await open({
      directory: true,
      multiple: false,
      defaultPath: carpetaDeTrabajo(props.proyecto) ?? undefined,
      title: t("projects.view.work_pick_title"),
    });
    if (typeof dir === "string") await props.onCarpetaEditable(dir);
  }

  const carpeta = () => carpetaDeTrabajo(props.proyecto);
  const { copied: rutaCopiada, copy: copiarRuta } = createCopied();

  const fijo = () =>
    props.proyecto.sources
      .map((id) => props.sources.find((s) => s.id === id))
      .filter((s): s is Source => Boolean(s));

  /** La raíz de gobierno del workspace, si no está ya adjunta al proyecto. */
  const raiz = () => {
    const r = props.sources.find((s) => s.root);
    return r && !props.proyecto.sources.includes(r.id) ? r : null;
  };

  const disponibles = () => {
    const unicas = new Map<string, Source>();
    for (const s of props.sources) {
      if (
        props.proyecto.sources.includes(s.id) ||
        s.root ||
        !s.project_attachable ||
        unicas.has(s.identity)
      ) {
        continue;
      }
      unicas.set(s.identity, s);
    }
    return [...unicas.values()];
  };

  const cuenta = (s: Source) => {
    const p = procedencia(s);
    return p.proveedor ? p.sitio.split("/")[0] : null;
  };

  const distingueCuenta = (s: Source) => {
    const actual = cuenta(s);
    return (
      actual !== null &&
      disponibles().some(
        (otra) =>
          otra.id !== s.id &&
          otra.etiqueta === s.etiqueta &&
          cuenta(otra) !== actual,
      )
    );
  };

  /** De dónde viene, como lo reconoce la persona; nunca la copia bajo AppData. */
  const origen = (s: Source) => {
    const lugar = procedencia(s);
    return lineaDeProcedencia(
      { ...lugar, rama: null },
      t("projects.view.origin_folder"),
    );
  };

  return (
    <div class="min-h-0 flex-1 overflow-y-auto">
      <Tabs
        value={pestana()}
        onChange={setPestana}
        class="mx-auto grid w-full max-w-[860px] gap-3 px-6 pt-4 pb-10"
      >
        <div class={cn(PANEL, "grid gap-3 px-4 pt-3")}>
          <header class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
            <h1 class="m-0 min-w-0 truncate text-xl font-display font-bold tracking-[-0.02em] text-neutral-950">
              {props.proyecto.name}
            </h1>
            <Button size="sm" onClick={props.onNueva}>
              <SquarePen size={14} />
              {t("projects.view.new_task")}
            </Button>
          </header>
          <TabsList>
            <TabsTrigger value="tasks">{t("projects.view.tasks_title")}</TabsTrigger>
            <TabsTrigger value="settings">{t("projects.view.settings_title")}</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="tasks" class="min-w-0 outline-none">
          {/* La misma lista que el historial del sidebar, y a propósito: sus
              filas ya llevan el estado de cada tarea —trabajando, preguntó,
              espera aprobación— y su menú de mover y borrar. Dos listas de lo
              mismo divergen. */}
          <Show
            when={props.sessions.length > 0}
            fallback={
              <EmptyState class="bg-surface" title={t("projects.view.tasks_empty")} />
            }
          >
            <section class={cn(PANEL, "p-2")}>
              <Sessions
                sessions={props.sessions}
                groupByHandler
                current={props.current}
                vivas={props.vivas}
                aprobando={props.aprobando}
                destinos={props.destinos}
                de={props.proyecto.id}
                onPick={props.onAbrir}
                onDelete={props.onDelete}
                onMove={props.onMove}
                onEtapa={props.onEtapa}
                onRenombrar={props.onRenombrar}
                onPin={props.onPin}
              />
            </section>
          </Show>
        </TabsContent>

        <TabsContent value="settings" class="grid min-w-0 gap-3 outline-none">
          <Panel title={t("projects.view.work_title")}>
            <dl class="m-0 divide-y divide-border border-t border-border">
              <div class={FILA}>
                <dt class={ETIQUETA}>{t("projects.view.work_path")}</dt>
                <dd class="m-0 grid min-w-0 gap-0.5">
                  <Show
                    when={carpeta()}
                    fallback={<span class="text-xs text-neutral-500">{t("projects.view.work_none")}</span>}
                  >
                    {(dir) => (
                      <span class="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2">
                        <WorkdirIcon
                          kind={props.proyecto.kind} cloud={props.proyecto.cloud}
                          class="text-neutral-500"
                        />
                        <span class="min-w-0 truncate font-mono text-caption text-neutral-950" title={dir()}>
                          {dir()}
                        </span>
                        <span class="flex items-center gap-0.5">
                          <Button
                            variant="ghost"
                            size="icon"
                            class="size-7 text-neutral-500"
                            onClick={() => void invoke("open_external", { target: dir() }).catch(() => {})}
                            aria-label={t("shell.folder.open")}
                            title={t("shell.folder.open")}
                          >
                            <FolderOpen size={15} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            class="size-7 text-neutral-500"
                            onClick={() => copiarRuta(dir())}
                            aria-label={rutaCopiada() ? t("shell.folder.copied") : t("shell.folder.copy")}
                            title={rutaCopiada() ? t("shell.folder.copied") : t("shell.folder.copy")}
                          >
                            <Show when={rutaCopiada()} fallback={<Copy size={15} />}>
                              <Check size={15} />
                            </Show>
                          </Button>
                        </span>
                      </span>
                    )}
                  </Show>
                  <span class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                    <span class="text-xs text-neutral-500">
                      <Show when={carpeta()}>
                        {props.proyecto.kind === "git"
                          ? t("projects.view.work_git")
                          : t("projects.view.work_folder")}
                      </Show>
                    </span>
                    {/* Cambiarla mueve el `cwd` de toda tarea nueva: acción secundaria, sin icono ni peso de «Añadir». */}
                    <Button
                      variant="ghost"
                      size="compact"
                      class="font-normal text-neutral-500"
                      onClick={() => void elegirCarpeta()}
                    >
                      {t("projects.view.work_pick")}
                    </Button>
                  </span>
                </dd>
              </div>

              {/* Un árbol nuevo sale de `HEAD`: no trae `node_modules`, ni lo
                  construido, ni lo ignorado. Sin este comando el primer test del
                  agente falla por algo ajeno al encargo. */}
              <Show when={props.proyecto.kind === "git"}>
                <div class={FILA}>
                  <dt class={ETIQUETA}>{t("worktrees.base.default")}</dt>
                  <dd class="m-0 min-w-0">
                    <BaseBranchPicker project={props.proyecto.id} directory={carpeta()} preference inlineLabel />
                  </dd>
                </div>
                <div class={FILA}>
                  <dt class={ETIQUETA}>
                    <label for={idPreparacion}>{t("projects.view.setup_title")}</label>
                  </dt>
                  <dd class="m-0 grid min-w-0 gap-1 text-xs">
                    <Input
                      id={idPreparacion}
                      class="font-mono text-caption"
                      placeholder={t("projects.view.setup_placeholder")}
                      value={preparacion()}
                      onInput={(e) => setPreparacion(e.currentTarget.value)}
                      onBlur={() => void guardarPreparacion()}
                    />
                    <span class="text-neutral-500">
                      {t("projects.view.setup_help")}
                    </span>
                    <Show when={falloDePreparacion()}>
                      {(f) => <span class="text-error-strong">{f()}</span>}
                    </Show>
                  </dd>
                </div>
              </Show>
            </dl>
          </Panel>

          <Panel
            title={t("projects.view.sources_title")}
            action={
              <Popover
                open={anadiendo()}
                onOpenChange={(abre) => {
                  setAnadiendo(abre);
                  if (!abre) setTrayendo(false);
                }}
                placement="bottom-end"
                gutter={6}
              >
                <PopoverTrigger
                  as={(p: object) => (
                    <Button {...p} variant="ghost" size="sm">
                      <Plus size={14} />
                      {t("projects.view.add")}
                    </Button>
                  )}
                />
                <PopoverContent class="w-[360px] p-2">
                  <Show
                    when={!trayendo()}
                    fallback={
                      <MaterialPicker
                        onCancelar={() => setTrayendo(false)}
                        onListo={(source: string) => {
                          setTrayendo(false);
                          setAnadiendo(false);
                          void props.onAdjuntar(source);
                          // El material entró al workspace: lo recarga todo lo
                          // que lo lee, no solo esta pantalla.
                          window.dispatchEvent(new CustomEvent("harness:sources"));
                        }}
                      />
                    }
                  >
                    {/* Lo que ya está en el workspace primero: adjuntarlo no
                        copia nada ni pide red, y es el caso normal cuando ya se
                        trabajó con ese material en otro proyecto. */}
                    <Show when={disponibles().length > 0}>
                      <div class="mb-1 grid max-h-56 gap-0.5 overflow-y-auto">
                        <For each={disponibles()}>
                          {(s) => (
                            <button
                              class={`${ITEM_DE_MENU} grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2`}
                              onClick={() => {
                                setAnadiendo(false);
                                void props.onAdjuntar(s.id);
                              }}
                            >
                              <span class="truncate">{s.etiqueta}</span>
                              <Show when={distingueCuenta(s)}>
                                <Badge forma="dato" class="shrink-0">{cuenta(s)}</Badge>
                              </Show>
                              <span class="shrink-0 font-mono text-2xs text-neutral-500">
                                {s.kind === "git"
                                  ? t("projects.view.source_git")
                                  : t("projects.view.source_folder")}
                              </span>
                            </button>
                          )}
                        </For>
                      </div>
                      <span class="my-1 block h-px bg-border" />
                    </Show>
                    <Button
                      variant="ghost"
                      size="sm"
                      class="w-full shrink justify-start"
                      onClick={() => setTrayendo(true)}
                    >
                      <FolderOpen size={12} />
                      {t("projects.view.bring_new")}
                    </Button>
                  </Show>
                </PopoverContent>
              </Popover>
            }
          >
            <p class="m-0 px-3 pb-2 text-xs text-neutral-500">
              {t("projects.view.sources_hint")}
            </p>
            <Show
              when={fijo().length > 0 || raiz()}
              fallback={
                <EmptyState class="mx-3 mb-3" title={t("projects.view.sources_empty")} />
              }
            >
              <ul class="m-0 list-none divide-y divide-border border-t border-border p-0">
                <Show when={raiz()}>
                  {(r) => (
                    <li class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-3 py-2">
                      <span class="min-w-0">
                        <span class="block truncate text-ui text-neutral-950">
                          {r().name}
                        </span>
                        <span
                          class="block truncate font-mono text-2xs text-neutral-500"
                          title={r().location}
                        >
                          {origen(r())}
                        </span>
                      </span>
                      {/* No lleva botón de quitar: es del workspace y la leen
                          todos los proyectos. */}
                      <span class="flex shrink-0 items-center gap-2">
                        <SelectorDeRama
                          project={props.proyecto.id}
                          source={r()}
                        />
                        <span class="text-caption text-neutral-500">
                          {t("projects.view.from_workspace")}
                        </span>
                      </span>
                    </li>
                  )}
                </Show>
                <For each={fijo()}>
                  {(s) => (
                    <li class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-3 py-2">
                      <span class="min-w-0">
                        <span class="block truncate text-ui text-neutral-950">
                          {s.name}
                        </span>
                        <span
                          class={`block truncate font-mono text-2xs ${
                            s.missing ? "text-error-strong" : "text-neutral-500"
                          }`}
                          title={s.location}
                        >
                          {s.missing
                            ? `${origen(s)} · ${t("projects.view.source_missing")}`
                            : origen(s)}
                        </span>
                      </span>
                      <span class="flex shrink-0 items-center gap-1">
                        <SelectorDeRama
                          project={props.proyecto.id}
                          source={s}
                        />
                        <button
                          class="grid size-7 shrink-0 place-items-center rounded-sm text-neutral-500 outline-none hover:bg-surface-muted hover:text-error-strong focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                          aria-label={t("projects.view.remove_source_named", {
                            name: s.name,
                          })}
                          title={t("projects.view.remove_source")}
                          onClick={() => void props.onQuitar(s.id)}
                        >
                          <X size={14} />
                        </button>
                      </span>
                    </li>
                  )}
                </For>
              </ul>
            </Show>
          </Panel>

          <Panel
            title={t("projects.view.agents_title")}
            action={
              <Button size="sm" variant="ghost" onClick={() => setCreando(true)}>
                <Plus size={14} />
                {t("projects.agents.new_open")}
              </Button>
            }
          >
            <Show when={creando()}>
              <LazyPart>
                <NewAgent
                  abierto
                  onAbrir={setCreando}
                  project={props.proyecto.id}
                  modelos={props.modelos}
                  onCreado={releerEncargados}
                />
              </LazyPart>
            </Show>
            <Show
              when={visibles().length > 0}
              fallback={
                <EmptyState class="mx-3 mb-3" title={t("projects.view.agents_empty")} />
              }
            >
              <ul class="m-0 list-none divide-y divide-border border-t border-border p-0">
                <For each={visibles()}>
                  {(uno) => {
                    const lectores = () => t("projects.view.agents_read_by", { agents: uno.providers.join(", ") });
                    return (
                      <li>
                        <button
                          type="button"
                          class="grid min-h-10 w-full grid-cols-[auto_minmax(0,7.5rem)_minmax(0,1fr)_auto_auto] items-center gap-x-2.5 bg-transparent px-3 py-1 text-left outline-none hover:bg-surface-muted focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary"
                          title={`${uno.description}\n${lectores()}`}
                          onClick={() => props.onHablarCon(uno.name)}
                        >
                          {/* La cara va aquí y no en un rótulo: sin ella, un agente se
                              lee como una fila de configuración. */}
                          <AstroAvatar
                            name={uno.name}
                            status={estadoDe(uno.name)}
                            body={perfiles()[uno.name]?.body}
                            avatar={perfiles()[uno.name]?.avatar}
                            size={24}
                          />
                          <span class="truncate font-mono text-xs text-neutral-950">
                            {uno.name}
                          </span>
                          <span class="truncate text-xs text-neutral-500">
                            {uno.description}
                          </span>
                          <span class="max-w-52 truncate text-2xs text-neutral-500">
                            <Show when={lectoresDistintos().has(uno.name)}>{lectores()}</Show>
                          </span>
                          <ChevronRight size={14} class="text-neutral-500" aria-hidden="true" />
                        </button>
                      </li>
                    );
                  }}
                </For>
              </ul>
            </Show>
            <Show when={ocultos().length > 0 || encargados().rechazados.length > 0}>
              <div class="grid gap-2 border-t border-border px-3 py-2">
                {/* Los ocultos, aquí y en ningún otro sitio: es la lista completa
                    del proyecto, y el único camino de vuelta para uno del
                    repositorio al que se le quitó la fila del riel. */}
                <Show when={ocultos().length > 0}>
                  <SectionLabel as="h3">
                    {t("projects.view.agents_hidden")}
                  </SectionLabel>
                  <ul class="m-0 grid list-none gap-1 p-0">
                    <For each={ocultos()}>
                      {(uno) => (
                        <li class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-sm border border-border px-2 py-1">
                          <span class="overflow-hidden text-ellipsis whitespace-nowrap text-xs text-neutral-500">
                            {displayName(uno.name, perfiles()[uno.name])}
                          </span>
                          <Button size="compact" variant="ghost" onClick={() => void mostrar(uno.name)}>
                            <Eye size={13} />
                            {t("projects.view.agents_show")}
                          </Button>
                        </li>
                      )}
                    </For>
                  </ul>
                </Show>
                {/* Lo rechazado se pinta: una declaración que desapareciera en
                    silencio se diagnostica como que el proyecto no la tiene. */}
                <For each={encargados().rechazados}>
                  {(roto) => (
                    <p class="m-0 text-xs text-error-strong">
                      {t("projects.view.agents_broken", {
                        origin: roto.origin,
                        reason: roto.reason,
                      })}
                    </p>
                  )}
                </For>
              </div>
            </Show>
          </Panel>

          <Suspense>
            <Memoria
              project={props.proyecto.id}
              workspace={props.workspace}
              agents={props.agents}
              encargados={encargados().agents.map((e) => e.name)}
            />
          </Suspense>
        </TabsContent>
      </Tabs>
    </div>
  );
}
