/**
 * Lo que entra y sale del cliente de máquinas sin ser una respuesta del borde: la configuración, el
 * transporte, el sobre de la respuesta (`MachinesAnswer`) y el ticket ya validado. Las respuestas
 * (`Machine`, `MachineList`, `MachineTicket`, `Operation`) salen del OpenAPI en `generated/types.ts`.
 */
import type { Answer, Fetch } from "../../computers/src/api.ts";
import type { MachineTicket } from "./generated/types.ts";

/** El ticket que entrega `admission()`: el del contrato con `url` (ya validada) y `ticket` presentes. */
export type Admission = MachineTicket & Required<Pick<MachineTicket, "url" | "ticket">>;

/** `Answer` más «el servidor aún no tiene esta ruta» (404 o 501 de una colección). */
export type MachinesAnswer<T> = (Answer<T> | { kind: "unavailable"; status: number }) & { retryAfter?: string };
export type MachinesTransport = {
  call(path: string, init?: RequestInit): Promise<Response>;
  mutation(path: string, init?: RequestInit): Promise<Response>;
};
export type MachinesResponse = Awaited<ReturnType<Fetch>> & { headers?: Pick<Headers, "get"> };
type MachinesFetch = (url: string, init?: Parameters<Fetch>[1]) => Promise<MachinesResponse>;

export type MachinesConfig = {
  /** El borde con su versión: `https://edge.danil.ai/v1`. */
  endpoint: string;
  /**
   * El portador de la sesión, solo donde el token vive en JS. Sin él no se manda `Authorization`:
   * Desk autentica en Rust (`danil_edge_fetch`) y la web usa su cookie (`transport`).
   */
  getToken?: () => Promise<string>;
  fetch?: MachinesFetch;
  /** La web inyecta el transporte con cookie y CSRF; con él nunca se pide un Bearer. */
  transport?: MachinesTransport;
  /** Orígenes exactos del relay que pueden recibir el ticket (`RELAY_ORIGIN`); sin lista, los del borde de producción. */
  relayOrigins?: readonly string[];
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  /** Cuánto se espera a que termine una operación de encendido. */
  operationTimeoutMs?: number;
};
