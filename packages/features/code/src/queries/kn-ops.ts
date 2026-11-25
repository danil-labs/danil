import { callEngine, type InvokeOptions } from "../../../../engine-client/src/client.ts";

export const knCloudState = <t = unknown>(
  payload: { project: string },
  options?: InvokeOptions,
): Promise<t> =>
  callEngine<t>("kn_cloud_state", payload, options);

export const knCloudStart = (
  payload: { project: string; retry: boolean },
  options?: InvokeOptions,
): Promise<void> =>
  callEngine("kn_cloud_start", payload, options);

export const knPending = <t = unknown>(
  payload: { project: string; session: string },
  options?: InvokeOptions,
): Promise<t> =>
  callEngine<t>("kn_pending", payload, options);

export const knFinish = (
  payload: { project: string; session: string },
  options?: InvokeOptions,
): Promise<void> =>
  callEngine("kn_finish", payload, options);

export const knUpdate = (
  payload: { project: string; session: string },
  options?: InvokeOptions,
): Promise<void> =>
  callEngine("kn_update", payload, options);

export const knStatus = <t = unknown>(
  payload: unknown,
  options?: InvokeOptions,
): Promise<t> =>
  callEngine<t>("kn_status", payload as Record<string, unknown>, options);

