import { Show, type Accessor, type JSX, type Setter } from "solid-js";
import { sameSite } from "../../../ui/src/lib/panels";
import { type PanelSite as SitioDePanel } from "../../../ui/src/lib/panels-types.ts";
import { type TaskFiles, type TaskSideMode } from "../../../ui/src/lib/taskFiles.ts";
import { type SessionRow } from "../../../features/projects/src/screens/Sessions.tsx";
import { DelegatedNone, type DelegatedPanelModel, DelegatedToolbar } from "../../../features/projects/src/screens/DelegatedTasks";
import { type SearchSurface, ThreadSearch, type ThreadSearchTarget } from "../../../features/chat/src/screens/ThreadSearch";
import UsageTool from "../shell/UsageTool";
import type { createUsage } from "../shell/usage";

export type TaskToolbarDeps = {
  agent: Accessor<string>;
  alta: Accessor<boolean>;
  archivosDeTarea: TaskFiles;
  botonDeArchivos: (sesion: () => string) => JSX.Element;
  botonDelArbol: () => JSX.Element;
  carpetaDelProyecto: () => string | null;
  consumo: ReturnType<typeof createUsage>;
  delegatedPanels: Accessor<Map<string, () => DelegatedPanelModel>>;
  filaDe: (id: string) => SessionRow | undefined;
  llaveDeBorrador: (proyecto: string | undefined) => string;
  model: Accessor<string | null>;
  muestra: (id: string, mode: TaskSideMode) => boolean;
  paginaDeAgente: () => boolean;
  paneles: { activeSite: Accessor<SitioDePanel> };
  project: Accessor<string>;
  setSearchSurfaces: Setter<Map<string, SearchSurface>>;
  settings: Accessor<string | null>;
  threadSearchTargets: Accessor<Map<string, ThreadSearchTarget>>;
  workspaceActivo: Accessor<string | null>;
};

/**
 * Renders the task toolbar buttons inside `[data-task-bar]` (38 px top bar), aligned horizontally
 * with `TaskLocation` (`machine / project / branch`) so they never float over right-side split panels.
 */
export function createTaskToolbar(deps: TaskToolbarDeps) {
  const {
    agent, alta, archivosDeTarea, botonDeArchivos, botonDelArbol, carpetaDelProyecto,
    consumo, delegatedPanels, filaDe, llaveDeBorrador, model, muestra, paginaDeAgente,
    paneles, project, setSearchSurfaces, settings, threadSearchTargets, workspaceActivo,
  } = deps;

  const setSurface = (id: string, surface: SearchSurface | null) => {
    setSearchSurfaces((previous) => {
      if (surface) return new Map(previous).set(id, surface);
      if (!previous.has(id)) return previous;
      const next = new Map(previous);
      next.delete(id);
      return next;
    });
  };

  const toolbarForTask = (session: () => string, site: () => SitioDePanel | null, visible: () => boolean) => {
    const target = () => threadSearchTargets().get(session());
    const agenteDeLaVentana = () => sameSite(site(), paneles.activeSite())
      ? agent()
      : (filaDe(session())?.agent ?? agent());
    const modeloDeLaVentana = () => sameSite(site(), paneles.activeSite())
      ? model()
      : (filaDe(session())?.model ?? model());
    return (
      <ThreadSearch
        conversation={session()}
        active={visible() && sameSite(site(), paneles.activeSite()) && settings() === null && !alta()}
        disabled={!session()}
        open={muestra(session(), "search")}
        messages={target()?.messages() ?? []}
        thread={() => target()?.thread()}
        onJump={(block) => target()?.jump(block)}
        onMove={(delta) => target()?.move(delta)}
        onToggle={() => { const id = session(); if (id) archivosDeTarea.present(id, "search"); }}
        onShow={() => { const id = session(); if (id && !muestra(id, "search")) archivosDeTarea.present(id, "search"); }}
        onClose={() => { const id = session(); if (id) archivosDeTarea.setOpen(id, false); }}
        onSurface={setSurface}
        tools={
          <>
            <Show when={delegatedPanels().get(`${workspaceActivo()}/${session()}`)} fallback={<DelegatedNone />}>
              {(read) => (
                <DelegatedToolbar
                  model={read()()}
                  pressed={muestra(session(), "delegated")}
                  onClick={() => { const id = session(); if (id) archivosDeTarea.present(id, "delegated"); }}
                />
              )}
            </Show>
            <UsageTool
              usage={consumo}
              agent={agenteDeLaVentana()}
              model={modeloDeLaVentana()}
              pressed={muestra(session(), "usage")}
              onToggle={() => { const id = session(); if (id) archivosDeTarea.present(id, "usage"); }}
            />
            {botonDeArchivos(session)}
          </>
        }
      />
    );
  };

  const toolbarForDraft = (site: () => SitioDePanel, visible: () => boolean) => {
    const idDePanel = () => (carpetaDelProyecto() ? llaveDeBorrador(project()) : "");
    return (
      <ThreadSearch
        conversation=""
        active={visible() && sameSite(site(), paneles.activeSite()) && settings() === null && !alta()}
        disabled
        open={false}
        messages={[]}
        thread={() => undefined}
        onJump={() => {}}
        onMove={() => {}}
        onToggle={() => {}}
        onShow={() => {}}
        onClose={() => {}}
        onSurface={setSurface}
        tools={
          <>
            <DelegatedNone />
            <UsageTool
              usage={consumo}
              agent={agent()}
              model={model()}
              pressed={muestra(idDePanel(), "usage")}
              onToggle={() => { const id = idDePanel(); if (id) archivosDeTarea.present(id, "usage"); }}
            />
            <Show when={!paginaDeAgente()}>{botonDelArbol()}</Show>
          </>
        }
      />
    );
  };

  return { toolbarForTask, toolbarForDraft };
}
