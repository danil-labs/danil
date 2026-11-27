import { SignalDot } from "../../../ui/src/SignalDot";
import FolderPlus from "lucide-solid/icons/folder-plus";
import History from "lucide-solid/icons/history";
import Plus from "lucide-solid/icons/plus";
import SquarePen from "lucide-solid/icons/square-pen";
import { createEffect, createMemo, createSignal, lazy, Match, on, onCleanup, Show, Suspense, Switch } from "solid-js";
import { puntoDelArrastre, tareaEnVuelo } from "../../../ui/src/lib/drag";
import { t } from "../../../ui/src/lib/i18n";
import { ariaDeAtajo } from "../../../ui/src/lib/shortcuts";
import { cn } from "../../../ui/src/lib/utils";
import { KeyedList } from "../../../ui/src/KeyedList";
import { Pressable } from "../../../ui/src/Pressable";
import { Spinner } from "../../../ui/src/Spinner";
import { TeclaDeAtajo } from "../../../ui/src/Shortcut";
import { machineAction } from "../../../host/src/machine-action";
import { machineName, machines } from "../../../features/machines/src/queries/store";
import {
  SidebarContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  Sidebar as SidebarShell,
} from "../../../ui/src/sidebar";
import { groupKey } from "../../../ui/src/lib/sidebarView";
import { LazyPart, retryableLazy } from "../../../ui/src/LazyPart";
import {
  CORE_RAIL_SECTION_IDS,
  resetRailLayout,
  resolvedRailSections,
  toggleRailSectionCollapsed,
} from "./rail-layout";
import { CollapsedRailButtons, RailButton, RailSection } from "./RailSection";
import { TasksFilterMenu } from "./SidebarFilter";
import { createTareasDelRiel } from "./sidebar-groups";
import { createDockDelRiel } from "./sidebar-dock";
import { createFilas, type SidebarProps } from "./sidebar-rows";

export { createSidebar } from "./sidebar-state";

const NewAgent = retryableLazy(() => import("../../../features/projects/src/screens/NewAgent"));

// El catálogo conserva su carga perezosa al situarse sobre las tareas.
const AgentDock = lazy(() => import("./AgentDock"));


/* El ancho vive en `ColumnaLateral`, que es la columna que envuelve a esta
   barra. Aquí había cuatro constantes —expandido, mínimo, máximo y el riel— que
   existían para alimentar un panel redimensionable; ese panel se fue, y con él
   la única razón de que el ancho fuera un número en este archivo. */

/**
 * La columna izquierda, montada sobre el shell de `ui/sidebar.tsx`.
 *
 * **Las tareas de todas las carpetas, por carpeta salvo que se elija otra
 * agrupación.** Por carpeta, una sin tareas también tiene su cabecera: la
 * recién agregada se ve. Sin agrupar, la carpeta es un dato de cada fila.
 */
