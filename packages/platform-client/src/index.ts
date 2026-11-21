import { createOperations, type Transport } from "./generated/operations.ts";

/** El cliente del borde sobre un transporte: HTTP con cookie (web) o el motor (Desk). Uno por app. */
export function createPlatformClient(transport: Transport) {
  return createOperations(transport);
}
export type PlatformClient = ReturnType<typeof createPlatformClient>;

export { createOperations };
export type { Transport, TransportRequest, RequestOptions } from "./generated/operations.ts";
export {
  createHttpTransport,
  createEngineTransport,
  withRetry,
  backoffDelay,
  idempotencyKey,
} from "./http.ts";
export type { HttpOptions, RetryOptions, EngineFetch, Reply } from "./http.ts";
export type { ClientError } from "./errors.ts";
export { isClientError } from "./errors.ts";
export type * from "./generated/types.ts";
export { CONTRACT_HASH } from "./generated/contract.ts";
export { API_BASE, BILLING_URL, HARNESS_URL } from "./config.ts";
export { PlatformProvider, usePlatform } from "./solid.ts";
export { planLabel } from "./plan.ts";
export { createQuery, invalidate } from "./query.ts";
