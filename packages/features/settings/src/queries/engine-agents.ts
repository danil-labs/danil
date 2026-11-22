import type { InvokeArgs, InvokeOptions } from "@tauri-apps/api/core";
import { invoke } from "../../../../engine-client/src/client.ts";

export function deleteAgent<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("delete_agent", args, options);
}

export function listMachineAgents<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("list_machine_agents", args, options);
}

export function setAgentAvatar<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("set_agent_avatar", args, options);
}
