import { invoke } from "./invoke.ts";
import { freeModelScope, recognizedFreeModelPolicy, type FreeModelPolicy, type FreeModelStartup } from "./free-model-policy.ts";

/** La política se lee en un destino fijo; nunca se acepta el resultado fusionado. */
export async function loadFreeModelPolicy(captured?: FreeModelPolicy): Promise<FreeModelPolicy | null> {
  let destination: Pick<FreeModelPolicy, "workspace_id" | "destination_machine"> | undefined = captured;
  if (!destination) {
    const startup = await invoke<FreeModelStartup>("workspaces_startup");
    if (!startup.active) return null;
    const machines = await invoke<{ id: string; active: boolean }[]>("machine_list");
    const machine = machines.find((m) => m.active);
    if (!machine) return null;
    destination = { workspace_id: startup.active, destination_machine: machine.id };
  }
  const startup = await invoke<FreeModelStartup>("workspaces_startup", undefined, freeModelScope(destination));
  const policy = recognizedFreeModelPolicy(startup);
  return policy && policy.workspace_id === destination.workspace_id
    ? { ...policy, destination_machine: destination.destination_machine }
    : null;
}
