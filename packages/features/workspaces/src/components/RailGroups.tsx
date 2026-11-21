import {
  createSignal,
  createMemo,
  For,
  Show,
  type Component,
  type Accessor,
} from "solid-js";
import type { EngineClient } from "@danil/engine-client";
import type { Workspace, Organization } from "../model.ts";
import {
  useOrganizations,
  useWorkspaces,
  selectWorkspace,
  getActiveWorkspaceId,
  type ClientResolverOptions,
} from "../queries.ts";
import { WorkspaceItem } from "./WorkspaceItem.tsx";
import { WorkspaceErrorView } from "./WorkspaceErrorView.tsx";
import { WorkspaceEmptyView } from "./WorkspaceEmptyView.tsx";
import { CreateWorkspaceDialog } from "./CreateWorkspaceDialog.tsx";

export interface RailGroupsProps extends ClientResolverOptions {
  engineClient?: EngineClient | (() => EngineClient | undefined | null);
  activeWorkspaceId?: Accessor<string | null> | string | null;
  onSelectWorkspace?: (workspaceId: string) => void | Promise<void>;
  onAddWorkspace?: (orgId?: string) => void;
  class?: string;
}

/**
 * RailGroups: pinta el riel DS1 v2 agrupado por organización.
 * - Estructura: stack con logo que se despliega hacia abajo.
 * - Textos con nombre del plan («Personal», «Team», «Enterprise»), nunca la palabra «Organización» (B-008).
 * - Manejo de error con reintento (B-006) y estado vacío.
 * - Selección atómica de workspace (B-007).
 * - Botón «+» → «Agregar workspace».
 */
