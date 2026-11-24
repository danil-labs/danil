import { invoke, type InvokeArgs, type InvokeOptions } from "../../../../engine-client/src/client.ts";

export function deleteAgent<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return invoke<res>("delete_agent", args, options);
}

export function listMachineAgents<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return invoke<res>("list_machine_agents", args, options);
}

export function savePastedImage<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return invoke<res>("guardar_imagen_pegada", args, options);
}

export function setAgentAvatar<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return invoke<res>("set_agent_avatar", args, options);
}
