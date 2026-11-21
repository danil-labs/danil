import { createSignal, For, Show } from "solid-js";
import { ITEM_DE_MENU, Popover, PopoverContent, PopoverTrigger, SignalDot } from "@danil/ui";
import type { Machine } from "../model.ts";
import { MachineIcon } from "./MachineIcon.tsx";

export interface RunOnPickerProps {
  /** Lista de máquinas ya filtrada por la plataforma para el workspace (M3) */
  machines: Machine[];
  selectedId?: string | null;
  onSelect?: (machine: Machine) => void;
  loading?: boolean;
  disabled?: boolean;
  class?: string;
}

/**
 * Selector «Ejecutar en»: la máquina donde corre una tarea.
 * Apariencia idéntica a MachinePicker de apps/desktop manteniendo las props actuales.
 */
export function RunOnPicker(props: RunOnPickerProps) {
  const [abierto, setAbierto] = createSignal(false);

  const elegida = () =>
    props.machines.find((m) => (props.selectedId ? m.machine_id === props.selectedId : false)) ??
    props.machines[0];

  const nombre = (m: Machine) => m.name?.trim() || m.machine_id;

  const etiqueta = () => {
    const chosen = elegida();
    if (chosen) return nombre(chosen);
    return "Ejecutar en";
  };

  return (
    <div class={`inline-block text-left ${props.class ?? ""}`} data-run-on-picker="">
      <Popover open={abierto()} onOpenChange={setAbierto} placement="top-start" gutter={4}>
        <PopoverTrigger
          disabled={props.disabled || props.loading}
          class="flex min-h-7 max-w-[260px] items-center gap-1.5 rounded-sm px-1 text-left text-xs text-neutral-500 hover:text-neutral-950 disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="Ejecutar en"
        >
          <MachineIcon wakes={(elegida() as { wakes?: boolean } | undefined)?.wakes} size={12} />
          <span class="truncate">{etiqueta()}</span>
          <Show when={elegida()}>
            {(chosen) => <SignalDot tone={chosen().state === "running" ? "success" : "off"} />}
          </Show>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="11"
            height="11"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </PopoverTrigger>
        <PopoverContent class="w-[300px] overflow-hidden p-0 text-caption text-neutral-500 shadow-lg">
          <p class="m-0 border-b border-border px-2 py-1.5">Ejecutar en</p>
          <div class="py-1">
            <Show
              when={props.machines.length > 0}
              fallback={
                <div class="px-3 py-2 text-xs text-neutral-500">No hay máquinas disponibles</div>
              }
            >
              <For each={props.machines}>
                {(m) => {
                  const isSelected = () => elegida()?.machine_id === m.machine_id;
                  const isOn = () => m.state === "running";
                  return (
                    <button
                      class={`${ITEM_DE_MENU} flex items-center gap-2 disabled:opacity-50`}
                      data-machine-option={m.machine_id}
                      onClick={() => {
                        setAbierto(false);
                        props.onSelect?.(m);
                      }}
                    >
                      <MachineIcon wakes={(m as { wakes?: boolean }).wakes} size={12} />
                      <SignalDot tone={isOn() ? "success" : "off"} />
                      <span class="flex-1 truncate">{nombre(m)}</span>
                      <span class="text-2xs">
                        {isOn() ? "encendida" : "apagada"}
                      </span>
                      <span class="flex w-3 shrink-0">
                        <Show when={isSelected()}>
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            aria-hidden="true"
                          >
                            <path d="M20 6 9 17l-5-5" />
                          </svg>
                        </Show>
                      </span>
                    </button>
                  );
                }}
              </For>
            </Show>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
