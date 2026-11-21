import {
  createResource,
  onCleanup,
  type Accessor,
  type Resource,
} from "solid-js";
import {
  usePlatform,
  idempotencyKey,
  API_BASE,
} from "@danil/platform-client";
import { host } from "@danil/host";
import type { EngineClient } from "@danil/engine-client";
import type { Workspace, Organization, WorkspaceGroup } from "./model.ts";
import { planLabel } from "./model.ts";

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
 * Consulta las organizaciones del usuario por sesión.
 * Captura usePlatform() en el cuerpo del hook (RV1 #2, RV2 #2) y soporta cancelación por signal.
 * Un error se preserva en error() para permitir reintentos (B-006).
 */
export function useOrganizations(): UseOrganizationsResult {
  const client = usePlatform();
  const controller = new AbortController();
  onCleanup(() => controller.abort());

  const [data, { refetch }] = createResource(async () => {
    const res = await client.getOrganizations({ signal: controller.signal });
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
  });

  return {
    organizations: data,
    loading: () => data.loading,
    error: () => data.error,
    refetch: (info?: unknown) => {
      void refetch(info);
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
 * Consulta los workspaces del usuario por sesión.
 * Captura usePlatform() en el cuerpo del hook (RV1 #2, RV2 #2).
 * Sin filtro local por org ni workspaces sin organización (RV1 #32, RV2 #22).
 */
export function useWorkspaces(): UseWorkspacesResult {
  const client = usePlatform();
  const controller = new AbortController();
  onCleanup(() => controller.abort());

  const [data, { refetch, mutate }] = createResource(async () => {
    const res = await client.getWorkspaces({ signal: controller.signal });
    const list = res.items ?? [];
    // 11 §2: No existen workspaces sin organización
    return list.filter((w) => !!w.org);
  });

  return {
    workspaces: data,
    loading: () => data.loading,
    error: () => data.error,
    refetch: (info?: unknown) => {
      void refetch(info);
    },
    mutate,
  };
}

export interface SelectWorkspaceOptions {
  engineClient?: EngineClient | (() => EngineClient | undefined | null);
}

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

    // 2. Notificar al motor local si está disponible
    const engine =
      typeof options?.engineClient === "function"
        ? options.engineClient()
        : options?.engineClient;
    if (engine) {
      await engine.set_active_workspace({ id: workspaceId });
    }
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
 * Devuelve la URL para agregar un workspace (RV1 #8, RV2 #20).
 * El «+» solo ofrece «Agregar workspace» abriendo el selector externo.
 */
export function getAddWorkspaceUrl(orgId?: string): string {
  const base = API_BASE.replace(/\/v1\/?$/, "");
  const query = orgId ? `?org=${encodeURIComponent(orgId)}` : "";
  return `${base}/workspaces/add${query}`;
}

/**
 * Abre la página externa para agregar un workspace mediante host.openExternal (RV1 #8, RV2 #20).
 */
export function openAddWorkspace(orgId?: string): void {
  void host.openExternal(getAddWorkspaceUrl(orgId));
}
