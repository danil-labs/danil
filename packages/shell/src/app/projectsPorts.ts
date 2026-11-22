import { enchufarPuertos } from "../../../features/projects/src/model/ports";
import { bringHereLabel, canBringHere, machineName, machineSystem, machines } from "../../../features/machines/src/queries/store";
import { MachineChip } from "../../../features/machines/src/components/MachineChip";
import { colorDeMarca, describirEstado, localDe } from "../../../features/code/src/queries/localStatus";
import SelectorDeModelo from "../../../features/chat/src/components/ModelPicker";

/** Lo de machines, code y chat que usa projects: es de esas features y el shell lo enchufa (R3). */
export function enchufarProyectos() {
  enchufarPuertos({
    machines,
    machineName,
    machineSystem,
    bringHereLabel,
    canBringHere,
    MachineChip,
    localDe,
    colorDeMarca,
    describirEstado,
    SelectorDeModelo,
  });
}
