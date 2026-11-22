import { invoke } from "../../../../engine-client/src/client.ts";

type agentsViewStatus = { installed: boolean; enabled: boolean };
export type AgentsViewStatus = agentsViewStatus;

export const getAgentsViewStatus = () => invoke<agentsViewStatus>("agentsview_status");

export const connectObservability = () => invoke<{ url: string }>("observability_connect");

export const disconnectObservability = () => invoke("observability_disconnect");
