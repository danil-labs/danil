import { type createPanelDeChatState as T_createPanelDeChatState } from "./panel-de-chat-state.ts";
import { carpetaDeTrabajo, type HandlerDefinition } from "../../../ui/src/lib/model";
import { type CatalogosDeModelos } from "../../../ui/src/lib/models.ts";
import { type Superficie } from "../../../ui/src/lib/surfaces.ts";
import { type TaskFiles } from "../../../ui/src/lib/taskFiles.ts";
import { cn } from "../../../ui/src/lib/utils";
import { capabilities } from "../../../host/src/platform";
import { LOCATION_BAR } from "../../../host/src/window";
import type { default as TaskLocationScreen } from "../../../features/chat/src/screens/TaskLocation";
import { LazyPart } from "../../../ui/src/LazyPart";
import { workLabel } from "../../../ui/src/lib/workLabel.ts";
import { type createDeskStrip, type createDeskStrip as T_createDeskStrip, type createWorkspaceSession } from "../../../features/projects/src";
import { type default as AgentProfileScreen } from "../../../features/projects/src/screens/AgentProfile";
import { type machines } from "../../../features/machines/src/queries/store";
import { type SessionRow } from "../../../ui/src/lib/session-row.ts";
import { Show, Suspense, batch, type Accessor, type Component, type ComponentProps, type JSX, type lazy } from "solid-js";


/** Lo que el bloque usaba del cuerpo de App. */
export type PanelDeChatPartsDeps = { AgentProfile: Component<ComponentProps<typeof AgentProfileScreen>>; TaskLocation: ReturnType<typeof lazy<typeof TaskLocationScreen>>; createFreeRouterConsent: ComponentProps<typeof AgentProfileScreen>["createFreeRouterConsent"]; folderIcon: ComponentProps<typeof TaskLocationScreen>["folderIcon"]; abrirPantalla: (machine: string) => void; abrirSesion: (proyecto: string, id: string, activar?: string, propagateError?: boolean) => Promise<void>; agent: Accessor<string>; apagadas: ReturnType<typeof createDeskStrip>["apagadas"]; archivosDeTarea: TaskFiles; busy: () => boolean; catalogos: Accessor<CatalogosDeModelos>; composer: ReturnType<typeof T_createDeskStrip>["composer"]; draftMachine: () => string | null; effort: Accessor<string>; estadoDePanelDeChat: ReturnType<typeof T_createPanelDeChatState>["estadoDePanelDeChat"]; filaDe: (id: string) => SessionRow | undefined; machineName: (id: string, local?: boolean) => string; machineWakes: (id: string) => boolean; machines: typeof machines; paginaDeAgente: () => boolean; rememberedRunOn: (workspace: string | null) => string | null; saveDraftConfiguration: (mode?: string, clave?: string) => void; sessionId: ReturnType<typeof createWorkspaceSession>["sessionId"]; superficies: Accessor<Superficie[] | null>; workspaceActivo: ReturnType<typeof createWorkspaceSession>["workspaceActivo"] };

