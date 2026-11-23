import { t } from "../../../../apps/desktop/src/lib/i18n";
import { type Project } from "../../../../apps/desktop/src/lib/model.ts";
import { type CatalogosDeModelos } from "../../../../apps/desktop/src/lib/models.ts";
import { type PanelSite as SitioDePanel, type Side as PanelSide } from "../../../../apps/desktop/src/lib/panels-types.ts";
import { type DragPoint } from "../../../../apps/desktop/src/lib/pointer-drag.ts";
import { sidebarViewKey } from "../../../../apps/desktop/src/lib/sidebarView";
import { spaceName } from "../../../../apps/desktop/src/lib/spaces";
import { type Space } from "../../../../apps/desktop/src/lib/spaces.ts";
import { type Superficie } from "../../../../apps/desktop/src/lib/surfaces.ts";
import { type TextEdit } from "../../../../apps/desktop/src/lib/taskMentions.ts";
import { type PermissionRequest } from "../../../features/chat/src/screens/Chat.tsx";
import { machines } from "../../../features/machines/src/queries/store";
import { type createDeskStrip as T_createDeskStrip, type createSessionMutations as T_createSessionMutations } from "../../../features/projects/src";
import { type ClonEnCurso } from "../../../features/projects/src/screens/AddWorkdir.tsx";
import { type SessionRow } from "../../../features/projects/src/screens/Sessions.tsx";
import { type AttentionStore } from "../../../features/projects/src/screens/workspace-session.ts";
import { type Workspace } from "../../../features/settings/src/queries/workspaces-store.ts";
import { ConexionesMenu } from "../../../features/settings/src/screens/Tools";
import { capabilities } from "../../../host/src/platform";
import { sealFirstFreeWorkspace, TitleBarSection } from "../shell";
import AppTools from "../shell/AppTools";
import GlobalSearch from "../shell/GlobalSearch";
import { type SearchFilter } from "../shell/GlobalSearch.tsx";
import ColumnaLateral from "../shell/SideColumn";
import Sidebar from "../shell/Sidebar";
import { type SidebarFilterProps } from "../shell/SidebarFilter.tsx";
import SpaceMenu from "../shell/SpaceMenu";
import WorkspaceColumn from "../shell/WorkspaceColumn";
import ControlesDeVentana from "../shell/WindowControls";
import { flattenTasks } from "../shell/sidebarTasks";
import { createFreeRouterConsent } from "./chatSlots";
import { MachinesLicense, Onboarding } from "./lazy-screens";
import { Show, Suspense, createEffect, type Accessor, type JSX, type Setter } from "solid-js";


