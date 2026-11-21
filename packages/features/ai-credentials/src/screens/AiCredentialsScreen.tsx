import { createMemo, For, type JSX, Show } from "solid-js";
import type {
  ConnectOptions,
  EngineClient,
  PlatformClient,
  WorkspaceRecipient,
} from "../model.ts";
import {
  useConnectAccount,
  useDeleteAccount,
  useProviders,
  useRemoveMachineAccount,
  useRestoreMachineAccount,
  useWakeMachine,
  useWorkspaceAccounts,
} from "../queries.ts";
import { CredentialErrorNotice } from "../components/CredentialErrorNotice.tsx";
import { MachineWakeNotice } from "../components/MachineWakeNotice.tsx";
import { ProviderCard } from "../components/ProviderCard.tsx";

export interface AiCredentialsScreenProps {
  workspaceId?: string;
  platformClient?: PlatformClient;
  engineClient?: EngineClient;
  connectOptions?: ConnectOptions;
  knownMachineIds?: string[];
}

export function AiCredentialsScreen(props: AiCredentialsScreenProps): JSX.Element {
  const activeWorkspaceId = () => props.workspaceId ?? "default";

  // Consulta única y cacheada de credenciales del workspace (B-023)
  const accountsQuery = useWorkspaceAccounts(
    activeWorkspaceId,
    props.platformClient,
  );

  // Consulta de proveedores en el motor
  const providersQuery = useProviders(props.engineClient);

  // Mutaciones
  const connectAction = useConnectAccount(props.platformClient);
  const deleteAction = useDeleteAccount(props.platformClient);
  const removeMachineAction = useRemoveMachineAccount(props.platformClient);
  const restoreMachineAction = useRestoreMachineAccount(props.platformClient);
  const wakeAction = useWakeMachine();

  const recipients = (): WorkspaceRecipient[] =>
    accountsQuery.data()?.recipients ?? [];

  const credentials = () =>
    accountsQuery.data()?.credentials ?? [];

  // Detección de máquinas del workspace ausentes de recipients (B-021)
  const missingMachines = createMemo(() => {
    const known = props.knownMachineIds ?? [];
    const recipientIds = new Set(
      recipients()
        .filter((r) => Boolean(r.public_key))
        .map((r) => r.machine_id),
    );
    return known
      .filter((id) => !recipientIds.has(id))
      .map((id) => ({ machine_id: id }));
  });

  async function handleWake(machineId: string) {
    if (props.connectOptions) {
      await wakeAction.wake({
        ...props.connectOptions,
        machine: { machine_id: machineId },
      });
      accountsQuery.refetch();
    }
  }

  const providers = [
    {
      id: "claude" as const,
      name: "Anthropic Claude",
      description: "Modelos Claude 3.5 Sonnet y Opus para agentes autónomos.",
      kind: "api_key" as const,
    },
    {
      id: "codex" as const,
      name: "OpenAI Codex",
      description: "Modelos GPT-4o y series de razonamiento o1.",
      kind: "api_key" as const,
    },
    {
      id: "antigravity" as const,
      name: "Antigravity (Gemini)",
      description: "Modelos Gemini Flash y Pro con suscripción unificada Danil.",
      kind: "subscription" as const,
    },
    {
      id: "opencode" as const,
      name: "OpenCode",
      description: "Modelos de código abierto para ejecución e inferencia en máquina.",
      kind: "api_key" as const,
    },
  ];

  return (
    <div class="mx-auto max-w-4xl space-y-6 p-6 text-neutral-900 dark:text-neutral-100">
      {/* Encabezado */}
      <div class="flex flex-col gap-1 border-b border-neutral-200 pb-5 dark:border-neutral-800">
        <h1 class="text-xl font-bold tracking-tight text-neutral-950 dark:text-white">
          Cuentas y Credenciales de IA
        </h1>
        <p class="text-sm text-neutral-500 dark:text-neutral-400">
          Gestiona las claves y accesos a modelos de lenguaje para tus máquinas. Los secretos se sellan
          en el cliente con X25519 antes de viajar a la plataforma.
        </p>
      </div>

      {/* Manejo de error de la API con botón de reintento (regla obligatoria) */}
      <Show when={accountsQuery.error()}>
        <CredentialErrorNotice
          error={accountsQuery.error()}
          onRetry={() => accountsQuery.refetch()}
        />
      </Show>

      {/* Estado de carga inicial */}
      <Show when={accountsQuery.loading()}>
        <div class="flex items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 p-4 text-xs text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900/50 dark:text-neutral-400">
          <svg class="size-4 animate-spin text-neutral-500" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          Consultando cuentas y destinatarios en el workspace...
        </div>
      </Show>

      {/* Aviso de máquinas dormidas o sin llave publicada (B-021) */}
      <MachineWakeNotice
        missingMachines={missingMachines()}
        onWake={handleWake}
        waking={wakeAction.waking()}
      />

      {/* Lista de tarjetas de proveedores */}
      <div class="grid gap-5">
        <For each={providers}>
          {(p) => (
            <ProviderCard
              id={p.id}
              name={p.name}
              description={p.description}
              kind={p.kind}
              workspaceId={activeWorkspaceId()}
              recipients={recipients()}
              credentials={credentials()}
              onConnect={connectAction.connect}
              onDelete={(credId) => deleteAction.remove(activeWorkspaceId(), credId)}
              onRemoveMachine={(credId, mId) =>
                removeMachineAction.removeMachine(activeWorkspaceId(), credId, mId)
              }
              onRestoreMachine={(credId, mId) =>
                restoreMachineAction.restoreMachine(activeWorkspaceId(), credId, mId)
              }
              connecting={connectAction.saving()}
            />
          )}
        </For>
      </div>
    </div>
  );
}
