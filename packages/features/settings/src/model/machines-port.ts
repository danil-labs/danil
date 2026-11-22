import type { InvokeOptions } from "@tauri-apps/api/core";
import type { Component } from "solid-js";
import type { Machine } from "../../../../ui/src/lib/machine";

/**
 * Lo que Configuración usa de máquinas. Es de `features/machines` y lo enchufa
 * el shell (R3): las pantallas lo leen con los mismos nombres que exporta machines.
 */
export type MaquinasDeAjustes = {
  machines: () => Machine[];
  machineName: (id: string, local?: boolean) => string;
  machineOf: (id: string | null | undefined) => InvokeOptions | undefined;
  isDanilWorkspace: (workspace: string) => boolean;
  ActivityLogs: Component<{ workspace: string | null; machine?: string | null }>;
  AccountComputersSection: Component<{ account?: string | null; workspace?: string; owner?: string | null; self?: string | null; onSelfName?: (name: string) => void }>;
  ConnectMachineSection: Component<{ account?: string | null }>;
  WslMachineSection: Component;
};