/** Lo que el bloque usaba del cuerpo de App. */
export type ColumnasDePrincipalDeps = { Conversacion: () => JSX.Element; abrirLlevarCarpeta: (id: string, machine?: string) => Promise<void>; abrirProyecto: (id: string) => void; abrirSesion: (proyecto: string, id: string, activar?: string, propagateError?: boolean) => Promise<void>; abrirSitio: (url: string, proyecto: string, session: string) => Promise<void>; abrirTraer: (proyecto: string | undefined, id: string) => Promise<void>; activeSpace: () => Space | null; alta: Accessor<boolean>; arrastrando: Accessor<string | null>; arrastrarTarea: (project: string, row: SessionRow, event: PointerEvent) => void; attention: AttentionStore; bordeDeLaBarra: Accessor<number | null>; borrarProyecto: (id: string) => Promise<void>; buscando: Accessor<SearchFilter | null>; busy: () => boolean; cambiarEscritorio: (id: string, restaurarActiva?: boolean) => void; clonEnCurso: Accessor<ClonEnCurso | null>; createSpace: (name: string, folders: string[]) => Promise<void>; deleteTask: (project: string, id: string, members?: number) => void; enCache: Accessor<boolean>; enLaMaquinaDelGrupo: (machine: string | undefined) => void; escritorio: Accessor<string | null>; etaparSesion: ReturnType<typeof T_createSessionMutations>["etaparSesion"]; fijarSesion: (proyecto: string, id: string, pinned: boolean) => Promise<void>; hablandoCon: Accessor<{ project: string; name: string; } | null>; hablarConEncargado: (enProyecto: string, name: string) => void; medirBordeDeLaBarra: (el: HTMLDivElement) => void; modelosParaAgentes: Accessor<{ superficies: Superficie[]; catalogos: CatalogosDeModelos; }>; moveToSpace: (project: string, id: string, space: string) => Promise<void>; moverSesion: (de: string, id: string, a: string) => Promise<void>; multipleSpaces: () => boolean; nuevaSesion: (enProyecto?: string) => void; opcionesDeMover: () => { id: string; name: string; }[]; openAgentProfile: (enProyecto: string, name: string) => void; permissions: Accessor<PermissionRequest[]>; pestanaActiva: () => string | null; project: Accessor<string>; projectList: Accessor<Project[]>; proyectoAbierto: Accessor<string | null>; proyectosDelRiel: Accessor<Project[]>; removeFromActiveSpace: (folder: string) => Promise<void>; renameSpace: (id: string, name: string) => Promise<void>; renombrarProyecto: (id: string, name: string) => Promise<void>; renombrarSesion: (proyecto: string, id: string, title: string) => Promise<boolean>; senalDe: ReturnType<typeof T_createDeskStrip>["senalDe"]; sesiones: Accessor<Record<string, SessionRow[]>>; sesionesConPestana: Accessor<string[]>; sesionesDelRiel: () => { [k: string]: SessionRow[]; }; sessionId: Accessor<string | null>; setAlta: Setter<boolean>; setAnadiendoCarpeta: Setter<boolean>; setBuscando: Setter<SearchFilter | null>; setDeletingSpace: Setter<string | null>; setHablandoCon: Setter<{ project: string; name: string; } | null>; setInput: (value: string, inputType?: string, change?: TextEdit) => void; setSettings: Setter<string | null>; setSidebarFilter: Setter<SidebarFilterProps | null>; sidebar: { colapsado: () => boolean; alternar: () => boolean | void; }; sidebarFilter: Accessor<SidebarFilterProps | null>; spaces: Accessor<Space[]>; tabDrag: { source: Accessor<string | null>; cursor: Accessor<DragPoint | null>; destination: Accessor<{ folder: string | undefined; sitio: { col: number; fila: number; }; indice: number; zone?: undefined; } | { folder: string | undefined; sitio: { col: number; fila: number; }; zone: "center" | PanelSide; indice?: undefined; } | { sitio: SitioDePanel; indice: undefined; zone: undefined; folder: string; } | null>; start: (id: string, event: PointerEvent) => void; }; tiraDeLaVentana: () => JSX.Element; vivas: Accessor<string[]>; workspaceActivo: Accessor<string | null>; workspaceActual: () => Workspace | null };

