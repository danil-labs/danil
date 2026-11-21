import { MachineIcon } from "./MachineIcon";

export interface MachineChipProps {
  machine: string;
  name?: string;
  wakes?: boolean;
  on: boolean;
  class?: string;
}

/** La máquina que corre una tarea; atenuada si está apagada. */
export function MachineChip(props: MachineChipProps) {
  const name = () => props.name ?? props.machine;
  const label = () =>
    props.on
      ? `Corre en ${name()}`
      : `Corre en ${name()}, apagada: se enciende cuando actúes sobre esta tarea.`;

  return (
    <span
      data-machine={props.machine}
      data-machine-on={props.on ? "true" : "false"}
      class={`flex shrink-0 items-center gap-0.5 ${!props.on ? "opacity-60" : ""} ${props.class ?? ""}`.trim()}
      title={label()}
      aria-label={label()}
    >
      <MachineIcon wakes={props.wakes} size={13} />
      <span class="truncate">{name()}</span>
    </span>
  );
}
