import { Show } from "solid-js";

export interface MachineIconProps {
  kind?: string;
  class?: string;
}

/**
 * Ícono de máquina: laptop para kind personal, nube para organización.
 * R5: la lógica del negocio no distingue local/nube; solo este icono visual.
 */
export function MachineIcon(props: MachineIconProps) {
  const iconIsPersonal = props.kind === "personal";

  return (
    <Show
      when={iconIsPersonal}
      fallback={
        <svg
          class={props.class ?? "h-4 w-4 text-neutral-500"}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-label="Máquina en la nube"
        >
          <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
        </svg>
      }
    >
      <svg
        class={props.class ?? "h-4 w-4 text-neutral-500"}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-label="Máquina personal"
      >
        <path d="M20 16V7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v9m16 0H4m16 0 1.28 2.55a1 1 0 0 1-.9 1.45H3.62a1 1 0 0 1-.9-1.45L4 16" />
      </svg>
    </Show>
  );
}
