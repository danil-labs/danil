import {
  createSignal,
  createMemo,
  Show,
  type Component,
  type Accessor,
} from "solid-js";
import type { EngineClient } from "@danil/engine-client";
import {
  useOrganizations,
  useWorkspaces,
  useSelectWorkspace,
} from "../queries.ts";
import { useSession } from "@danil/session/solid";
import { webLoginUrl } from "@danil/session";
import { host } from "@danil/host";
import { AddWorkspaceMenu } from "../components/AddWorkspaceMenu.tsx";
import { WorkspaceErrorView } from "../components/WorkspaceErrorView.tsx";
import { WorkspaceEmptyView } from "../components/WorkspaceEmptyView.tsx";
import { OrganizationRailLayout } from "../components/OrganizationRailLayout.tsx";
import { OrganizationRailGroup } from "../components/OrganizationRailGroup.tsx";
import {
  changeOrgPreference,
  type OrgPreference,
  type SessionRailGroup,
} from "../components/organization-rail-model.ts";

export interface RailGroupsProps {
  engineClient?: EngineClient | (() => EngineClient | undefined | null);
  activeWorkspaceId?: Accessor<string | null | undefined> | string | null;
  onSelectWorkspace?: (workspaceId: string) => void | Promise<void>;
  onAddWorkspace?: (orgId?: string) => void;
  class?: string;
}

/**
 * RailGroups: pinta el riel DS1 v2 agrupado por organización.
 * Utiliza OrganizationRailLayout, OrganizationRailGroup, OrganizationStack y OrganizationWorkspaceTile.
 * El «+» solo ofrece «Agregar workspace» abriendo el selector externo (RV1 #8, RV2 #20).
 */
export const RailGroups: Component<RailGroupsProps> = (props) => {
  const session = useSession();
  const orgsQuery = useOrganizations();
  const workspacesQuery = useWorkspaces();
  const selectWorkspace = useSelectWorkspace();

  const [selectionError, setSelectionError] = createSignal<string | null>(null);
  const [preference, setPreference] = createSignal<OrgPreference>({
    version: 1,
    orgs: [],
  });

  const activeId = () => {
    if (typeof props.activeWorkspaceId === "function") {
      return props.activeWorkspaceId();
    }
    return props.activeWorkspaceId ?? null;
  };

  const handleSelectWorkspace = async (workspaceId: string) => {
    setSelectionError(null);
    try {
      await selectWorkspace(workspaceId, {
        engineClient: props.engineClient,
      });
      await props.onSelectWorkspace?.(workspaceId);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error al seleccionar workspace";
      setSelectionError(msg);
    }
  };

  const handleAddAccountOrOrg = () => {
    if (props.onAddWorkspace) {
      props.onAddWorkspace();
    } else if (host.kind === "desk") {
      session.add();
    } else {
      void host.openExternal(webLoginUrl());
    }
  };

  // Agrupación de workspaces por id de organización
  const workspacesByOrg = createMemo(() => {
    const list = workspacesQuery.workspaces() || [];
    const map = new Map<string, typeof list>();
    for (const ws of list) {
      if (!ws.org) continue;
      const existing = map.get(ws.org) || [];
      existing.push(ws);
      map.set(ws.org, existing);
    }
    return map;
  });

  const sessionGroups = createMemo<SessionRailGroup[]>(() => {
    const orgs = orgsQuery.organizations() || [];
    if (orgs.length === 0) {
      return [];
    }
    return orgs.map((org) => {
      const orgWorkspaces = workspacesByOrg().get(org.id) || [];
      return {
        context_id: org.id,
        org: org.id,
        org_name: org.planLabel || "Personal",
        plan: org.plan || org.type,
        role: org.role,
        available: orgWorkspaces.map((w) => ({
          id: w.id,
          name: w.name || `Workspace ${w.id}`,
          logo: w.logo ?? null,
        })),
      };
    });
  });

  const workspaceRows = createMemo(() => {
    const wsList = workspacesQuery.workspaces() || [];
    return wsList.map((w) => ({
      id: w.id,
      name: w.name || `Workspace ${w.id}`,
      logo: w.logo ?? null,
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
              onAddWorkspace={() => handleAddAccountOrOrg()}
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

          {/* Botón «+» con AddWorkspaceMenu (RV2b «+», RV1b N13) */}
          <AddWorkspaceMenu onAddAccountOrOrg={handleAddAccountOrOrg} />
        </Show>
      </Show>
    </div>
  );
};