export default function Sidebar(props: SidebarProps) {
  const [creatingAgentIn, setCreatingAgentIn] = createSignal<{ id: string; name: string } | null>(null);
  let listViewport: HTMLDivElement | undefined;
  // Colapsado, el historial no desaparece: se abre al lado del riel.
  const [desplegado, setDesplegado] = createSignal(false);
  let riel: HTMLDivElement | undefined;

  // Expandir vuelve redundante el desplegable: la lista ya está a la vista.
  createEffect(
    on(
      () => props.collapsed,
      (c) => {
        if (!c) setDesplegado(false);
      },
    ),
  );

  createEffect(
    on(desplegado, (abierto) => {
      if (!abierto) return;
      const alPulsar = (e: PointerEvent) => {
        if (!riel?.contains(e.target as Node)) setDesplegado(false);
      };
      const alTeclear = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          setDesplegado(false);
        }
      };
      document.addEventListener("pointerdown", alPulsar);
      window.addEventListener("keydown", alTeclear, true);
      onCleanup(() => {
        document.removeEventListener("pointerdown", alPulsar);
        window.removeEventListener("keydown", alTeclear, true);
      });
    }),
  );

  const tareas = createTareasDelRiel(props);
  const { vista, cambiarVista, todas, grupos, hayCarpetasVacias } = tareas;
  const { carpetaActual, agentesDelDock, carpetasDelAgente, rosterListo, perfilDe, filtro } = createDockDelRiel(props, tareas);
  const { FilaDeClon, Grupo } = createFilas(props, tareas, { setDesplegado, setCreatingAgentIn });
  const seccionesVisibles = createMemo(() => resolvedRailSections().filter((section) => section.visible));
  const algunAgenteTrabajando = createMemo(() => agentesDelDock().some((a) => a.status === "working"));
  const asleepMachine = createMemo(() => {
    const rows = machines().filter((m) => !m.local && m.wakes && !m.refuses);
    return rows.find((m) => m.power === "starting") ?? rows.find((m) => m.power === "off") ?? null;
  });

  /** La misma lista, montada en dos sitios: expandida y en el desplegable. */
  const Lista = () => (
    <div data-sidebar-tasks class="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1 rounded-[14px]">
      <Show when={props.clon}>{(c) => <FilaDeClon clon={c()} />}</Show>

      <Show when={asleepMachine()}>
        {(machine) => (
          <Show
            when={machine().power === "starting"}
            fallback={
              <div class="mx-1 flex flex-col items-start gap-1.5 rounded-md border border-border bg-surface px-2.5 py-2 text-caption text-neutral-600" data-machine-stopped={machine().id}>
                <p class="m-0">{t("web.machines.off_wakes", { name: machineName(machine().id) })}</p>
                <Pressable
                  class="rounded-md bg-neutral-200 px-2 py-1 text-caption font-medium text-neutral-950 hover:bg-neutral-300 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-primary"
                  data-wake-machine={machine().id}
                  onClick={() => machineAction()}
                >
                  {t("web.machines.wake")}
                </Pressable>
              </div>
            }
          >
            <div class="mx-1 flex items-center gap-2 rounded-md border border-border bg-surface px-2.5 py-2 text-caption text-neutral-600" data-machine-waking={machine().id}>
              <Spinner size={13} class="shrink-0 text-neutral-500" />
              <span class="min-w-0 truncate">{t("web.machines.starting", { name: machineName(machine().id) })}</span>
            </div>
          </Show>
        )}
      </Show>

      <Show when={todas().length === 0 && !hayCarpetasVacias() && !asleepMachine()}>
        <Show
          when={props.projects.length === 0}
          fallback={<p class="m-0 px-2 pt-1 text-xs text-neutral-500" data-sidebar-empty="">{t("shell.sidebar.empty")}</p>}
        >
          <Show when={props.escritorio}>
            <p class="m-0 px-2 pt-1 text-xs text-neutral-500" data-desk-empty="">
              {t("spaces.rail.empty", { name: props.escritorio ?? "" })}
            </p>
          </Show>
        </Show>
      </Show>

      <Show when={todas().length > 0 && grupos().every((g) => g.tasks.length === 0)}>
        <p class="m-0 px-2 pt-1 text-xs text-neutral-500" data-sidebar-filtered-empty="">{t("shell.sidebar.filter_empty")}</p>
      </Show>

      <KeyedList each={grupos()} by={groupKey}>{(g) => <Grupo grupo={g()} />}</KeyedList>
    </div>
  );

  return (
    <div
      ref={riel}
      // El borde que separa esta región del chat lo dibuja `ColumnaLateral`, y
      // no aquí: es la frontera **entre** las dos columnas, así que tiene que
      // irse cuando la columna se va. Con el borde en este div, cerrarla lo
      // recortaba a la vez que el contenido; con el mismo borde en las dos
      // columnas habría dos definiciones de la misma línea.
      //
      // `w-full min-w-0`: sin eso el contenido no se entera del ancho del
      // contenedor —`overflow-visible` hace falta para el menú del pie y para
      // el desplegable— así que los títulos largos lo estiraban y empujaban
      // fuera de la vista lo que estuviera a la derecha, como el «+».
      class="relative z-40 h-full min-h-0 w-full min-w-0 overflow-hidden"
    >
      <Show when={creatingAgentIn()}>{project => <LazyPart><NewAgent
        abierto onAbrir={open => { if (!open) setCreatingAgentIn(null); }}
        project={project().id}
        modelos={props.modelos}
        createFreeRouterConsent={props.createFreeRouterConsent}
        onCreado={() => setCreatingAgentIn(null)}
      /></LazyPart>}</Show>
      <SidebarShell
        state={props.collapsed ? "collapsed" : "expanded"}
        class="h-full w-full min-w-0 grid-rows-[minmax(0,1fr)]"
        aria-label={t("shell.sidebar.label")}
      >
        <SidebarContent class="gap-0 p-0">
          {/* Un solo scroll unificado para todo el riel izquierdo (estilo claude.ai):
              «Nueva tarea», «Tus agentes», «Tareas» y cualquier plugin registrado se
              desplazan juntos. `overflow-x-hidden overflow-y-auto` evita barras
              horizontales; `data-arrastre-scroll` permite desplazar el riel al
              arrastrar una tarea hacia sus bordes (`lib/drag.ts`). */}
          <div
            ref={listViewport}
            class={cn(
              "flex min-h-0 min-w-0 flex-1 flex-col gap-3 px-2 pt-2 pb-4",
              !props.collapsed && "overflow-x-hidden overflow-y-auto",
            )}
            data-arrastre-scroll={!props.collapsed ? "" : undefined}
          >
            <SidebarMenu class="shrink-0 gap-1.5">
              <SidebarMenuItem class={cn(!props.collapsed && "@container flex min-w-0 items-center gap-1.5")}>
                {/* Nueva tarea es la acción principal, negra y sólida.
                    `primary` queda reservado para las acciones del agente. */}
                <SidebarMenuButton
                  class={cn(
                    "bg-neutral-950 font-bold text-neutral-50 hover:bg-neutral-950",
                    !props.collapsed && "min-w-0 flex-1",
                  )}
                  aria-keyshortcuts={ariaDeAtajo("newTask")}
                  aria-label={t("shell.sidebar.new_task")}
                  onClick={() => {
                    props.onNew();
                    setDesplegado(false);
                  }}
                >
                  <SquarePen size={14} aria-hidden="true" />
                  <Show when={!props.collapsed}>
                    <span>{t("shell.sidebar.new_task")}</span>
                    <TeclaDeAtajo accion="newTask" />
                  </Show>
                </SidebarMenuButton>
                <Show when={!props.collapsed && props.onAddProject}>
                  {(addProject) => (
                    <Pressable
                      class="inline-flex h-[30px] min-w-[30px] shrink-0 items-center justify-center gap-1.5 rounded-sm border border-border bg-surface px-2 text-ui font-medium text-neutral-700 hover:bg-neutral-200 hover:text-neutral-950 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-primary"
                      data-add-project=""
                      aria-label={t("projects.add.title")}
                      title={t("projects.add.title")}
                      onClick={() => addProject()()}
                    >
                      <FolderPlus size={14} class="shrink-0" aria-hidden="true" />
                      <span class="hidden truncate @[280px]:inline">{t("shell.sidebar.new_folder")}</span>
                    </Pressable>
                  )}
                </Show>
              </SidebarMenuItem>
              <Show when={props.collapsed && props.onAddProject}>
                {(addProject) => (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      data-add-project=""
                      tooltip={t("projects.add.title")}
                      aria-label={t("projects.add.title")}
                      onClick={() => addProject()()}
                    >
                      <FolderPlus size={15} aria-hidden="true" />
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
              </Show>
              <Show when={props.collapsed}>
                <CollapsedRailButtons sections={seccionesVisibles()} onAfterActivate={() => setDesplegado(false)} />
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={desplegado()}
                    tooltip={t("shell.sidebar.tasks")}
                    aria-label={t("shell.sidebar.tasks")}
                    aria-expanded={desplegado()}
                    onClick={() => setDesplegado((v) => !v)}
                  >
                    <History size={15} />
                    {/* Con la lista escondida, el riel sigue diciendo que hay una
                        sesión abierta: sin esto el estado se comunicaría solo al
                        desplegar. */}
                    <Show when={props.current}>
                      <SignalDot tone="working" class="ui-sidebar-menu-badge absolute top-1 right-1" />
                    </Show>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </Show>
            </SidebarMenu>

            <Show when={!props.collapsed}>
              <Show
                when={seccionesVisibles().length > 0}
                fallback={
                  <div class="flex flex-col items-start gap-2 rounded-lg border border-border bg-surface px-3 py-3 text-caption text-neutral-500" data-rail-all-hidden="">
                    <p class="m-0">{t("shell.rail_organizer.all_hidden")}</p>
                    <Pressable
                      class="rounded-md bg-neutral-200 px-2 py-1 text-caption font-medium text-neutral-950 hover:bg-neutral-300 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-primary"
                      onClick={() => resetRailLayout()}
                    >
                      {t("shell.rail_organizer.show_all")}
                    </Pressable>
                  </div>
                }
              >
                <KeyedList each={seccionesVisibles()} by={(section) => section.id}>
                  {(section) => (
                    <Switch>
                      <Match when={section().id === CORE_RAIL_SECTION_IDS.AGENTS}>
                        <RailSection
                          id={section().id}
                          title={section().descriptor.label()}
                          collapsed={section().collapsed}
                          onToggle={() => toggleRailSectionCollapsed(section().id)}
                          badge={
                            section().collapsed && algunAgenteTrabajando() ? (
                              <SignalDot tone="working" pulse class="ml-0.5 motion-reduce:animate-none" />
                            ) : undefined
                          }
                          actions={
                            <Pressable
                              class="relative grid size-6 shrink-0 place-items-center rounded-md border-0 bg-transparent p-0 text-neutral-500 transition-colors hover:bg-neutral-200 hover:text-neutral-950 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-primary"
                              aria-label={t("projects.agents.new_open")}
                              title={t("projects.agents.new_open")}
                              onClick={() => setCreatingAgentIn({ id: carpetaActual() ?? "", name: "" })}
                            >
                              <Plus size={14} aria-hidden="true" />
                            </Pressable>
                          }
                        >
                          <Suspense fallback={<div class="h-24 rounded-lg border border-border bg-surface motion-safe:animate-pulse" aria-busy="true" />}>
                            <AgentDock
                              embedded
                              agents={agentesDelDock()}
                              selected={vista().agent}
                              foldersOf={carpetasDelAgente}
                              currentFolder={carpetaActual()}
                              loading={!rosterListo()}
                              onTalk={props.onHablarCon}
                              onShowTasks={(agent) => cambiarVista({ ...vista(), agent })}
                              onProfile={props.onAgentProfile}
                              onSeeAll={() => props.onSettings("agentes")}
                              onNewAgent={() => setCreatingAgentIn({ id: carpetaActual() ?? "", name: "" })}
                              profileOf={perfilDe}
                            />
                          </Suspense>
                        </RailSection>
                      </Match>

                      <Match when={section().id === CORE_RAIL_SECTION_IDS.TASKS}>
                        <RailSection
                          id={section().id}
                          title={section().descriptor.label()}
                          collapsed={section().collapsed}
                          onToggle={() => toggleRailSectionCollapsed(section().id)}
                          actions={<TasksFilterMenu {...filtro} />}
                        >
                          <Lista />
                        </RailSection>
                      </Match>

                      <Match when={section().descriptor.kind === "button" && section().descriptor.onActivate}>
                        {(activate) => (
                          <RailButton
                            id={section().id}
                            title={section().descriptor.label()}
                            active={section().descriptor.isActive?.()}
                            icon={section().descriptor.renderIcon?.()}
                            onActivate={() => {
                              activate()();
                              setDesplegado(false);
                            }}
                          />
                        )}
                      </Match>

                      <Match when={section().descriptor.render}>
                        {(renderPlugin) => (
                          <RailSection
                            id={section().id}
                            title={section().descriptor.label()}
                            collapsed={section().collapsed}
                            onToggle={() => toggleRailSectionCollapsed(section().id)}
                            actions={section().descriptor.renderActions?.()}
                          >
                            {renderPlugin()()}
                          </RailSection>
                        )}
                      </Match>
                    </Switch>
                  )}
                </KeyedList>
              </Show>
            </Show>
          </div>
        </SidebarContent>

      </SidebarShell>

      {/* El historial colapsado no desaparece: se abre al lado del riel. Este SÍ
          lleva borde y sombra: flota de verdad sobre lo que hay debajo, que es
          para lo que el sistema reserva la elevación. */}
      <Show when={props.collapsed && desplegado()}>
        <div class="absolute top-12 left-full z-40 ml-2 flex max-h-[min(60vh,420px)] w-70 flex-col overflow-hidden rounded-lg border border-border bg-surface-raised shadow-md">
          <div
            ref={listViewport}
            class="min-w-0 overflow-x-hidden overflow-y-auto p-2"
            data-arrastre-scroll=""
          >
            <Lista />
          </div>
        </div>
      </Show>

      {/* Lo que va en la mano mientras se arrastra una tarea.

          **Sin esto el gesto no se ve.** El puntero cambia de forma y el
          grupo de debajo se enciende, pero nada dice QUÉ se está moviendo.

          `pointer-events-none` no es cosmético: `lib/drag.ts` resuelve el
          destino con `elementFromPoint`, y un nodo pegado al puntero sería
          siempre lo que hay debajo del puntero. */}
      <Show when={tareaEnVuelo()}>
        {(enVuelo) => (
          <div
            aria-hidden="true"
            class="pointer-events-none fixed z-[90] max-w-64 truncate rounded-md border border-border bg-surface-raised px-2 py-1 text-xs text-neutral-950 shadow-md"
            style={{
              left: `${puntoDelArrastre().x + 12}px`,
              top: `${puntoDelArrastre().y + 10}px`,
            }}
          >
            {enVuelo().titulo}
          </div>
        )}
      </Show>
    </div>
  );
}
