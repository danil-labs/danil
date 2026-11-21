import { createTransport, type HttpOptions } from "./http.ts";
import { createOperations } from "./generated/operations.ts";

export type PlatformClientOptions = Pick<
  HttpOptions,
  "getToken" | "getWorkspaceId" | "csrf" | "onUnauthorized" | "onUnavailable" | "signal"
>;

export function createPlatformClient(options: PlatformClientOptions = {}) {
  return createOperations(createTransport(options));
}
export type PlatformClient = ReturnType<typeof createPlatformClient>;

export type { ClientError } from "./errors.ts";
export { isClientError } from "./errors.ts";
export type * from "./generated/types.ts";
export { CONTRACT_HASH } from "./generated/contract.ts";
