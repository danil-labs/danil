import Plus from "lucide-solid/icons/plus";
import Search from "lucide-solid/icons/search";
import { lazy, Match, Show, Suspense, Switch, type Accessor, type JSX, type Setter } from "solid-js";
import { t } from "../../../ui/src/lib/i18n";
import { cn } from "../../../ui/src/lib/utils";
import { KeyedList } from "../../../ui/src/KeyedList";
import { Pressable } from "../../../ui/src/Pressable";
import {
  CORE_RAIL_SECTION_IDS,
  resetRailLayout,
  toggleRailSectionCollapsed,
  type ResolvedRailSection,
} from "./rail-layout";
import { RailButton, RailSection } from "./RailSection";
import { AgentCollapsedStrip } from "./AgentCollapsedStrip";
import ProjectsDock from "./ProjectsDock";
import { TasksFilterMenu } from "./SidebarFilter";
import type { createDockDelRiel } from "./sidebar-dock";
import type { TareasDelRiel } from "./sidebar-groups";
import type { SidebarProps } from "./sidebar-rows";

// El catálogo conserva su carga perezosa al situarse sobre las tareas.
const AgentDock = lazy(() => import("./AgentDock"));

/** Secciones expandidas del riel izquierdo (proyectos, agentes, tareas y plugins registrados). */
export function SidebarSections(props: {
  sidebar: SidebarProps;
  secciones: ResolvedRailSection[];
  dock: ReturnType<typeof createDockDelRiel>;
  tareas: Pick<TareasDelRiel, "vista" | "cambiarVista">;
  agentSearchOpen: Accessor<boolean>;
  setAgentSearchOpen: Setter<boolean>;
  setDesplegado: Setter<boolean>;
  setCreatingAgentIn: Setter<{ id: string; name: string } | null>;
  lista: () => JSX.Element;
}) {
  return (
    <Show
      when={props.secciones.length > 0}
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
      <KeyedList each={props.secciones} by={(section) => section.id}>
        {(section) => (
          <Switch>
            <Match when={section().id === CORE_RAIL_SECTION_IDS.PROJECTS}>
              <RailSection
                id={section().id}
                title={section().descriptor.label()}
                collapsed={section().collapsed}
                onToggle={() => toggleRailSectionCollapsed(section().id)}
                actions={
                  <Show when={props.sidebar.onAddProject}>
                    {(addProject) => (
                      <Pressable
                        class="relative grid size-6 shrink-0 place-items-center rounded-md border-0 bg-transparent p-0 text-neutral-500 transition-colors hover:bg-neutral-200 hover:text-neutral-950 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-primary"
                        aria-label={t("projects.add.title")}
                        title={t("projects.add.title")}
                        onClick={() => addProject()()}
                      >
                        <Plus size={14} aria-hidden="true" />
                      </Pressable>
                    )}
                  </Show>
                }
              >
                <ProjectsDock
                  projects={props.sidebar.projects}
                  activeProjectId={props.sidebar.proyectoAbierto ?? props.sidebar.carpetaDelBorrador ?? null}
                  taskCountOf={(id) => (props.sidebar.sessions[id] ?? []).filter((r) => !r.archived).length}
                  onOpenProject={(id) => props.sidebar.onAbrirProyecto(id)}
                  onNewTaskIn={(id) => { props.sidebar.onNuevaTareaEn(id); props.setDesplegado(false); }}
                />
              </RailSection>
            </Match>

            <Match when={section().id === CORE_RAIL_SECTION_IDS.AGENTS}>
              <RailSection
                id={section().id}
                title={section().descriptor.label()}
                collapsed={section().collapsed}
                onToggle={() => toggleRailSectionCollapsed(section().id)}
                actions={
                  <div class="flex shrink-0 items-center gap-1">
                    <Show
                      when={section().collapsed}
                      fallback={
                        <Pressable
                          class={cn(
                            "relative grid size-6 shrink-0 place-items-center rounded-md border-0 p-0 text-neutral-500 transition-colors hover:bg-neutral-200 hover:text-neutral-950 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-primary",
                            props.agentSearchOpen() ? "bg-neutral-200 text-neutral-950" : "bg-transparent",
                          )}
                          aria-label={t("chat.search.placeholder")}
                          aria-pressed={props.agentSearchOpen()}
                          title={t("chat.search.placeholder")}
                          onClick={() => props.setAgentSearchOpen((open) => !open)}
                        >
                          <Search size={13} aria-hidden="true" />
                        </Pressable>
                      }
                    >
                      <AgentCollapsedStrip
                        agents={props.dock.agentesDelDock()}
                        foldersOf={props.dock.carpetasDelAgente}
                        currentFolder={props.dock.carpetaActual()}
                        profileOf={props.dock.perfilDe}
                        onTalk={props.sidebar.onHablarCon}
                      />
                    </Show>
                    <Pressable
                      class="relative grid size-6 shrink-0 place-items-center rounded-md border-0 bg-transparent p-0 text-neutral-500 transition-colors hover:bg-neutral-200 hover:text-neutral-950 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-primary"
                      aria-label={t("projects.agents.new_open")}
                      title={t("projects.agents.new_open")}
                      onClick={() => props.setCreatingAgentIn({ id: props.dock.carpetaActual() ?? "", name: "" })}
                    >
                      <Plus size={14} aria-hidden="true" />
                    </Pressable>
                  </div>
                }
              >
                <Suspense fallback={<div class="h-24 rounded-lg border border-border bg-surface motion-safe:animate-pulse" aria-busy="true" />}>
                  <AgentDock
                    embedded
                    searchOpen={props.agentSearchOpen()}
                    agents={props.dock.agentesDelDock()}
                    selected={props.tareas.vista().agent}
                    foldersOf={props.dock.carpetasDelAgente}
                    currentFolder={props.dock.carpetaActual()}
                    loading={!props.dock.rosterListo()}
                    onTalk={props.sidebar.onHablarCon}
                    onShowTasks={(agent) => props.tareas.cambiarVista({ ...props.tareas.vista(), agent })}
                    onProfile={props.sidebar.onAgentProfile}
                    onSeeAll={() => props.sidebar.onSettings("agentes")}
                    onNewAgent={() => props.setCreatingAgentIn({ id: props.dock.carpetaActual() ?? "", name: "" })}
                    profileOf={props.dock.perfilDe}
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
                actions={<TasksFilterMenu {...props.dock.filtro} />}
              >
                {props.lista()}
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
                    props.setDesplegado(false);
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
  );
}
