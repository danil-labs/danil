export function openWebSocket(url: string, protocols?: string | string[]): WebSocket {
  return new WebSocket(url, protocols);
}
