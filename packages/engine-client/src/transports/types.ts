import type { EngineTransport } from "../generated/transport.ts";

/** `stopped`: la VM está apagada y nadie pidió despertarla; no se reintenta (FOCO NUEVO, M6b). */
export type ConnectionStatus = "connecting" | "waking" | "connected" | "reconnecting" | "stopped" | "error";

/** Un transporte del motor: llamadas, eventos y estado observable. */
export interface StatefulTransport extends EngineTransport {
  status(): ConnectionStatus;
  onStatus(cb: (s: ConnectionStatus) => void): () => void;
  close(): void;
}
