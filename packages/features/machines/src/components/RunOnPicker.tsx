import { createSignal, For, Show } from "solid-js";
import type { Machine } from "../model.ts";
import { MachineBadge } from "./MachineBadge.tsx";
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
 * Selector «Ejecutar en» (M3):
 * Ofrece las máquinas donde se puede ejecutar el workspace actual.
 * La plataforma entrega la lista ya filtrada; este componente solo presenta.
 * El ícono visual depende de kind; la lógica no (R5).
 */
export function RunOnPicker(props: RunOnPickerProps) {
  const [open, setOpen] = createSignal(false);

  const selected = () =>
    props.machines.find((m) => m.machine_id === props.selectedId) ?? props.machines[0];

  const handleSelect = (m: Machine) => {
    setOpen(false);
    props.onSelect?.(m);
  };

  return (
    <div class={`relative inline-block text-left ${props.class ?? ""}`} data-run-on-picker="">
      <button
        type="button"
        disabled={props.disabled || props.loading}
        class="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-neutral-800 shadow-sm transition hover:bg-neutral-200 hover:text-neutral-950 disabled:cursor-not-allowed disabled:opacity-50"
        aria-haspopup="listbox"
        aria-expanded={open()}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span class="text-neutral-500">Ejecutar en:</span>
        <Show
          when={selected()}
          fallback={<span class="italic text-neutral-400">Seleccionar máquina</span>}
        >
          {(m) => (
            <span class="inline-flex items-center gap-1.5 font-medium">
              <MachineIcon kind={m().kind} class="h-3.5 w-3.5" />
              <span>{m().name?.trim() || m().machine_id}</span>
            </span>
          )}
        </Show>
        <svg
          class="h-3.5 w-3.5 text-neutral-400"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fill-rule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
            clip-rule="evenodd"
          />
        </svg>
      </button>

      <Show when={open()}>
        <div
          class="absolute left-0 z-50 mt-1 min-w-[14rem] rounded-md border border-border bg-surface py-1 shadow-lg"
          role="listbox"
        >
          <Show
            when={props.machines.length > 0}
            fallback={
              <div class="px-3 py-2 text-xs text-neutral-500">No hay máquinas disponibles</div>
            }
          >
            <For each={props.machines}>
              {(m) => {
                const isSelected = () => m.machine_id === selected()?.machine_id;
                return (
                  <button
                    type="button"
                    role="option"
                    aria-selected={isSelected()}
                    class={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs transition ${
                      isSelected()
                        ? "bg-surface-raised font-semibold text-neutral-950"
                        : "text-neutral-700 hover:bg-neutral-200 hover:text-neutral-950"
                    }`}
                    onClick={() => handleSelect(m)}
                  >
                    <span class="inline-flex items-center gap-2 truncate">
                      <MachineIcon kind={m.kind} class="h-3.5 w-3.5 shrink-0" />
                      <span class="truncate">{m.name?.trim() || m.machine_id}</span>
                    </span>
                    <MachineBadge state={m.state} connection={m.connection} />
                  </button>
                );
              }}
            </For>
          </Show>
        </div>
      </Show>
    </div>
  );
}
