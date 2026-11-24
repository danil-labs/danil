import type { ComponentProps } from "solid-js";
import Settings from "../../../features/settings/src/screens/Settings";
import type { MaquinasDeAjustes } from "../../../features/settings/src/model/machines-port";
import type { PiezasDeAjustes } from "../../../features/settings/src/model/features-port";
import type { SesionesDeAjustes } from "../../../features/settings/src/model/sessions-port";
import { accountReturn, MoveWorkspaceDialog, noteWebAccountMode, sessionRailState, usesGroupAccounts } from "../shell";
import { organizationLogo } from "../shell/organization-logo";
import { MarcaDeWorkspace } from "../shell/WorkspaceMarks";
import { AstroAvatar } from "../../../features/projects/src/screens/AstroAvatar";
import NewAgent from "../../../features/projects/src/screens/NewAgent";
import { displayName, notifyProfiles } from "../../../features/projects/src/queries/profiles";
import { createDanilCreditsBalance } from "../../../features/chat/src/queries/store";
import { isDanilWorkspace } from "../../../features/machines/src";
import { machineName, machineOf, machines } from "../../../features/machines/src/queries/store";
import { machineAvailability } from "../../../host/src/platform";

/** Lo de máquinas que usa Configuración: es de machines y el shell lo enchufa (R3). */
const maquinasDeAjustes: MaquinasDeAjustes = {
  machines,
  machineName,
  machineOf,
  isDanilWorkspace,
  availability: machineAvailability,
};

/** Lo de projects y chat que pinta Configuración: el shell lo enchufa (R3). */
const piezasDeAjustes: PiezasDeAjustes = {
  AstroAvatar,
  NewAgent,
  displayName,
  notifyProfiles,
  createDanilCreditsBalance,
};

/** Lo del riel de sesiones y de cuentas que lee Configuración: es del shell y él lo enchufa (R3). */
const sesionesDeAjustes: SesionesDeAjustes = {
  sessionRailState,
  accountReturn,
  noteWebAccountMode,
  usesGroupAccounts,
  MoveWorkspaceDialog,
  MarcaDeWorkspace,
  organizationLogo,
};

/** Configuración con sus máquinas: viaja en el mismo chunk perezoso que la pantalla. */
export default function SettingsWithMachines(props: Omit<ComponentProps<typeof Settings>, "maquinas" | "piezas" | "sesiones">) {
  return <Settings {...props} maquinas={maquinasDeAjustes} piezas={piezasDeAjustes} sesiones={sesionesDeAjustes} />;
}
