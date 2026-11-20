import { classOf, FleetError, type Fleet, type Link } from "@terminus/fleet";
import type { Capabilities } from "../lib/platform";
import type { Router } from "../features/machines/router";

export async function selectEngineWorkspace(router: Pick<Router, "handle" | "activeContext" | "activeWorkspace">, workspaces: Capabilities["webWorkspaces"], group: { org: string; context: string } | null) {
  const accountId = workspaces?.active();
  const engineId = workspaces?.rows().find(row => row.id === accountId && (!group || row.org === group.org))?.engine_workspace_id ?? null;
  if (router.activeContext() !== (group?.context ?? null) || (accountId && router.activeWorkspace() !== engineId))
    await router.handle("set_active_workspace", { id: engineId }, { headers: { "x-danil-context": group?.context ?? "" } });
}

export function webMachineCall(link: Link, fleet: Fleet, machine: string, context?: string): Link["call"] {
  return async (...args) => {
    const [, command, , , payload] = args;
    if (command === "send_message" && (payload as { session?: string } | null)?.session && !fleet.canContinue(machine, context))
      throw new FleetError("machine_off", machine);
    if (classOf(command) === "intent") await fleet.wake(machine, context);
    return link.call(...args);
  };
}
