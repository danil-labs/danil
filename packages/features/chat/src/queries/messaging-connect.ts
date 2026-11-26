import {
  completeConnectSession,
  executePluginProxyHttp,
  readConnectSession,
  type ConnectSessionState,
  type PluginProxyHttpRequest,
  type PluginProxyHttpResponse,
} from "../../../../platform-client/src/messaging-proxy";

export type { ConnectSessionState, PluginProxyHttpRequest, PluginProxyHttpResponse };

export function fetchConnectSessionStatus(
  sessionId: string,
  options: { workspaceId?: string | null; signal?: AbortSignal } = {},
) {
  return readConnectSession(sessionId, options);
}

export function submitConnectSessionCompletion(
  sessionId: string,
  payload: Record<string, unknown>,
  options: { workspaceId?: string | null; idempotencyKey?: string; signal?: AbortSignal } = {},
) {
  return completeConnectSession(sessionId, payload, options);
}

export function proxyMessagingCardHttp(request: PluginProxyHttpRequest) {
  return executePluginProxyHttp(request);
}
