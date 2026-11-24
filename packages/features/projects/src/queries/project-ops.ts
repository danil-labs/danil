import { callEngine } from "../../../../engine-client/src/client.ts";
import type { HandlerList } from "../../../../ui/src/lib/model";

export const listSourceBranches = (payload: {
  source: string;
}): Promise<string[]> =>
  callEngine<string[]>("list_source_branches", payload);

export const setSourceBranch = (payload: {
  project: string;
  source: string;
  branch: string;
}): Promise<void> =>
  callEngine("set_source_branch", payload);

export const getProjectSetupCommand = (
  project: string,
): Promise<string | null> =>
  callEngine<string | null>("project_setup_command", { project });

export const setProjectSetupCommand = (payload: {
  project: string;
  command: string | null;
}): Promise<void> =>
  callEngine("set_project_setup_command", payload);

export const listAgents = (project: string): Promise<(HandlerList)> =>
  callEngine<(HandlerList)>("list_agents", { project });

export const setAgentHidden = (payload: {
  project: string;
  name: string;
  hidden: boolean;
}): Promise<void> =>
  callEngine("set_agent_hidden", payload);

export const openExternal = (target: string): Promise<void> =>
  callEngine("open_external", { target });
