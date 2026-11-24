import { invokeNative } from "../../../../host/src/native.ts";
import type { ClientToken, DanilStatus } from "../screens/account-helpers.ts";

export function listNativeMachines(): Promise<{ features?: unknown }[] | null> {
  return invokeNative<{ features?: unknown }[] | null>("machine_list", {});
}

export function fetchAccountRelayToken(account?: string | null): Promise<ClientToken> {
  return invokeNative<ClientToken>("account_relay_token", account ? { account } : {});
}

export function readDanilSessionsOrNull<T = unknown>(): Promise<T[] | null> {
  return invokeNative<T[] | null>("danil_sessions", {}).catch(() => null);
}

export function readListedWorkspacesOrNull(): Promise<{ active?: unknown } | null> {
  return invokeNative<{ active?: unknown } | null>("list_workspaces", {}).catch(() => null);
}

export function readDanilWorkspaceAccountOrNull<T = unknown>(workspace?: string | null): Promise<T | null> {
  return invokeNative<T | null>("danil_workspace_account", workspace ? { workspace } : {}).catch(() => null);
}

export function readDanilConnectStatusOrNull(): Promise<DanilStatus | null> {
  return invokeNative<DanilStatus | null>("danil_connect_status", {}).catch(() => null);
}

export function readDanilSessionStatusOrNull(): Promise<{ state?: string; sessions?: unknown } | null> {
  return invokeNative<{ state?: string; sessions?: unknown } | null>("danil_session_status").catch(() => null);
}