export const RailGroups: Component<RailGroupsProps> = (props) => {
  const orgsQuery = useOrganizations(props);
  const workspacesQuery = useWorkspaces(props);

  const [expandedOrgs, setExpandedOrgs] = createSignal<Record<string, boolean>>({});
  const [dialogOpen, setDialogOpen] = createSignal(false);
  const [targetOrgId, setTargetOrgId] = createSignal<string | undefined>(undefined);
  const [selectionError, setSelectionError] = createSignal<string | null>(null);
  const [selectingId, setSelectingId] = createSignal<string | null>(null);

  const activeId = () => {
    if (typeof props.activeWorkspaceId === "function") {
      return props.activeWorkspaceId();
    }
    if (typeof props.activeWorkspaceId === "string") {
      return props.activeWorkspaceId;
    }
    return getActiveWorkspaceId();
  };

  const isOrgExpanded = (orgId: string): boolean => {
    const map = expandedOrgs();
    if (map[orgId] !== undefined) {
      return map[orgId];
    }
    return true; // Expandido por defecto
  };

  const toggleOrg = (orgId: string) => {
    setExpandedOrgs((prev) => ({
      ...prev,
      [orgId]: !isOrgExpanded(orgId),
    }));
  };

  const handleSelectWorkspace = async (workspaceId: string) => {
    setSelectionError(null);
    setSelectingId(workspaceId);
    try {
      await selectWorkspace(workspaceId, {
        client: props.client,
        engineClient: props.engineClient,
        session: props.session,
        sessionSource: props.sessionSource,
      });
      await props.onSelectWorkspace?.(workspaceId);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error al seleccionar workspace";
      setSelectionError(msg);
    } finally {
      setSelectingId(null);
    }
  };

  const openCreateDialog = (orgId?: string) => {
    setTargetOrgId(orgId);
    if (props.onAddWorkspace) {
      props.onAddWorkspace(orgId);
    } else {
      setDialogOpen(true);
    }
  };

  const handleCreated = (created: Workspace) => {
    workspacesQuery.refetch();
    handleSelectWorkspace(created.id);
  };

  // Agrupación de workspaces por id de organización
  const workspacesByOrg = createMemo(() => {
    const list = workspacesQuery.workspaces() || [];
    const map = new Map<string, Workspace[]>();
    for (const ws of list) {
      const orgKey = ws.org || "default";
      const existing = map.get(orgKey) || [];
      existing.push(ws);
      map.set(orgKey, existing);
    }
    return map;
  });

  return (
    <div class={`flex flex-col gap-2 w-full select-none ${props.class || ""}`}>
      {/* Error de selección atómica */}
      <Show when={selectionError()}>
        <WorkspaceErrorView
          message={selectionError()!}
          onRetry={() => setSelectionError(null)}
        />
      </Show>

      {/* Error de carga en organizaciones (B-006) */}
      <Show when={orgsQuery.error()}>
        <WorkspaceErrorView
          message="No se pudieron cargar los planes disponibles."
          onRetry={() => {
            orgsQuery.refetch();
            workspacesQuery.refetch();
          }}
        />
      </Show>

      {/* Error de carga en workspaces (B-006) */}
      <Show when={workspacesQuery.error() && !orgsQuery.error()}>
        <WorkspaceErrorView
          message="No se pudieron sincronizar los workspaces."
          onRetry={() => workspacesQuery.refetch()}
        />
      </Show>

      {/* Estado cargando inicial */}
      <Show when={orgsQuery.loading() && !orgsQuery.organizations()}>
        <div class="flex flex-col gap-2 p-2">
          <div class="h-8 rounded bg-zinc-800/60 animate-pulse" />
          <div class="h-8 rounded bg-zinc-800/60 animate-pulse" />
        </div>
      </Show>

      {/* Lista de grupos de organizaciones */}
      <Show when={!orgsQuery.error() && orgsQuery.organizations()}>
        <Show
          when={(orgsQuery.organizations()?.length ?? 0) > 0}
          fallback={
            <WorkspaceEmptyView
              onAddWorkspace={() => openCreateDialog()}
            />
          }
        >
          <div class="flex flex-col gap-3">
            <For each={orgsQuery.organizations()}>
              {(org: Organization) => {
                const orgWorkspaces = () =>
                  workspacesByOrg().get(org.id) ||
                  workspacesByOrg().get("default") ||
                  [];
                const expanded = () => isOrgExpanded(org.id);

                return (
                  <div class="flex flex-col rounded-lg bg-zinc-900/60 border border-zinc-800/80 overflow-hidden">
                    {/* Cabecera del stack con logo y nombre del plan (B-008) */}
                    <button
                      type="button"
                      onClick={() => toggleOrg(org.id)}
                      class="flex items-center justify-between w-full px-2.5 py-2 hover:bg-zinc-800/50 transition-colors text-left"
                    >
                      <div class="flex items-center gap-2 min-w-0">
                        {/* Logo o avatar del plan */}
                        <div class="w-6 h-6 rounded-md bg-zinc-800 border border-zinc-700/80 flex items-center justify-center text-xs font-bold text-white shrink-0">
                          {org.planLabel.charAt(0).toUpperCase()}
                        </div>
                        {/* Nombre del plan (nunca «Organización») */}
                        <span class="text-xs font-semibold text-zinc-200 truncate">
                          {org.planLabel}
                        </span>
                      </div>
                      {/* Indicador de desplegable hacia abajo */}
                      <svg
                        class={`w-3.5 h-3.5 text-zinc-400 transition-transform duration-200 ${
                          expanded() ? "rotate-180" : ""
                        }`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>

                    {/* Contenido desplegable hacia abajo */}
                    <Show when={expanded()}>
                      <div class="flex flex-col gap-1 p-2 border-t border-zinc-800/60 bg-zinc-950/40">
                        <Show
                          when={orgWorkspaces().length > 0}
                          fallback={
                            <div class="py-2 text-center text-[11px] text-zinc-500">
                              Sin workspaces
                            </div>
                          }
                        >
                          <For each={orgWorkspaces()}>
                            {(ws) => (
                              <WorkspaceItem
                                workspace={ws}
                                isActive={activeId() === ws.id}
                                disabled={selectingId() === ws.id}
                                onSelect={() => handleSelectWorkspace(ws.id)}
                              />
                            )}
                          </For>
                        </Show>

                        {/* Botón «+» → «Agregar workspace» */}
                        <button
                          type="button"
                          onClick={() => openCreateDialog(org.id)}
                          class="flex items-center gap-1.5 px-2.5 py-1.5 mt-1 rounded text-[11px] font-medium text-zinc-400 hover:text-white hover:bg-zinc-800/60 transition-colors"
                        >
                          <span class="text-sm leading-none">+</span>
                          <span>Agregar workspace</span>
                        </button>
                      </div>
                    </Show>
                  </div>
                );
              }}
            </For>
          </div>
        </Show>
      </Show>

      {/* Modal para crear workspace */}
      <CreateWorkspaceDialog
        open={dialogOpen()}
        onClose={() => setDialogOpen(false)}
        organizations={orgsQuery.organizations()}
        defaultOrgId={targetOrgId()}
        onCreated={handleCreated}
        client={props.client}
        session={props.session}
        sessionSource={props.sessionSource}
      />
    </div>
  );
};
