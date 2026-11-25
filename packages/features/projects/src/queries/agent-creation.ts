import { callEngine } from "../../../../engine-client/src/client.ts";
import type { CreatedHandler } from "../../../../ui/src/lib/model";

export const createAgent = (payload: {
  name: string;
  description: string;
  instructions?: string;
  scope?: unknown;
}): Promise<(CreatedHandler)> =>
  callEngine<(CreatedHandler)>("create_agent", payload);

export const saveAgentProfile = (payload: {
  project: string;
  name: string;
  displayName?: string | null;
  body?: unknown;
  veil?: unknown;
  profile?: unknown;
}): Promise<void> =>
  callEngine("save_agent_profile", payload);

export const setAgentModel = (payload: {
  project: string;
  name: string;
  provider?: string;
  model: string;
  effort: string | null;
}): Promise<void> =>
  callEngine("set_agent_model", payload);
