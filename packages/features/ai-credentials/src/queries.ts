import { createResource, createSignal, type Accessor, type Resource } from "solid-js";
import type { ClientError, PlatformClient } from "@danil/platform-client";
import {
  connectMachine,
  type ConnectOptions,
  type EngineClient,
  type MachineConnection,
  type MachineRef,
} from "@danil/engine-client";
import type {
  EngineProviderItem,
  PutWorkspaceAccountPayload,
  WorkspaceAccountsResponse,
} from "./model.ts";
import { sealForRecipients } from "./seal.ts";

export type MachineQueryTarget =
  | EngineClient
  | MachineRef
  | (() => EngineClient | MachineRef | null | undefined)
  | null
  | undefined;

export interface UseProvidersReturn {
  providers: Resource<EngineProviderItem[]>;
  refetch: () => void;
  mutate: (v: EngineProviderItem[]) => void;
  loading: Accessor<boolean>;
  error: Accessor<unknown>;
}

/**
 * Consulta la lista de proveedores soportados y configurados en una máquina.
 *
 * Utiliza el método RPC1 `list_providers` del motor conectado.
 */
export function useProviders(machine: MachineQueryTarget): UseProvidersReturn {
  const getTarget = typeof machine === "function" ? machine : () => machine;

  const [data, { refetch, mutate }] = createResource(getTarget, async (target) => {
    if (!target) return [];
    if ("list_providers" in target && typeof target.list_providers === "function") {
      const result = await target.list_providers();
      return (Array.isArray(result) ? result : []) as EngineProviderItem[];
    }
    return [];
  });

  return {
    providers: data,
    refetch: () => void refetch(),
    mutate: (v) => mutate(v),
    loading: () => data.loading,
    error: () => data.error,
  };
}

const UNAVAILABLE_ERROR: ClientError = {
  kind: "unavailable",
  retrying: false,
};

/**
 * Consulta única y cacheada de cuentas de IA y destinatarios por workspace (B-023).
 *
 * Ruta OpenAPI: `GET /v1/credentials/workspaces/{workspace_id}/accounts`
 * Pendiente de contrato en `@danil/platform-client`.
 */
export function useWorkspaceAccounts(
  workspaceId: Accessor<string | null | undefined>,
  _platformClient?: PlatformClient,
) {
  const [data, { refetch, mutate }] = createResource<
    WorkspaceAccountsResponse | null,
    string | null | undefined
  >(workspaceId, async (id) => {
    if (!id) return null;
    // La ruta GET /v1/credentials/workspaces/{workspace_id}/accounts no está
    // en @danil/platform-client todavía. Se devuelve error tipado unavailable.
    throw UNAVAILABLE_ERROR;
  });

  return {
    data,
    refetch: () => void refetch(),
    mutate: (v: WorkspaceAccountsResponse | null) => mutate(v),
    loading: () => data.loading,
    error: () => data.error as ClientError | null,
  };
}

export interface ConnectAccountOptions {
  workspaceId: string;
  provider: string;
  slot: string;
  label?: string;
  hint?: string;
  kind?: "api_key" | "subscription" | "mcp_secret";
  secret?: string;
  recipients: Array<{ machine_id: string; public_key: string | null }>;
}

/**
 * Conexión de cuenta sellando el secreto para cada máquina receptora (X25519).
 *
 * Sella el secreto con `seal.ts` y envía `copies: [{ machine_id, sealed }]`.
 * Ruta OpenAPI: `PUT /v1/credentials/workspaces/{workspace_id}/accounts`
 * Pendiente de contrato en `@danil/platform-client`.
 */
export function useConnectAccount(_platformClient?: PlatformClient) {
  const [saving, setSaving] = createSignal(false);
  const [error, setError] = createSignal<ClientError | null>(null);

  async function connect(opts: ConnectAccountOptions): Promise<void> {
    setSaving(true);
    setError(null);
    try {
      if (opts.kind === "subscription" && opts.provider === "antigravity") {
        // Antigravity se autentica por suscripción (kind=subscription).
        // Pendiente de especificación en el contrato sobre qué payload se sube.
        throw UNAVAILABLE_ERROR;
      }

      const secretValue = opts.secret ?? "";
      const sealTargets = opts.recipients.map((r) => ({
        computer_id: r.machine_id,
        public_key: r.public_key,
      }));

      const sealedCopies = await sealForRecipients(
        sealTargets,
        opts.workspaceId,
        opts.slot,
        secretValue,
      );

      const _payload: PutWorkspaceAccountPayload = {
        kind: opts.kind ?? "api_key",
        provider: opts.provider,
        slot: opts.slot,
        label: opts.label,
        hint: opts.hint,
        copies: sealedCopies.map((c) => ({
          machine_id: c.computer_id,
          sealed: c.sealed,
        })),
      };

      // La ruta PUT /v1/credentials/workspaces/{workspace_id}/accounts no está generada
      throw UNAVAILABLE_ERROR;
    } catch (e) {
      const clientErr = (e as ClientError)?.kind ? (e as ClientError) : UNAVAILABLE_ERROR;
      setError(clientErr);
      throw clientErr;
    } finally {
      setSaving(false);
    }
  }

  return {
    connect,
    saving,
    error,
  };
}

