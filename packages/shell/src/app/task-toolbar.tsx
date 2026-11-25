import { Show, type Accessor, type JSX, type Setter } from "solid-js";
import { sameSite } from "../../../ui/src/lib/panels";
import { type PanelSite as SitioDePanel } from "../../../ui/src/lib/panels-types.ts";
import { type TaskFiles, type TaskSideMode } from "../../../ui/src/lib/taskFiles.ts";
import { type SessionRow } from "../../../features/projects/src/screens/Sessions.tsx";
import { DelegatedNone, type DelegatedPanelModel, DelegatedToolbar } from "../../../features/projects/src/screens/DelegatedTasks";
import { type SearchSurface, ThreadSearch, type ThreadSearchTarget } from "../../../features/chat/src/screens/ThreadSearch";
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
 * Renders the fixed top-right task toolbar buttons (Search, Subtasks, Files).
 * Provider usage lives in the left sidebar (`SidebarUsageBar`), never inside the task bar.
 */
export function createTaskToolbar(deps: TaskToolbarDeps) {
  const {
    alta, archivosDeTarea, botonDeArchivos, botonDelArbol,
    delegatedPanels, muestra, paginaDeAgente,
    paneles, setSearchSurfaces, settings, threadSearchTargets, workspaceActivo,
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
        onClose={() => { const id = session(); if (id) archivosDeTarea.closePopover(id); }}
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
            {botonDeArchivos(session)}
          </>
        }
      />
    );
  };

  const toolbarForDraft = (site: () => SitioDePanel, visible: () => boolean) => {
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
            <Show when={!paginaDeAgente()}>{botonDelArbol()}</Show>
          </>
        }
      />
    );
  };

  return { toolbarForTask, toolbarForDraft };
}
