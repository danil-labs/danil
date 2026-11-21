import { For, type JSX, Show } from "solid-js";

export interface MissingMachineItem {
  machine_id: string;
  name?: string;
}

export interface MachineWakeNoticeProps {
  missingMachines: MissingMachineItem[];
  onWake: (machineId: string) => void;
  waking?: boolean;
}

export function MachineWakeNotice(props: MachineWakeNoticeProps): JSX.Element {
  return (
    <Show when={props.missingMachines.length > 0}>
      <div
        role="region"
        aria-label="Máquinas pendientes de encendido"
        class="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200"
      >
        <div class="flex items-start gap-3">
          <svg
            class="mt-0.5 size-5 shrink-0 text-amber-600 dark:text-amber-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            stroke-width="2"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M13 10V3L4 14h7v7l9-11h-7z"
            />
          </svg>
          <div class="flex-1 space-y-2">
            <div>
              <h4 class="font-semibold text-amber-950 dark:text-amber-100">
                Máquinas no disponibles para sincronizar
              </h4>
              <p class="mt-0.5 text-xs text-amber-800 dark:text-amber-300">
                Las siguientes máquinas no han publicado su llave o están apagadas. Enciende la máquina
                para sellar y propagar las credenciales hacia ellas.
              </p>
            </div>

            <ul class="divide-y divide-amber-200/60 dark:divide-amber-900/40">
              <For each={props.missingMachines}>
                {(m) => (
                  <li class="flex items-center justify-between py-2 text-xs">
                    <span class="font-mono text-amber-950 dark:text-amber-100">
                      {m.name ? `${m.name} (${m.machine_id})` : m.machine_id}
                    </span>
                    <button
                      type="button"
                      disabled={props.waking}
                      onClick={() => props.onWake(m.machine_id)}
                      class="inline-flex items-center gap-1.5 rounded-md bg-amber-600 px-2.5 py-1 text-xs font-medium text-white shadow-sm transition hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:opacity-50 dark:bg-amber-700 dark:hover:bg-amber-600"
                    >
                      <Show
                        when={props.waking}
                        fallback={
                          <>
                            <svg
                              class="size-3.5"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              stroke-width="2"
                            >
                              <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                d="M5.636 18.364a9 9 0 010-12.728m12.728 0a9 9 0 010 12.728m-9.9-2.829a5 5 0 010-7.07m7.072 0a5 5 0 010 7.07M12 3v9"
                              />
                            </svg>
                            Enciende la máquina
                          </>
                        }
                      >
                        Conectando...
                      </Show>
                    </button>
                  </li>
                )}
              </For>
            </ul>
          </div>
        </div>
      </div>
    </Show>
  );
}
