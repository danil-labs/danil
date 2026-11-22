/**
 * La `Idempotency-Key` de las escrituras al borde: una por operación lógica, y la misma en cada
 * reintento de esa operación (quien reintenta guarda la llave y la vuelve a pasar). Si ya viene en
 * las cabeceras, se respeta.
 */
import { requestId } from "../../computers/src/relay-frames.ts";

/** Una llave nueva para una operación lógica. */
export const newIdempotencyKey = (): string => requestId();

/** Las cabeceras con su `Idempotency-Key`: la que ya traen, `key`, o una nueva. */
export function withIdempotencyKey(headers: Record<string, string> = {}, key: string = newIdempotencyKey()): Record<string, string> {
  return Object.keys(headers).some(name => name.toLowerCase() === "idempotency-key") ? { ...headers } : { ...headers, "Idempotency-Key": key };
}
