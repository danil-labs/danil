import type { InvokeOptions } from "@tauri-apps/api/core";
import { invoke } from "../../../../engine-client/src/client.ts";

export const knCloudState = <t = unknown>(
  payload: { project: string },
  options?: InvokeOptions,
): Promise<t> =>
  invoke<t>("kn_cloud_state", payload, options);

export const knCloudStart = (
  payload: { project: string; retry: boolean },
  options?: InvokeOptions,
): Promise<void> =>
  invoke("kn_cloud_start", payload, options);

export const knPending = <t = unknown>(
  payload: { project: string; session: string },
  options?: InvokeOptions,
): Promise<t> =>
  invoke<t>("kn_pending", payload, options);

export const knFinish = (
  payload: { project: string; session: string },
  options?: InvokeOptions,
): Promise<void> =>
  invoke("kn_finish", payload, options);

export const knUpdate = (
  payload: { project: string; session: string },
  options?: InvokeOptions,
): Promise<void> =>
  invoke("kn_update", payload, options);

export const knStatus = <t = unknown>(
  payload: unknown,
  options?: InvokeOptions,
): Promise<t> =>
  invoke<t>("kn_status", payload as Record<string, unknown>, options);

