import {
  createSignal,
  createMemo,
  Show,
  type Component,
  type Accessor,
} from "solid-js";
import type { EngineClient } from "@danil/engine-client";
import type { Workspace } from "../model.ts";
import {
  useOrganizations,
  useWorkspaces,
  useSelectWorkspace,
  getActiveWorkspaceId,
  type ClientResolverOptions,
} from "../queries.ts";
import { WorkspaceErrorView } from "./WorkspaceErrorView.tsx";
import { WorkspaceEmptyView } from "./WorkspaceEmptyView.tsx";
import { CreateWorkspaceDialog } from "./CreateWorkspaceDialog.tsx";
import { OrganizationRailLayout } from "./OrganizationRailLayout.tsx";
import { OrganizationRailGroup } from "./OrganizationRailGroup.tsx";
import {
  changeOrgPreference,
  type OrgPreference,
  type SessionRailGroup,
} from "./organization-rail-model.ts";

export interface RailGroupsProps extends ClientResolverOptions {
  engineClient?: EngineClient | (() => EngineClient | undefined | null);
  activeWorkspaceId?: Accessor<string | null> | string | null;
  onSelectWorkspace?: (workspaceId: string) => void | Promise<void>;
  onAddWorkspace?: (orgId?: string) => void;
  class?: string;
}

/**
 * RailGroups: pinta el riel DS1 v2 agrupado por organización.
 * Utiliza OrganizationRailLayout, OrganizationRailGroup, OrganizationStack y OrganizationWorkspaceTile.
 */
export const RailGroups: Component<RailGroupsProps> = (props) => {
  const orgsQuery = useOrganizations(props);
  const workspacesQuery = useWorkspaces(props);
  const selectWorkspace = useSelectWorkspace();

  const [dialogOpen, setDialogOpen] = createSignal(false);
  const [targetOrgId, setTargetOrgId] = createSignal<string | undefined>(undefined);
  const [selectionError, setSelectionError] = createSignal<string | null>(null);
  const [preference, setPreference] = createSignal<OrgPreference>({
    version: 1,
    orgs: [],
  });

  const activeId = () => {
    if (typeof props.activeWorkspaceId === "function") {
      return props.activeWorkspaceId();
    }
    if (typeof props.activeWorkspaceId === "string") {
      return props.activeWorkspaceId;
    }
    return getActiveWorkspaceId();
  };

  const handleSelectWorkspace = async (workspaceId: string) => {
    setSelectionError(null);
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

  const sessionGroups = createMemo<SessionRailGroup[]>(() => {
    const orgs = orgsQuery.organizations() || [];
    const wsList = workspacesQuery.workspaces() || [];
    if (orgs.length === 0) {
      if (wsList.length === 0) return [];
      return [
        {
          context_id: "default",
          org: "default",
          org_name: "Personal",
          available: wsList.map((w) => ({
            id: w.id,
            name: w.name || `Workspace ${w.id}`,
            logo: (w as any).logo ?? null,
          })),
        },
      ];
    }
    return orgs.map((org) => {
      const orgWorkspaces =
        workspacesByOrg().get(org.id) ||
        (orgs.length === 1 ? wsList : []);
      return {
        context_id: org.id,
        org: org.id,
        org_name: org.planLabel || org.name || "Personal",
        plan: org.plan || org.type,
        role: org.role,
        available: orgWorkspaces.map((w) => ({
          id: w.id,
          name: w.name || `Workspace ${w.id}`,
          logo: (w as any).logo ?? null,
        })),
      };
    });
  });

  const workspaceRows = createMemo(() => {
    const wsList = workspacesQuery.workspaces() || [];
    return wsList.map((w) => ({
      id: w.id,
      name: w.name || `Workspace ${w.id}`,
      logo: (w as any).logo ?? null,
    }));
  });

  const activeSelection = createMemo(() => {
    const id = activeId();
    if (!id) return null;
    const ws = (workspacesQuery.workspaces() || []).find((w) => w.id === id);
    const contextId = ws?.org || "default";
    return { workspace: id, context: contextId };
  });

  const handleOrgChange = (orgId: string, action: "pin" | "up" | "down") => {
    const orgIds = sessionGroups().map((g) => g.org);
    setPreference((prev) => changeOrgPreference(prev, orgIds, orgId, action));
  };

  return (
    <div class={`flex flex-col items-center gap-2 w-full select-none ${props.class || ""}`}>
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
        <div class="flex flex-col gap-2 p-2 w-full items-center">
          <div class="h-8 w-8 rounded-md bg-zinc-800/60 animate-pulse" />
          <div class="h-8 w-8 rounded-md bg-zinc-800/60 animate-pulse" />
        </div>
      </Show>

      {/* Riel con Layout y Grupos */}
      <Show when={!orgsQuery.error() && orgsQuery.organizations()}>
        <Show
          when={sessionGroups().length > 0}
          fallback={
            <WorkspaceEmptyView
              onAddWorkspace={() => openCreateDialog()}
            />
          }
        >
          <OrganizationRailLayout
            groups={sessionGroups()}
            rows={workspaceRows()}
            preference={preference()}
            used={{}}
            active={activeSelection()}
            render={(org, stacked) => (
              <OrganizationRailGroup
                org={org()}
                stacked={stacked()}
                active={activeSelection()}
                onOpen={(tile) => handleSelectWorkspace(tile.id)}
                onChange={(action) => handleOrgChange(org().id, action)}
                index={sessionGroups().findIndex((g) => g.org === org().id)}
                count={sessionGroups().length}
              />
            )}
          />

          {/* Botón «+» → «Agregar workspace» al pie del riel */}
          <button
            type="button"
            data-add-workspace=""
            class="grid size-8 shrink-0 place-items-center rounded-md text-neutral-500 hover:bg-neutral-200 hover:text-neutral-950 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-primary transition-colors"
            aria-label="Agregar workspace"
            onClick={() => openCreateDialog()}
          >
            <span class="text-base font-semibold leading-none">+</span>
          </button>
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
