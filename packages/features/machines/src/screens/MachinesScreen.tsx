import { createSignal, For, Show } from "solid-js";
import { Close, SignalDot } from "@danil/ui";
import { useMachines, type SessionInput } from "../queries.ts";

export interface MachinesScreenProps {
  session?: SessionInput;
  class?: string;
}

/**
 * Pantalla «Tus máquinas»:
 * Lista las máquinas disponibles con la apariencia y estructura de AccountMachines de apps/desktop.
 * Datos y operaciones gestionados por useMachines.
 */
export function MachinesScreen(props: MachinesScreenProps) {
  const {
    machines,
    loading,
    error,
    refetch,
    start,
    stop,
    connect,
    getConnection,
    operating,
  } = useMachines(props.session);

  const [asking, setAsking] = createSignal<string | null>(null);
  const [failed, setFailed] = createSignal(false);

  async function handleTogglePower(id: string, isRunning: boolean) {
    setAsking(null);
    try {
      if (isRunning) {
        await stop(id);
      } else {
        await start(id);
      }
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }

  return (
    <div class={`flex w-full flex-col gap-4 p-4 ${props.class ?? ""}`} data-machines-screen="">
      <div class="flex items-center justify-between gap-4">
        <div>
          <h1 class="text-base font-semibold text-neutral-900 dark:text-neutral-100">
            Tus máquinas
          </h1>
          <p class="text-xs text-neutral-500 dark:text-neutral-400">
            Máquinas disponibles para ejecutar tareas en tu cuenta y organización.
          </p>
        </div>
        <button
          type="button"
          disabled={loading()}
          class="rounded-md border border-neutral-300 px-2.5 py-1 text-xs font-medium text-neutral-700 transition hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
          onClick={() => void refetch()}
        >
          {loading() ? "Actualizando…" : "Actualizar"}
        </button>
      </div>

      <Show when={error()}>
        {(err) => (
          <div
            class="flex flex-col items-start gap-2 rounded-lg border border-red-200 bg-red-50/70 p-3 text-xs text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300"
            role="alert"
          >
            <span>
              Error al cargar las máquinas:{" "}
              {(err() as any)?.message ?? "No se pudo conectar con la plataforma"}
            </span>
            <button
              type="button"
              class="rounded border border-red-300 bg-white px-2 py-0.5 text-xs font-medium text-red-700 transition hover:bg-red-50 dark:border-red-800 dark:bg-neutral-900 dark:text-red-300"
              onClick={() => void refetch()}
            >
              Reintentar
            </button>
          </div>
        )}
      </Show>

      <Show when={loading() && !machines()}>
        <div class="rounded-lg border border-neutral-200 p-4 text-center text-xs text-neutral-500 dark:border-neutral-800">
          Cargando máquinas…
        </div>
      </Show>

      <Show when={!loading() && !error() && machines()?.length === 0}>
        <div class="rounded-lg border border-dashed border-neutral-200 p-6 text-center text-xs text-neutral-500 dark:border-neutral-800">
          No tienes máquinas disponibles.
        </div>
      </Show>

      <Show when={machines() && machines()!.length > 0}>
        <ul
          class="-mt-1 flex flex-wrap items-center gap-1.5 px-3 pb-1 text-xs text-neutral-500"
          data-account-machines=""
        >
          <For each={machines()!}>
            {(m) => {
              const name = () => m.name?.trim() || m.machine_id;
              const on = () => m.state === "running";
              const isOperating = () => Boolean(operating()[m.machine_id]);
              return (
                <li
                  class="flex min-w-0 items-center gap-1 rounded-sm border border-border py-0.5 pr-0.5 pl-1.5"
                  data-account-machine={m.machine_id}
                  data-machine-id={m.machine_id}
                  data-on={on() ? "true" : "false"}
                  title={on() ? "En línea" : "Desconectada"}
                >
                  <SignalDot tone={on() ? "success" : "off"} />
                  <span class="max-w-[140px] truncate">{name()}</span>
                  <Show
                    when={asking() === m.machine_id}
                    fallback={
                      <div class="flex items-center gap-1">
                        <Show when={!isOperating()}>
                          <button
                            type="button"
                            class="grid size-4 place-items-center rounded-sm hover:bg-surface-muted hover:text-neutral-950"
                            aria-label={on() ? `Apagar ${name()}` : `Encender ${name()}`}
                            title={on() ? `Apagar ${name()}` : `Encender ${name()}`}
                            onClick={() => setAsking(m.machine_id)}
                          >
                            <Close size={11} />
                          </button>
                        </Show>
                        <button
                          type="button"
                          class="rounded px-1 text-2xs text-neutral-500 hover:bg-surface-muted hover:text-neutral-950"
                          onClick={() => connect(m)}
                        >
                          Conectar
                        </button>
                      </div>
                    }
                  >
                    <button
                      type="button"
                      class="px-1 text-error-strong"
                      data-sign-out-yes=""
                      onClick={() => void handleTogglePower(m.machine_id, on())}
                    >
                      {on() ? "Apagar" : "Encender"}
                    </button>
                    <button
                      type="button"
                      class="px-1"
                      onClick={() => setAsking(null)}
                    >
                      Cancelar
                    </button>
                  </Show>
                </li>
              );
            }}
          </For>
        </ul>
      </Show>

      <Show when={failed()}>
        <span class="text-xs text-error-strong">Error al cambiar el estado de la máquina</span>
      </Show>
    </div>
  );
}