/** Movido tal cual de packages/shell/src/app/App.tsx (líneas 2672–2856, tarea 2.5). Lo que usaba del cuerpo de App llega por `deps`. */
export function createColumnasDePrincipal(deps: ColumnasDePrincipalDeps) {
  const { Conversacion, abrirLlevarCarpeta, abrirProyecto, abrirSesion, abrirSitio, abrirTraer, activeSpace, alta, arrastrando, arrastrarTarea, attention, bordeDeLaBarra, borrarProyecto, buscando, busy, cambiarEscritorio, clonEnCurso, createSpace, deleteTask, enCache, enLaMaquinaDelGrupo, escritorio, etaparSesion, fijarSesion, hablandoCon, hablarConEncargado, medirBordeDeLaBarra, modelosParaAgentes, moveToSpace, moverSesion, multipleSpaces, nuevaSesion, opcionesDeMover, openAgentProfile, permissions, pestanaActiva, project, projectList, proyectoAbierto, proyectosDelRiel, removeFromActiveSpace, renameSpace, renombrarProyecto, renombrarSesion, senalDe, sesiones, sesionesConPestana, sesionesDelRiel, sessionId, setAlta, setAnadiendoCarpeta, setBuscando, setDeletingSpace, setHablandoCon, setInput, setSettings, setSidebarFilter, sidebar, sidebarFilter, spaces, tabDrag, tiraDeLaVentana, vivas, workspaceActivo, workspaceActual } = deps;
  const ColumnasDePrincipal = () => (
      <Show
        when={!alta()}
        fallback={
          <Suspense fallback={null}>
            <Onboarding
              /* Por el mismo evento que usa el selector de workspace: quien acaba
                 de crear el primero no tiene por qué saber cómo se recarga esta
                 pantalla. */
              onListo={() => {
                setAlta(false);
                window.dispatchEvent(new CustomEvent("harness:workspace"));
              }}
              sealFirstFreeWorkspace={sealFirstFreeWorkspace}
              ControlesDeVentana={ControlesDeVentana}
            />
          </Suspense>
        }
      >
        {/* El chasis se monta SIEMPRE, tenga o no fuente de contexto:
            detrás de `contextRoot`, un workspace recién creado no tenía
            riel lateral ni forma de escribir hasta señalar una carpeta,
            y eso contradecía el modelo —un proyecto dejó de ser un
            repo. */}

        {/* Las dos columnas son hermanas de ancho propio y usan
            `ColumnaLateral`, que documenta sus límites. */}
        <TitleBarSection
          border={bordeDeLaBarra()}
          sidebarCollapsed={sidebar.colapsado()}
          onToggleSidebar={sidebar.alternar}
          spaceMenu={<Show when={spaces().length > 0}>
            <SpaceMenu
              workspace={workspaceActual()?.name ?? ""}
              spaces={spaces()}
              activa={escritorio()}
              proyectos={projectList()}
              senal={(id) => senalDe(id)}
              onElegir={cambiarEscritorio}
              onCrear={createSpace}
              onRenombrar={renameSpace}
              onEliminar={(id) => setDeletingSpace(id)}
            />
          </Show>}
          sidebarExtra={capabilities().sidebarExtra?.()}
          searchOpen={buscando() !== null}
          onSearch={() => setBuscando("all")}
          onAddProject={() => setAnadiendoCarpeta(true)}
          filter={sidebarFilter()}
          tabs={tiraDeLaVentana()}
        />
        <GlobalSearch
          open={buscando()}
          onClose={() => setBuscando(null)}
          tasks={buscando() === null ? [] : flattenTasks(sesionesDelRiel(), true)}
          folders={proyectosDelRiel()}
          projects={projectList()}
          spaces={spaces()}
          onOpenTask={(p, id) => { setHablandoCon(null); void abrirSesion(p, id); }}
          onOpenFolder={abrirProyecto}
          onNewTask={(id) => nuevaSesion(id)}
        />
        {/* El velo del marco cubre la columna y el hueco alrededor de la caja: un solo tono también en la esquina. */}
        <div class="tab-veil window-frame relative flex min-h-0 flex-1 overflow-visible">
          <WorkspaceColumn
            attention={attention.list()}
            onSettings={(panel) => setSettings(panel ?? "")}
            onReportarBug={() => setInput(t("chat.composer.bug_report_starter"))}
            tools={<>
            <ConexionesMenu triggerClass="size-8 rounded-md" onManage={() => setSettings("mcp")} />
            <AppTools
              workspace={workspaceActivo()}
              busy={busy()}
              onAbrirSitio={(url, proyecto, session) => void abrirSitio(url, proyecto, session)}
              trabajando={vivas()}
              conPestana={sesionesConPestana()}
              onAbrirTarea={(proyecto, session) => void abrirSesion(proyecto, session)}
              lookup={(session) => {
                for (const [id, rows] of Object.entries(sesiones())) {
                  const row = rows.find((r) => r.id === session);
                  if (row) return { title: row.title, project: projectList().find((p) => p.id === id)?.name };
                }
                return undefined;
              }}
            />
            </>}
          />
          {/* La superficie: barra, ventana y panel derecho, una caja redondeada que flota sobre el marco. */}
          <div class="relative mr-1 mb-1 flex min-h-0 min-w-0 flex-1 overflow-hidden rounded-[10px] bg-surface" data-surface="">
          {/* Los topes los pone quien monta: el ancho por debajo del
              cual algo deja de caber solo lo sabe su contenido. Por
              debajo de 220 los títulos del historial dejan de caber; por
              encima de 420 la barra empieza a comer la conversación. */}
          <ColumnaLateral
            lado="left"
            colapsada={sidebar.colapsado()}
            clave="sidebar.width"
            ancho={260}
            min={220}
            max={420}
            etiqueta={t("shell.column.sidebar_width")}
          >
            <div class="relative h-full min-h-0 w-full min-w-0">
            {/* Las otras máquinas se ven por el relay, que es de pago: si la flota lo
                detuvo por la licencia, el aviso de Terminus (el pago vive en la web). */}
            <Show when={capabilities().machinesLicense?.() === "license_required" && !sidebar.colapsado()}>
              <div class="absolute inset-x-2 bottom-2 z-10 rounded-md border border-border bg-surface-raised p-3 shadow-sm" data-machines-license="">
                <MachinesLicense onRetry={() => capabilities().retryMachines?.()} />
              </div>
            </Show>
            <div
              class="flex h-full min-h-0 w-full min-w-0 flex-col"
              ref={(el) => createEffect(() => el.toggleAttribute("inert", enCache()))}
              aria-busy={enCache() || undefined}
              data-shell-cache={enCache() ? "" : undefined}
            >
            <div class="min-h-0 flex-1">
            <Sidebar
              projects={proyectosDelRiel()}
              modelos={modelosParaAgentes()} createFreeRouterConsent={createFreeRouterConsent}
              sessions={sesionesDelRiel()}
              viewKey={sidebarViewKey(workspaceActivo(), escritorio())}
              filterRef={(filter, released) => setSidebarFilter((actual) => filter ?? (actual === released ? null : actual))}
              onHablarCon={hablarConEncargado}
              onAgentProfile={openAgentProfile}
              escritorio={activeSpace() ? spaceName(activeSpace()) : null}
              spaces={opcionesDeMover()}
              onMoveToSpace={(p, id, i) => void moveToSpace(p, id, i)}
              onBringHere={(p, id) => void abrirTraer(p, id)}
              onCarryFolder={machines().length > 1 ? (id, machine) => void abrirLlevarCarpeta(id, machine) : undefined}
              current={sessionId()}
              vivas={vivas()}
        /* Qué tareas esperan que apruebes algo, aparte de `vivas`: pesa
           más, una que trabaja no necesita nada de ti, y una parada
           esperando tu aprobación no avanza hasta que vayas. */
        aprobando={permissions().map((p) => p.session)}
              collapsed={sidebar.colapsado()}
              onToggle={sidebar.alternar}
              draggedTask={arrastrando()}
              dragFolder={tabDrag.destination()?.folder}
              onDrag={arrastrarTarea}
              onPick={(p, id) => {
                // Abrir una tarea suelta la marca del agente: su fila no
                // puede seguir señalada cuando ya se mira otra cosa.
                setHablandoCon(null);
                void abrirSesion(p, id);
              }}
              onNew={() => nuevaSesion()}
              onRenombrarProyecto={(id, name) =>
                void renombrarProyecto(id, name)
              }
              onBorrarProyecto={borrarProyecto}
              onRemoveFromSpace={multipleSpaces() ? removeFromActiveSpace : undefined}
              clon={clonEnCurso()}
              onAbrirClon={() => setAnadiendoCarpeta(true)}
              proyectoAbierto={proyectoAbierto()}
              carpetaDelBorrador={!proyectoAbierto() && pestanaActiva() === null && !sessionId() && !hablandoCon() ? project() || null : null}
              onAbrirProyecto={(id, machine) => { abrirProyecto(id); enLaMaquinaDelGrupo(machine); }}
              /* El proyecto viaja en el mismo gesto que abre el borrador. */
              onNuevaTareaEn={(id, machine) => { nuevaSesion(id); enLaMaquinaDelGrupo(machine); }}
              onDelete={(p, id, members) => deleteTask(p, id, members)}
              onMove={(p, id, a) => void moverSesion(p, id, a)}
              onEtapa={(p, id, etapa) => void etaparSesion(p, id, etapa)}
              onPin={fijarSesion}
              onRenombrar={(p, id, title) =>
                renombrarSesion(p, id, title)
              }
              onSettings={(panel) => setSettings(panel ?? "")}
            />
            </div>
            </div>
            </div>
          </ColumnaLateral>

          {/* 30rem es lo que cabe en la caja sin partir el modelo ni el modo.
              Las columnas laterales encogen mil veces más rápido, hasta su
              mínimo; un factor menor que 1 aquí dejaría desbordar la fila. */}
          <div ref={medirBordeDeLaBarra} class={"min-h-0 min-w-0 flex-[1_1_30rem] overflow-hidden work-background"} data-conversacion>
            <Conversacion />
          </div>

          </div>
        </div>
      </Show>
  );
  return { ColumnasDePrincipal };
}
