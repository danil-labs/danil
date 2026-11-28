import type { InvokeOptions } from "../../../../engine-client/src/client.ts";
import type { Machine, MachineAvailability } from "../../../../ui/src/lib/machine";

/**
 * Lo que Configuración usa de máquinas. Es de `features/machines` y lo enchufa
 * el shell (R3): las pantallas lo leen con los mismos nombres que exporta machines.
 */
export type MaquinasDeAjustes = {
  machines: () => Machine[];
  machineName: (id: string, local?: boolean) => string;
  machineOf: (id: string | null | undefined) => InvokeOptions | undefined;
  isDanilWorkspace: (workspace: string) => boolean;
  availability?: () => MachineAvailability;
};
