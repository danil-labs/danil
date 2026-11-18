import { type Computer, linkedWorkspaces, organizationOf, serviceFeatures, systemOf, wakes } from "@terminus/computers";
import type { MachineInfo } from "@terminus/fleet";

/** La fila de una computadora de la cuenta como la lee la flota; `kind` y `organizationId` salen de `/v1/machines`. */
export const infoOf = (c: Computer): MachineInfo => {
  const os = systemOf(c.os);
  return {
    id: c.computer_id,
    name: c.name?.trim() || c.computer_id,
    wakes: wakes(c),
    linked: linkedWorkspaces(c),
    organization: organizationOf(c),
    features: serviceFeatures(c),
    ...(c.host_version ? { version: c.host_version } : {}),
    ...(os ? { os } : {}),
    ...(c.kind ? { kind: c.kind } : {}),
    ...(c.organization_id ? { organizationId: c.organization_id } : {}),
  };
};
