import {
  type Accessor,
  type Resource,
} from "solid-js";
import {
  usePlatform,
  idempotencyKey,
  planLabel,
  createQuery,
  invalidate,
} from "@danil/platform-client";
import { useSession } from "@danil/session/solid";
import { webLoginUrl } from "@danil/session";
import { host } from "@danil/host";
import type { EngineClient } from "@danil/engine-client";
import type { Workspace, Organization, WorkspaceGroup } from "./model.ts";

/**
 * Agrupa workspaces por organización asegurando pertenencia estricta (11 §2, Regla 2.1, 2.8).
 * Sin filtrados ambiguos ni workspaces huérfanos sin organización (RV1 #32, RV2 #22).
 */
export function groupWorkspacesByOrg(
  workspaces: Workspace[],
  organizations: Organization[],
): WorkspaceGroup[] {
  const orgMap = new Map<string, Workspace[]>();
  for (const org of organizations) {
    orgMap.set(org.id, []);
  }
  for (const ws of workspaces) {
    const key = ws.org;
    if (key && orgMap.has(key)) {
      orgMap.get(key)!.push(ws);
    }
  }
  return organizations.map((org) => ({
    organization: org,
    workspaces: orgMap.get(org.id) ?? [],
  }));
}

export interface UseOrganizationsResult {
  organizations: Resource<Organization[]>;
  loading: Accessor<boolean>;
  error: Accessor<unknown>;
  refetch: (info?: unknown) => void;
}

/**
 * Consulta las organizaciones del usuario por sesión con createQuery (RV1 #17).
 * Captura usePlatform() en el cuerpo del hook (RV1 #2, RV2 #2) y usa planLabel común (RV1 #26).
 * Un error se preserva en error() para permitir reintentos (B-006).
 */
export function useOrganizations(): UseOrganizationsResult {
  const client = usePlatform();
  const session = useSession();
  const sessionKey = () => session.active() ?? session.sessions()[0]?.key ?? "default";

  const { data, refetch } = createQuery(
    () => `organizations:${sessionKey()}`,
    async (signal) => {
      const res = await client.getOrganizations({ signal });
      const items = res.items ?? [];
      const orgs = items.map((org) => ({
        ...org,
        planLabel: planLabel(org),
      }));
      // Orden determinista DS1 v2: Personal primero, luego alfabéticamente por plan
      return orgs.sort((a, b) => {
        const aIsPersonal = a.planLabel === "Personal" || a.type === "personal";
        const bIsPersonal = b.planLabel === "Personal" || b.type === "personal";
        if (aIsPersonal && !bIsPersonal) return -1;
        if (!aIsPersonal && bIsPersonal) return 1;
        return a.planLabel.localeCompare(b.planLabel);
      });
    },
  );

  return {
    organizations: data as Resource<Organization[]>,
    loading: () => data.loading,
    error: () => data.error,
    refetch: (_info?: unknown) => {
      void refetch();
    },
  };
}

export interface UseWorkspacesResult {
  workspaces: Resource<Workspace[]>;
  loading: Accessor<boolean>;
  error: Accessor<unknown>;
  refetch: (info?: unknown) => void;
  mutate: (workspaces: Workspace[]) => void;
}

/**
 * Consulta los workspaces del usuario por sesión con createQuery (RV1 #17).
 * Captura usePlatform() en el cuerpo del hook (RV1 #2, RV2 #2).
 * Sin filtro local por org ni workspaces sin organización (RV1 #32, RV2 #22).
 */
export function useWorkspaces(): UseWorkspacesResult {
  const client = usePlatform();
  const session = useSession();
  const sessionKey = () => session.active() ?? session.sessions()[0]?.key ?? "default";

  const { data, refetch, mutate } = createQuery(
    () => `workspaces:${sessionKey()}`,
    async (signal) => {
      const res = await client.getWorkspaces({ signal });
      const list = res.items ?? [];
      // 11 §2: No existen workspaces sin organización
      return list.filter((w) => !!w.org);
    },
  );

  return {
    workspaces: data as Resource<Workspace[]>,
    loading: () => data.loading,
    error: () => data.error,
    refetch: (_info?: unknown) => {
      void refetch();
    },
    mutate: (workspaces: Workspace[]) => mutate(workspaces),
  };
}

export interface SelectWorkspaceOptions {}

/**
 * Hook para seleccionar un workspace (RV1 #2, RV2 #2, RV1 #16, RV2 #21).
 * 1. Primero la plataforma vía cliente del borde (B-007).
 * 2. Si tiene éxito y hay motor, invoca set_active_workspace en el motor.
 * La ruta del router es la única dueña del workspace activo (sin señales globales).
 */
export function useSelectWorkspace() {
  const client = usePlatform();
  return async (
    workspaceId: string,
    options?: SelectWorkspaceOptions,
  ): Promise<void> => {
    const key = idempotencyKey();

    // 1. Primero la plataforma
    await client.selectWorkspace({
      idempotencyKey: key,
      body: { workspace: workspaceId },
    });

    // El paso 2 (motor) lo hace la pantalla del workspace con su propio conn (RV1c N16).
    void options;
    invalidate("workspaces:");
  };
}

/**
 * Hook para seleccionar la organización activa (RV1 #2, RV2 #2).
 */
export function useSelectOrganization() {
  const client = usePlatform();
  return async (organizationId: string): Promise<void> => {
    const key = idempotencyKey();

    await client.selectOrganization({
      idempotencyKey: key,
      body: { organization_id: organizationId },
    });

    invalidate("organizations:");
  };
}

/**
 * Hook que agrupa las acciones de selección cerrando sobre usePlatform().
 */
export function useWorkspaceActions() {
  const select = useSelectWorkspace();
  const selectOrg = useSelectOrganization();
  return {
    selectWorkspace: select,
    selectOrganization: selectOrg,
  };
}

/**
 * Abre la acción externa para agregar workspace o iniciar sesión (RV1 #8, RV2 #20, RV2b «+»).
 */
export function openAddWorkspace(): void {
  void host.openExternal(webLoginUrl());
}
