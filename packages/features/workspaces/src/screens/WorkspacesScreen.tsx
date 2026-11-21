import { createSignal, Show, type Component } from "solid-js";
import type { EngineClient } from "@danil/engine-client";
import { RailGroups, type RailGroupsProps } from "../components/RailGroups.tsx";
import { CreateWorkspaceDialog } from "../components/CreateWorkspaceDialog.tsx";
import { useOrganizations, useWorkspaces, selectWorkspace, type ClientResolverOptions } from "../queries.ts";
import type { Workspace } from "../model.ts";

export interface WorkspacesScreenProps extends ClientResolverOptions {
  engineClient?: EngineClient | (() => EngineClient | undefined | null);
  activeWorkspaceId?: string | null;
  onSelectWorkspace?: (workspaceId: string) => void | Promise<void>;
}

/**
 * Pantalla principal de workspaces que el shell puede montar.
 * Integra el riel DS1 v2 y la gestión de selección de workspace.
 */
export const WorkspacesScreen: Component<WorkspacesScreenProps> = (props) => {
  const [dialogOpen, setDialogOpen] = createSignal(false);
  const [selectedOrgId, setSelectedOrgId] = createSignal<string | undefined>(undefined);

  const orgsQuery = useOrganizations(props);
  const workspacesQuery = useWorkspaces(props);

  const handleCreated = async (created: Workspace) => {
    workspacesQuery.refetch();
    await selectWorkspace(created.id, {
      client: props.client,
      engineClient: props.engineClient,
      session: props.session,
      sessionSource: props.sessionSource,
    });
    await props.onSelectWorkspace?.(created.id);
  };

  return (
    <div class="flex h-full w-full bg-zinc-950 text-zinc-100">
      {/* Columna lateral del riel */}
      <aside class="w-64 border-r border-zinc-800/80 p-3 flex flex-col gap-3 shrink-0 overflow-y-auto">
        <div class="flex items-center justify-between pb-2 border-b border-zinc-800">
          <span class="text-xs font-bold uppercase tracking-wider text-zinc-400">
            Workspaces
          </span>
          <button
            type="button"
            onClick={() => {
              setSelectedOrgId(undefined);
              setDialogOpen(true);
            }}
            class="px-2 py-1 text-[11px] font-medium rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors"
          >
            + Agregar workspace
          </button>
        </div>

        <RailGroups
          client={props.client}
          engineClient={props.engineClient}
          session={props.session}
          sessionSource={props.sessionSource}
          activeWorkspaceId={props.activeWorkspaceId}
          onSelectWorkspace={props.onSelectWorkspace}
          onAddWorkspace={(orgId) => {
            setSelectedOrgId(orgId);
            setDialogOpen(true);
          }}
        />
      </aside>

      {/* Área principal */}
      <main class="flex-1 p-6 overflow-y-auto flex flex-col gap-4">
        <header class="flex items-center justify-between pb-4 border-b border-zinc-800/80">
          <div>
            <h1 class="text-lg font-bold text-white">Espacios de trabajo</h1>
            <p class="text-xs text-zinc-400 mt-1">
              Selecciona o administra tus entornos de trabajo agrupados por plan.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setDialogOpen(true)}
            class="px-3.5 py-2 rounded-lg bg-white text-zinc-950 text-xs font-semibold hover:bg-zinc-200 transition-colors shadow-sm"
          >
            Agregar workspace
          </button>
        </header>

        <Show when={workspacesQuery.loading()}>
          <div class="text-xs text-zinc-500 py-4">Cargando workspaces...</div>
        </Show>

        <Show when={!workspacesQuery.loading() && (workspacesQuery.workspaces()?.length ?? 0) === 0}>
          <div class="py-12 flex flex-col items-center justify-center gap-3 text-center border border-dashed border-zinc-800 rounded-xl">
            <p class="text-sm text-zinc-400">No se encontraron workspaces activos.</p>
            <button
              type="button"
              onClick={() => setDialogOpen(true)}
              class="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs text-white font-medium transition-colors"
            >
              Agregar workspace
            </button>
          </div>
        </Show>
      </main>

      <CreateWorkspaceDialog
        open={dialogOpen()}
        onClose={() => setDialogOpen(false)}
        organizations={orgsQuery.organizations()}
        defaultOrgId={selectedOrgId()}
        onCreated={handleCreated}
        client={props.client}
        session={props.session}
        sessionSource={props.sessionSource}
      />
    </div>
  );
};
