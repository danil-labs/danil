import type { EngineTransport } from "../generated/transport.ts";

export type ConnectionStatus = "connecting" | "waking" | "connected" | "reconnecting" | "error";

/** Un transporte del motor: llamadas, eventos y estado observable. */
export interface StatefulTransport extends EngineTransport {
  status(): ConnectionStatus;
  onStatus(cb: (s: ConnectionStatus) => void): () => void;
  close(): void;
}