/**
 * Borra una cuenta de credenciales y sus copias en todas las máquinas.
 *
 * Ruta OpenAPI: `DELETE /v1/credentials/workspaces/{workspace_id}/accounts/{credential_id}`
 * Pendiente de contrato en `@danil/platform-client`.
 */
export function useDeleteAccount(_platformClient?: PlatformClient) {
  const [deleting, setDeleting] = createSignal(false);
  const [error, setError] = createSignal<ClientError | null>(null);

  async function remove(_workspaceId: string, _credentialId: string): Promise<void> {
    setDeleting(true);
    setError(null);
    try {
      throw UNAVAILABLE_ERROR;
    } catch (e) {
      const clientErr = (e as ClientError)?.kind ? (e as ClientError) : UNAVAILABLE_ERROR;
      setError(clientErr);
      throw clientErr;
    } finally {
      setDeleting(false);
    }
  }

  return {
    remove,
    deleting,
    error,
  };
}

/**
 * Quita una máquina (`removed`) de una credencial.
 *
 * Ruta OpenAPI: `DELETE /v1/credentials/workspaces/{workspace_id}/accounts/{credential_id}/machines/{machine_id}`
 * Pendiente de contrato en `@danil/platform-client`.
 */
export function useRemoveMachineAccount(_platformClient?: PlatformClient) {
  const [removing, setRemoving] = createSignal(false);
  const [error, setError] = createSignal<ClientError | null>(null);

  async function removeMachine(
    _workspaceId: string,
    _credentialId: string,
    _machineId: string,
  ): Promise<void> {
    setRemoving(true);
    setError(null);
    try {
      throw UNAVAILABLE_ERROR;
    } catch (e) {
      const clientErr = (e as ClientError)?.kind ? (e as ClientError) : UNAVAILABLE_ERROR;
      setError(clientErr);
      throw clientErr;
    } finally {
      setRemoving(false);
    }
  }

  return {
    removeMachine,
    removing,
    error,
  };
}

/**
 * Restaura una credencial en una máquina a estado `pending`.
 *
 * Ruta OpenAPI: `POST /v1/credentials/workspaces/{workspace_id}/accounts/{credential_id}/machines/{machine_id}/restore`
 * Pendiente de contrato en `@danil/platform-client`.
 */
export function useRestoreMachineAccount(_platformClient?: PlatformClient) {
  const [restoring, setRestoring] = createSignal(false);
  const [error, setError] = createSignal<ClientError | null>(null);

  async function restoreMachine(
    _workspaceId: string,
    _credentialId: string,
    _machineId: string,
  ): Promise<void> {
    setRestoring(true);
    setError(null);
    try {
      throw UNAVAILABLE_ERROR;
    } catch (e) {
      const clientErr = (e as ClientError)?.kind ? (e as ClientError) : UNAVAILABLE_ERROR;
      setError(clientErr);
      throw clientErr;
    } finally {
      setRestoring(false);
    }
  }

  return {
    restoreMachine,
    restoring,
    error,
  };
}

/**
 * Enciende/conecta una máquina cuando está apagada o no tiene llave publicada (B-021).
 * Solo se invoca por acción explícita de la persona usuaria.
 */
export function useWakeMachine() {
  const [waking, setWaking] = createSignal(false);
  const [error, setError] = createSignal<unknown>(null);

  async function wake(opts: ConnectOptions): Promise<MachineConnection> {
    setWaking(true);
    setError(null);
    try {
      return connectMachine(opts);
    } catch (e) {
      setError(e);
      throw e;
    } finally {
      setWaking(false);
    }
  }

  return {
    wake,
    waking,
    error,
  };
}
