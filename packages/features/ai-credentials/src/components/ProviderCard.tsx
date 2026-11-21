import { createSignal, For, type JSX, Show } from "solid-js";
import type {
  ConnectAccountOptions,
  MachineCredentialStatus,
  SupportedProvider,
  WorkspaceCredential,
  WorkspaceRecipient,
} from "../model.ts";

export interface ProviderCardProps {
  id: SupportedProvider;
  name: string;
  description: string;
  kind: "api_key" | "subscription";
  workspaceId: string;
  recipients: WorkspaceRecipient[];
  credentials: WorkspaceCredential[];
  onConnect: (opts: ConnectAccountOptions) => Promise<void>;
  onDelete: (credentialId: string) => Promise<void>;
  onRemoveMachine: (credentialId: string, machineId: string) => Promise<void>;
  onRestoreMachine: (credentialId: string, machineId: string) => Promise<void>;
  connecting?: boolean;
}

export function ProviderCard(props: ProviderCardProps): JSX.Element {
  const [apiKey, setApiKey] = createSignal("");
  const [showInput, setShowInput] = createSignal(false);
  const [localError, setLocalError] = createSignal<string | null>(null);

  const providerCredentials = () =>
    props.credentials.filter((c) => c.provider === props.id || c.slot === props.id);

  const hasCredentials = () => providerCredentials().length > 0;

  async function handleConnect(e: Event) {
    e.preventDefault();
    setLocalError(null);

    if (props.kind === "subscription") {
      try {
        await props.onConnect({
          workspaceId: props.workspaceId,
          provider: props.id,
          slot: props.id,
          kind: "subscription",
          recipients: props.recipients,
        });
      } catch (err: unknown) {
        setLocalError(
          "Antigravity se autentica por suscripción: la especificación de subida está pendiente en el contrato.",
        );
      }
      return;
    }

    const key = apiKey().trim();
    if (!key) {
      setLocalError("Ingresa una clave de API válida");
      return;
    }

    try {
      await props.onConnect({
        workspaceId: props.workspaceId,
        provider: props.id,
        slot: props.id,
        kind: "api_key",
        secret: key,
        hint: `...${key.slice(-4)}`,
        recipients: props.recipients,
      });
      setApiKey("");
      setShowInput(false);
    } catch (err: unknown) {
      setLocalError("Fallo al conectar: la operación está pendiente de contrato en platform-client.");
    }
  }

  return (
    <div class="rounded-lg border border-neutral-800 bg-neutral-900/80 p-5 shadow-sm transition-all text-neutral-200">
      {/* Cabecera del proveedor con apariencia de apps/desktop */}
      <div class="flex items-start justify-between border-b border-neutral-800 pb-4">
        <div>
          <div class="flex items-center gap-2">
            <h3 class="text-sm font-semibold text-neutral-100">
              {props.name}
            </h3>
            <Show when={props.kind === "subscription"}>
              <span class="inline-flex items-center rounded bg-sky-500/10 px-2 py-0.5 text-[11px] font-medium text-sky-400 border border-sky-500/20">
                Suscripción
              </span>
            </Show>
            <Show when={hasCredentials()}>
              <span class="inline-flex items-center rounded bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-400 border border-emerald-500/20">
                Conectada
              </span>
            </Show>
          </div>
          <p class="mt-1 text-xs text-neutral-400">
            {props.description}
          </p>
        </div>

        <Show when={!showInput() && props.kind !== "subscription"}>
          <button
            type="button"
            onClick={() => setShowInput(true)}
            class="inline-flex items-center gap-1.5 rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-xs font-medium text-neutral-200 shadow-sm hover:bg-neutral-700 hover:text-white transition-colors focus:outline-none focus:ring-1 focus:ring-neutral-500"
          >
            <svg class="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Agregar clave
          </button>
        </Show>
      </div>

      {/* Caso especial Antigravity (Gemini): suscripción */}
      <Show when={props.id === "antigravity"}>
        <div class="mt-4 rounded-md border border-sky-500/20 bg-sky-500/10 p-3 text-xs text-sky-300">
          <p class="font-medium text-sky-200">Autenticación por suscripción Danil</p>
          <p class="mt-0.5 text-sky-300/80">
            Antigravity se autentica por suscripción (kind=subscription), a diferencia de las API keys.
            La especificación de subida está pendiente en el contrato del borde.
          </p>
          <div class="mt-3">
            <button
              type="button"
              disabled={props.connecting}
              onClick={handleConnect}
              class="inline-flex items-center gap-1.5 rounded-md bg-neutral-100 px-3 py-1.5 text-xs font-medium text-neutral-900 shadow-sm hover:bg-white focus:outline-none disabled:opacity-50 transition-colors"
            >
              Conectar suscripción
            </button>
          </div>
        </div>
      </Show>

      {/* Formulario de entrada de clave */}
      <Show when={showInput() && props.kind !== "subscription"}>
        <form onSubmit={handleConnect} class="mt-4 space-y-3">
          <div>
            <label
              for={`input-${props.id}`}
              class="block text-xs font-medium text-neutral-300"
            >
              API Key ({props.name})
            </label>
            <div class="mt-1">
              <input
                id={`input-${props.id}`}
                type="password"
                placeholder="Pega la API Key aquí (se sellará con X25519 antes de viajar)"
                value={apiKey()}
                onInput={(e) => setApiKey(e.currentTarget.value)}
                class="w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-1.5 text-xs text-neutral-200 placeholder:text-neutral-500 focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-500"
              />
            </div>
            <p class="mt-1 text-[11px] text-neutral-500">
              El secreto se sella en el navegador para cada máquina con su llave pública. Nunca viaja en claro.
            </p>
          </div>

          <div class="flex items-center gap-2">
            <button
              type="submit"
              disabled={props.connecting}
              class="inline-flex items-center gap-1.5 rounded-md bg-neutral-100 px-3 py-1.5 text-xs font-medium text-neutral-900 shadow-sm hover:bg-white focus:outline-none disabled:opacity-50 transition-colors"
            >
              <Show when={props.connecting} fallback="Guardar y sellar">
                Guardando...
              </Show>
            </button>
            <button
              type="button"
              onClick={() => {
                setShowInput(false);
                setApiKey("");
                setLocalError(null);
              }}
              class="rounded-md border border-neutral-700 bg-transparent px-3 py-1.5 text-xs font-medium text-neutral-300 hover:bg-neutral-800 transition-colors"
            >
              Cancelar
            </button>
          </div>
        </form>
      </Show>

      {/* Mensaje de error local */}
      <Show when={localError()}>
        <div class="mt-3 rounded-md bg-rose-500/10 border border-rose-500/20 p-2.5 text-xs text-rose-300">
          {localError()}
        </div>
      </Show>

      {/* Lista de cuentas existentes para este proveedor */}
      <Show when={hasCredentials()}>
        <div class="mt-4 space-y-3">
          <h4 class="text-xs font-semibold uppercase tracking-wider text-neutral-500">
            Cuentas configuradas
          </h4>
          <ul class="divide-y divide-neutral-800 rounded-md border border-neutral-800 bg-neutral-950/40">
            <For each={providerCredentials()}>
              {(cred) => (
                <li class="p-3">
                  <div class="flex items-center justify-between">
                    <div>
                      <div class="flex items-center gap-2">
                        <span class="text-xs font-medium text-neutral-100">
                          {cred.label || props.name}
                        </span>
                        <Show when={cred.hint}>
                          <span class="font-mono text-xs text-neutral-400">
                            {cred.hint}
                          </span>
                        </Show>
                      </div>
                      <span class="text-[11px] text-neutral-500">
                        Versión {cred.version} · {cred.slot}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => props.onDelete(cred.credential_id)}
                      class="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-rose-400 hover:bg-rose-500/10 transition-colors"
                      title="Eliminar credencial en todas las máquinas"
                    >
                      <svg class="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                      Eliminar
                    </button>
                  </div>

                  {/* Estado por máquina (B-022) */}
                  <Show when={cred.machines && cred.machines.length > 0}>
                    <div class="mt-3 border-t border-neutral-800/60 pt-2">
                      <p class="text-[11px] font-medium text-neutral-500">
                        Estado por máquina:
                      </p>
                      <ul class="mt-1 space-y-1">
                        <For each={cred.machines}>
                          {(m: MachineCredentialStatus) => (
                            <li class="flex items-center justify-between text-xs py-0.5">
                              <span class="font-mono text-neutral-300">
                                {m.machine_id}
                              </span>
                              <div class="flex items-center gap-2">
                                <Show
                                  when={m.state === "active"}
                                  fallback={
                                    <Show
                                      when={m.state === "pending"}
                                      fallback={
                                        <span class="inline-flex items-center rounded bg-neutral-800 px-2 py-0.5 text-[10px] font-medium text-neutral-400 border border-neutral-700">
                                          Removida
                                        </span>
                                      }
                                    >
                                      <span class="inline-flex items-center rounded bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-400 border border-amber-500/20">
                                        Pendiente
                                      </span>
                                    </Show>
                                  }
                                >
                                  <span class="inline-flex items-center rounded bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400 border border-emerald-500/20">
                                    Activa
                                  </span>
                                </Show>

                                <Show
                                  when={m.state === "removed"}
                                  fallback={
                                    <button
                                      type="button"
                                      onClick={() => props.onRemoveMachine(cred.credential_id, m.machine_id)}
                                      class="text-[10px] text-neutral-500 underline hover:text-rose-400 transition-colors"
                                    >
                                      Quitar
                                    </button>
                                  }
                                >
                                  <button
                                    type="button"
                                    onClick={() => props.onRestoreMachine(cred.credential_id, m.machine_id)}
                                    class="text-[10px] text-neutral-500 underline hover:text-emerald-400 transition-colors"
                                  >
                                    Restaurar
                                  </button>
                                </Show>
                              </div>
                            </li>
                          )}
                        </For>
                      </ul>
                    </div>
                  </Show>
                </li>
              )}
            </For>
          </ul>
        </div>
      </Show>
    </div>
  );
}
