export interface MachineIconProps {
  wakes?: boolean;
  size?: number;
  class?: string;
  kind?: string;
  iconIsLocal?: boolean;
}

/**
 * Una VM que Danil puede encender (`wakes`) frente a una máquina de la persona (`iconIsLocal`).
 * El sistema, cuando se sabe, se lee en la tarjeta de la tarea; el icono no lo dibuja.
 */
export function MachineIcon(props: MachineIconProps) {
  const size = () => props.size ?? 12;
  const isComputer = () => (props.iconIsLocal !== undefined ? props.iconIsLocal : !props.wakes);

  return !isComputer() ? (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size()}
      height={size()}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      class={props.class}
      aria-hidden="true"
      data-machine-form="vm"
    >
      <rect width="20" height="8" x="2" y="2" rx="2" ry="2" />
      <rect width="20" height="8" x="2" y="14" rx="2" ry="2" />
      <line x1="6" x2="6.01" y1="6" y2="6" />
      <line x1="6" x2="6.01" y1="18" y2="18" />
    </svg>
  ) : (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size()}
      height={size()}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      class={props.class}
      aria-hidden="true"
      data-machine-form="computer"
    >
      <path d="M20 16V7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v9m16 0H4m16 0 1.28 2.55a1 1 0 0 1-.9 1.45H3.62a1 1 0 0 1-.9-1.45L4 16" />
    </svg>
  );
}
