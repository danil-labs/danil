import { For, Show } from "solid-js";
import { Button, SettingsBlock, SettingsPanel, SettingsSection } from "@danil/ui";
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
    <div class={`p-6 max-w-4xl text-neutral-950 dark:text-neutral-100 ${props.class ?? ""}`} data-machines-screen="">
      <SettingsPanel>
        <SettingsSection
          title="Tus máquinas"
          description="Máquinas disponibles para ejecutar tareas en tu cuenta y organización."
          aside={
            <Button
              size="sm"
              variant="secondary"
              disabled={loading()}
              onClick={() => void refetch()}
            >
              {loading() ? "Actualizando…" : "Actualizar"}
            </Button>
          }
        >
          <Show when={error()}>
            {(err) => (
              <SettingsBlock>
                <p class="m-0 text-sm text-error-strong" role="alert">
                  Error al cargar las máquinas: {(err() as any)?.message ?? "No se pudo conectar con la plataforma"}
                </p>
                <Button size="sm" variant="secondary" class="justify-self-start" onClick={() => void refetch()}>
                  Reintentar
                </Button>
              </SettingsBlock>
            )}
          </Show>

          <Show when={loading() && !machines()}>
            <SettingsBlock>
              <p class="m-0 text-sm text-neutral-500">Cargando máquinas…</p>
            </SettingsBlock>
          </Show>

          <Show when={!loading() && !error() && machines()?.length === 0}>
            <SettingsBlock>
              <p class="m-0 text-sm text-neutral-500">No tienes máquinas disponibles.</p>
            </SettingsBlock>
          </Show>

          <Show when={machines() && machines()!.length > 0}>
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
          </Show>
        </SettingsSection>
      </SettingsPanel>
    </div>
  );
}
