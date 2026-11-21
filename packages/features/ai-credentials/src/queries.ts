import { createResource, createSignal, type Accessor, type Resource } from "solid-js";
import {
  usePlatform,
  type ClientError,
  type PlatformClient,
  type WorkspaceAccounts,
  type AccountCredential,
  type PutWorkspaceAccount,
} from "@danil/platform-client";
import {
  connectMachine,
  type ConnectOptions,
  type EngineClient,
  type MachineConnection,
  type MachineRef,
} from "@danil/engine-client";
import type {
  ConnectAccountOptions,
  EngineProviderItem,
  RawAccountCredentialsListOutput,
} from "./model.ts";
import { sealForRecipients } from "./seal.ts";

export type { ConnectAccountOptions, AccountCredential };

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

export interface UseMachineAccountCredentialsReturn {
  credentials: Resource<RawAccountCredentialsListOutput | null>;
  refetch: () => void;
  mutate: (v: RawAccountCredentialsListOutput | null) => void;
  loading: Accessor<boolean>;
  error: Accessor<unknown>;
}

/**
 * Consulta el estado de las credenciales de cuenta en el motor local o remoto (11-business-logic § 3).
 *
 * Utiliza el método RPC1 `account_credentials_list` del motor conectado.
 */
export function useMachineAccountCredentials(
  machine: MachineQueryTarget
): UseMachineAccountCredentialsReturn {
  const getTarget = typeof machine === "function" ? machine : () => machine;

  const [data, { refetch, mutate }] = createResource(getTarget, async (target) => {
    if (!target) return null;
    if ("account_credentials_list" in target && typeof target.account_credentials_list === "function") {
      const result = await target.account_credentials_list();
      return result as RawAccountCredentialsListOutput;
    }
    return null;
  });

  return {
    credentials: data,
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
 */
export function useWorkspaceAccounts(
  workspaceId: Accessor<string | null | undefined>,
) {
  const client = usePlatform();

  const [data, { refetch, mutate }] = createResource<
    WorkspaceAccounts | null,
    string | null | undefined
  >(workspaceId, async (id) => {
    if (!id) return null;
    return await client.getWorkspaceAccounts({ workspace_id: id });
  });

  return {
    data,
    refetch: () => void refetch(),
    mutate: (v: WorkspaceAccounts | null) => mutate(v),
    loading: () => data.loading,
    error: () => data.error as ClientError | null,
  };
}

/**
 * Conexión de cuenta sellando el secreto para cada máquina receptora (X25519).
 *
 * Sella el secreto con `seal.ts` y envía `copies: [{ machine_id, sealed }]`.
 * Ruta OpenAPI: `PUT /v1/credentials/workspaces/{workspace_id}/accounts`
 */
export function useConnectAccount() {
  const client = usePlatform();
  const [saving, setSaving] = createSignal(false);
  const [error, setError] = createSignal<ClientError | null>(null);

  async function connect(opts: ConnectAccountOptions): Promise<void> {
    setSaving(true);
    setError(null);
    try {
      const isSecretRequired = opts.kind !== "subscription";
      const secretValue = opts.secret ?? "";
      if (isSecretRequired && secretValue.trim().length === 0) {
        throw {
          kind: "error",
          status: 400,
          code: "empty_secret",
          message: "Secret cannot be empty or whitespace only",
        } satisfies ClientError;
      }

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

      if (isSecretRequired && sealedCopies.length === 0) {
        throw {
          kind: "error",
          status: 400,
          code: "empty_copies",
          message: "At least one recipient copy is required",
        } satisfies ClientError;
      }

      const body: PutWorkspaceAccount = {
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

      await client.putWorkspaceAccount({
        workspace_id: opts.workspaceId,
        body,
      });
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
 */
export function useDeleteAccount() {
  const client = usePlatform();
  const [deleting, setDeleting] = createSignal(false);
  const [error, setError] = createSignal<ClientError | null>(null);

  async function remove(workspaceId: string, credentialId: string): Promise<void> {
    setDeleting(true);
    setError(null);
    try {
      await client.deleteWorkspaceAccount({
        workspace_id: workspaceId,
        credential_id: credentialId,
      });
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

export type CredentialMachineMutationFn = (
  client: PlatformClient,
  params: { workspace_id: string; credential_id: string; machine_id: string },
) => Promise<unknown>;

/**
 * Fábrica genérica para mutaciones de credenciales por máquina (remove / restore).
 * Evita duplicación de lógica y manejo de errores (RV1 #36, R9).
 */
export function useCredentialMutation(mutateFn: CredentialMachineMutationFn) {
  const client = usePlatform();
  const [pending, setPending] = createSignal(false);
  const [error, setError] = createSignal<ClientError | null>(null);

  async function mutate(
    workspaceId: string,
    credentialId: string,
    machineId: string,
  ): Promise<void> {
    setPending(true);
    setError(null);
    try {
      await mutateFn(client, {
        workspace_id: workspaceId,
        credential_id: credentialId,
        machine_id: machineId,
      });
    } catch (e) {
      const clientErr = (e as ClientError)?.kind ? (e as ClientError) : UNAVAILABLE_ERROR;
      setError(clientErr);
      throw clientErr;
    } finally {
      setPending(false);
    }
  }

  return {
    mutate,
    pending,
    error,
  };
}

/**
 * Quita una máquina (`removed`) de una credencial.
 *
 * Ruta OpenAPI: `DELETE /v1/credentials/workspaces/{workspace_id}/accounts/{credential_id}/machines/{machine_id}`
 */
export function useRemoveMachineAccount() {
  const { mutate, pending, error } = useCredentialMutation((c, params) =>
    c.removeWorkspaceAccountMachine(params),
  );

  return {
    removeMachine: mutate,
    removing: pending,
    error,
  };
}

/**
 * Restaura una credencial en una máquina a estado `pending`.
 *
 * Ruta OpenAPI: `POST /v1/credentials/workspaces/{workspace_id}/accounts/{credential_id}/machines/{machine_id}/restore`
 */
export function useRestoreMachineAccount() {
  const { mutate, pending, error } = useCredentialMutation((c, params) =>
    c.restoreWorkspaceAccountMachine(params),
  );

  return {
    restoreMachine: mutate,
    restoring: pending,
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
