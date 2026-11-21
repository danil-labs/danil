import {
  createResource,
  createSignal,
  type Accessor,
  type Resource,
} from "solid-js";
import {
  usePlatform,
  type PlatformClient,
} from "@danil/platform-client";
import type { EngineClient } from "@danil/engine-client";
import type { Session, SessionSource } from "@danil/session";
import type { Workspace, Organization } from "./model.ts";
import { getPlanLabel } from "./model.ts";

export interface ClientResolverOptions {
  client?: PlatformClient | (() => PlatformClient | undefined | null);
  session?: Accessor<Session | undefined | null> | Session | null;
  sessionSource?: SessionSource;
}

export function resolvePlatformClient(options?: ClientResolverOptions): PlatformClient {
  if (options?.client) {
    if (typeof options.client === "function") {
      const c = options.client();
      if (c) return c;
    } else {
      return options.client;
    }
  }

  return usePlatform();
}

function generateIdempotencyKey(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export interface UseOrganizationsResult {
  organizations: Resource<Organization[]>;
  loading: Accessor<boolean>;
  error: Accessor<unknown>;
  refetch: (info?: unknown) => void;
}

/**
 * Consulta las organizaciones del usuario por sesión.
 * Un error se preserva en error() para permitir reintentos (B-006).
 */
export function useOrganizations(options?: ClientResolverOptions): UseOrganizationsResult {
  const fallbackClient = usePlatform();
  const getClient = () => {
    if (options?.client) {
      const c = typeof options.client === "function" ? options.client() : options.client;
      if (c) return c;
    }
    return fallbackClient;
  };

  const getSessionKey = () => {
    const s = typeof options?.session === "function" ? options.session() : options?.session;
    return s ? s.key : "current";
  };

  const [data, { refetch }] = createResource(
    getSessionKey,
    async () => {
      const client = getClient();
      const res = await client.getOrganizations();
      const items = res.items ?? res.organizations ?? [];
      return items.map((org) => ({
        ...org,
        planLabel: getPlanLabel(org),
      }));
    }
  );

  return {
    organizations: data,
    loading: () => data.loading,
    error: () => data.error,
    refetch: (info?: unknown) => {
      void refetch(info);
    },
  };
}

export interface UseWorkspacesOptions extends ClientResolverOptions {
  organizationId?: Accessor<string | undefined | null> | string | null;
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
 */
export function useWorkspaces(options?: UseWorkspacesOptions): UseWorkspacesResult {
  const fallbackClient = usePlatform();
  const getClient = () => {
    if (options?.client) {
      const c = typeof options.client === "function" ? options.client() : options.client;
      if (c) return c;
    }
    return fallbackClient;
  };

  const getSourceKey = () => {
    const s = typeof options?.session === "function" ? options.session() : options?.session;
    const orgId = typeof options?.organizationId === "function" ? options.organizationId() : options?.organizationId;
    return `${s ? s.key : "current"}:${orgId ?? "all"}`;
  };

  const [data, { refetch, mutate }] = createResource(
    getSourceKey,
    async () => {
      const client = getClient();
      const res = await client.getWorkspaces();
      const list = res.items ?? res.workspaces ?? [];
      const orgId = typeof options?.organizationId === "function" ? options.organizationId() : options?.organizationId;
      if (orgId) {
        return list.filter((w) => w.org === orgId || !w.org);
      }
      return list;
    }
  );

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

export interface CreateWorkspaceParams {
  name: string;
  org?: string;
}

/**
 * Crea un nuevo workspace en la plataforma.
 */
export async function createWorkspace(
  params: CreateWorkspaceParams,
  options?: ClientResolverOptions,
): Promise<Workspace> {
  const client = resolvePlatformClient(options);
  const idempotencyKey = generateIdempotencyKey("ws-create");

  const created = await client.createWorkspace({
    idempotencyKey,
    body: {
      name: params.name,
      org: params.org,
    },
  });

  return created;
}

// Señales globales locales para la selección activa
const [activeWorkspaceIdSignal, setActiveWorkspaceIdSignal] = createSignal<string | null>(null);
const [activeOrganizationIdSignal, setActiveOrganizationIdSignal] = createSignal<string | null>(null);

export function getActiveWorkspaceId(): string | null {
  return activeWorkspaceIdSignal();
}

export function setActiveWorkspaceId(id: string | null): void {
  setActiveWorkspaceIdSignal(id);
}

export function getActiveOrganizationId(): string | null {
  return activeOrganizationIdSignal();
}

export function setActiveOrganizationId(id: string | null): void {
  setActiveOrganizationIdSignal(id);
}

export interface SelectWorkspaceOptions extends ClientResolverOptions {
  engineClient?: EngineClient | (() => EngineClient | undefined | null);
}

/**
 * Selecciona un workspace de forma atómica (B-007):
 * 1. Primero la plataforma.
 * 2. Si la plataforma falla, el estado local no cambia (la función lanza error).
 * 3. Si tiene éxito y hay cliente del motor, se invoca set_active_workspace en el motor.
 * 4. Por último se actualiza la señal local.
 * Esta es la única acción de selección que el shell debe llamar.
 */
export async function selectWorkspace(
  workspaceId: string,
  options?: SelectWorkspaceOptions,
): Promise<void> {
  const client = resolvePlatformClient(options);
  const idempotencyKey = generateIdempotencyKey("ws-select");

  // 1. Primero la plataforma
  await client.selectWorkspace({
    idempotencyKey,
    body: { workspace: workspaceId },
  });

  // 2. Si falla lo anterior, no llega a este punto.
  // 3. Notificar al motor local si está disponible
  const engine = typeof options?.engineClient === "function" ? options.engineClient() : options?.engineClient;
  if (engine) {
    await engine.set_active_workspace({ id: workspaceId });
  }

  // 4. Actualizar el estado local
  setActiveWorkspaceIdSignal(workspaceId);
}

/**
 * Selecciona la organización activa en la plataforma.
 */
export async function selectOrganization(
  organizationId: string,
  options?: ClientResolverOptions,
): Promise<void> {
  const client = resolvePlatformClient(options);
  const idempotencyKey = generateIdempotencyKey("org-select");

  await client.selectOrganization({
    idempotencyKey,
    body: { organization_id: organizationId },
  });

  setActiveOrganizationIdSignal(organizationId);
}
