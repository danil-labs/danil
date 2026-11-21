import type {
  Machine as ApiMachine,
  MachineList as ApiMachineList,
  Operation as ApiOperation,
} from "@danil/platform-client";
import type {
  ConnectionStatus,
  MachineConnection,
  MachineRef,
  LocalHost,
} from "@danil/engine-client";

export type OperationState = "pending" | "running" | "succeeded" | "failed";

export type Machine = ApiMachine;
export type MachineList = ApiMachineList;
export type Operation = Omit<ApiOperation, "state"> & {
  state?: OperationState | string;
};

export type MachineState = NonNullable<Machine["state"]>;
export type MachineConnectionState = NonNullable<Machine["connection"]>;
export type MachineKind = Machine["kind"];

/** Estado visible consolidado de una máquina */
export interface MachineDisplayState {
  state: MachineState | string;
  connection: MachineConnectionState | string;
  engineStatus?: ConnectionStatus;
  isStarting?: boolean;
  isStopping?: boolean;
}

export type { ConnectionStatus, MachineConnection, MachineRef, LocalHost };
