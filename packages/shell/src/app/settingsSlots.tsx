import { lazy, type ComponentProps } from "solid-js";
import Settings from "../../../features/settings/src/screens/Settings";
import type { MaquinasDeAjustes } from "../../../features/settings/src/model/machines-port";
import type { PiezasDeAjustes } from "../../../features/settings/src/model/features-port";
import { AstroAvatar } from "../../../features/projects/src/screens/AstroAvatar";
import NewAgent from "../../../features/projects/src/screens/NewAgent";
import { displayName, notifyProfiles } from "../../../features/projects/src/queries/profiles";
import { createDanilCreditsBalance } from "../../../features/chat/src/queries/store";
import { isDanilWorkspace } from "../../../features/machines/src";
import { machineName, machineOf, machines } from "../../../features/machines/src/queries/store";
import { AccountComputersSection } from "../../../features/machines/src/screens/AccountComputers";
import { ConnectMachineSection } from "../../../features/machines/src/screens/ConnectMachine";
import { WslMachineSection } from "../../../features/machines/src/screens/WslMachine";

/** La bitácora solo se baja al abrir su pestaña. */
const ActivityLogs = lazy(() => import("../../../features/machines/src/components/ActivityLogs"));

/** Lo de máquinas que usa Configuración: es de machines y el shell lo enchufa (R3). */
const maquinasDeAjustes: MaquinasDeAjustes = {
  machines,
  machineName,
  machineOf,
  isDanilWorkspace,
  ActivityLogs,
  AccountComputersSection,
  ConnectMachineSection,
  WslMachineSection,
};

/** Lo de projects y chat que pinta Configuración: el shell lo enchufa (R3). */
const piezasDeAjustes: PiezasDeAjustes = {
  AstroAvatar,
  NewAgent,
  displayName,
  notifyProfiles,
  createDanilCreditsBalance,
};

/** Configuración con sus máquinas: viaja en el mismo chunk perezoso que la pantalla. */
export default function SettingsWithMachines(props: Omit<ComponentProps<typeof Settings>, "maquinas" | "piezas">) {
  return <Settings {...props} maquinas={maquinasDeAjustes} piezas={piezasDeAjustes} />;
}
