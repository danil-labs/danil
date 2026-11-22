import { invoke } from "../../../../engine-client/src/client.ts";
import type { CreatedHandler } from "../../../../../apps/desktop/src/lib/model";

export const createAgent = (payload: {
  name: string;
  description: string;
  instructions?: string;
  scope?: unknown;
}): Promise<(CreatedHandler)> =>
  invoke<(CreatedHandler)>("create_agent", payload);

export const saveAgentProfile = (payload: {
  project: string;
  name: string;
  displayName?: string | null;
  body?: unknown;
  veil?: unknown;
  profile?: unknown;
}): Promise<void> =>
  invoke("save_agent_profile", payload);

export const setAgentModel = (payload: {
  project: string;
  name: string;
  provider?: string;
  model: string;
  effort: string | null;
}): Promise<void> =>
  invoke("set_agent_model", payload);
