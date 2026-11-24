import { invoke } from "../../../../engine-client/src/client.ts";
import type { HandlerList } from "../../../../ui/src/lib/model";

export const listSourceBranches = (payload: {
  source: string;
}): Promise<string[]> =>
  invoke<string[]>("list_source_branches", payload);

export const setSourceBranch = (payload: {
  project: string;
  source: string;
  branch: string;
}): Promise<void> =>
  invoke("set_source_branch", payload);

export const getProjectSetupCommand = (
  project: string,
): Promise<string | null> =>
  invoke<string | null>("project_setup_command", { project });

export const setProjectSetupCommand = (payload: {
  project: string;
  command: string | null;
}): Promise<void> =>
  invoke("set_project_setup_command", payload);

export const listAgents = (project: string): Promise<(HandlerList)> =>
  invoke<(HandlerList)>("list_agents", { project });

export const setAgentHidden = (payload: {
  project: string;
  name: string;
  hidden: boolean;
}): Promise<void> =>
  invoke("set_agent_hidden", payload);

export const openExternal = (target: string): Promise<void> =>
  invoke("open_external", { target });
