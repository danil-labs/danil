import { t } from "../../lib/i18n";
import { cn } from "../../lib/utils";
import { MachineIcon } from "./MachineIcon";
import { machineName, machineWakes } from "./store";

/** La máquina que corre una tarea que no es de la máquina de la ventana; atenuada si está apagada. */
export function MachineChip(props: { machine: string; on: boolean; class?: string }) {
  const label = () =>
    props.on
      ? t("shell.machines.task_on", { name: machineName(props.machine) })
      : t("shell.machines.task_off", { name: machineName(props.machine) });
  return (
    <span
      data-machine={props.machine}
      data-machine-on={props.on ? "true" : "false"}
      class={cn("flex shrink-0 items-center gap-0.5", !props.on && "opacity-60", props.class)}
      title={label()}
      aria-label={label()}
    >
      <MachineIcon wakes={machineWakes(props.machine)} size={13} />
      <span class="truncate">{machineName(props.machine)}</span>
    </span>
  );
}