/** Movido tal cual de packages/shell/src/app/App.tsx (líneas 180–243, tarea 2.5). Lo que usaba del cuerpo de App llega por `deps`. */
export function createPanelDeChatParts(deps: PanelDeChatPartsDeps) {
  const { AgentProfile, TaskLocation, createFreeRouterConsent, folderIcon, abrirPantalla, abrirSesion, agent, apagadas, archivosDeTarea, busy, catalogos, composer, draftMachine, effort, estadoDePanelDeChat, filaDe, machineName, machineWakes, machines, paginaDeAgente, rememberedRunOn, saveDraftConfiguration, sessionId, superficies, workspaceActivo } = deps;
  const ubicacionDePanelDeChat = (pp: {
    sesion: string | null;
    /** El proyecto de esa tarea. `null` en la ventana en blanco, que no tiene. */
    proyecto?: string | null;
    soloLectura?: boolean;
    inline?: boolean;
    toolbar?: () => JSX.Element;
  }, { proyectoDeLaCelda, estadoDelTrabajo }: ReturnType<typeof estadoDePanelDeChat>) => {
    // Una sola barra superior de 38 px (`LOCATION_BAR`) con ubicación a la izquierda y herramientas
    // a la derecha: queda alineada al píxel con la cabecera del panel derecho en el split.
    const barraDeLaTarea = (contenido: JSX.Element) => (
      <div data-task-bar="" class={cn("flex min-w-0 shrink-0 items-center justify-between gap-2 border-b border-border/60 pr-2.5", LOCATION_BAR)}>
        <div class="flex h-full min-w-0 flex-1 items-center overflow-hidden">{contenido}</div>
        <Show when={pp.toolbar}>
          <div class="flex shrink-0 items-center">{pp.toolbar?.()}</div>
        </Show>
      </div>
    );
    const ubicacion = () => <Show when={pp.sesion} fallback={<Show when={!paginaDeAgente()}>{barraDeLaTarea(<Suspense fallback={null}><TaskLocation
      /* La tarea nueva: la máquina y la carpeta donde va a correr. La rama sale al empezarla. */
      machine={(draftMachine() ?? (capabilities().nativeWindow ? null : rememberedRunOn(workspaceActivo()))) ?? undefined} machineName={machineName} machineWakes={machineWakes} folderIcon={folderIcon}
      on={((m) => m?.on !== false && (capabilities().nativeWindow || (!!m && m.hosts !== false)))(machines().find(m => m.id === (draftMachine() ?? rememberedRunOn(workspaceActivo()))))}
      onScreen={abrirPantalla}
      project={proyectoDeLaCelda()}
      path={carpetaDeTrabajo(proyectoDeLaCelda() ?? {}) || undefined} /></Suspense>)}</Show>}>{(id) => {
      return barraDeLaTarea(<Suspense fallback={null}><TaskLocation
        machine={filaDe(id())?.machine} machineName={machineName} machineWakes={machineWakes} folderIcon={folderIcon}
        on={!apagadas()[id()] && filaDe(id())?.machine_on !== false && (capabilities().nativeWindow || machines().find(m => m.id === filaDe(id())?.machine)?.hosts !== false)}
        onScreen={abrirPantalla}
        onFiles={() => {
          const folder = proyectoDeLaCelda()?.id ?? pp.proyecto ?? "";
          void abrirSesion(folder, id()).then(() => archivosDeTarea.setOpen(id(), true));
        }}
        project={proyectoDeLaCelda()}
        path={estadoDelTrabajo()?.path || undefined}
        branch={workLabel(estadoDelTrabajo()?.branch, estadoDelTrabajo()?.alias) || undefined} /></Suspense>);
    }}</Show>;
    return ubicacion;
  };
  const perfilDePanelDeChat = (pp: {
    sesion: string | null;
    /** El proyecto de esa tarea. `null` en la ventana en blanco, que no tiene. */
    proyecto?: string | null;
    soloLectura?: boolean;
  }, { proyectoDeLaCelda, estadoDelEncargado, cellProfile, chatBackground, setViewingProfile, handlerPolicy }: ReturnType<typeof estadoDePanelDeChat>) => (e: Accessor<HandlerDefinition>) => (
        <LazyPart><AgentProfile
          project={proyectoDeLaCelda()?.id ?? ""} createFreeRouterConsent={createFreeRouterConsent}
          agent={e()}
          profile={cellProfile()}
          handlerPolicy={handlerPolicy()}
          status={estadoDelEncargado()}
          background={chatBackground() ?? null}
          superficies={superficies() ?? []}
          catalogos={catalogos()}
          currentAgent={filaDe(pp.sesion ?? "")?.provider ?? null}
          onModelChosen={(elegidoAgent, elegidoModel) => {
            // Solo si es la conversación que tiene el mando: las demás
            // celdas no tienen composer propio con quien aplicarlo, y
            // pisarían el agente/modelo de la que sí lo tiene.
            if (pp.sesion !== sessionId() || busy()) return;
            batch(() => {
              composer.resumeTask({ provider: elegidoAgent || agent(), model: elegidoModel ?? "", effort: effort() });
              saveDraftConfiguration();
            });
          }}
          onDeleted={() => setViewingProfile(false)}
          onClose={() => setViewingProfile(false)}
        /></LazyPart>
  );
  return { perfilDePanelDeChat, ubicacionDePanelDeChat };
}
