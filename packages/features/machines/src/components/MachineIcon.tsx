import { Laptop, Server } from "@danil/ui";

export interface MachineIconProps {
  kind?: string;
  wakes?: boolean;
  size?: number;
  class?: string;
}

/**
 * Ícono de máquina: laptop para personal, servidor para organización o wakes.
 * Paridad exacta con apps/desktop/src/features/machines/MachineIcon.tsx.
 */
export function MachineIcon(props: MachineIconProps) {
  const size = () => props.size ?? 14;
  const isServer = () => props.wakes || (props.kind !== undefined && props.kind !== "personal");

  return isServer() ? (
    <Server size={size()} class={props.class} aria-hidden="true" data-machine-form="vm" />
  ) : (
    <Laptop size={size()} class={props.class} aria-hidden="true" data-machine-form="computer" />
  );
}
