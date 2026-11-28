export { AUTO_WAKE_BACKOFF_MS, createAutoWaker, type AutoWakeOptions } from "./model/auto-wake.ts";
export { contextAttentionStale } from "./queries/context-attention.ts";
export { createContextRelayPool } from "./queries/context-relay-pool.ts";
export { createRemoteGuestManager } from "./queries/remoteGuestLink.ts";
export { danilAvailable, danilAvailableContext, danilMachines, isDanilWorkspace, machinesListed, readDanil, readDanilContext } from "./queries/danil-source.ts";
export { mergeByMachineId } from "./model/merge-by-machine.ts";
export { isRemoteGuestMachine, parseRemoteGuestMachineId } from "./model/wsl.ts";
export {
  DESKTOP_AVAILABILITY,
  deriveMachineAvailability,
  hasNoMachines,
  isNoMachineError,
  type AvailabilityInput,
  type AvailabilityMachine,
  type MachineAvailability,
} from "./model/availability.ts";
