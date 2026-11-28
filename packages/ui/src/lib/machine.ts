import type { MachineState, SystemId } from "../../../platform-client/src/machine.ts";

/**
 * `machine_list`: `hosts` es si tiene el workspace abierto (`null`, que no se sabe
 * sin encenderla); `materializes`, si puede hacerlo suyo con el mismo id al crear ahí;
 * `refuses`, que el relay no la deja usarlo (no tiene permiso ahí).
 * `wakes`: VM administrada. `os` solo si se sabe; si falta, no se inventa.
 * `features`: lo que su motor anuncia (`status.service_features`). `power`, lo que
 * sabe la flota (`starting`: encendiéndose); `version`, su `host_version`, también apagada.
 */
export type Machine = { id: string; local: boolean; active: boolean; on: boolean; connection?: MachineState; power?: "on" | "off" | "starting" | "outdated"; version?: string; hosts: boolean | null; materializes?: boolean; refuses?: boolean; wakes?: boolean; os?: SystemId; features?: readonly string[] };

/** Lo que el picker sabe del proyecto de la tarea nueva: las máquinas con su carpeta y su remoto. */
export type ProjectPlace = { name: string; machines?: string[]; remote_url?: string | null } | null | undefined;

/** Estado agregado de disponibilidad de máquinas para un contexto o workspace (compartido por R3). */
export type MachineAvailability =
  | { kind: "loading" }
  | { kind: "unavailable"; reason: "service_error" | "not_permitted" }
  | { kind: "no_machines"; scope: "context" | "workspace" }
  | { kind: "offline"; wakeable: boolean; count: number }
  | { kind: "ready"; online: number; total: number };
