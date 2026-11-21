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
    <div class={`flex flex-col gap-1 w-full select-none ${props.class || ""}`}>
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
        <div class="flex flex-col items-center gap-2 p-1">
          <div class="size-8 rounded-md bg-surface-muted animate-pulse" />
          <div class="size-8 rounded-md bg-surface-muted animate-pulse" />
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
          <div class="flex flex-col items-center gap-2 w-full">
            <For each={orgsQuery.organizations()}>
              {(org: Organization) => {
                const orgWorkspaces = () =>
                  workspacesByOrg().get(org.id) ||
                  workspacesByOrg().get("default") ||
                  [];
                const expanded = () => isOrgExpanded(org.id);

                return (
                  <div role="group" data-rail-organization={org.id} class="flex w-full flex-col items-center gap-1">
                    {/* Cabecera del stack con logo y nombre del plan (B-008) */}
                    <button
                      type="button"
                      onClick={() => toggleOrg(org.id)}
                      title={`Plan ${org.planLabel}`}
                      aria-label={`Plan ${org.planLabel}`}
                      class="group relative grid size-10 w-full shrink-0 place-items-center outline-none select-none"
                    >
                      <span
                        aria-hidden="true"
                        class="danil-mark relative grid size-8 place-items-center rounded-md border border-border bg-surface text-label font-semibold text-neutral-700 hover:bg-neutral-200 hover:text-neutral-950 group-focus-visible:outline-solid group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-primary transition-colors"
                      >
                        {org.planLabel.charAt(0).toUpperCase()}
                      </span>
                    </button>

                    {/* Contenido desplegable hacia abajo */}
                    <Show when={expanded()}>
                      <div class="flex w-full flex-col items-center gap-1">
                        <Show
                          when={orgWorkspaces().length > 0}
                          fallback={
                            <div class="py-1 text-center text-caption text-neutral-500">
                              Vacío
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
                          title="Agregar workspace"
                          aria-label="Agregar workspace"
                          class="grid size-8 shrink-0 place-items-center rounded-md border border-dashed border-border text-neutral-500 outline-none hover:border-border-strong hover:bg-neutral-200 hover:text-neutral-950 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary transition-colors text-sm"
                        >
                          +
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
        defaultOrgId={targetOrgId()}
        organizations={orgsQuery.organizations() || []}
        onClose={() => setDialogOpen(false)}
        onCreated={handleCreated}
      />
    </div>
  );
};
