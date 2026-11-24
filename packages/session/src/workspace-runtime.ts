import { classOf, FleetError, type Fleet, type Link } from "../../features/machines/src/model/fleet/index.ts";

export function webMachineCall(link: Link, fleet: Fleet, machine: string, context?: string): Link["call"] {
  return async (...args) => {
    const [, command, , , payload] = args;
    if (command === "send_message" && (payload as { session?: string } | null)?.session && !fleet.canContinue(machine, context))
      throw new FleetError("machine_off", machine);
    if (classOf(command) === "intent") await fleet.wake(machine, context);
    return link.call(...args);
  };
}
