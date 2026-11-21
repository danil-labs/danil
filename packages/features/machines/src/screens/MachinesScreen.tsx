import { For, Show } from "solid-js";
import { MachineRow } from "../components/MachineRow.tsx";
import { useMachines, type SessionInput } from "../queries.ts";

export interface MachinesScreenProps {
  session?: SessionInput;
  class?: string;
}

/**
 * Pantalla «Tus máquinas» (M1, M2):
 * Lista todas las máquinas que devuelve GET /v1/machines para la sesión,
 * sin filtros y sin depender de que haya un workspace activo.
 * Errores de API muestran botón de reintento, nunca lista vacía (M8).
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
        <div class="flex flex-col gap-2">
          <For each={machines()!}>
            {(machine) => (
              <MachineRow
                machine={machine}
                isOperating={operating()[machine.machine_id]}
                connection={getConnection(machine.machine_id)}
                onStart={start}
                onStop={stop}
                onConnect={connect}
              />
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}
